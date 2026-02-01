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

### Step 3: Create Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Start in **production mode**
3. Choose a location (e.g., `us-central1`)
4. Click **Enable**

### Step 4: Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll to "Your apps" section
3. Click **Web app** icon (`</>`)
4. Register app with nickname: `jan-nivaran-web`
5. Copy the `firebaseConfig` object

### Step 5: Configure Environment Variables

1. Create `.env.local` file in project root:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

2. Replace values with your Firebase config

### Step 6: Deploy Security Rules

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase in project:
```bash
firebase init firestore
```

4. Select your Firebase project
5. Use `firestore.rules` as the rules file
6. Deploy rules:
```bash
firebase deploy --only firestore:rules
```

### Step 7: Create Initial Admin User

After setting up, create your first admin user:

1. Sign up through the app with email/password
2. Go to Firebase Console → Firestore Database
3. Find your user document in `users` collection
4. Edit the document and change `role` field to `"admin"`

## 📊 Database Collections

The following collections will be created automatically:

- **users** - User profiles with roles
- **complaints** - All grievance complaints
- **escalations** - Escalation records
- **auditLogs** - Audit trail for all actions
- **departments** - Department configurations (optional)

## 🚀 Testing the Backend

### Test Authentication

```typescript
import { useAuth } from '@/lib/auth-context';

function MyComponent() {
  const { signIn, signInWithGoogle, user } = useAuth();
  
  // Email/Password sign in
  await signIn('user@example.com', 'password');
  
  // Google sign in
  await signInWithGoogle();
}
```

### Test Complaint Creation

```typescript
import { createComplaint } from '@/lib/services/complaint-service';

const formData = {
  title: 'Broken Street Light',
  description: 'Street light on Main St is not working',
  category: 'Electricity',
  location: 'Main Street, Block A',
};

const complaint = await createComplaint(formData, user);
console.log('Tracking ID:', complaint.trackingId);
```

### Test Dashboard Stats

```typescript
import { getDashboardStats } from '@/lib/services/dashboard-service';

const stats = await getDashboardStats();
console.log('Total complaints:', stats.totalComplaints);
console.log('SLA breached:', stats.breached);
```

## 🔒 Security

- All Firestore operations are protected by security rules
- Role-based access control is enforced
- Citizens can only view/create their own complaints
- Officials can view complaints in their department
- Admins have full access

## 📝 Next Steps

1. Set up Firebase project and get credentials
2. Add credentials to `.env.local`
3. Deploy Firestore security rules
4. Create first admin user
5. Test authentication flows
6. Start creating complaints!

## 🛠️ Optional: Background Jobs

For production, set up Cloud Functions for:

- **SLA Monitoring**: Run every hour to update SLA status
- **Auto-Escalation**: Escalate breached complaints
- **Email Notifications**: Send updates to users

Example Cloud Function:

```typescript
import { autoEscalateBreachedComplaints } from './services/escalation-service';

export const monitorSLA = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    await autoEscalateBreachedComplaints();
  });
```
