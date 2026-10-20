import { auth } from './firebase-config';

/**
 * Call a JanNivaran API route as the signed-in user. Attaches a fresh Firebase
 * ID token and throws the server's error message when the request fails.
 */
export async function apiFetch<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in to continue.');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(url, { ...init, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body as T;
}
