# JanNivaran demo guide

A walkthrough of one complaint that the citizen files under the **wrong category**: the Authority transfers
it to the right department (same tracking ID), the water official works it, the Authority resolves it, and the
citizen sees the department, timeline and chart update. Everything below reflects what the app actually does.

## Before you start

**Where to run it** (state checked on 24 October 2026)

| Option | URL | Notes |
| --- | --- | --- |
| Local, emulators | <http://localhost:3000> | Everything works, including photo evidence. No cloud data or email. See [Local demo](#local-demo-on-emulators). **Use this for the full demo today.** |
| Hosted | <https://oraoss.in> | Serves the `main` branch. Until this branch is merged and deployed, the site runs older code: no working **Use GPS** (the button has no handler there), no transfer, no status chart. Photo upload fails on the hosted site until Firebase Storage exists (see below). |

Branch previews (`*.vercel.app` preview URLs) are **not** usable: the Preview environment has no Firebase Admin
credentials, so every API call answers `503`. Say which URL (and commit) you are showing.

**Accounts** (created by `scripts/provision-demo.mjs`, UIDs `demo-citizen`, `demo-water-official`, `demo-authority`)

| Identity | Role | Department | Sign in at |
| --- | --- | --- | --- |
| `demo-citizen@example.test` | citizen | none | `/citizen` |
| `demo-water-official@example.test` | official | Water Department | `/admin/login` → **Official** |
| `demo-authority@example.test` | admin (Authority) | none (sees all) | `/admin/login` → **Authority** |

Passwords live only in `.demo-credentials.json` (gitignored, mode 600) on the machine that ran the
provisioning command. Reuse them; don't show that file on screen. `@example.test` addresses can never receive
mail, so the app skips email for these accounts.

**Use three separate browser profiles** (or three different browsers), one per role. Tabs and windows of one
profile share a single Firebase sign-in, so signing in as the official would sign the citizen out.

**A demo photo:** any small JPG, PNG or WebP under 5 MB that shows nothing private (for example a photo of a
tap, or a plain test image). Up to three photos per complaint.

### Photo evidence on the hosted site (owner action needed)

Checked directly on 24 October 2026: Firebase project `jan-nivaran` has **no Cloud Storage bucket**
(`jan-nivaran.firebasestorage.app`, the name the web app and server are configured with, does not exist) and
**Cloud Billing is disabled** for the project. New default buckets need the pay-as-you-go **Blaze** plan, so
uploads cannot succeed until the project owner:

1. Firebase console → project **jan-nivaran** → upgrade to **Blaze** (set a budget alert if wanted).
2. **Build → Storage → Get started**. Choose a location (a US region such as `us-central1` keeps the
   no-cost Storage quota; `asia-south1` matches Firestore but is billed from the first byte). Start in
   production mode.
3. Confirm the bucket shown is `gs://jan-nivaran.firebasestorage.app` (it must match
   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` in Vercel). If it differs, update that variable in Vercel and redeploy.
4. Publish the repository's rules (Hosting deploys never do this):
   `npx firebase-tools@15.34.0 deploy --only storage --project jan-nivaran`.
5. File one complaint with a demo photo on the hosted site and check that staff can see the photo.

Until then the hosted form says **"Photo storage isn't set up on this site yet"** with the detail
`Photo upload failed: storage/unknown (HTTP 404)`, keeps everything typed, and offers **Submit without photos**.

## Walkthrough

### 1. Citizen files under the wrong category (profile A)

1. Open `/citizen`, sign in as `demo-citizen@example.test`. The dashboard shows status cards and, once you
   have complaints, **Your complaints by status**.
2. **File Complaint** → choose **Electricity** (deliberately wrong).
3. Title `DEMO Water leak near Ward 7 market`; description `Main pipe leaking onto the road near the market gate.`;
   location `Ward 7 market gate (demo)`.
4. Optional: **Use GPS**. The button shows **Locating…** while the browser works; allow the permission prompt.
   Coordinates and accuracy are appended, e.g. `(GPS 18.52040, 73.85670 ±25 m)`; a broad estimate is marked
   `approximate`. Pressing again replaces the fix. If permission is blocked, location services are off, or the
   prompt is ignored for 20 seconds, the message says which, and you can type the landmark instead. Coordinates
   are visible to the citizen and the handling staff only, never on public tracking.
5. **Next Step** → attach the demo photo → **Submit Complaint**.

Expected: progress for the photo, then **Complaint Filed Successfully!** with a tracking ID like `JAN-123456`.
Note it. The dashboard shows it as PENDING, "Filed as Electricity • Handled by Electricity Board".

### 2. Authority transfers it to the Water Department (profile C)

1. Open `/admin/login`, choose **Authority**, sign in as `demo-authority@example.test`.
2. **All Complaints** → eye icon on the demo complaint. The header shows **Filed as Electricity** and the current
   department **Electricity Board**. (Opening a pending complaint marks it **Under Review**.)
3. Under **Wrong department?** choose **Water Department**, reason `Water pipe leak filed under Electricity`,
   then **Transfer to department**.

Expected: "Transferred to Water Department…", the department badge changes, and the timeline lists the transfer
with its reason. Tracking ID, status, priority, photo and SLA deadline are unchanged; it is not a new complaint.
An Electricity official who had it open sees the details close and a note that it left their queue; the server
now refuses them. Only the Authority can transfer, and only active complaints.

### 3. Water official works it (profile B)

1. Open `/admin/login`, choose **Official**, sign in as `demo-water-official@example.test`.
2. **All Complaints** lists Water Department complaints only; the demo complaint is now there with its photo.
3. Open it → **Mark as In Progress**. The badge shows **In Progress** once the server confirms.

Officials have no **Resolve**, **Critical Priority** or **Transfer** controls, and the server refuses those
actions if called directly.

### 4. Authority resolves it (profile C)

1. Open the demo complaint again → **Close & Resolve Complaint**. The badge shows **Resolved**; the transfer
   form disappears (completed complaints can't be transferred).
2. Close the dialog. The complaint leaves **Active**; **Completed** (or **All**) still shows it as RESOLVED.

### 5. Citizen view and public tracking (profile A, then any window)

1. The citizen dashboard updates live: "Filed as Electricity • Handled by Water Department", RESOLVED, and the
   chart counts move (Under Review → In Progress → Resolved). The chart counts each complaint once and shows
   "Resolved: N of M complaints (P%)", which is the share of the citizen's complaints that are resolved, not how
   much of any repair is done. Withdrawn and "closed without resolution" are counted separately from resolved.
2. Click the complaint: the timeline shows each stage reached and **Department changes** with the reason.
3. Open `/track`, enter the tracking ID: category, current department, status, priority, SLA and timeline appear.
   Title, description, location, GPS and the citizen's identity are not shown.

### Access isolation and error paths (optional)

Another citizen sees none of these complaints; an official of another department sees only their own department;
direct API calls and Firestore reads are refused. `npm run test:e2e` runs this whole walkthrough automatically on
the emulators, including GPS failures, a missing bucket, and the transfer access changes.

Turn the network off just before **Submit Complaint**: the form says it couldn't confirm the complaint was
received and keeps everything. Turn it back on and submit again: same tracking ID, never a duplicate.

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
