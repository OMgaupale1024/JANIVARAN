// Unit tests for SLA, mapping and policy logic. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.cjs');

const { calculateSLA, getSLADeadline } = load('@/lib/services/sla-service');
const { isComplaintStalled, isSLABreached, getStalledStatusLabel } = load('@/lib/services/stalled-detection-service');
const { complaintToGrievance } = load('@/lib/utils/type-mappers');
const { getDashboardStats } = load('@/lib/services/dashboard-service');
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
const dashboardSLA = c => {
    const g = complaintToGrievance(c);
    return calculateSLA({
        createdAt: g.submittedAt,
        sla: { deadline: g.slaDeadline, assignedHours: g.slaHours },
        status: g.status === 'RESOLVED' ? 'resolved' : 'open',
        resolvedAt: g.resolvedAt,
    }, NOW);
};

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
    assert.equal(calculateSLA(withdrawnLate, NOW).status, 'breached');
    assert.equal(isComplaintStalled(withdrawnLate, NOW), false);
    assert.equal(getDashboardStats([withdrawnLate], NOW).breached, 0);
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
