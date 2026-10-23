// Create, refresh or remove the three demo accounts with the Firebase Admin SDK.
//
//   Emulators: FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST set, --project demo-<name>
//   Live:      node --env-file=.env.local scripts/provision-demo.mjs --project <id> --live
//
// Options: --rotate-passwords (issue new passwords), --cleanup (delete the demo accounts and the
// complaints they filed), --out <file> (credentials file, default .demo-credentials.json, gitignored).
//
// Accounts get fixed UIDs that only the Admin SDK can create (public signup gets random UIDs), so a
// rerun recognises its own accounts and refuses to touch any account someone else registered with a
// demo address. Roles live in users/{uid} with demo: true, a field browsers can never write.
// Passwords are random, written only to the credentials file (mode 600), never printed or stored.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const ACCOUNTS = [
    { uid: 'demo-citizen', email: 'demo-citizen@example.test', displayName: 'Demo Citizen', role: 'citizen', login: '/citizen' },
    { uid: 'demo-water-official', email: 'demo-water-official@example.test', displayName: 'Demo Water Official', role: 'official', department: 'Water Department', login: '/admin/login (Official tab)' },
    { uid: 'demo-authority', email: 'demo-authority@example.test', displayName: 'Demo Authority', role: 'admin', login: '/admin/login (Authority tab)' },
];

function fail(message) {
    console.error(`provision-demo: ${message}`);
    process.exit(1);
}

let opts;
try {
    ({ values: opts } = parseArgs({
        options: {
            project: { type: 'string' },
            live: { type: 'boolean', default: false },
            cleanup: { type: 'boolean', default: false },
            'rotate-passwords': { type: 'boolean', default: false },
            out: { type: 'string', default: '.demo-credentials.json' },
        },
    }));
} catch (error) {
    fail(error.message);
}

// ---------- target: explicit, and never a live project by accident ----------

const env = process.env;
const project = opts.project;
const emulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST);
if (!project) fail('--project <id> is required');

let app;
if (emulator) {
    if (opts.live) fail('--live cannot be used while emulator variables are set');
    if (!env.FIREBASE_AUTH_EMULATOR_HOST || !env.FIRESTORE_EMULATOR_HOST) fail('set both FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST');
    if (!project.startsWith('demo-')) fail(`emulator targets must use a demo- project ID, not "${project}"`);
    app = initializeApp({ projectId: project, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${project}.appspot.com` });
} else {
    if (!opts.live) fail(`refusing to change live project "${project}" without --live (nothing was changed)`);
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) fail('a live target needs FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (e.g. node --env-file=.env.local ...)');
    const keyProject = /@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/.exec(clientEmail)?.[1];
    const configured = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (keyProject !== project) fail(`--project "${project}" does not match the service account's project "${keyProject}"`);
    if (configured && configured !== project) fail(`--project "${project}" does not match the configured project "${configured}"`);
    app = initializeApp({ credential: cert({ projectId: project, clientEmail, privateKey }), projectId: project, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
}

const auth = getAuth(app);
const db = getFirestore(app);
const notFound = error => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
};

let store = {};
if (existsSync(opts.out)) {
    try {
        store = JSON.parse(readFileSync(opts.out, 'utf8'));
    } catch {
        fail(`${opts.out} is not valid JSON; move it aside and rerun`);
    }
}
function saveStore() {
    writeFileSync(opts.out, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    chmodSync(opts.out, 0o600); // mode above only applies when the file is created
}

// ---------- email/password sign-in must be enabled ----------

const authBase = emulator ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
const apiKey = emulator ? 'fake-api-key' : env.NEXT_PUBLIC_FIREBASE_API_KEY;
const ENABLE_HINT = 'enable it in Firebase console > Authentication > Sign-in method > Email/Password';

async function checkPasswordProvider() {
    if (emulator) return;
    const { access_token: token } = await app.options.credential.getAccessToken();
    const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return console.warn(`could not read sign-in providers (HTTP ${res.status}); sign-in is verified after provisioning`);
    if (!(await res.json()).signIn?.email?.enabled) fail(`Email/Password sign-in is disabled for ${project}: ${ENABLE_HINT}. Nothing was changed.`);
}

// Returns null when the password signs in to the expected account, else the error code
async function signInError(account, password) {
    if (!apiKey) return 'NO_WEB_API_KEY';
    const res = await fetch(`${authBase}/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password, returnSecureToken: true }),
    });
    const body = await res.json();
    return body.localId === account.uid ? null : body.error?.message ?? `HTTP ${res.status}`;
}

// ---------- provision ----------

async function provision() {
    await checkPasswordProvider();

    // Preflight every address before changing anything
    const existing = {};
    for (const account of ACCOUNTS) {
        const owner = await auth.getUserByEmail(account.email).catch(notFound);
        if (owner && owner.uid !== account.uid) {
            fail(`${account.email} already belongs to another account (uid ${owner.uid}) that this script did not create; it was left unchanged and nothing was provisioned`);
        }
        existing[account.uid] = await auth.getUser(account.uid).catch(notFound);
    }

    const known = Object.fromEntries((store[project]?.accounts ?? []).map(a => [a.email, a.password]));
    const results = [];
    for (const account of ACCOUNTS) {
        const keep = existing[account.uid] && known[account.email] && !opts['rotate-passwords'];
        const password = keep ? known[account.email] : randomBytes(18).toString('base64url');
        const fields = { email: account.email, displayName: account.displayName, disabled: false, ...(keep ? {} : { password }) };
        if (existing[account.uid]) await auth.updateUser(account.uid, fields);
        else await auth.createUser({ uid: account.uid, ...fields, password });

        const ref = db.collection('users').doc(account.uid);
        const current = await ref.get();
        await ref.set({
            uid: account.uid,
            email: account.email,
            displayName: account.displayName,
            role: account.role,
            department: account.department ?? FieldValue.delete(),
            demo: true,
            createdAt: current.get('createdAt') ?? Timestamp.now(),
            lastLogin: current.get('lastLogin') ?? Timestamp.now(),
        }, { merge: true });

        results.push({ email: account.email, password, role: account.role, ...(account.department ? { department: account.department } : {}), login: account.login });
        const detail = account.department ? `${account.role}, ${account.department}` : account.role;
        console.log(`${existing[account.uid] ? 'updated' : 'created'} ${account.email} (${detail})${keep ? ', password unchanged' : ''}`);
    }

    store[project] = { updatedAt: new Date().toISOString(), accounts: results };
    saveStore();
    console.log(`credentials written to ${opts.out} (mode 600)`);

    for (const account of ACCOUNTS) {
        const error = await signInError(account, results.find(r => r.email === account.email).password);
        if (error === 'NO_WEB_API_KEY') return console.warn('NEXT_PUBLIC_FIREBASE_API_KEY not set: sign-in was not verified');
        if (/PASSWORD_LOGIN_DISABLED|OPERATION_NOT_ALLOWED/.test(error ?? '')) fail(`Email/Password sign-in is disabled: ${ENABLE_HINT}`);
        if (error) fail(`sign-in check failed for ${account.email}: ${error}`);
    }
    console.log('email/password sign-in verified for all demo accounts');
}

// ---------- cleanup: only demo accounts and what the demo accounts filed ----------

async function deleteAll(query) {
    const snap = await query.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    return snap.size;
}

async function cleanup() {
    const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (emulator ? `${project}.appspot.com` : '');
    for (const { uid, email } of ACCOUNTS) {
        const complaints = await db.collection('complaints').where('citizenId', '==', uid).get();
        for (const complaint of complaints.docs) {
            await deleteAll(db.collection('auditLogs').where('complaintId', '==', complaint.id));
            const trackingId = complaint.get('trackingId');
            const reservation = trackingId && await db.collection('trackingIds').doc(trackingId).get();
            if (reservation?.get('complaintId') === complaint.id) await reservation.ref.delete();
            await complaint.ref.delete();
        }
        await deleteAll(db.collection('complaintRequests').where('uid', '==', uid));
        if (bucketName) {
            await getStorage(app).bucket(bucketName).deleteFiles({ prefix: `complaints/${uid}/` })
                .catch(error => (error.code === 404 ? null : Promise.reject(error)));
        }
        await db.collection('users').doc(uid).delete();
        await auth.deleteUser(uid).catch(notFound);
        console.log(`removed ${email} and ${complaints.size} complaint(s) it filed`);
    }
    if (store[project]) {
        delete store[project];
        saveStore();
    }
}

try {
    console.log(`target: ${emulator ? 'emulators' : 'LIVE project'} ${project}`);
    await (opts.cleanup ? cleanup() : provision());
    process.exit(0);
} catch (error) {
    fail(`${error.code ?? ''} ${error.message}`.trim());
}
