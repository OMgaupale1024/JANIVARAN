// The three-role demonstration in a real browser, against the Firebase emulators:
// citizen files a water leak under the wrong category (Electricity) -> authority transfers it to the
// Water Department -> water official works it -> authority resolves -> citizen and public see it.
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'demo-jannivaran';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST!;
const admin = initializeApp({ projectId: PROJECT }, 'e2e');
const db = getFirestore(admin);

const TITLE = 'DEMO Water leak near Ward 7 market';
const DESCRIPTION = 'Main pipe has been leaking onto the road since morning near the market gate.';
const LOCATION = 'Ward 7 market gate';
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

type Account = { email: string; password: string; role: string };
let accounts: Record<'citizen' | 'official' | 'authority', Account>;
const ELECTRICITY = { email: 'power-official@example.test', password: 'power-official-pass-1' };
const OTHER_CITIZEN = { name: 'Other Citizen', email: 'other-citizen@example.test', password: 'other-citizen-pass-1' };

let citizen: { context: BrowserContext; page: Page };
let trackingId = '';
let complaintId = '';
const TRANSFER_REASON = 'Water pipe leak filed under Electricity';

// Count shown for one status in the citizen's chart
const chartCount = (page: Page, status: string) =>
    page.getByTestId('status-chart').locator(`[data-status="${status}"] > span`).last();

// Swap the emulator's Firestore rules (restored from firestore.rules afterwards)
async function setFirestoreRules(content: string) {
    const res = await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
        method: 'PUT',
        body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
    });
    expect(res.ok).toBe(true);
}

// A controllable navigator.geolocation: tests answer each request (or never answer it) by index
function stubGeolocation() {
    type Call = { ok: (p: unknown) => void; fail: (e: unknown) => void };
    const w = window as unknown as { __gps: { calls: Call[]; permission: string } };
    w.__gps = { calls: [], permission: 'prompt' };
    Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (ok: Call['ok'], fail: Call['fail']) => { w.__gps.calls.push({ ok, fail }); } },
    });
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d => (d.name === 'geolocation'
        ? Promise.resolve({ state: w.__gps.permission })
        : query(d))) as typeof navigator.permissions.query;
}
type GpsWindow = { __gps: { calls: Array<{ ok: (p: unknown) => void; fail: (e: unknown) => void }>; permission: string } };
const gpsCalls = (page: Page) => page.evaluate(() => (window as unknown as GpsWindow).__gps.calls.length);
const gpsFix = (page: Page, i: number, accuracy: number) => page.evaluate(([i, accuracy]) => {
    (window as unknown as GpsWindow).__gps.calls[i].ok({ coords: { latitude: 18.5204, longitude: 73.8567, accuracy } });
}, [i, accuracy]);
const gpsError = (page: Page, i: number, code: number, permission = 'prompt') => page.evaluate(([i, code, permission]) => {
    const gps = (window as unknown as GpsWindow).__gps;
    gps.permission = permission as string;
    gps.calls[i as number].fail({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
}, [i, code, permission] as const);

test.describe.configure({ mode: 'serial' });
// Note: Next.js renders a route announcer with role="alert", so alerts are matched by their text

async function idToken(email: string, password: string): Promise<string> {
    const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return (await res.json()).idToken;
}

async function citizenLogin(browser: Browser, email: string, password: string) {
    const context = await browser.newContext({ geolocation: { latitude: 18.5204, longitude: 73.8567, accuracy: 25 }, permissions: ['geolocation'] });
    const page = await context.newPage();
    await page.goto('/citizen');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/citizen\/dashboard/);
    return { context, page };
}

async function staffLogin(browser: Browser, tab: 'Official' | 'Authority', email: string, password: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/admin/login');
    await page.getByRole('button', { name: tab }).click();
    await page.getByLabel('Official Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Access Dashboard/ }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.getByRole('button', { name: 'All Complaints' }).click();
    return { context, page };
}

async function complaintsFiledBy(uid: string) {
    return (await db.collection('complaints').where('citizenId', '==', uid).get()).docs;
}

test.beforeAll(async () => {
    await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

    // The real provisioning command creates the three demo accounts
    const out = path.join(tmpdir(), `e2e-demo-credentials-${Date.now()}.json`);
    const run = spawnSync(process.execPath, ['scripts/provision-demo.mjs', '--project', PROJECT, '--out', out], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const list: Account[] = JSON.parse(readFileSync(out, 'utf8'))[PROJECT].accounts;
    const byRole = (role: string) => list.find(a => a.role === role)!;
    accounts = { citizen: byRole('citizen'), official: byRole('official'), authority: byRole('admin') };

    // An official of another department, set up the way an operator would (trusted profile)
    const power = await getAuth(admin).createUser({ email: ELECTRICITY.email, password: ELECTRICITY.password });
    await db.collection('users').doc(power.uid).set({ uid: power.uid, email: ELECTRICITY.email, displayName: 'Power Official', role: 'official', department: 'Electricity Board' });
});

test.afterAll(async () => {
    await citizen?.context.close();
    await deleteApp(admin);
});

test('citizen files a water leak under the wrong category (Electricity); failed attempts keep the draft and never duplicate it', async ({ browser }) => {
    citizen = await citizenLogin(browser, accounts.citizen.email, accounts.citizen.password);
    const { page } = citizen;

    await page.getByRole('link', { name: 'File Complaint' }).first().click();
    await page.getByRole('button', { name: 'Electricity' }).click();
    await page.getByLabel('Title (Optional)').fill(TITLE);
    await page.getByLabel('Description').fill(DESCRIPTION);
    await page.getByLabel('Location').fill(LOCATION);
    await page.getByRole('button', { name: 'Use GPS' }).click();
    await expect(page.getByLabel('Location')).toHaveValue(/Ward 7 market gate \(GPS 18\.5204\d*, 73\.8567\d* ±25 m\)/);
    await expect(page.getByText(/Coordinates added \(accurate to about 25 m\)/)).toBeVisible();
    // Pressing again refreshes the fix instead of appending a second one
    await page.getByRole('button', { name: 'Use GPS' }).click();
    await expect(page.getByRole('button', { name: 'Use GPS' })).toBeEnabled();
    expect((await page.getByLabel('Location').inputValue()).match(/GPS/g)).toHaveLength(1);
    await page.getByRole('button', { name: /Next Step/ }).click();

    // Oversized photos are refused before upload; a valid one is accepted
    await page.locator('#photo-upload').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByText(/huge\.jpg: larger than 5MB/)).toBeVisible();
    await page.locator('#photo-upload').setInputFiles({ name: 'leak.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('leak.png')).toBeVisible();

    // 1) The bucket doesn't exist (the hosted project's state) or Storage refuses the upload:
    //    each is named, with the failed stage and code; draft kept; nothing sent to the API
    let apiCalls = 0;
    page.on('request', r => { if (r.url().endsWith('/api/complaints') && r.method() === 'POST') apiCalls++; });
    const storageAnswers = (status: number, message: string) => page.route('**/v0/b/**', route => route.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: status, message } }),
    }));
    await storageAnswers(404, 'Not Found.');
    await page.getByRole('button', { name: /Submit Complaint/ }).click();
    const missing = page.getByRole('alert').filter({ hasText: /photo storage isn't set up/i });
    await expect(missing).toContainText('Photo upload failed: storage/unknown (HTTP 404)');
    await expect(missing.getByRole('button', { name: 'Submit without photos' })).toBeVisible();
    await page.unroute('**/v0/b/**');
    await storageAnswers(403, 'Permission denied.');
    await page.getByRole('button', { name: /Submit Complaint/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /refused the upload/i })).toContainText('storage/unauthorized (HTTP 403)');
    await expect(page.getByRole('button', { name: /Submit Complaint/ })).toBeEnabled();
    await expect(page.getByLabel('Selected photos')).toContainText('leak.png');
    expect(apiCalls).toBe(0);
    await page.unroute('**/v0/b/**');

    // 2) The server saves the complaint but the response is lost: the user is told retrying is safe
    // One request starts each upload: multipart for small files, a resumable "start" for large ones
    let uploads = 0;
    page.on('request', r => {
        const h = r.headers();
        if (r.url().includes('/v0/b/') && (h['x-goog-upload-protocol'] === 'multipart' || h['x-goog-upload-command'] === 'start')) uploads++;
    });
    await page.route('**/api/complaints', async route => {
        await route.fetch(); // reaches the server and commits
        await route.abort('connectionreset');
    });
    await page.getByRole('button', { name: /Submit Complaint/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /couldn't confirm/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Back/ })).toBeEnabled();
    const citizenUid = (await getAuth(admin).getUserByEmail(accounts.citizen.email)).uid;
    expect(await complaintsFiledBy(citizenUid)).toHaveLength(1);
    await page.unroute('**/api/complaints');

    // 3) Retrying (two clicks back to back) returns the same complaint: one request, one record, one upload
    await page.getByRole('button', { name: /Submit Complaint/ }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole('heading', { name: 'Complaint Filed Successfully!' })).toBeVisible();
    trackingId = (await page.getByTestId('tracking-id').innerText()).trim();
    expect(trackingId).toMatch(/^JAN-\d{6}$/);
    expect(apiCalls).toBe(2); // the lost attempt + one for both clicks
    expect(uploads).toBe(1);
    const filed = await complaintsFiledBy(citizenUid);
    expect(filed).toHaveLength(1);
    expect(filed[0].get('trackingId')).toBe(trackingId);
    expect(filed[0].get('photoURLs')).toHaveLength(1);
    expect(filed[0].get('category')).toBe('Electricity');
    expect(filed[0].get('assignedDepartment')).toBe('Electricity Board');
    expect(filed[0].get('location')).toMatch(/^Ward 7 market gate \(GPS /);
    complaintId = filed[0].id;

    await page.getByRole('link', { name: 'Go to Dashboard' }).click();
    await expect(page.getByText(TITLE).first()).toBeVisible();
});

test('an expired session is refreshed once without duplicating the complaint', async () => {
    const { page } = citizen;
    await page.goto('/file-complaint');
    await page.getByRole('button', { name: 'Electricity' }).click();
    await page.getByLabel('Description').fill('Street light flickering all night outside block D.');
    await page.getByLabel('Location').fill('Block D lane');
    await page.getByRole('button', { name: /Next Step/ }).click();

    let posts = 0;
    await page.route('**/api/complaints', async route => {
        posts++;
        if (posts === 1) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false,"error":"Invalid or expired session. Please sign in again."}' });
        return route.continue();
    });
    await page.getByRole('button', { name: /Submit Complaint/ }).click();
    await expect(page.getByRole('heading', { name: 'Complaint Filed Successfully!' })).toBeVisible();
    expect(posts).toBe(2);
    await page.unroute('**/api/complaints');
});

test('GPS: no overlapping requests, unanswered prompts end, late fixes never overwrite, failures are told apart', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(stubGeolocation);
    const page = await context.newPage();
    await page.goto('/file-complaint');
    await page.getByRole('button', { name: 'Roads & Potholes' }).click();
    const location = page.getByLabel('Location');
    const status = page.locator('#gps-status');
    const gps = page.getByRole('button', { name: /Use GPS|Locating/ });

    // Locating state; a second press while waiting starts nothing
    await location.fill('Opposite Ward 3 school');
    await gps.click();
    await expect(gps).toHaveText(/Locating/);
    await expect(gps).toBeDisabled();
    await gps.click({ force: true });
    expect(await gpsCalls(page)).toBe(1);

    // Broad estimate: labelled approximate, typed text kept
    await gpsFix(page, 0, 4200);
    await expect(location).toHaveValue('Opposite Ward 3 school (GPS 18.520, 73.857 ±4.2 km, approximate)');
    await expect(status).toContainText('Approximate location added');

    // Each failure is described separately, and the field stays editable
    const failures: Array<[number, string, RegExp]> = [
        [1, 'denied', /blocked for this site/],
        [1, 'granted', /location services are off/],
        [1, 'prompt', /wasn't given/],
        [2, 'prompt', /couldn't work out its location/],
        [3, 'prompt', /took too long/],
    ];
    for (const [code, permission, message] of failures) {
        await gps.click();
        await gpsError(page, (await gpsCalls(page)) - 1, code, permission);
        await expect(status).toContainText(message);
        await expect(gps).toBeEnabled();
    }
    await expect(location).toHaveValue(/Opposite Ward 3 school/);

    // Editing while locating stops the request; its late fix is ignored
    await gps.click();
    const edited = await gpsCalls(page) - 1;
    await location.fill('Gate 2, Ward 3 school');
    await expect(status).toContainText('stopped because you edited');
    await gpsFix(page, edited, 10);
    await expect(location).toHaveValue('Gate 2, Ward 3 school');

    // A prompt nobody answers: the button comes back, and an answer after that changes nothing
    await gps.click();
    const unanswered = await gpsCalls(page) - 1;
    await sleep(21_000);
    await expect(status).toContainText('No location yet');
    await expect(gps).toBeEnabled();
    await gpsFix(page, unanswered, 10);
    await expect(location).toHaveValue('Gate 2, Ward 3 school');
    await context.close();

    // A real browser where the site has no location permission
    const plain = await browser.newContext();
    const denied = await plain.newPage();
    await denied.goto('/file-complaint');
    await denied.getByRole('button', { name: 'Roads & Potholes' }).click();
    await denied.getByRole('button', { name: 'Use GPS' }).click();
    await expect(denied.locator('#gps-status')).toContainText(/blocked for this site|wasn't given|location services|No location yet/);
    await expect(denied.getByRole('button', { name: 'Use GPS' })).toBeEnabled();
    await plain.close();
});

test('authority transfers the complaint to the Water Department; the Electricity official loses it', async ({ browser }) => {
    // The Electricity official has it open; the citizen watches their dashboard (live counts)
    const power = await staffLogin(browser, 'Official', ELECTRICITY.email, ELECTRICITY.password);
    await citizen.page.goto('/citizen/dashboard');
    await expect(chartCount(citizen.page, 'under-review')).toHaveText('0');
    await power.page.getByRole('button', { name: `View details for ${TITLE}` }).click();
    await expect(power.page.getByRole('dialog').getByTestId('complaint-status')).toHaveText('Under Review');
    await expect(chartCount(citizen.page, 'under-review')).toHaveText('1');
    const before = (await db.collection('complaints').doc(complaintId).get()).data()!;

    const { context, page } = await staffLogin(browser, 'Authority', accounts.authority.email, accounts.authority.password);
    await page.getByRole('button', { name: `View details for ${TITLE}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('complaint-department')).toHaveText('Electricity Board');
    await dialog.getByLabel('New department').selectOption('Water Department');
    await dialog.getByLabel('Reason').fill(TRANSFER_REASON);
    await dialog.getByRole('button', { name: 'Transfer to department' }).click();
    await expect(dialog.getByText(/Transferred to Water Department/)).toBeVisible();
    await expect(dialog.getByTestId('complaint-department')).toHaveText('Water Department');
    await expect(dialog.getByTestId('complaint-status')).toHaveText('Under Review');
    await expect(dialog.getByLabel('Transfer history')).toContainText(`Electricity Board → Water Department: ${TRANSFER_REASON}`);
    await context.close();

    // Same complaint: tracking ID, evidence, SLA deadline and status are unchanged
    const after = (await db.collection('complaints').doc(complaintId).get()).data()!;
    expect(after.trackingId).toBe(trackingId);
    expect(after.assignedDepartment).toBe('Water Department');
    expect(after.category).toBe('Electricity');
    for (const field of ['photoURLs', 'sla', 'createdAt', 'status', 'priority', 'citizenId']) expect(after[field], field).toEqual(before[field]);
    expect(await complaintsFiledBy(before.citizenId)).toHaveLength(2); // nothing recreated

    // The Electricity official's open details close and the complaint leaves their feed and the API
    await expect(power.page.getByRole('dialog')).toHaveCount(0);
    await expect(power.page.getByText(/no longer in your queue/)).toBeVisible();
    await expect(power.page.getByRole('button', { name: `View details for ${TITLE}` })).toHaveCount(0);
    const token = await idToken(ELECTRICITY.email, ELECTRICITY.password);
    expect((await power.page.request.get(`/api/complaints/${complaintId}`, { headers: { authorization: `Bearer ${token}` } })).status()).toBe(404);
    // ...and cannot move it anywhere
    const forged = await power.page.request.patch(`/api/complaints/${complaintId}`, {
        headers: { authorization: `Bearer ${token}` },
        data: { action: 'transfer', department: 'Electricity Board', fromDepartment: 'Water Department', reason: 'Taking it back' },
    });
    expect(forged.status()).toBe(403);
    await power.context.close();

    // The citizen sees the new department on the same tracking ID, live
    await expect(citizen.page.getByText(`Filed as Electricity • Handled by Water Department`).first()).toBeVisible();
});

test('water official sees the complaint and its evidence, moves it forward, and cannot resolve, reprioritise or delete', async ({ browser }) => {
    const { context, page } = await staffLogin(browser, 'Official', accounts.official.email, accounts.official.password);
    await page.getByRole('button', { name: `View details for ${TITLE}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('img', { name: /Evidence photo 1/ })).toBeVisible();
    // Opening a pending complaint marks it under review
    await expect(dialog.getByTestId('complaint-status')).toHaveText('Under Review');
    await dialog.getByRole('button', { name: 'Mark as In Progress' }).click();
    await expect(dialog.getByTestId('complaint-status')).toHaveText('In Progress');
    await expect(dialog.getByRole('button', { name: /Resolve/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Critical Priority/ })).toHaveCount(0);

    // The API refuses the same actions even when called directly
    const token = await idToken(accounts.official.email, accounts.official.password);
    const patch = (body: object) => page.request.patch(`/api/complaints/${complaintId}`, { headers: { authorization: `Bearer ${token}` }, data: body });
    expect((await patch({ action: 'updateStatus', status: 'resolved' })).status()).toBe(403);
    expect((await patch({ action: 'updateStatus', priority: 'critical' })).status()).toBe(403);
    expect((await page.request.delete(`/api/complaints/${complaintId}`, { headers: { authorization: `Bearer ${token}` } })).status()).toBe(403);
    await context.close();
});

test('another department\'s official and another citizen are denied in the UI, the API and Firestore', async ({ browser }) => {
    // Sees the citizen's Electricity complaint, never the Water one
    const power = await staffLogin(browser, 'Official', ELECTRICITY.email, ELECTRICITY.password);
    await expect(power.page.getByText('Electricity Issue')).toBeVisible();
    await expect(power.page.getByText(TITLE)).toHaveCount(0);
    await power.context.close();

    // A second citizen signs up through the normal form
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/citizen/signup');
    await page.getByLabel('Full Name').fill(OTHER_CITIZEN.name);
    await page.getByLabel('Email').fill(OTHER_CITIZEN.email);
    await page.getByLabel('Password', { exact: true }).fill(OTHER_CITIZEN.password);
    await page.getByLabel('Confirm Password').fill(OTHER_CITIZEN.password);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/citizen\/dashboard/);
    await expect(page.getByText('No complaints filed yet').first()).toBeVisible();
    await expect(page.getByText(TITLE)).toHaveCount(0);
    await expect(page.getByTestId('status-chart')).toHaveCount(0);

    // A load failure is reported as a failure, never as zero complaints
    await setFirestoreRules(`rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  match /users/{uid} { allow read: if request.auth.uid == uid; }
  match /{document=**} { allow read, write: if false; }
} }`);
    try {
        await page.reload();
        await expect(page.getByText(/complaints could not be loaded/i).first()).toBeVisible();
        await expect(page.getByText('No complaints filed yet')).toHaveCount(0);
        await expect(page.getByText('Total Complaints')).toHaveCount(0);
    } finally {
        await setFirestoreRules(readFileSync('firestore.rules', 'utf8'));
    }

    for (const who of [ELECTRICITY, OTHER_CITIZEN]) {
        const token = await idToken(who.email, who.password);
        const auth = { authorization: `Bearer ${token}` };
        expect((await page.request.get(`/api/complaints/${complaintId}`, { headers: auth })).status()).toBe(404);
        const forged = await page.request.patch(`/api/complaints/${complaintId}`, { headers: auth, data: { action: 'updateStatus', status: 'resolved', role: 'admin' } });
        expect([400, 403]).toContain(forged.status());
        const list = await (await page.request.get('/api/complaints?citizenId=demo-citizen&department=Water%20Department', { headers: auth })).json();
        expect(JSON.stringify(list)).not.toContain(complaintId);
        const direct = await page.request.get(`http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/complaints/${complaintId}`, { headers: auth });
        expect(direct.status()).toBe(403);
    }
    expect((await db.collection('complaints').doc(complaintId).get()).get('status')).toBe('in-progress');
    await context.close();
});

test('authority prioritises and resolves the complaint, and can still find it afterwards', async ({ browser }) => {
    const { context, page } = await staffLogin(browser, 'Authority', accounts.authority.email, accounts.authority.password);
    await page.getByRole('button', { name: `View details for ${TITLE}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Mark as Critical Priority' }).click();
    await expect(dialog.getByText('CRITICAL PRIORITY')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close & Resolve Complaint' }).click();
    await expect(dialog.getByTestId('complaint-status')).toHaveText('Resolved');
    await expect(dialog.getByRole('button', { name: 'Transfer to department' })).toHaveCount(0);
    const token = await idToken(accounts.authority.email, accounts.authority.password);
    const late = await page.request.patch(`/api/complaints/${complaintId}`, {
        headers: { authorization: `Bearer ${token}` },
        data: { action: 'transfer', department: 'Sanitation Department', fromDepartment: 'Water Department', reason: 'Too late to move' },
    });
    expect(late.status()).toBe(409);
    await dialog.getByRole('button', { name: 'Close details' }).click();

    // Active list drops it; Completed and All keep it with its real status
    await expect(page.getByText(TITLE)).toHaveCount(0);
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    const row = page.getByRole('row', { name: new RegExp(TITLE) });
    await expect(row).toContainText('RESOLVED');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('row', { name: new RegExp(TITLE) })).toBeVisible();
    await context.close();
});

test('citizen sees the resolved status; public tracking shows only redacted details', async ({ browser }) => {
    const { page } = citizen;
    await page.goto('/citizen/dashboard');
    await expect(page.getByText(TITLE).first()).toBeVisible();
    await expect(page.getByText('RESOLVED').first()).toBeVisible();

    // Chart and cards agree: the street-light complaint is still pending, the transferred one resolved
    await expect(page.getByText('Resolved: 1 of 2 complaints (50%)')).toBeVisible();
    for (const [status, count] of [['pending', '1'], ['under-review', '0'], ['in-progress', '0'], ['resolved', '1'], ['withdrawn', '0']]) {
        await expect(chartCount(page, status), status).toHaveText(count);
    }
    await expect(page.getByText('2 complaints: 1 pending, 0 under review, 0 in progress, 0 escalated, 1 resolved, 0 closed without resolution, 0 withdrawn.')).toBeAttached();

    // The per-complaint timeline shows the transfer
    await page.getByText(TITLE).first().click();
    await expect(page.getByText(`transferred from Electricity Board to Water Department. Reason: ${TRANSFER_REASON}`)).toBeVisible();
    // ...and the citizen's own photo, actually loaded from Storage
    const photo = page.getByRole('img', { name: 'Your photo 1' });
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Phone width: no sideways scrolling
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    const visitor = await browser.newContext();
    const publicPage = await visitor.newPage();
    await publicPage.goto('/track');
    await publicPage.getByLabel('Tracking ID').fill(trackingId.toLowerCase());
    await publicPage.getByRole('button', { name: 'Track complaint' }).click();
    await expect(publicPage.getByText(trackingId)).toBeVisible();
    await expect(publicPage.getByText('Resolved').first()).toBeVisible();
    const text = await publicPage.locator('main').innerText();
    for (const secret of [TITLE, DESCRIPTION, 'Ward 7', 'GPS', 'Demo Citizen', accounts.citizen.email]) {
        expect(text).not.toContain(secret);
    }
    await visitor.close();
});

test('a profile that cannot load is reported, not treated as signed out', async () => {
    const { page } = citizen;
    await page.route(`http://${FIRESTORE}/**`, route => route.abort());
    await page.goto('/file-complaint');
    await expect(page.getByRole('alert').filter({ hasText: /could not load your account/i })).toBeVisible();
    await expect(page).toHaveURL(/\/file-complaint/);
    await page.unroute(`http://${FIRESTORE}/**`);
});

test('primary routes load for a signed-out visitor without runtime errors', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    const routes: Array<[string, RegExp, string | RegExp]> = [
        ['/', /\/$/, 'Civic Clarity'],
        ['/track', /\/track$/, 'Track Your Grievance'],
        ['/citizen', /\/citizen$/, 'Welcome Back'],
        ['/citizen/signup', /\/citizen\/signup$/, 'Create Account'],
        ['/forgot-password', /\/forgot-password$/, 'Reset Password'],
        ['/admin/login', /\/admin\/login$/, 'Official Access'],
        ['/file-complaint', /\/file-complaint$/, /need to sign in to submit/],
        ['/admin/dashboard', /\/admin\/login$/, 'Official Access'], // staff only
        ['/dashboard', /\/admin\/login$/, 'Official Access'], // legacy URL
        ['/citizen/dashboard', /\/citizen$/, 'Welcome Back'], // signed-in only
        ['/account-center', /\/citizen$/, 'Welcome Back'], // signed-in only
    ];
    for (const [path, finalUrl, text] of routes) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(page, path).toHaveURL(finalUrl);
        await expect(page.getByText(text).first(), path).toBeVisible();
    }
    expect(errors).toEqual([]);
    await context.close();
});
