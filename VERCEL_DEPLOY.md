# Deploying JanNivaran to Vercel

This guide explains how to deploy the JanNivaran application to [Vercel](https://vercel.com), the creators of Next.js.

## Prerequisites

1.  A [Vercel Account](https://vercel.com/signup).
2.  Your project pushed to a Git provider (GitHub, GitLab, or Bitbucket).

## Option A: Deploy via Vercel Dashboard (Recommended)

1.  **Push your code** to a GitHub repository.
2.  Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
3.  Click **"Add New..."** > **"Project"**.
4.  Import your `jan-nivaran` repository.
5.  **Configure Project**:
    *   **Framework Preset**: Keep as `Next.js`.
    *   **Root Directory**: Keep as `./`.
    *   **Environment Variables**: You MUST add the environment variables from your `.env.local` file.

    Expand the "Environment Variables" section and add the following (copy values from your local `.env.local`):

    | Key | Description |
    | :--- | :--- |
    | `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key |
    | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
    | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `jan-nivaran` |
    | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage Bucket |
    | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID |
    | `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
    | `FIREBASE_PROJECT_ID` | `jan-nivaran` (for server-side admin) |
    | `FIREBASE_CLIENT_EMAIL` | Service Account Email (from `.env.local`) |
    | `FIREBASE_PRIVATE_KEY` | Service Account Private Key (handle newlines correctly!) |
    | `SMTP_HOST` | (Optional) SMTP Host for emails |
    | `SMTP_PORT` | (Optional) SMTP Port |
    | `SMTP_USER` | (Optional) SMTP User |
    | `SMTP_PASS` | (Optional) SMTP Password |
    | `NEXT_PUBLIC_APP_URL` | Public site URL used in email links |
    | `EMAIL_OVERRIDE_TO` | (Optional, testing) send all mail to this inbox |

6.  Click **"Deploy"**. Vercel runs `npm install`; the committed `.npmrc` makes peer resolution match the lockfile.

> Before going live, deploy `firestore.rules`, `storage.rules` and `firestore.indexes.json` to the
> same Firebase project (see `FIREBASE_SETUP.md`, Step 6). A Vercel deploy does not update Firebase rules.

## Option B: Deploy via CLI within VS Code

1.  Install Vercel CLI:
    ```bash
    npm i -g vercel
    ```
2.  Run the deploy command:
    ```bash
    vercel
    ```
3.  Follow the prompts:
    *   Set up and deploy? **Y**
    *   Which scope? **(Select your account)**
    *   Link to existing project? **N**
    *   Project name? **jan-nivaran**
    *   In which directory? **./**
    *   Auto-detect settings? **Y** (It should detect Next.js)
    *   *Important*: It might ask to override settings. Ensure you add env vars in the dashboard later if you don't link them now.

## Handling `FIREBASE_PRIVATE_KEY` on Vercel

When adding the private key to Vercel's Environment Variables UI, you can usually paste the entire key including `-----BEGIN PRIVATE KEY-----` and newlines. Vercel handles this well.

If you face issues, ensure the value is enclosed in quotes if using the CLI, or just paste the raw value in the Dashboard UI.

---

## Post-Deployment

Once deployed, you will get a URL like `jan-nivaran.vercel.app`.
*   Go to your **Firebase Console** > **Authentication** > **Settings** > **Authorized Domains**.
*   Add your Vercel domain (`jan-nivaran.vercel.app`) to the list to allow Google Sign-In and other auth providers to work.
