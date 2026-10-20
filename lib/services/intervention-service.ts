export interface AuthorityContact {
    name: string;
    designation: string;
    department: string;
    phone: string;
    email: string;
    level: 'Department Head' | 'Senior Official' | 'Director';
}

// Mock authority contacts, keyed by complaint category
const AUTHORITY_CONTACTS: Record<string, AuthorityContact> = {
    'Roads & Potholes': {
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
    'Sanitation & Waste': {
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
 * Get authority contact for a complaint category
 */
export function getAuthorityContact(category?: string): AuthorityContact {
    return AUTHORITY_CONTACTS[category || 'Default'] || AUTHORITY_CONTACTS.Default;
}
