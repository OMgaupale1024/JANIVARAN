# Firebase Backend Setup Guide

## 🔥 Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter project name: `jan-nivaran` (or your preferred name)
4. Enable Google Analytics (optional)
5. Create project

### Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Enable **Google** provider
   - Add your support email
   - Save

### Step 3: Create Firestore Database and Storage

1. Go to **Firestore Database** → **Create database**
2. Start in **production mode**
3. Choose location `asia-south1` (matches `firebase.json`)
4. Go to **Storage** → **Get started** (complaint photo evidence is stored here). New default buckets
   (`<project>.firebasestorage.app`) need the Blaze plan. Without a bucket, photo uploads cannot succeed:
   the form gives up after about 20 seconds and asks the citizen to retry or submit without photos.

### Step 4: Get Firebase Configuration

1. Go to **Project Settings** (gear icon) → "Your apps" → Web app (`</>`)
2. Copy the `firebaseConfig` values into `.env.local` (`NEXT_PUBLIC_FIREBASE_*`)
3. **Project Settings → Service accounts → Generate new private key** and copy
   `project_id`, `client_email` and `private_key` into `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. Do not commit the key file.

### Step 5: Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in every value (see comments in that file).

### Step 6: Deploy Security Rules, Indexes and Storage Rules

Run against the intended project only (double-check the project ID):

```bash
npx firebase-tools@15.34.0 login
npx firebase-tools@15.34.0 deploy --only firestore:rules,firestore:indexes,storage --project <your-project-id>
```

Verify afterwards in the console (**Firestore → Rules**, **Storage → Rules**, **Firestore → Indexes**)
that the published rules match `firestore.rules` / `storage.rules`. Until they are deployed the
project keeps whatever rules it had before (the previous rules allowed everyone to read and write).

### Step 7: Grant (and revoke) Authority or Official access

The app trusts only the `role` (and, for officials, `department`) stored in Firestore at `users/{uid}`,
where `{uid}` is the person's Firebase Authentication UID. Public signup always creates a `citizen`, and
security rules stop every browser, including an Authority's, from changing `role` or `department`. So
roles are changed by someone with access to the Firebase console:

1. **Email/Password sign-in must be enabled**: Authentication → Sign-in method → Email/Password → Enable.
   (It is enabled for `jan-nivaran`.)
2. **The person registers themselves** at `/citizen/signup` with their own email and password. This creates
   their Authentication account and a `users/{uid}` profile with `role: "citizen"`. Never create or share
   an account on their behalf.
3. **Find the exact profile**: Authentication → Users → search their email → copy the **User UID**.
   Then Firestore Database → `users` → open the document whose ID is exactly that UID, and check its `email`
   matches. Don't create a new document.
4. **Change only the role field**, leaving everything else as it is:
   - Authority: set `role` to `admin` (string).
   - Official: set `role` to `official` and add a string field `department` with one exact department name:
     `Water Department`, `Electricity Board`, `Sanitation Department`, `Public Works Department`,
     `Transport Department` or `General Administration`. An official with a missing or misspelt department
     sees no complaints and cannot be assigned any.
5. **The person signs out and back in** at `/admin/login`, choosing **Authority** or **Official** to match.
   Check the scope: an Authority sees all departments and can resolve, prioritise, assign and delete; an
   official sees only their department and can mark complaints Under Review or In Progress.

**Revoking or demoting.** Set `role` back to `citizen` and delete `department`. The API reads the role on
every request, so staff actions stop at once; pages already open keep their current view until reloaded,
so ask the person to sign out. To cut access off completely, also disable the account (Authentication →
Users → ⋮ → Disable account); sign-in tokens issued earlier expire within an hour.

**Application admin is not project ownership.** `role: "admin"` gives Authority powers inside JanNivaran
only. It does not grant any access to the Firebase console or Google Cloud, and it cannot change anyone's
role. People who need to manage roles themselves should get their own Google account added under Project
settings → Users and permissions, with the least privileged role that lets them edit Firestore. Never
share the project owner's Google credentials. Do not "grant" roles through localStorage, a role choice at
signup, or by relaxing the rules: the app ignores the first two and the rules exist to prevent the third.

**Demo accounts** are not created this way: `scripts/provision-demo.mjs` creates the three demo identities
with the Admin SDK and refuses to modify accounts it did not create. See [DEMO_GUIDE.md](DEMO_GUIDE.md).

## 📊 Database Collections

The following collections will be created automatically:

- **users** - User profiles with roles
- **complaints** - All grievance complaints
- **escalations** - Escalation records
- **auditLogs** - Audit trail for all actions
- **departments** - Department configurations (optional)

## 🚀 Testing the Backend

Automated tests run against local emulators with a `demo-` project, so they never touch real data:

```bash
npm test                # unit tests
npm run test:emulator   # rules + API integration tests (needs Java 21+)
```

API calls from the browser go through `apiFetch` (`lib/api-client.ts`), which attaches the
signed-in user's ID token:

```typescript
import { apiFetch } from '@/lib/api-client';

const { data } = await apiFetch('/api/complaints', {
  method: 'POST',
  body: JSON.stringify({ title: 'Broken Street Light', description: 'Street light on Main St is not working', category: 'Electricity', location: 'Main Street, Block A' }),
});
console.log('Tracking ID:', data.trackingId);
```

## 🔒 Security

- Complaint writes happen only in API routes (Admin SDK) after ID-token verification
- Firestore rules: citizens read their own complaints, officials their department, admins all; browsers cannot write complaints
- Users cannot change their own `role` or `department`
- Storage rules: owners upload images (≤5MB) to `complaints/{uid}/…` only

## 📝 Next Steps

1. Set up Firebase project and get credentials
2. Add credentials to `.env.local`
3. Deploy Firestore, Storage rules and indexes
4. Create first admin user
5. Test authentication flows
6. Start creating complaints!
