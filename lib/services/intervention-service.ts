export interface AuthorityContact {
    name: string;
    designation: string;
    department: string;
    phone: string;
    email: string;
    level: 'Department Head' | 'Senior Official' | 'Director';
}

// DEMO DATA: there is no verified directory of officials. These placeholders use an unassigned
// phone format and the reserved .example domain so nobody real can be called or emailed.
const AUTHORITY_CONTACTS: Record<string, AuthorityContact> = {
    'Roads & Potholes': {
        name: 'Public Works duty officer (demo)',
        designation: 'Chief Engineer',
        department: 'Public Works Department',
        phone: '+91-00000-00001 (demo)',
        email: 'pwd-desk@jannivaran.example',
        level: 'Department Head',
    },
    'Water Supply': {
        name: 'Water Supply duty officer (demo)',
        designation: 'Executive Engineer',
        department: 'Water Supply Department',
        phone: '+91-00000-00002 (demo)',
        email: 'water-desk@jannivaran.example',
        level: 'Senior Official',
    },
    'Electricity': {
        name: 'Electricity Board duty officer (demo)',
        designation: 'Superintending Engineer',
        department: 'Electricity Board',
        phone: '+91-00000-00003 (demo)',
        email: 'power-desk@jannivaran.example',
        level: 'Senior Official',
    },
    'Sanitation & Waste': {
        name: 'Sanitation duty officer (demo)',
        designation: 'Municipal Commissioner',
        department: 'Sanitation Department',
        phone: '+91-00000-00004 (demo)',
        email: 'sanitation-desk@jannivaran.example',
        level: 'Department Head',
    },
    'Default': {
        name: 'Administrative duty officer (demo)',
        designation: 'Senior Administrative Officer',
        department: 'General Administration',
        phone: '+91-00000-00000 (demo)',
        email: 'admin-desk@jannivaran.example',
        level: 'Senior Official',
    },
};

/**
 * Get the (demo) authority contact for a complaint category
 */
export function getAuthorityContact(category?: string): AuthorityContact {
    return category && Object.hasOwn(AUTHORITY_CONTACTS, category) ? AUTHORITY_CONTACTS[category] : AUTHORITY_CONTACTS.Default;
}
