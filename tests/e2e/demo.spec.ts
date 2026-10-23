// The three-role demonstration in a real browser, against the Firebase emulators:
// citizen files -> water official works it -> authority resolves -> citizen and public see it.
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

test('citizen files a Water Supply complaint; failed attempts keep the draft and never duplicate it', async ({ browser }) => {
    citizen = await citizenLogin(browser, accounts.citizen.email, accounts.citizen.password);
    const { page } = citizen;

    await page.getByRole('link', { name: 'File Complaint' }).first().click();
    await page.getByRole('button', { name: 'Water Supply' }).click();
    await page.getByLabel('Title (Optional)').fill(TITLE);
    await page.getByLabel('Description').fill(DESCRIPTION);
    await page.getByLabel('Location').fill(LOCATION);
    await page.getByRole('button', { name: 'Use GPS' }).click();
    await expect(page.getByLabel('Location')).toHaveValue(/Ward 7 market gate \(GPS 18\.5204\d*, 73\.8567\d* ±25 m\)/);
    await page.getByRole('button', { name: /Next Step/ }).click();

    // Oversized photos are refused before upload; a valid one is accepted
    await page.locator('#photo-upload').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByText(/huge\.jpg: larger than 5MB/)).toBeVisible();
    await page.locator('#photo-upload').setInputFiles({ name: 'leak.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('leak.png')).toBeVisible();

    // 1) Storage refuses the upload: clear error, draft kept, nothing sent to the API
    let apiCalls = 0;
    page.on('request', r => { if (r.url().endsWith('/api/complaints') && r.method() === 'POST') apiCalls++; });
    await page.route('**/v0/b/**', route => route.fulfill({
        status: 403,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: '{"error":{"code":403,"message":"Permission denied."}}',
    }));
    await page.getByRole('button', { name: /Submit Complaint/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /upload was refused/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Submit Complaint/ })).toBeEnabled();
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
