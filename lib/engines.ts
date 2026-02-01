import { differenceInMinutes, addHours } from 'date-fns';
import { Grievance, SLAState, EscalationLevel, Priority, GrievanceStatus, ClassificationResult, Department } from './types';

export const Engines = {
    // 0. Classifier & Deadline
    classify: (text: string): ClassificationResult => {
        const lower = text.toLowerCase();
        if (lower.includes('water') || lower.includes('pipe') || lower.includes('leak')) return { department: 'Water', slaHours: 48 };
        if (lower.includes('light') || lower.includes('power') || lower.includes('pole')) return { department: 'Electricity', slaHours: 24 };
        if (lower.includes('road') || lower.includes('pothole')) return { department: 'Roads', slaHours: 72 };
        if (lower.includes('garbage') || lower.includes('trash')) return { department: 'Sanitation', slaHours: 24 };
        return { department: 'Other', slaHours: 96 };
    },

    calculateDeadline: (startDate: string, hours: number): string => {
        return addHours(new Date(startDate), hours).toISOString();
    },

    // 1. SLA Calculator
    calculateSLA: (grievance: Grievance): { status: SLAState; timeRemaining: number; progress: number } => {
        const now = new Date();
        const deadline = new Date(grievance.slaDeadline);
        const submitted = new Date(grievance.submittedAt);

        const totalDuration = differenceInMinutes(deadline, submitted);
        const timeRemaining = differenceInMinutes(deadline, now);

        const progress = Math.max(0, Math.min(100, ((totalDuration - timeRemaining) / totalDuration) * 100));

        let status: SLAState = 'ON_TRACK';
        if (timeRemaining <= 0) status = 'BREACHED';
        else if (timeRemaining < totalDuration * 0.5) status = 'AT_RISK';

        return { status, timeRemaining, progress };
    },

    // 2. Escalation Engine
    processEscalations: (grievance: Grievance): Grievance => {
        const { status } = Engines.calculateSLA(grievance);
        let textUpdates: string[] = [];

        // Logic: If Breached and not yet escalated deeply, escalate it
        if (status === 'BREACHED') {
            if (grievance.escalationLevel === 'NONE') {
                grievance.escalationLevel = 'L1_DEPT_HEAD';
                grievance.status = 'ESCALATED';
                textUpdates.push('Auto-escalated to Level 1 (Dept Head) due to SLA Breach');
            }
        }

        if (textUpdates.length > 0) {
            grievance.history.push({
                timestamp: new Date().toISOString(),
                action: 'AUTO_ESCALATION',
                details: textUpdates.join(', '),
                by: 'System Engine'
            });
        }

        return grievance;
    },

    // 3. Demo Data Generator
    // ⚠️ DEPRECATED: This function is no longer used in production
    // All dashboards now use Firestore as the single source of truth
    // Kept for reference only - DO NOT USE
    generateMockGrievances: (): Grievance[] => {
        console.warn('⚠️ generateMockGrievances() is deprecated. Use Firestore instead.');

        const categories = ['Water Supply', 'Roads', 'Electricity', 'Sanitation', 'Public Transport'];
        const locations = ['Ward 12, Indiranagar', 'Zone 4, MG Road', 'Sector 2, HSR Layout', 'Ward 5, Koramangala'];

        return Array.from({ length: 15 }).map((_, i) => {
            const isCritical = Math.random() > 0.8;
            const isBreached = Math.random() > 0.85;

            const submittedAt = new Date();
            // Spread submission over last 48 hours
            submittedAt.setHours(submittedAt.getHours() - Math.floor(Math.random() * 48));

            const deadline = new Date(submittedAt);
            deadline.setHours(deadline.getHours() + (isCritical ? 24 : 72)); // 24h for critical, 72h normal

            // Force some to be breached for demo
            if (isBreached) {
                deadline.setHours(deadline.getHours() - 100);
            }

            return {
                id: `GRV-${2026000 + i}`,
                title: `${categories[i % categories.length]} Issue reported`,
                category: categories[i % categories.length],
                location: locations[i % locations.length],
                status: isBreached ? 'ESCALATED' : (Math.random() > 0.5 ? 'IN_PROGRESS' : 'PENDING'),
                priority: isCritical ? 'CRITICAL' : (Math.random() > 0.5 ? 'HIGH' : 'MEDIUM'),
                submittedAt: submittedAt.toISOString(),
                slaDeadline: deadline.toISOString(),
                escalationLevel: isBreached ? 'L1_DEPT_HEAD' : 'NONE',
                assignedTo: 'Field Officer Sharma',
                history: [
                    {
                        timestamp: submittedAt.toISOString(),
                        action: 'SUBMITTED',
                        details: 'Grievance received via Portal',
                        by: 'Citizen'
                    }
                ]
            } as Grievance;
        });
    }
};
