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
const nextServer = require('./next-server.cjs');
const { NextRequest } = require('next/server');
const { initializeApp, deleteApp } = require('firebase/app');
const fs = require('firebase/firestore');
const st = require('firebase/storage');
const { adminDb, adminBucket, adminAuth } = load('@/lib/firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const net = require('net');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const nodeFs = require('fs');

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

async function call(handler, { method = 'GET', path = '/', token, body, id, headers: extra = {} } = {}) {
    const headers = { ...extra };
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

async function uploadEvidence(uid, name = 'photo.jpg', contentType = 'image/jpeg', bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0])) {
    const path = `complaints/${uid}/${Math.random().toString(36).slice(2)}/${name}`;
    await adminBucket().file(path).save(bytes, { contentType });
    return `http://${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=test`;
}

const complaintDoc = id => adminDb().collection('complaints').doc(id).get().then(d => d.data());

// A local SMTP endpoint: 'stall' accepts connections and never answers, 'reject' refuses service
async function fakeSmtp(mode) {
    const sockets = new Set();
    let onConnect;
    const connected = new Promise(resolve => { onConnect = resolve; });
    const server = net.createServer(socket => {
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
        onConnect();
        if (mode === 'reject') socket.end('554 5.3.2 Service unavailable\r\n');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        port: server.address().port,
        connected,
        close: () => new Promise(resolve => { sockets.forEach(s => s.destroy()); server.close(() => resolve()); }),
    };
}

// Point the mail code at a local port with credentials set; returns a restore function
function useSmtp(port) {
    const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_OVERRIDE_TO'];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER: 'robot', SMTP_PASS: 'not-a-real-password', EMAIL_OVERRIDE_TO: 'qa-inbox@jannivaran-qa.net' });
    return () => keys.forEach(k => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
}

// Unsigned emulator ID token that expired an hour ago
function expiredToken(user) {
    const part = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${part({ alg: 'none', typ: 'JWT' })}.${part({
        iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: user.uid, user_id: user.uid,
        email: user.email, auth_time: now - 7200, iat: now - 7200, exp: now - 3600,
    })}.`;
}

async function signIn(email, password) {
    const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return res.json();
}

const PROVISION = path.join(__dirname, '..', 'scripts', 'provision-demo.mjs');
function provision(args, env = process.env) {
    return spawnSync(process.execPath, [PROVISION, ...args], { env, encoding: 'utf8', timeout: 60_000 });
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
    await denied(fs.setDoc(ref, { ...base, role: 'citizen', demo: true }));
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
    assert.equal(res.body.data.status, 'pending');
    assert.equal(res.body.data.category, 'Water Supply');
    // Free text (title, location) can hold addresses or names, so it stays private too
    for (const key of ['citizenId', 'citizenEmail', 'citizenName', 'description', 'photoURLs', 'citizenTickets', 'title', 'location', 'assignedTo']) {
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

test('api: welcome email goes only to the verified address, once, and records what really happened', async () => {
    const first = await call(routes.welcome.POST, { method: 'POST', token: bob.token, body: { user: { email: 'victim@example.test' } } });
    assert.equal(first.status, 200);
    assert.equal(first.body.notification, 'skipped'); // no SMTP in tests
    const profile = (await adminDb().collection('users').doc(bob.uid).get()).data();
    assert.ok(profile.welcomeEmailRequestedAt);
    assert.equal(profile.welcomeEmailStatus, 'skipped');
    assert.equal(profile.welcomeEmailSentAt, undefined, 'a skipped email must not be recorded as sent');
    const second = await call(routes.welcome.POST, { method: 'POST', token: bob.token });
    assert.equal(second.body.reason, 'already-requested');

    // Accounts welcomed before delivery status existed are not emailed again
    const legacy = await makeUser('legacy@example.test', 'citizen');
    await adminDb().collection('users').doc(legacy.uid).update({ welcomeEmailSentAt: Timestamp.now() });
    assert.equal((await call(routes.welcome.POST, { method: 'POST', token: legacy.token })).body.reason, 'already-requested');

    // With mail configured the email is queued for after the response, then its outcome is stored
    const smtp = await fakeSmtp('reject');
    const restore = useSmtp(smtp.port);
    try {
        const carol = await makeUser('welcome-smtp@example.test', 'citizen');
        const queued = await call(routes.welcome.POST, { method: 'POST', token: carol.token });
        assert.equal(queued.body.notification, 'queued');
        assert.equal((await adminDb().collection('users').doc(carol.uid).get()).data().welcomeEmailStatus, undefined);
        await nextServer.runAfterTasks();
        assert.equal((await adminDb().collection('users').doc(carol.uid).get()).data().welcomeEmailStatus, 'failed');
    } finally {
        restore();
        await smtp.close();
    }
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

// ---------- notifications never hold up committed work ----------

const WATER = { category: 'Water Supply', description: 'Leaking valve beside the bus stop', location: 'Ward 3' };

test('api: a stalled mail server does not delay or undo a saved complaint', async () => {
    const smtp = await fakeSmtp('stall');
    const restore = useSmtp(smtp.port);
    try {
        const started = Date.now();
        const res = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body: WATER });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.ok(Date.now() - started < 3000, `response took ${Date.now() - started}ms`);
        assert.equal(res.body.notification, 'queued');
        assert.match(res.body.data.trackingId, /^JAN-\d{6}$/);
        assert.equal((await complaintDoc(res.body.data.id)).citizenId, alice.uid);

        // The email is only attempted after the response; the server never answers, then disappears
        const delivery = nextServer.runAfterTasks();
        await smtp.connected;
        await smtp.close();
        assert.deepEqual(await delivery, ['failed']);
        assert.equal((await complaintDoc(res.body.data.id)).status, 'pending');
    } finally {
        restore();
        await smtp.close();
    }
});

test('api: a failing or unreachable mail server does not undo a committed status change or assignment', async () => {
    const id = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });
    const smtp = await fakeSmtp('reject');
    const restore = useSmtp(smtp.port);
    try {
        const res = await call(routes.complaint.PATCH, { method: 'PATCH', id, token: waterOfficial.token, body: { action: 'updateStatus', status: 'under-review' } });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.notification, 'queued');
        assert.equal((await complaintDoc(id)).status, 'under-review');
        assert.deepEqual(await nextServer.runAfterTasks(), ['failed']);

        await smtp.close(); // nothing listens on the port any more
        const assigned = await call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'assign', officialId: waterOfficial.uid } });
        assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
        assert.equal(assigned.body.notification, 'queued');
        assert.deepEqual(await nextServer.runAfterTasks(), ['failed']);
        const doc = await complaintDoc(id);
        assert.equal(doc.assignedTo, waterOfficial.uid);
        assert.equal(doc.status, 'in-progress');
    } finally {
        restore();
        await smtp.close();
    }
});

test('api: mail to reserved demo domains is skipped, not attempted', async () => {
    const smtp = await fakeSmtp('stall');
    const restore = useSmtp(smtp.port);
    delete process.env.EMAIL_OVERRIDE_TO;
    try {
        const res = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body: WATER });
        assert.equal(res.status, 201);
        assert.equal(res.body.notification, 'skipped'); // alice@example.test can never receive mail
        assert.equal(nextServer.pendingAfterTasks(), 0);
    } finally {
        restore();
        await smtp.close();
    }
});

// ---------- idempotent complaint creation ----------

async function complaintsOf(user, description) {
    const snap = await adminDb().collection('complaints').where('citizenId', '==', user.uid).get();
    return snap.docs.filter(d => d.data().description === description);
}

test('api: retrying a submission with the same request ID returns the original complaint', async () => {
    const dave = await makeUser('dave@example.test', 'citizen');
    const key = randomUUID();
    const body = { ...WATER, description: 'No water since morning in Block C' };
    const first = await call(routes.complaints.POST, { method: 'POST', token: dave.token, body, headers: { 'idempotency-key': key } });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const retry = await call(routes.complaints.POST, { method: 'POST', token: dave.token, body, headers: { 'idempotency-key': key } });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.notification, 'skipped');
    assert.equal(retry.body.data.id, first.body.data.id);
    assert.equal(retry.body.data.trackingId, first.body.data.trackingId);

    const stored = await complaintsOf(dave, body.description);
    assert.equal(stored.length, 1);
    const reservations = await adminDb().collection('trackingIds').where('complaintId', '==', first.body.data.id).get();
    assert.equal(reservations.size, 1);

    // Same ID with different details is a conflict that names the saved complaint
    const conflict = await call(routes.complaints.POST, { method: 'POST', token: dave.token, body: { ...body, location: 'Ward 9' }, headers: { 'idempotency-key': key } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.trackingId, first.body.data.trackingId);

    // A genuinely new complaint (new ID) with identical text is allowed
    const repeat = await call(routes.complaints.POST, { method: 'POST', token: dave.token, body, headers: { 'idempotency-key': randomUUID() } });
    assert.equal(repeat.status, 201);
    assert.notEqual(repeat.body.data.id, first.body.data.id);
    assert.equal((await complaintsOf(dave, body.description)).length, 2);
});

test('api: concurrent retries of one request create exactly one complaint', async () => {
    const erin = await makeUser('erin@example.test', 'citizen');
    const key = randomUUID();
    const body = { ...WATER, description: 'Sewage overflow outside the school gate' };
    const results = await Promise.all(Array.from({ length: 6 }, () =>
        call(routes.complaints.POST, { method: 'POST', token: erin.token, body, headers: { 'idempotency-key': key } })));
    assert.ok(results.every(r => r.status === 201 || r.status === 200), JSON.stringify(results.map(r => [r.status, r.body.error])));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(new Set(results.map(r => r.body.data.trackingId)).size, 1);
    assert.equal((await complaintsOf(erin, body.description)).length, 1);
});

test('api: request IDs are scoped to the signed-in user and validated', async () => {
    const key = randomUUID();
    const body = { ...WATER, description: 'Shared request id across two citizens' };
    const a = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body, headers: { 'idempotency-key': key } });
    const b = await call(routes.complaints.POST, { method: 'POST', token: bob.token, body, headers: { 'idempotency-key': key } });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.data.id, b.body.data.id);
    assert.equal(b.body.data.citizenId, bob.uid);

    for (const bad of ['short', 'has spaces in it but long enough', 'x'.repeat(200)]) {
        const res = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body, headers: { 'idempotency-key': bad } });
        assert.equal(res.status, 400, bad);
    }
});

// ---------- validation and scoping ----------

test('api: inherited object keys are rejected as categories with 400', async () => {
    for (const category of ['toString', 'constructor', '__proto__']) {
        const res = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body: { category, description: 'Pipe burst on main road', location: 'Ward 5' } });
        assert.equal(res.status, 400, category);
        assert.equal(res.body.error, 'Invalid category');
    }
});

test('api: oversized evidence and expired sessions are rejected', async () => {
    const big = await uploadEvidence(alice.uid, 'big.jpg', 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1));
    const res = await call(routes.complaints.POST, { method: 'POST', token: alice.token, body: { ...WATER, photoURLs: [big] } });
    assert.equal(res.status, 400);

    const expired = await call(routes.complaints.GET, { token: expiredToken(alice) });
    assert.equal(expired.status, 401);
    assert.match(expired.body.error, /expired session/i);
});

test('api: complaints are assigned only to officials of their own department', async () => {
    const id = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email }); // Water Department
    const assign = (officialId, extra = {}) => call(routes.complaint.PATCH, { method: 'PATCH', id, token: admin.token, body: { action: 'assign', officialId, ...extra } });

    assert.equal((await assign(powerOfficial.uid)).status, 400);
    const unassigned = await makeUser('unassigned-official@example.test', 'official');
    assert.equal((await assign(unassigned.uid)).status, 400);
    assert.equal((await assign(alice.uid)).status, 400);
    assert.equal((await complaintDoc(id)).assignedTo, undefined);

    // Department text for notifications comes from the stored complaint, never the request
    assert.equal((await assign(waterOfficial.uid, { departmentName: 'Forged Department' })).status, 400);

    const ok = await assign(waterOfficial.uid);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await complaintDoc(id)).assignedTo, waterOfficial.uid);
    assert.equal((await call(routes.complaint.GET, { id, token: waterOfficial.token })).status, 200);

    const orphan = await seedComplaint({ citizenId: alice.uid, department: null, assignedDepartment: null });
    const res = await call(routes.complaint.PATCH, { method: 'PATCH', id: orphan, token: admin.token, body: { action: 'assign', officialId: waterOfficial.uid } });
    assert.equal(res.status, 409);
});

// ---------- demo account provisioning ----------

const DEMO = {
    citizen: { uid: 'demo-citizen', email: 'demo-citizen@example.test' },
    official: { uid: 'demo-water-official', email: 'demo-water-official@example.test' },
    authority: { uid: 'demo-authority', email: 'demo-authority@example.test' },
};

test('provisioning: refuses ambiguous or non-demo targets before touching anything', () => {
    const out = path.join(os.tmpdir(), `demo-creds-${randomUUID()}.json`);
    assert.notEqual(provision(['--out', out]).status, 0, 'no --project');
    assert.notEqual(provision(['--project', 'jan-nivaran', '--out', out]).status, 0, 'emulator target must be a demo- project');
    assert.notEqual(provision(['--project', PROJECT, '--live', '--out', out]).status, 0, '--live with emulator variables');

    const liveEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
    const live = provision(['--project', 'jan-nivaran', '--out', out], liveEnv);
    assert.notEqual(live.status, 0);
    assert.match(live.stderr, /--live/);
    assert.equal(nodeFs.existsSync(out), false);
});

test('provisioning: creates UID-matched demo accounts, is safe to rerun, and never takes over other accounts', async () => {
    const out = path.join(os.tmpdir(), `demo-creds-${randomUUID()}.json`);

    // Someone already registered the citizen address through public signup
    const squatter = await signUp(DEMO.citizen.email);
    const refused = provision(['--project', PROJECT, '--out', out]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /demo-citizen@example\.test/);
    await assert.rejects(adminAuth().getUser(DEMO.official.uid), err => err.code === 'auth/user-not-found');
    await adminAuth().deleteUser(squatter.uid);

    const run = provision(['--project', PROJECT, '--out', out]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(nodeFs.statSync(out).mode & 0o777, 0o600);
    const creds = JSON.parse(nodeFs.readFileSync(out, 'utf8'))[PROJECT].accounts;
    assert.equal(creds.length, 3);
    for (const c of creds) assert.ok(typeof c.password === 'string' && c.password.length >= 16);
    assert.doesNotMatch(run.stdout + run.stderr, new RegExp(creds.map(c => c.password).join('|')), 'passwords must not be printed');

    const profiles = Object.fromEntries(await Promise.all(Object.entries(DEMO).map(async ([k, d]) =>
        [k, (await adminDb().collection('users').doc(d.uid).get()).data()])));
    assert.equal(profiles.citizen.role, 'citizen');
    assert.equal(profiles.official.role, 'official');
    assert.equal(profiles.official.department, 'Water Department');
    assert.equal(profiles.authority.role, 'admin');
    assert.equal(profiles.authority.department, undefined);
    for (const p of Object.values(profiles)) {
        assert.equal(p.demo, true);
        assert.ok(creds.every(c => !JSON.stringify(p).includes(c.password)), 'password stored in Firestore');
    }

    // Real email/password sign-in works and the app trusts the UID-matched profile
    const byEmail = Object.fromEntries(creds.map(c => [c.email, c.password]));
    const session = await signIn(DEMO.authority.email, byEmail[DEMO.authority.email]);
    assert.equal(session.localId, DEMO.authority.uid);
    assert.equal((await call(routes.stats.GET, { token: session.idToken })).status, 200);
    const citizenSession = await signIn(DEMO.citizen.email, byEmail[DEMO.citizen.email]);
    assert.equal((await call(routes.stats.GET, { token: citizenSession.idToken })).status, 403);

    // Rerun keeps working passwords; rotation replaces them
    assert.equal(provision(['--project', PROJECT, '--out', out]).status, 0);
    assert.deepEqual(JSON.parse(nodeFs.readFileSync(out, 'utf8'))[PROJECT].accounts, creds);
    assert.equal((await signIn(DEMO.citizen.email, byEmail[DEMO.citizen.email])).localId, DEMO.citizen.uid);
    const rotated = provision(['--project', PROJECT, '--out', out, '--rotate-passwords']);
    assert.equal(rotated.status, 0, rotated.stderr);
    const newCreds = JSON.parse(nodeFs.readFileSync(out, 'utf8'))[PROJECT].accounts;
    assert.notEqual(newCreds[0].password, creds[0].password);
    assert.ok((await signIn(DEMO.citizen.email, byEmail[DEMO.citizen.email])).error, 'old password still works');
});

test('provisioning: cleanup removes only demo accounts and the demo citizen\'s complaints', async () => {
    const out = path.join(os.tmpdir(), `demo-creds-${randomUUID()}.json`);
    assert.equal(provision(['--project', PROJECT, '--out', out]).status, 0);
    const creds = JSON.parse(nodeFs.readFileSync(out, 'utf8'))[PROJECT].accounts;
    const citizen = await signIn(DEMO.citizen.email, creds.find(c => c.email === DEMO.citizen.email).password);
    const photo = await uploadEvidence(DEMO.citizen.uid);
    const filed = await call(routes.complaints.POST, { method: 'POST', token: citizen.idToken, body: { ...WATER, photoURLs: [photo] }, headers: { 'idempotency-key': randomUUID() } });
    assert.equal(filed.status, 201, JSON.stringify(filed.body));
    const kept = await seedComplaint({ citizenId: alice.uid, citizenEmail: alice.email });

    const run = provision(['--project', PROJECT, '--out', out, '--cleanup']);
    assert.equal(run.status, 0, run.stderr);

    assert.equal((await adminDb().collection('complaints').doc(filed.body.data.id).get()).exists, false);
    assert.equal((await adminDb().collection('trackingIds').doc(filed.body.data.trackingId).get()).exists, false);
    assert.equal((await adminDb().collection('auditLogs').where('complaintId', '==', filed.body.data.id).get()).size, 0);
    assert.equal((await adminDb().collection('complaintRequests').where('uid', '==', DEMO.citizen.uid).get()).size, 0);
    const evidence = decodeURIComponent(new URL(photo).pathname.split('/o/')[1]);
    assert.equal((await adminBucket().file(evidence).exists())[0], false);
    for (const d of Object.values(DEMO)) {
        await assert.rejects(adminAuth().getUser(d.uid), err => err.code === 'auth/user-not-found');
        assert.equal((await adminDb().collection('users').doc(d.uid).get()).exists, false);
    }
    assert.equal(JSON.parse(nodeFs.readFileSync(out, 'utf8'))[PROJECT], undefined);
    assert.ok((await adminDb().collection('complaints').doc(kept).get()).exists);
    assert.ok((await adminAuth().getUser(alice.uid)).uid);
});
