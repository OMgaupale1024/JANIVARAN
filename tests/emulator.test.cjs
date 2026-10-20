// Security-rules and API integration tests against the Firebase emulators.
// Run: npm run test:emulator  (wraps this file in `firebase emulators:exec`)
const test = require('node:test');
const assert = require('node:assert/strict');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-jannivaran';
const BUCKET = `${PROJECT}.appspot.com`;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

// Configure the server code for the emulators before loading it; no SMTP = no real mail
Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: FIRESTORE,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH,
    FIREBASE_STORAGE_EMULATOR_HOST: STORAGE,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: BUCKET,
});
for (const key of ['SMTP_USER', 'SMTP_PASS', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_PROJECT_ID']) delete process.env[key];

const load = require('./load.cjs');
const { NextRequest } = require('next/server');
const { initializeApp, deleteApp } = require('firebase/app');
const fs = require('firebase/firestore');
const st = require('firebase/storage');
const { adminDb, adminBucket } = load('@/lib/firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const routes = {
    complaints: load('@/app/api/complaints/route'),
    complaint: load('@/app/api/complaints/[id]/route'),
    intervene: load('@/app/api/complaints/[id]/intervene/route'),
    grievances: load('@/app/api/grievances/route'),
    track: load('@/app/api/track/route'),
    stats: load('@/app/api/dashboard/stats/route'),
    simulation: load('@/app/api/simulation/route'),
    welcome: load('@/app/api/user/welcome/route'),
};

const HOUR = 60 * 60 * 1000;
const [fsHost, fsPort] = FIRESTORE.split(':');
const [stHost, stPort] = STORAGE.split(':');

// ---------- helpers ----------

async function signUp(email) {
    const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'secret-pass-123', returnSecureToken: true }),
    });
    const body = await res.json();
    assert.ok(body.idToken, `signUp failed: ${JSON.stringify(body)}`);
    return { uid: body.localId, email, token: body.idToken };
}

async function makeUser(email, role, department) {
    const user = await signUp(email);
    await adminDb().collection('users').doc(user.uid).set({
        uid: user.uid, email, displayName: email.split('@')[0], role, ...(department ? { department } : {}),
        createdAt: Timestamp.now(), lastLogin: Timestamp.now(),
    });
    return user;
}

async function call(handler, { method = 'GET', path = '/', token, body, id } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const req = new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await handler(req, { params: Promise.resolve({ id }) });
    return { status: res.status, body: await res.json() };
}

const clientApps = [];
function clientFor(user) {
    const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key', storageBucket: BUCKET }, `client-${clientApps.length}`);
    clientApps.push(app);
    const db = fs.getFirestore(app);
    const storage = st.getStorage(app);
    const mockUserToken = user ? { sub: user.uid, user_id: user.uid, email: user.email } : undefined;
    fs.connectFirestoreEmulator(db, fsHost, Number(fsPort), mockUserToken ? { mockUserToken } : {});
    st.connectStorageEmulator(storage, stHost, Number(stPort), mockUserToken ? { mockUserToken } : {});
    return { db, storage };
}

const denied = async (promise) => {
    await assert.rejects(promise, err => /permission|PERMISSION_DENIED|unauthorized|403/i.test(`${err.code} ${err.message}`));
};

async function seedComplaint(fields) {
    const now = Date.now();
    const ref = adminDb().collection('complaints').doc();
    await ref.set({
        trackingId: `JAN-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        title: 'Seeded', description: 'Seeded complaint', category: 'Water Supply', location: 'Ward 1',
        department: 'Water Department', assignedDepartment: 'Water Department',
        status: 'pending', priority: 'medium', photoURLs: [],
        sla: { assignedHours: 24, deadline: Timestamp.fromMillis(now + 24 * HOUR), remainingHours: 24, status: 'on-track' },
        createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now),
        ...fields,
    });
    return ref.id;
}

async function uploadEvidence(uid, name = 'photo.jpg', contentType = 'image/jpeg') {
    const path = `complaints/${uid}/${Math.random().toString(36).slice(2)}/${name}`;
    await adminBucket().file(path).save(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { contentType });
    return `http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=test`;
}

// ---------- fixtures ----------

let alice, bob, waterOfficial, powerOfficial, admin;
let aliceComplaint, bobComplaint, powerComplaint;

test.before(async () => {
    await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

    alice = await makeUser('alice@example.test', 'citizen');
    bob = await makeUser('bob@example.test', 'citizen');
    waterOfficial = await makeUser('water@example.test', 'official', 'Water Department');
    powerOfficial = await makeUser('power@example.test', 'official', 'Electricity Board');
    admin = await makeUser('admin@example.test', 'admin');

    aliceComplaint = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });
    bobComplaint = await seedComplaint({ citizenId: bob.uid, citizenEmail: bob.email });
    powerComplaint = await seedComplaint({
        citizenId: bob.uid, category: 'Electricity', department: 'Electricity Board', assignedDepartment: 'Electricity Board',
    });
    await adminDb().collection('auditLogs').add({ complaintId: aliceComplaint, action: 'seed', timestamp: Timestamp.now() });
});

// Close SDK connections so the test process can exit
test.after(async () => {
    await Promise.all(clientApps.map(app => deleteApp(app)));
    const admin = require('firebase-admin/app');
    await Promise.all(admin.getApps().map(app => admin.deleteApp(app)));
});

// ---------- Firestore rules ----------

test('rules: unauthenticated clients cannot read anything', async () => {
    const { db } = clientFor(null);
    await denied(fs.getDoc(fs.doc(db, 'complaints', aliceComplaint)));
    await denied(fs.getDocs(fs.collection(db, 'complaints')));
    await denied(fs.getDoc(fs.doc(db, 'users', alice.uid)));
});

test('rules: citizens see only their own complaints', async () => {
    const { db } = clientFor(alice);
    assert.equal((await fs.getDoc(fs.doc(db, 'complaints', aliceComplaint))).data().citizenId, alice.uid);
    await denied(fs.getDoc(fs.doc(db, 'complaints', bobComplaint)));
    const own = await fs.getDocs(fs.query(fs.collection(db, 'complaints'), fs.where('citizenId', '==', alice.uid), fs.orderBy('createdAt', 'desc')));
    assert.deepEqual(own.docs.map(d => d.id), [aliceComplaint]);
    await denied(fs.getDocs(fs.query(fs.collection(db, 'complaints'), fs.where('citizenId', '==', bob.uid))));
    await denied(fs.getDocs(fs.collection(db, 'complaints')));
});

test('rules: browsers cannot write complaints, audit logs or tracking IDs', async () => {
    const { db } = clientFor(alice);
    await denied(fs.addDoc(fs.collection(db, 'complaints'), { citizenId: alice.uid, title: 'x' }));
    await denied(fs.updateDoc(fs.doc(db, 'complaints', aliceComplaint), { status: 'resolved' }));
    await denied(fs.deleteDoc(fs.doc(db, 'complaints', aliceComplaint)));
    await denied(fs.addDoc(fs.collection(db, 'auditLogs'), { complaintId: aliceComplaint }));
    await denied(fs.getDocs(fs.collection(db, 'auditLogs')));
    const adminClient = clientFor(admin);
    await denied(fs.getDoc(fs.doc(adminClient.db, 'trackingIds', 'JAN-000000')));
});

test('rules: signup creates a citizen profile and roles cannot be self-assigned', async () => {
    const carol = await signUp('carol@example.test');
    const { db } = clientFor(carol);
    const ref = fs.doc(db, 'users', carol.uid);
    const base = { uid: carol.uid, email: carol.email, displayName: 'Carol', createdAt: fs.Timestamp.now(), lastLogin: fs.Timestamp.now() };

    await denied(fs.setDoc(ref, { ...base, role: 'admin' }));
    await denied(fs.setDoc(ref, { ...base, role: 'citizen', department: 'Water Department' }));
    await denied(fs.setDoc(fs.doc(db, 'users', bob.uid), { ...base, uid: bob.uid, role: 'citizen' }));
    await fs.setDoc(ref, { ...base, role: 'citizen' });

    assert.equal((await fs.getDoc(ref)).data().role, 'citizen');
    await denied(fs.updateDoc(ref, { role: 'admin' }));
    await denied(fs.updateDoc(ref, { role: 'official', department: 'Water Department' }));
    await denied(fs.setDoc(ref, { ...base, role: 'admin' }));
    await fs.updateDoc(ref, { displayName: 'Carol K', lastLogin: fs.Timestamp.now() });
    await denied(fs.getDoc(fs.doc(db, 'users', alice.uid)));
});

test('rules: officials are limited to their department; admins see all', async () => {
    const { db } = clientFor(waterOfficial);
    const water = await fs.getDocs(fs.query(fs.collection(db, 'complaints'), fs.where('assignedDepartment', '==', 'Water Department')));
    assert.ok(water.size >= 2);
    await denied(fs.getDocs(fs.query(fs.collection(db, 'complaints'), fs.where('assignedDepartment', '==', 'Electricity Board'))));
    await denied(fs.getDoc(fs.doc(db, 'complaints', powerComplaint)));
    await denied(fs.getDocs(fs.collection(db, 'complaints')));

    const adminClient = clientFor(admin);
    assert.ok((await fs.getDocs(fs.collection(adminClient.db, 'complaints'))).size >= 3);
    assert.ok((await fs.getDocs(fs.collection(adminClient.db, 'auditLogs'))).size >= 1);
});

// ---------- Storage rules ----------

test('storage rules: owners upload images to their own folder only', async () => {
    const { storage } = clientFor(alice);
    const ok = st.ref(storage, `complaints/${alice.uid}/u1/photo.jpg`);
    await st.uploadBytes(ok, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
    assert.match(await st.getDownloadURL(ok), /alt=media/);

    await denied(st.uploadBytes(st.ref(storage, `complaints/${bob.uid}/u1/photo.jpg`), new Uint8Array([1]), { contentType: 'image/jpeg' }));
    await denied(st.uploadBytes(st.ref(storage, `complaints/${alice.uid}/u2/a.txt`), new Uint8Array([1]), { contentType: 'text/plain' }));
    await denied(st.uploadBytes(st.ref(storage, `complaints/${alice.uid}/u3/big.jpg`), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
    await denied(st.uploadBytes(st.ref(storage, `elsewhere/${alice.uid}.jpg`), new Uint8Array([1]), { contentType: 'image/jpeg' }));
    await denied(st.getDownloadURL(st.ref(clientFor(bob).storage, `complaints/${alice.uid}/u1/photo.jpg`)));
});

// ---------- API ----------

test('api: unauthenticated and forged-token requests are rejected', async () => {
    const id = aliceComplaint;
    assert.equal((await call(routes.complaints.GET)).status, 401);
    assert.equal((await call(routes.complaints.POST, { method: 'POST', body: {} })).status, 401);
    assert.equal((await call(routes.complaint.GET, { id })).status, 401);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, body: { action: 'updateStatus', status: 'resolved' } })).status, 401);
    assert.equal((await call(routes.complaint.DELETE, { method: 'DELETE', id })).status, 401);
    assert.equal((await call(routes.intervene.POST, { method: 'POST', id, body: { action: 'call' } })).status, 401);
    assert.equal((await call(routes.grievances.GET, { path: '/api/grievances?role=admin' })).status, 401);
    assert.equal((await call(routes.stats.GET)).status, 401);
    assert.equal((await call(routes.welcome.POST, { method: 'POST' })).status, 401);
    assert.equal((await call(routes.complaint.DELETE, { method: 'DELETE', id, token: 'not-a-token' })).status, 401);
    assert.ok(await adminDb().collection('complaints').doc(id).get().then(d => d.exists));
});

test('api: citizen A cannot read, edit, delete or escalate citizen B\'s complaint', async () => {
    const id = bobComplaint;
    assert.equal((await call(routes.complaint.GET, { id, token: alice.token })).status, 404);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: alice.token, body: { action: 'updateStatus', status: 'resolved' } })).status, 403);
    assert.equal((await call(routes.complaint.DELETE, { method: 'DELETE', id, token: alice.token })).status, 403);
    assert.equal((await call(routes.intervene.POST, { method: 'POST', id, token: alice.token, body: { action: 'raise-ticket', reason: 'Other' } })).status, 403);
    assert.equal((await call(routes.intervene.POST, { method: 'POST', id, token: alice.token, body: { action: 'call' } })).status, 403);

    const own = await call(routes.complaints.GET, { path: `/api/complaints?citizenId=${bob.uid}`, token: alice.token });
    assert.equal(own.status, 200);
    assert.ok(own.body.data.every(c => c.citizenId === alice.uid));
    assert.equal((await adminDb().collection('complaints').doc(id).get()).data().status, 'pending');
});

test('api: caller-supplied identity and roles are ignored', async () => {
    const forged = await call(routes.complaint.PATCH, {
        method: 'PATCH', id: aliceComplaint, token: alice.token,
        body: { action: 'updateStatus', status: 'resolved', user: { uid: admin.uid, role: 'admin' } },
    });
    assert.equal(forged.status, 400);
    const asCitizen = await call(routes.complaint.PATCH, { method: 'PATCH', id: aliceComplaint, token: alice.token, body: { action: 'updateStatus', status: 'resolved' } });
    assert.equal(asCitizen.status, 403);

    const list = await call(routes.grievances.GET, { path: '/api/grievances?role=admin&department=Electricity%20Board', token: waterOfficial.token });
    assert.equal(list.status, 200);
    assert.ok(list.body.length >= 2);
    assert.ok(!list.body.some(g => g.id === powerComplaint));
    assert.equal((await call(routes.stats.GET, { token: alice.token })).status, 403);
});

test('api: complaint submission with evidence', async () => {
    const photo = await uploadEvidence(alice.uid);
    const res = await call(routes.complaints.POST, {
        method: 'POST', token: alice.token,
        body: { category: 'Water Supply', title: 'Leak', description: 'Main pipe leaking near the market', location: 'Ward 7', photoURLs: [photo] },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.trackingId, /^JAN-\d{6}$/);
    assert.equal(res.body.notification, 'skipped');

    const stored = (await adminDb().collection('complaints').doc(res.body.data.id).get()).data();
    assert.equal(stored.citizenId, alice.uid);
    assert.equal(stored.department, 'Water Department');
    assert.equal(stored.sla.assignedHours, 24);
    assert.equal(stored.sla.deadline.toMillis() - stored.createdAt.toMillis(), 24 * HOUR);
    assert.deepEqual(stored.photoURLs, [photo]);
    assert.ok((await adminDb().collection('trackingIds').doc(stored.trackingId).get()).exists);

    const bobsPhoto = await uploadEvidence(bob.uid);
    const stolen = await call(routes.complaints.POST, {
        method: 'POST', token: alice.token,
        body: { category: 'Water Supply', description: 'Main pipe leaking near the market', location: 'Ward 7', photoURLs: [bobsPhoto] },
    });
    assert.equal(stolen.status, 400);
    const notImage = await call(routes.complaints.POST, {
        method: 'POST', token: alice.token,
        body: { category: 'Water Supply', description: 'Main pipe leaking near the market', location: 'Ward 7', photoURLs: [await uploadEvidence(alice.uid, 'x.txt', 'text/plain')] },
    });
    assert.equal(notImage.status, 400);
    const injected = await call(routes.complaints.POST, {
        method: 'POST', token: alice.token,
        body: { category: 'Water Supply', description: 'Main pipe leaking near the market', location: 'Ward 7', status: 'resolved' },
    });
    assert.equal(injected.status, 400);
});

test('api: tracking IDs are unique across many submissions', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => call(routes.complaints.POST, {
        method: 'POST', token: bob.token,
        body: { category: 'Other', description: `Bulk complaint number ${i} for uniqueness`, location: 'Ward 9' },
    })));
    assert.ok(results.every(r => r.status === 201), JSON.stringify(results.find(r => r.status !== 201)?.body));
    const ids = results.map(r => r.body.data.trackingId);
    assert.equal(new Set(ids).size, ids.length);
});

test('api: public tracking returns a redacted view', async () => {
    const trackingId = (await adminDb().collection('complaints').doc(aliceComplaint).get()).data().trackingId;
    const res = await call(routes.track.GET, { path: `/api/track?trackingId=${trackingId.toLowerCase()}` });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.trackingId, trackingId);
    for (const key of ['citizenId', 'citizenEmail', 'citizenName', 'description', 'photoURLs', 'citizenTickets']) {
        assert.ok(!(key in res.body.data), `leaked ${key}`);
    }
    assert.equal(typeof res.body.data.createdAt, 'string');
    assert.equal((await call(routes.track.GET, { path: '/api/track?trackingId=JAN-000001' })).status, 404);
    assert.equal((await call(routes.track.GET, { path: '/api/track?trackingId=../../users' })).status, 400);
});

test('api: officials work only their department and cannot resolve or reprioritise', async () => {
    const id = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });
    const ok = await call(routes.complaint.PATCH, { method: 'PATCH', id, token: waterOfficial.token, body: { action: 'updateStatus', status: 'under-review' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const doc = (await adminDb().collection('complaints').doc(id).get()).data();
    assert.equal(doc.status, 'under-review');
    assert.ok(doc.underReviewAt && doc.lastStatusChange);

    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: waterOfficial.token, body: { action: 'updateStatus', status: 'resolved' } })).status, 403);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: waterOfficial.token, body: { action: 'updateStatus', priority: 'critical' } })).status, 403);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id: powerComplaint, token: waterOfficial.token, body: { action: 'updateStatus', status: 'in-progress' } })).status, 403);
    assert.equal((await call(routes.complaint.GET, { id: powerComplaint, token: waterOfficial.token })).status, 404);
    assert.equal((await call(routes.complaint.DELETE, { method: 'DELETE', id, token: waterOfficial.token })).status, 403);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id: powerComplaint, token: powerOfficial.token, body: { action: 'updateStatus', status: 'in-progress' } })).status, 200);
});

test('api: authority Prioritize saves priority and status together and it survives reload', async () => {
    const id = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email, status: 'under-review' });
    const res = await call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'updateStatus', status: 'in-progress', priority: 'critical' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.notification, 'skipped');

    const reloaded = await call(routes.complaint.GET, { id, token: admin.token, path: `/api/complaints/${id}?includeAudit=true` });
    const c = reloaded.body.data.complaint;
    assert.equal(c.priority, 'critical');
    assert.equal(c.status, 'in-progress');
    assert.ok(c.inProgressAt && c.lastStatusChange);
    const actions = reloaded.body.data.auditLogs.map(l => l.action).sort();
    assert.deepEqual(actions, ['priority_changed', 'status_changed']);
    assert.ok(reloaded.body.data.auditLogs.every(l => l.performedBy === admin.uid && l.performedByRole === 'admin'));

    // Citizen view reflects the same persisted priority
    assert.equal((await call(routes.complaint.GET, { id, token: alice.token })).body.data.complaint.priority, 'critical');
    assert.equal((await call(routes.complaint.GET, { id, token: alice.token, path: `/x?includeAudit=true` })).body.data.auditLogs, undefined);

    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'updateStatus', status: 'resolved' } })).status, 200);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'updateStatus', status: 'pending' } })).status, 400);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'updateStatus', status: 'bogus' } })).status, 400);
    assert.equal((await call(routes.complaint.PATCH, { method: 'PATCH', id: 'a/b', token: admin.token, body: { action: 'updateStatus', status: 'closed' } })).status, 400);
});

test('api: concurrent citizen tickets are all kept', async () => {
    const id = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call(routes.intervene.POST, {
        method: 'POST', id, token: alice.token, body: { action: 'raise-ticket', reason: 'Other', message: `ticket ${i}` },
    })));
    assert.ok(results.every(r => r.status === 200), JSON.stringify(results.map(r => r.body)));

    const doc = (await adminDb().collection('complaints').doc(id).get()).data();
    assert.equal(doc.citizenTickets.length, 8);
    assert.equal(new Set(doc.citizenTickets.map(t => t.message)).size, 8);
    assert.equal(doc.priority, 'high');
    assert.ok(doc.escalatedAt);
    const audits = await adminDb().collection('auditLogs').where('complaintId', '==', id).get();
    assert.equal(audits.size, 8);

    const call_ = await call(routes.intervene.POST, { method: 'POST', id, token: alice.token, body: { action: 'call' } });
    assert.equal(call_.status, 200);
    assert.equal(call_.body.contact.department, 'Water Supply Department');
    assert.equal((await call(routes.intervene.POST, { method: 'POST', id, token: alice.token, body: { action: 'raise-ticket', reason: 'not allowed' } })).status, 400);
});

test('api: citizens withdraw only before work starts; only authorities delete', async () => {
    const pending = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });
    const res = await call(routes.complaint.DELETE, { method: 'DELETE', id: pending, token: alice.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'withdrawn');
    const withdrawn = (await adminDb().collection('complaints').doc(pending).get()).data();
    assert.equal(withdrawn.status, 'closed');
    assert.equal(withdrawn.closedReason, 'withdrawn-by-citizen');

    const started = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email, status: 'in-progress' });
    assert.equal((await call(routes.complaint.DELETE, { method: 'DELETE', id: started, token: alice.token })).status, 403);

    const photo = await uploadEvidence(alice.uid);
    const withPhoto = await seedComplaint({ citizenId: alice.uid, status: 'in-progress', photoURLs: [photo] });
    const del = await call(routes.complaint.DELETE, { method: 'DELETE', id: withPhoto, token: admin.token });
    assert.equal(del.body.outcome, 'deleted');
    assert.equal((await adminDb().collection('complaints').doc(withPhoto).get()).exists, false);
    const audit = await adminDb().collection('auditLogs').where('complaintId', '==', withPhoto).where('action', '==', 'deleted').get();
    assert.equal(audit.size, 1);
    const path = decodeURIComponent(new URL(photo).pathname.split('/o/')[1]);
    assert.equal((await adminBucket().file(path).exists())[0], false);
});

test('api: welcome email goes only to the verified address, once', async () => {
    const first = await call(routes.welcome.POST, { method: 'POST', token: bob.token, body: { user: { email: 'victim@example.test' } } });
    assert.equal(first.status, 200);
    assert.equal(first.body.notification, 'skipped'); // no SMTP in tests
    assert.ok((await adminDb().collection('users').doc(bob.uid).get()).data().welcomeEmailSentAt);
    const second = await call(routes.welcome.POST, { method: 'POST', token: bob.token });
    assert.equal(second.body.reason, 'already-sent');
});

test('api: simulation is admin-only, test-data-only, and disabled in production', async () => {
    const real = await seedComplaint({ citizenId: alice.uid });
    const demo = await seedComplaint({ citizenId: alice.uid, testData: true });
    const before = id => adminDb().collection('complaints').doc(id).get().then(d => d.data());
    const [realBefore, demoBefore] = await Promise.all([before(real), before(demo)]);

    assert.equal((await call(routes.simulation.POST, { method: 'POST', token: alice.token, body: { action: 'FORWARD_TIME', hours: 2 } })).status, 403);
    const ok = await call(routes.simulation.POST, { method: 'POST', token: admin.token, body: { action: 'FORWARD_TIME', hours: 2 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const [realAfter, demoAfter] = await Promise.all([before(real), before(demo)]);
    assert.equal(realAfter.createdAt.toMillis(), realBefore.createdAt.toMillis());
    assert.equal(demoBefore.createdAt.toMillis() - demoAfter.createdAt.toMillis(), 2 * HOUR);
    assert.equal(demoBefore.sla.deadline.toMillis() - demoAfter.sla.deadline.toMillis(), 2 * HOUR);

    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        assert.equal((await call(routes.simulation.POST, { method: 'POST', token: admin.token, body: { action: 'FORWARD_TIME' } })).status, 404);
    } finally {
        process.env.NODE_ENV = env;
    }
});

test('api: official without a department is denied, not shown everything', async () => {
    const orphan = await makeUser('orphan@example.test', 'official');
    assert.equal((await call(routes.complaints.GET, { token: orphan.token })).status, 403);
    assert.equal((await call(routes.complaint.GET, { id: aliceComplaint, token: orphan.token })).status, 404);
});
