// Unit tests for SLA, mapping and policy logic. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

// No Firebase Admin configuration or emulators: server code must fail as "unavailable"
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    delete process.env[key];
}

const load = require('./load.cjs');
const { NextRequest } = require('next/server');

const { calculateSLA, getSLADeadline, slaHoursForCategory } = load('@/lib/services/sla-service');
const { isComplaintStalled, isSLABreached, getStalledStatusLabel } = load('@/lib/services/stalled-detection-service');
const { complaintToGrievance, grievanceSLA } = load('@/lib/utils/type-mappers');
const { getDashboardStats } = load('@/lib/services/dashboard-service');
const { classifyComplaint, isValidCategory } = load('@/lib/engines/classification-engine');
const policy = load('@/lib/complaint-policy');

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ago = h => new Date(NOW - h * HOUR);

function complaint(overrides = {}) {
    const createdAt = overrides.createdAt ?? ago(1);
    const hours = overrides.hours ?? 120;
    return {
        id: 'c1', trackingId: 'JAN-123456', title: 'T', description: 'D', category: 'Other',
        department: 'General Administration', assignedDepartment: 'General Administration',
        status: 'pending', priority: 'medium', location: 'L', citizenId: 'alice', citizenName: 'Alice', citizenEmail: 'a@x',
        sla: { assignedHours: hours, deadline: new Date(createdAt.getTime() + hours * HOUR), remainingHours: hours, status: 'on-track' },
        createdAt, updatedAt: createdAt,
        ...overrides,
    };
}

// What the admin dashboard computes from the mapped Grievance
const dashboardSLA = c => grievanceSLA(complaintToGrievance(c), NOW);

function assertAgreement(c) {
    const direct = calculateSLA(c, NOW);
    assert.equal(dashboardSLA(c).status, direct.status, 'dashboard vs sla-service');
    assert.equal(isSLABreached(c, NOW), !direct.closed && direct.status === 'breached', 'stalled-detection vs sla-service');
    assert.equal(getDashboardStats([c], NOW).breached, !direct.closed && direct.status === 'breached' ? 1 : 0, 'stats vs sla-service');
    return direct;
}

test('critical complaint aged 25h gets one answer everywhere (stored deadline wins over priority)', () => {
    const other = complaint({ priority: 'critical', createdAt: ago(25), hours: 120 });
    assert.equal(assertAgreement(other).status, 'on-track');

    const electricity = complaint({ priority: 'critical', category: 'Electricity', createdAt: ago(25), hours: 12 });
    assert.equal(assertAgreement(electricity).status, 'breached');
    assert.equal(getStalledStatusLabel(electricity, NOW), 'DELAYED');
});

test('Water Supply complaint uses its stored 24h SLA in every view', () => {
    const water = complaint({ category: 'Water Supply', priority: 'medium', createdAt: ago(25), hours: 24 });
    const g = complaintToGrievance(water);
    assert.equal(Date.parse(g.slaDeadline) - water.createdAt.getTime(), 24 * HOUR);
    assert.equal(calculateSLA(water, NOW).assignedHours, 24);
    assert.equal(assertAgreement(water).status, 'breached');
});

test('legacy records without a stored SLA fall back to category hours', () => {
    const legacy = complaint({ category: 'Water Supply', sla: undefined });
    assert.equal(getSLADeadline(legacy).getTime() - legacy.createdAt.getTime(), 24 * HOUR);
});

test('at-risk threshold is the last 25% of the window', () => {
    assert.equal(calculateSLA(complaint({ createdAt: ago(89), hours: 120 }), NOW).status, 'on-track');
    assert.equal(calculateSLA(complaint({ createdAt: ago(91), hours: 120 }), NOW).status, 'at-risk');
    assertAgreement(complaint({ createdAt: ago(91), hours: 120 }));
});

test('resolved/closed complaints freeze the clock and are never stalled', () => {
    const resolvedOnTime = complaint({ status: 'resolved', createdAt: ago(200), hours: 24, resolvedAt: ago(190) });
    const sla = assertAgreement(resolvedOnTime);
    assert.equal(sla.closed, true);
    assert.notEqual(sla.status, 'breached');
    assert.equal(isComplaintStalled(resolvedOnTime, NOW), false);

    const withdrawnLate = complaint({ status: 'closed', createdAt: ago(200), hours: 24, closedAt: ago(100) });
    assert.equal(assertAgreement(withdrawnLate).status, 'breached');
    assert.equal(dashboardSLA(withdrawnLate).closed, true);
    assert.equal(isComplaintStalled(withdrawnLate, NOW), false);
    assert.equal(getDashboardStats([withdrawnLate], NOW).breached, 0);
});

test('staff view keeps closed (withdrawn) complaints distinct from resolved ones', () => {
    assert.equal(complaintToGrievance(complaint({ status: 'resolved', resolvedAt: ago(1) })).status, 'RESOLVED');
    const withdrawn = complaintToGrievance(complaint({ status: 'closed', closedAt: ago(1), closedReason: 'withdrawn-by-citizen' }));
    assert.equal(withdrawn.status, 'CLOSED');
    assert.equal(withdrawn.closedReason, 'withdrawn-by-citizen');
});

test('inherited object keys are never categories', () => {
    for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
        assert.equal(isValidCategory(name), false, name);
        assert.deepEqual(
            policy.validateNewComplaint({ category: name, description: 'Pipe burst on main road', location: 'Ward 5' }),
            { ok: false, error: 'Invalid category' },
            name,
        );
        // Stored legacy data with such a category falls back to "Other" instead of undefined values
        assert.deepEqual(classifyComplaint('Pipe burst on main road', name), { department: 'General Administration', slaHours: 120, priority: 'low' }, name);
        assert.equal(slaHoursForCategory(name), 120, name);
    }
    assert.equal(isValidCategory('Water Supply'), true);
    assert.equal(classifyComplaint('Pipe burst on main road', 'Water Supply').department, 'Water Department');
});

test('missing Firebase Admin configuration is reported as 503, not as an invalid session', async () => {
    const { requireUser } = load('@/lib/server/auth');
    const request = new Request('http://localhost/api/complaints', { headers: { authorization: 'Bearer any-token' } });
    await assert.rejects(requireUser(request), err => err.status === 503);
    await assert.rejects(requireUser(new Request('http://localhost/api/complaints')), err => err.status === 401);

    const { POST } = load('@/app/api/complaints/route');
    const res = await POST(new NextRequest('http://localhost/api/complaints', {
        method: 'POST',
        headers: { authorization: 'Bearer any-token', 'content-type': 'application/json' },
        body: JSON.stringify({ category: 'Water Supply', description: 'Pipe burst on main road', location: 'Ward 5' }),
    }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.doesNotMatch(body.error, /session|sign in/i);
});

test('stalled detection uses time since the last status change', () => {
    const idle = complaint({ createdAt: ago(90), hours: 120, lastStatusChange: ago(85) });
    assert.equal(getStalledStatusLabel(idle, NOW), 'ACTION_REQUIRED');
    const recentlyMoved = complaint({ createdAt: ago(80), hours: 120, lastStatusChange: ago(2) });
    assert.equal(isComplaintStalled(recentlyMoved, NOW), false);
});

test('mapper keeps under-review, priority, photos and status timestamps', () => {
    const g = complaintToGrievance(complaint({
        status: 'under-review', priority: 'critical', photoURLs: ['https://x/y'], underReviewAt: ago(0.5),
    }));
    assert.equal(g.status, 'UNDER_REVIEW');
    assert.equal(g.priority, 'CRITICAL');
    assert.deepEqual(g.photoURLs, ['https://x/y']);
    assert.deepEqual(g.history.map(h => h.action), ['SUBMITTED', 'UNDER_REVIEW']);
});

test('view and update policy', () => {
    const c = complaint({ assignedDepartment: 'Water Department', status: 'pending' });
    const alice = { uid: 'alice', role: 'citizen' };
    const bob = { uid: 'bob', role: 'citizen' };
    const water = { uid: 'w', role: 'official', department: 'Water Department' };
    const power = { uid: 'p', role: 'official', department: 'Electricity Board' };
    const noDept = { uid: 'n', role: 'official' };
    const admin = { uid: 'a', role: 'admin' };

    assert.ok(policy.canViewComplaint(alice, c));
    assert.ok(!policy.canViewComplaint(bob, c));
    assert.ok(policy.canViewComplaint(water, c));
    assert.ok(!policy.canViewComplaint(power, c));
    assert.ok(!policy.canViewComplaint(noDept, c));
    assert.ok(policy.canViewComplaint(admin, c));

    assert.equal(policy.checkStatusChange(water, c, 'under-review'), null);
    assert.match(policy.checkStatusChange(water, c, 'resolved'), /Only an authority/);
    assert.match(policy.checkStatusChange(power, c, 'in-progress'), /Not authorized/);
    assert.match(policy.checkStatusChange(alice, c, 'in-progress'), /Not authorized/);
    assert.equal(policy.checkStatusChange(admin, c, 'resolved'), null);
    assert.match(policy.checkStatusChange(admin, c, 'bogus'), /Invalid status/);
    assert.match(policy.checkStatusChange(admin, { ...c, status: 'closed' }, 'pending'), /Cannot change status/);

    assert.equal(policy.checkPriorityChange(admin, c, 'critical'), null);
    assert.match(policy.checkPriorityChange(water, c, 'critical'), /Only an authority/);
    assert.match(policy.checkPriorityChange(admin, c, 'urgent'), /Invalid priority/);
});

test('withdrawal vs deletion policy', () => {
    const alice = { uid: 'alice', role: 'citizen' };
    assert.equal(policy.deletionMode(alice, complaint({ status: 'pending' })), 'withdraw');
    assert.equal(policy.deletionMode(alice, complaint({ status: 'under-review' })), 'withdraw');
    assert.equal(policy.deletionMode(alice, complaint({ status: 'in-progress' })), null);
    assert.equal(policy.deletionMode({ uid: 'bob', role: 'citizen' }, complaint()), null);
    assert.equal(policy.deletionMode({ uid: 'w', role: 'official', department: 'General Administration' }, complaint()), null);
    assert.equal(policy.deletionMode({ uid: 'a', role: 'admin' }, complaint({ status: 'in-progress' })), 'delete');
});

test('new complaint validation', () => {
    const ok = policy.validateNewComplaint({ category: 'Water Supply', description: '  Pipe burst on main road  ', location: 'Ward 5', title: '' });
    assert.ok(ok.ok);
    assert.equal(ok.value.title, 'Water Supply Issue');
    assert.equal(ok.value.description, 'Pipe burst on main road');
    assert.deepEqual(ok.value.photoURLs, []);

    const bad = [
        { category: 'Water Supply', description: 'Pipe burst on main road', location: 'Ward 5', citizenId: 'x' },
        { category: 'Nope', description: 'Pipe burst on main road', location: 'Ward 5' },
        { category: 'Water Supply', description: 'short', location: 'Ward 5' },
        { category: 'Water Supply', description: 'x'.repeat(2001), location: 'Ward 5' },
        { category: 'Water Supply', description: 'Pipe burst on main road', location: 7 },
        { category: 'Water Supply', description: 'Pipe burst on main road', location: 'Ward 5', photoURLs: ['a', 'b', 'c', 'd'] },
        [],
        null,
    ];
    for (const body of bad) assert.equal(policy.validateNewComplaint(body).ok, false, JSON.stringify(body));
});

test('evidence URLs must point into the uploader\'s own folder', () => {
    const opts = { uid: 'alice', bucket: 'demo.appspot.com', emulatorHost: '127.0.0.1:9199' };
    const url = (path, host = 'https://firebasestorage.googleapis.com', bucket = 'demo.appspot.com') =>
        `${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`;

    assert.equal(policy.evidencePathFromURL(url('complaints/alice/u1/photo.jpg'), opts), 'complaints/alice/u1/photo.jpg');
    assert.equal(policy.evidencePathFromURL(url('complaints/alice/u1/photo.jpg', 'http://127.0.0.1:9199'), opts), 'complaints/alice/u1/photo.jpg');
    assert.equal(policy.evidencePathFromURL(url('complaints/bob/u1/photo.jpg'), opts), null);
    assert.equal(policy.evidencePathFromURL(url('complaints/alice/../bob/photo.jpg'), opts), null);
    assert.equal(policy.evidencePathFromURL(url('complaints/alice/u1/photo.jpg', 'https://firebasestorage.googleapis.com', 'other'), opts), null);
    assert.equal(policy.evidencePathFromURL(url('complaints/alice/u1/photo.jpg', 'http://firebasestorage.googleapis.com'), opts), null);
    assert.equal(policy.evidencePathFromURL(url('complaints/alice/u1/photo.jpg', 'https://evil.example'), opts), null);
    assert.equal(policy.evidencePathFromURL('not a url', opts), null);
});

test('ticket validation', () => {
    assert.ok(policy.validateTicket({ reason: 'SLA deadline breached', message: 'please' }).ok);
    assert.equal(policy.validateTicket({ reason: 'made up' }).ok, false);
    assert.equal(policy.validateTicket({ reason: 'Other', message: 'x'.repeat(1001) }).ok, false);
});

test('GPS fix is appended once, keeps typed text, fits the limit and labels broad estimates', () => {
    const fix = { latitude: 18.520412, longitude: 73.856743, accuracy: 25.4 };
    const once = policy.withGpsFix('Ward 7 market gate', fix);
    assert.equal(once, 'Ward 7 market gate (GPS 18.52041, 73.85674 ±25 m)');
    // A second press replaces the earlier fix instead of appending another
    assert.equal(policy.withGpsFix(once, { ...fix, accuracy: 9 }), 'Ward 7 market gate (GPS 18.52041, 73.85674 ±9 m)');
    assert.equal(policy.withGpsFix('', fix), 'GPS 18.52041, 73.85674 ±25 m');

    const coarse = policy.withGpsFix('Near bus stand', { ...fix, accuracy: 3200 });
    assert.equal(coarse, 'Near bus stand (GPS 18.520, 73.857 ±3.2 km, approximate)');

    // Long typed text is shortened so the whole fix still fits within the validated length
    const long = policy.withGpsFix('x'.repeat(400), fix);
    assert.ok(long.length <= policy.MAX_LOCATION);
    assert.match(long, /\(GPS 18\.52041, 73\.85674 ±25 m\)$/);
    assert.equal(policy.validateNewComplaint({ category: 'Other', description: 'Something is broken here', location: long }).ok, true);
});

test('citizen status breakdown counts each complaint once and keeps withdrawal apart from resolution', () => {
    const at = new Date(NOW);
    const sample = [
        { status: 'pending' }, { status: 'under-review' }, { status: 'under-review' }, { status: 'in-progress' },
        { status: 'escalated' }, { status: 'resolved', resolvedAt: at },
        { status: 'closed', resolvedAt: at, closedAt: at }, // resolved, later closed
        { status: 'closed', closedReason: 'withdrawn-by-citizen', closedAt: at },
        { status: 'closed', closedAt: at }, // closed without resolution
    ];
    const counts = Object.fromEntries(policy.CITIZEN_STATUSES.map(s => [s.key, 0]));
    sample.forEach(c => counts[policy.citizenStatus(c)]++);
    assert.deepEqual(counts, { 'pending': 1, 'under-review': 2, 'in-progress': 1, 'escalated': 1, 'resolved': 2, 'closed': 1, 'withdrawn': 1 });
    assert.equal(Object.values(counts).reduce((a, b) => a + b), sample.length);
    // Every stored status has a segment
    for (const status of policy.COMPLAINT_STATUSES) assert.ok(policy.CITIZEN_STATUSES.some(s => s.key === policy.citizenStatus({ status })));
});

test('transfer validation and policy', () => {
    const body = { department: 'Water Department', fromDepartment: 'Electricity Board', reason: 'Water pipe leak filed under Electricity' };
    assert.deepEqual(policy.validateTransfer(body), { ok: true, value: body });
    assert.equal(policy.validateTransfer({ ...body, department: 'Forged Department' }).ok, false);
    assert.equal(policy.validateTransfer({ ...body, department: 'toString' }).ok, false);
    assert.equal(policy.validateTransfer({ ...body, reason: 'bad' }).ok, false);
    assert.equal(policy.validateTransfer({ ...body, reason: 'x'.repeat(201) }).ok, false);
    assert.equal(policy.validateTransfer({ department: body.department, reason: body.reason }).ok, false);
    assert.deepEqual(policy.DEPARTMENTS.slice().sort(), ['Electricity Board', 'General Administration', 'Public Works Department', 'Sanitation Department', 'Transport Department', 'Water Department']);

    const input = policy.validateTransfer(body).value;
    const c = { citizenId: 'alice', status: 'in-progress', department: 'Electricity Board', assignedDepartment: 'Electricity Board' };
    const adminActor = { uid: 'a', role: 'admin' };
    assert.equal(policy.checkTransfer(adminActor, c, input), null);
    assert.equal(policy.checkTransfer({ uid: 'o', role: 'official', department: 'Electricity Board' }, c, input)[0], 403);
    assert.equal(policy.checkTransfer({ uid: 'alice', role: 'citizen' }, c, input)[0], 403);
    assert.equal(policy.checkTransfer(adminActor, { ...c, status: 'resolved' }, input)[0], 409);
    assert.equal(policy.checkTransfer(adminActor, { ...c, status: 'closed' }, input)[0], 409);
    assert.equal(policy.checkTransfer(adminActor, { ...c, assignedDepartment: 'Water Department' }, input)[0], 409); // stale view
    assert.equal(policy.checkTransfer(adminActor, c, { ...input, department: 'Electricity Board' })[0], 400); // same department
});

test('mapper shows the current department and transfers in the staff timeline', () => {
    const at = new Date(NOW - HOUR);
    const g = complaintToGrievance(complaint({
        category: 'Electricity', department: 'Water Department', assignedDepartment: 'Water Department',
        transfers: [{ from: 'Electricity Board', to: 'Water Department', reason: 'Pipe leak', at }],
    }));
    assert.equal(g.category, 'Electricity');
    assert.equal(g.department, 'Water Department');
    const entry = g.history.find(h => h.action === 'TRANSFERRED');
    assert.equal(entry.timestamp, at.toISOString());
    assert.equal(entry.details, 'Electricity Board → Water Department: Pipe leak');
});
