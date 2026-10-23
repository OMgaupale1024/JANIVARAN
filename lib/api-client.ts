import { auth } from './firebase-config';

/**
 * Why an API call failed:
 *  - signed-out:       no session, or it was rejected even after a refresh: sign in again
 *  - not-sent:         the sign-in token could not be obtained, so nothing was sent
 *  - no-response:      network error or timeout after sending; the server may still have acted
 *  - invalid-response: a success status with an unreadable body; the server may have acted
 *  - http:             the server answered with an error status (see status/body)
 */
export type ApiErrorKind = 'signed-out' | 'not-sent' | 'no-response' | 'invalid-response' | 'http';

export class ApiError extends Error {
    constructor(message: string, public kind: ApiErrorKind, public status = 0, public body: Record<string, unknown> = {}) {
        super(message);
        this.name = 'ApiError';
    }
}

const AUTH_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function idToken(forceRefresh: boolean): Promise<string> {
    try {
        const user = await within(auth.authStateReady().then(() => auth.currentUser), AUTH_TIMEOUT_MS);
        if (user) return await within(user.getIdToken(forceRefresh), AUTH_TIMEOUT_MS);
    } catch (error) {
        if (/user-token-expired|user-disabled|user-not-found|invalid-user-token/.test((error as { code?: string }).code ?? '')) {
            throw new ApiError('Your session has expired. Please sign in again.', 'signed-out', 401);
        }
        throw new ApiError("We couldn't verify your sign-in. Check your connection and try again.", 'not-sent');
    }
    throw new ApiError('Please sign in to continue.', 'signed-out', 401);
}

/**
 * Call a JanNivaran API route as the signed-in user. Attaches a Firebase ID token,
 * gives up after timeoutMs (the caller's signal can cancel sooner) and throws ApiError.
 * A 401 is answered before the server changes anything, so it is retried once with a
 * refreshed token. A timeout does not prove the server did nothing.
 */
export async function apiFetch<T = Record<string, unknown>>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    const { timeoutMs = REQUEST_TIMEOUT_MS, signal, ...rest } = init;
    for (let attempt = 0; ; attempt++) {
        const headers = new Headers(rest.headers);
        headers.set('Authorization', `Bearer ${await idToken(attempt > 0)}`);
        if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

        const controller = new AbortController();
        const abort = () => controller.abort();
        const timer = setTimeout(abort, timeoutMs);
        signal?.addEventListener('abort', abort);
        if (signal?.aborted) abort();
        let response: Response;
        let text: string;
        try {
            response = await fetch(url, { ...rest, headers, signal: controller.signal });
            text = await response.text();
        } catch (error) {
            if (signal?.aborted) throw signal.reason ?? error; // cancelled by the caller
            throw new ApiError(controller.signal.aborted ? 'The server took too long to respond.' : 'Could not reach the server.', 'no-response');
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }

        if (response.status === 401 && attempt === 0) continue;

        let body: Record<string, unknown> | null = null;
        try {
            body = JSON.parse(text);
        } catch {
            // not JSON (e.g. a platform error page)
        }
        if (!response.ok || body?.success === false) {
            const message = typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`;
            throw new ApiError(message, response.status === 401 ? 'signed-out' : 'http', response.status, body ?? {});
        }
        if (body === null || typeof body !== 'object') {
            throw new ApiError('The server sent an unexpected response.', 'invalid-response', response.status);
        }
        return body as T;
    }
}
