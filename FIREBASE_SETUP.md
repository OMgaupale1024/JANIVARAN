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
4. Go to **Storage** → **Get started** (complaint photo evidence is stored here)

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

### Step 7: Create Staff Accounts

Self-signup always creates a `citizen`. Roles are assigned only by an administrator:

1. The staff member signs up through the app
2. Firebase Console → Firestore → `users/{uid}`
3. Set `role` to `"official"` and `department` to the exact department name used on complaints
   (`Water Department`, `Electricity Board`, `Sanitation Department`, `Public Works Department`,
   `Transport Department`, `General Administration`), or set `role` to `"admin"` for an Authority
4. Staff sign in at `/admin/login`

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
