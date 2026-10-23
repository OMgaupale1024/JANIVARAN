import { defineConfig, devices } from '@playwright/test';

// Browser tests run only against the Firebase emulators (demo project, no real data or mail).
// Use `npm run test:e2e`, which starts the emulators and sets their *_EMULATOR_HOST variables.
const emulators = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'];
if (emulators.some(name => !process.env[name])) {
    throw new Error('Browser tests need the Firebase emulators: run `npm run test:e2e`');
}

const PORT = 3100;
const PROJECT = 'demo-jannivaran';

export default defineConfig({
    testDir: 'tests/e2e',
    workers: 1,
    timeout: 180_000,
    expect: { timeout: 20_000 },
    reporter: [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        navigationTimeout: 90_000,
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
    },
    webServer: {
        command: `npx next dev --port ${PORT}`,
        url: `http://localhost:${PORT}/track`,
        timeout: 180_000,
        reuseExistingServer: false,
        // Values set here win over .env.local, so real credentials and SMTP are never loaded
        env: {
            NEXT_PUBLIC_FIREBASE_EMULATORS: 'true',
            NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
            NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
            NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
            NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
            FIREBASE_PROJECT_ID: PROJECT,
            FIREBASE_CLIENT_EMAIL: '',
            FIREBASE_PRIVATE_KEY: '',
            SMTP_HOST: '',
            SMTP_USER: '',
            SMTP_PASS: '',
            EMAIL_OVERRIDE_TO: '',
        },
    },
});
