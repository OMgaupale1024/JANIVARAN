import { Timestamp } from 'firebase/firestore';

// Intervention action types
export type InterventionType = 'call' | 'escalation';

export interface InterventionAction {
    type: InterventionType;
    timestamp: Timestamp;
    reason?: string;
    message?: string;
    userId: string;
    userName?: string;
}

export interface AuthorityContact {
    name: string;
    designation: string;
    department: string;
    phone: string;
    email: string;
    level: 'Department Head' | 'Senior Official' | 'Director';
}

// Mock authority contacts by department
const AUTHORITY_CONTACTS: Record<string, AuthorityContact> = {
    'Public Works': {
        name: 'Rajesh Kumar',
        designation: 'Chief Engineer',
        department: 'Public Works Department',
        phone: '+91-11-2345-6789',
        email: 'rajesh.kumar@pwd.gov.in',
        level: 'Department Head',
    },
    'Health Services': {
        name: 'Dr. Priya Sharma',
        designation: 'Director of Health Services',
        department: 'Health Department',
        phone: '+91-11-2345-6790',
        email: 'priya.sharma@health.gov.in',
        level: 'Director',
    },
    'Water Supply': {
        name: 'Amit Patel',
        designation: 'Executive Engineer',
        department: 'Water Supply Department',
        phone: '+91-11-2345-6791',
        email: 'amit.patel@water.gov.in',
        level: 'Senior Official',
    },
    'Electricity': {
        name: 'Sunita Reddy',
        designation: 'Superintending Engineer',
        department: 'Electricity Board',
        phone: '+91-11-2345-6792',
        email: 'sunita.reddy@electricity.gov.in',
        level: 'Senior Official',
    },
    'Sanitation': {
        name: 'Vikram Singh',
        designation: 'Municipal Commissioner',
        department: 'Sanitation Department',
        phone: '+91-11-2345-6793',
        email: 'vikram.singh@sanitation.gov.in',
        level: 'Department Head',
    },
    'Default': {
        name: 'Administrative Officer',
        designation: 'Senior Administrative Officer',
        department: 'General Administration',
        phone: '+91-11-2345-6700',
        email: 'admin@jannivaran.gov.in',
        level: 'Senior Official',
    },
};

/**
 * Initiate a call to authority (mock implementation)
 * Returns authority contact information
 */
export async function initiateCallToAuthority(
    complaintId: string,
    userId: string,
    userName: string,
    department?: string
): Promise<{
    success: boolean;
    action: InterventionAction;
    contact: AuthorityContact;
}> {
    // Get authority contact for department
    const contact = AUTHORITY_CONTACTS[department || 'Default'] || AUTHORITY_CONTACTS.Default;

    // Create intervention action record
    const action: InterventionAction = {
        type: 'call',
        timestamp: Timestamp.now(),
        userId,
        userName,
    };

    // Log the action (in production, this would be saved to database)
    console.log(`📞 [CALL INITIATED] Complaint: ${complaintId} | User: ${userName} | Authority: ${contact.name} (${contact.designation})`);

    return {
        success: true,
        action,
        contact,
    };
}

/**
 * Raise an escalation request
 */
export async function raiseEscalationRequest(
    complaintId: string,
    userId: string,
    userName: string,
    reason: string,
    message?: string
): Promise<{
    success: boolean;
    action: InterventionAction;
    escalationId: string;
}> {
    // Create intervention action record
    const action: InterventionAction = {
        type: 'escalation',
        timestamp: Timestamp.now(),
        reason,
        message,
        userId,
        userName,
    };

    // Generate escalation ID
    const escalationId = `ESC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Log the action (in production, this would be saved to database and trigger notifications)
    console.log(`🚨 [ESCALATION RAISED] Complaint: ${complaintId} | User: ${userName} | Reason: ${reason}`);
    console.log(`   Escalation ID: ${escalationId}`);
    if (message) {
        console.log(`   Message: ${message}`);
    }

    return {
        success: true,
        action,
        escalationId,
    };
}

/**
 * Get intervention history for a complaint
 * In production, this would fetch from database
 */
export function getInterventionHistory(interventionActions: InterventionAction[]): {
    calls: number;
    escalations: number;
    lastAction?: InterventionAction;
} {
    const calls = interventionActions.filter(a => a.type === 'call').length;
    const escalations = interventionActions.filter(a => a.type === 'escalation').length;
    const lastAction = interventionActions.length > 0
        ? interventionActions[interventionActions.length - 1]
        : undefined;

    return { calls, escalations, lastAction };
}

/**
 * Get authority contact for a department
 */
export function getAuthorityContact(department?: string): AuthorityContact {
    return AUTHORITY_CONTACTS[department || 'Default'] || AUTHORITY_CONTACTS.Default;
}

/**
 * Format intervention action for display
 */
export function formatInterventionAction(action: InterventionAction): string {
    const timestamp = action.timestamp instanceof Timestamp
        ? action.timestamp.toDate()
        : new Date(action.timestamp);

    const timeStr = timestamp.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    if (action.type === 'call') {
        return `📞 Called authority on ${timeStr}`;
    } else {
        return `🚨 Raised escalation on ${timeStr}: ${action.reason}`;
    }
}
