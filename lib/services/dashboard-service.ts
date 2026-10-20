import { Complaint, DashboardStats } from '@/types/backend';
import { calculateSLA, toMillis } from './sla-service';

/**
 * Dashboard statistics computed from a list of complaints the caller may see.
 * SLA figures are live (sla-service), not the creation-time snapshot.
 */
export function getDashboardStats(complaints: Complaint[], now: number = Date.now()): DashboardStats {
    const open = complaints.filter(c => !calculateSLA(c, now).closed);
    return {
        totalComplaints: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        inProgress: complaints.filter(c => c.status === 'in-progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        escalated: complaints.filter(c => c.status === 'escalated').length,
        breached: open.filter(c => calculateSLA(c, now).status === 'breached').length,
        atRisk: open.filter(c => calculateSLA(c, now).status === 'at-risk').length,
        avgResolutionTime: calculateAvgResolutionTime(complaints),
    };
}

/**
 * Average resolution time in hours
 */
function calculateAvgResolutionTime(complaints: Complaint[]): number {
    const durations = complaints
        .map(c => {
            const resolved = toMillis(c.resolvedAt);
            const created = toMillis(c.createdAt);
            return resolved !== null && created !== null ? resolved - created : null;
        })
        .filter((d): d is number => d !== null);

    if (durations.length === 0) return 0;
    const avgMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return Math.round(avgMs / (1000 * 60 * 60));
}

/**
 * Complaint counts by department
 */
export function getDepartmentStats(complaints: Complaint[]): Record<string, number> {
    const departmentStats: Record<string, number> = {};
    for (const complaint of complaints) {
        departmentStats[complaint.department] = (departmentStats[complaint.department] || 0) + 1;
    }
    return departmentStats;
}

/**
 * Percentage of closed complaints resolved within their SLA deadline
 */
export function getSLAComplianceRate(complaints: Complaint[]): number {
    const closed = complaints.filter(c => calculateSLA(c).closed);
    if (closed.length === 0) return 100;
    const compliant = closed.filter(c => calculateSLA(c).status !== 'breached');
    return Math.round((compliant.length / closed.length) * 100);
}
