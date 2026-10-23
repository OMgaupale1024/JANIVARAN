# JanNivaran demo guide

A five-minute walkthrough of one complaint moving citizen → water official → authority → citizen,
using real email/password accounts. Everything below reflects what the app actually does.

## Before you start

**Where to run it**

| Option | URL | Notes |
| --- | --- | --- |
| Hosted | <https://oraoss.in> | Serves the `main` branch. Merge this fix branch first, or the site still runs the old code (slow submissions, photo uploads that hang, no Completed view). Photo evidence is unavailable until Firebase Storage is enabled (see below). |
| Local, emulators | <http://localhost:3000> | No cloud data or email; photo evidence works. See [Local demo](#local-demo-on-emulators). |

Branch previews (`*.vercel.app` preview URLs) are **not** usable for the demo: the Preview environment has
no Firebase Admin credentials, so every API call answers `503`.

**Accounts** (created by `scripts/provision-demo.mjs`, UIDs `demo-citizen`, `demo-water-official`, `demo-authority`)

| Identity | Role | Department | Sign in at |
| --- | --- | --- | --- |
| `demo-citizen@example.test` | citizen | none | `/citizen` |
| `demo-water-official@example.test` | official | Water Department | `/admin/login` → **Official** |
| `demo-authority@example.test` | admin (Authority) | none (sees all) | `/admin/login` → **Authority** |

Passwords live only in `.demo-credentials.json` (gitignored, mode 600) on the machine that ran the
provisioning command. Don't show that file on screen. `@example.test` addresses can never receive
mail, so the app skips email for these accounts.

**Use three separate browser profiles** (or three different browsers). Tabs and windows of one profile
share a single Firebase sign-in, so signing in as the official would sign the citizen out.

**Photo evidence on the hosted site:** project `jan-nivaran` has no Cloud Storage bucket, so uploads cannot
succeed there. Skip the photo step; if someone attaches one anyway, the form stops within about 20 seconds
with "Couldn't reach photo storage…" and keeps everything they typed. Enabling it is a console step that
needs the Blaze plan (Firebase console → Storage → Get started), followed by deploying `storage.rules`.

## Walkthrough

### 1. Citizen files a complaint (profile A)

1. Open `/citizen`, sign in as `demo-citizen@example.test`. You land on the citizen dashboard.
2. **File Complaint** → **Water Supply**.
3. Title `DEMO Water leak near Ward 7 market`; description `Main pipe leaking onto the road near the market gate.`;
   location `Ward 7 market gate (demo)`. Optional: **Use GPS** appends the browser's coordinates (after a
   permission prompt); they are visible to the citizen and staff only, never on public tracking.
4. **Next Step** → **Submit Complaint** (no photo on the hosted site).

Expected: the button shows "Saving your complaint…", then **Complaint Filed Successfully!** with a tracking
ID like `JAN-123456`. **Go to Dashboard** shows the complaint as PENDING. Note the tracking ID.

### 2. Water official works it (profile B)

1. Open `/admin/login`, choose **Official**, sign in as `demo-water-official@example.test`.
2. **All Complaints** (Active view) lists Water Department complaints only, newest first.
3. Click the eye icon on the demo complaint. About a second later the status badge changes to
   **Under Review** (opening a pending complaint marks it, once).
4. **Mark as In Progress** → the badge shows **In Progress** once the server confirms.

Expected: there is no **Resolve** or **Critical Priority** button for officials, and the server refuses those
actions even if called directly.

### 3. Authority resolves it (profile C)

1. Open `/admin/login`, choose **Authority**, sign in as `demo-authority@example.test`.
2. **All Complaints** shows every department. Open the demo complaint.
3. **Mark as Critical Priority**, then **Close & Resolve Complaint**. The badge shows **Resolved**.
4. Close the dialog. The complaint leaves **Active**; switch to **Completed** (or **All**) to find it again,
   marked RESOLVED. Withdrawn complaints appear there as WITHDRAWN, not as resolved.

### 4. Citizen and public view (profile A, then any window)

1. Refresh the citizen dashboard: the complaint shows RESOLVED; expand it for the timeline with timestamps.
2. Open `/track`, enter the tracking ID: category, department, status, priority, SLA and timeline appear.
   Title, description, location, GPS and the citizen's identity are not shown.

### 5. Access isolation (optional)

Another citizen sees none of these complaints; an official of another department sees only their own
department; direct API calls and Firestore reads are refused. All of this runs automatically in
`npm run test:e2e` and `npm run test:emulator`, which is quicker than showing it live.

### Showing an error path (optional)

On step 1, turn the network off just before **Submit Complaint**: the form says it couldn't confirm the
complaint was received and keeps everything. Turn the network back on and press **Submit Complaint** again:
you get the same tracking ID. A retry never creates a duplicate, even if the first attempt was saved.

## What is and isn't automatic

- **Email** is best effort and sent after the response, so a slow mail server never delays a save. API
  responses say `queued` or `skipped`, never `sent`; the delivery outcome is logged by the server.
- **SLA timers** turn amber and red, but nothing escalates automatically and no senior official is notified.
  **Raise Issue** records the citizen's reason and raises the priority to High.
- **Call Authority** shows placeholder contacts labelled as demo data; they are not real officials.
- **Simulation controls** (`+1h`, `Breach`) appear only in development builds (`npm run dev`), only for
  the Authority, and only change complaints marked `testData: true`. The hosted site never shows them and
  the demo doesn't need them.

## Cleanup

Run on the machine with `.env.local` (service-account credentials for `jan-nivaran`):

```bash
node --env-file=.env.local scripts/provision-demo.mjs --project jan-nivaran --live --cleanup
```

This deletes the three demo accounts, their profiles, and every complaint the demo accounts filed (with its
tracking-ID reservation, request records, audit entries and evidence). It touches nothing else. Status or
priority changes the demo staff made to other complaints stay in those complaints' history, so during the
demo act only on the demo complaint.

Recreate the accounts later with the same command without `--cleanup`. Rerunning it is safe: existing
demo accounts keep their passwords (`--rotate-passwords` issues new ones), and it refuses to modify any
account it did not create.

## Local demo on emulators

Needs Java 21+ (e.g. `brew install openjdk@21`). Three terminals:

```bash
# 1. Emulators (demo project: no cloud data, no email)
npx firebase-tools@15.34.0 emulators:start --project demo-jannivaran --only auth,firestore,storage

# 2. Demo accounts (passwords go to .demo-credentials.json under "demo-jannivaran")
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
  node scripts/provision-demo.mjs --project demo-jannivaran

# 3. The app, pointed at the emulators (these values override .env.local)
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
NEXT_PUBLIC_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-jannivaran \
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-jannivaran.appspot.com NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key \
FIREBASE_PROJECT_ID=demo-jannivaran FIREBASE_CLIENT_EMAIL= FIREBASE_PRIVATE_KEY= SMTP_USER= SMTP_PASS= \
  npx next dev
```

Stopping the emulators discards all data. Photo evidence works in this mode.
