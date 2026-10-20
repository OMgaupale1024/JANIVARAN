import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Actor } from '@/lib/complaint-policy';
import { UserRole } from '@/types/backend';

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export interface AuthUser extends Actor {
    email: string;
    displayName: string;
}

const ROLES: UserRole[] = ['citizen', 'official', 'admin'];

/**
 * Verify the Firebase ID token in the Authorization header and load the
 * caller's role/department from the trusted users/{uid} record. Identity and
 * role never come from the request body, query string, or localStorage.
 */
export async function requireUser(request: Request): Promise<AuthUser> {
    const match = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
    if (!match) throw new HttpError(401, 'Authentication required');

    let decoded;
    try {
        decoded = await adminAuth().verifyIdToken(match[1]);
    } catch {
        throw new HttpError(401, 'Invalid or expired session. Please sign in again.');
    }

    const profile = (await adminDb().collection('users').doc(decoded.uid).get()).data() ?? {};
    // Missing or unrecognised roles get the least privilege
    const role = ROLES.includes(profile.role) ? (profile.role as UserRole) : 'citizen';

    return {
        uid: decoded.uid,
        role,
        department: role === 'official' && typeof profile.department === 'string' ? profile.department : undefined,
        email: decoded.email ?? '',
        displayName: typeof profile.displayName === 'string' ? profile.displayName : decoded.name ?? 'Citizen',
    };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
    try {
        const body = await request.json();
        if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    } catch {
        // fall through
    }
    throw new HttpError(400, 'Request body must be a JSON object');
}

export function errorResponse(error: unknown, context: string) {
    const status = (error as { status?: unknown })?.status;
    if (typeof status === 'number' && status >= 400 && status < 600) {
        return NextResponse.json({ success: false, error: (error as Error).message }, { status });
    }
    console.error(`${context} error:`, error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
