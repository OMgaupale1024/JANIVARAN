import { ComplaintPriority } from '@/types/backend';

// Department configuration with keywords and SLA hours
export const DEPARTMENT_CONFIG = {
    'Sanitation & Waste': {
        keywords: ['garbage', 'waste', 'trash', 'sanitation', 'dustbin', 'cleaning', 'dirty', 'smell', 'litter'],
        slaHours: 48,
        department: 'Sanitation Department',
    },
    'Roads & Potholes': {
        keywords: ['road', 'pothole', 'street', 'pavement', 'footpath', 'crack', 'broken', 'damage', 'repair'],
        slaHours: 72,
        department: 'Public Works Department',
    },
    'Water Supply': {
        keywords: ['water', 'pipe', 'leak', 'supply', 'tap', 'drainage', 'sewage', 'overflow'],
        slaHours: 24,
        department: 'Water Department',
    },
    'Electricity': {
        keywords: ['electricity', 'power', 'light', 'streetlight', 'pole', 'wire', 'outage', 'blackout'],
        slaHours: 12,
        department: 'Electricity Board',
    },
    'Public Transport': {
        keywords: ['bus', 'transport', 'metro', 'train', 'station', 'stop', 'route', 'schedule'],
        slaHours: 96,
        department: 'Transport Department',
    },
    'Other': {
        keywords: [],
        slaHours: 120,
        department: 'General Administration',
    },
};

/**
 * Classify complaint based on description and category
 */
export function classifyComplaint(description: string, category: string): {
    department: string;
    slaHours: number;
    priority: ComplaintPriority;
} {
    const lowerDescription = description.toLowerCase();

    // Get department from category
    const config = DEPARTMENT_CONFIG[category as keyof typeof DEPARTMENT_CONFIG] || DEPARTMENT_CONFIG['Other'];

    // Determine priority based on keywords
    const priority = determinePriority(lowerDescription);

    return {
        department: config.department,
        slaHours: config.slaHours,
        priority,
    };
}

/**
 * Determine priority based on urgency keywords
 */
function determinePriority(description: string): ComplaintPriority {
    const criticalKeywords = ['emergency', 'urgent', 'danger', 'hazard', 'accident', 'injury', 'fire', 'flood'];
    const highKeywords = ['broken', 'severe', 'major', 'serious', 'critical', 'immediate'];
    const mediumKeywords = ['problem', 'issue', 'concern', 'need', 'require'];

    if (criticalKeywords.some(keyword => description.includes(keyword))) {
        return 'critical';
    }

    if (highKeywords.some(keyword => description.includes(keyword))) {
        return 'high';
    }

    if (mediumKeywords.some(keyword => description.includes(keyword))) {
        return 'medium';
    }

    return 'low';
}

/**
 * Validate complaint category
 */
export function isValidCategory(category: string): boolean {
    return category in DEPARTMENT_CONFIG;
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
    return Object.keys(DEPARTMENT_CONFIG);
}
