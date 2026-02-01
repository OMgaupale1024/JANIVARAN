import { User, UserRole } from '@/types/backend';

/**
 * Check if user has a specific role
 */
export function hasRole(user: User | null, role: UserRole): boolean {
    return user?.role === role;
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null): boolean {
    return hasRole(user, 'admin');
}

/**
 * Check if user is official
 */
export function isOfficial(user: User | null): boolean {
    return hasRole(user, 'official');
}

/**
 * Check if user is citizen
 */
export function isCitizen(user: User | null): boolean {
    return hasRole(user, 'citizen');
}

/**
 * Check if user has permission to view complaint
 */
export function canViewComplaint(user: User | null, complaintCitizenId: string, complaintDepartment?: string): boolean {
    if (!user) return false;

    // Admin can view all
    if (isAdmin(user)) return true;

    // Citizen can view their own
    if (isCitizen(user) && user.uid === complaintCitizenId) return true;

    // Official can view complaints in their department
    if (isOfficial(user) && user.department === complaintDepartment) return true;

    return false;
}

/**
 * Check if user can update complaint
 */
export function canUpdateComplaint(user: User | null, complaintDepartment?: string): boolean {
    if (!user) return false;

    // Admin can update all
    if (isAdmin(user)) return true;

    // Official can update complaints in their department
    if (isOfficial(user) && user.department === complaintDepartment) return true;

    return false;
}

/**
 * Check if user can escalate complaint
 */
export function canEscalateComplaint(user: User | null): boolean {
    if (!user) return false;
    return isAdmin(user) || isOfficial(user);
}

/**
 * Check if user can assign complaint
 */
export function canAssignComplaint(user: User | null): boolean {
    if (!user) return false;
    return isAdmin(user);
}

/**
 * Get user display name with fallback
 */
export function getUserDisplayName(user: User | null): string {
    return user?.displayName || user?.email || 'Unknown User';
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
    const roleNames: Record<UserRole, string> = {
        citizen: 'Citizen',
        official: 'Department Official',
        admin: 'Administrator',
    };
    return roleNames[role];
}
