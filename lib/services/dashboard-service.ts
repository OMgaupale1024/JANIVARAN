import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase-config';
import { Complaint, DashboardStats } from '@/types/backend';

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
    try {
        const complaintsRef = collection(db, 'complaints');
        const querySnapshot = await getDocs(complaintsRef);

        const complaints = querySnapshot.docs.map(doc => doc.data() as Complaint);

        const stats: DashboardStats = {
            totalComplaints: complaints.length,
            pending: complaints.filter(c => c.status === 'pending').length,
            inProgress: complaints.filter(c => c.status === 'in-progress').length,
            resolved: complaints.filter(c => c.status === 'resolved').length,
            escalated: complaints.filter(c => c.status === 'escalated').length,
            breached: complaints.filter(c => c.sla.status === 'breached').length,
            atRisk: complaints.filter(c => c.sla.status === 'at-risk').length,
            avgResolutionTime: calculateAvgResolutionTime(complaints),
        };

        return stats;
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        throw new Error('Failed to get dashboard stats');
    }
}

/**
 * Calculate average resolution time in hours
 */
function calculateAvgResolutionTime(complaints: Complaint[]): number {
    const resolvedComplaints = complaints.filter(c => c.resolvedAt);

    if (resolvedComplaints.length === 0) return 0;

    const totalTime = resolvedComplaints.reduce((sum, complaint) => {
        if (complaint.resolvedAt) {
            const resolutionTime = complaint.resolvedAt.toMillis() - complaint.createdAt.toMillis();
            return sum + resolutionTime;
        }
        return sum;
    }, 0);

    const avgMs = totalTime / resolvedComplaints.length;
    return Math.round(avgMs / (1000 * 60 * 60)); // Convert to hours
}

/**
 * Get complaints by department with stats
 */
export async function getDepartmentStats(): Promise<Record<string, number>> {
    try {
        const complaintsRef = collection(db, 'complaints');
        const querySnapshot = await getDocs(complaintsRef);

        const complaints = querySnapshot.docs.map(doc => doc.data() as Complaint);

        const departmentStats: Record<string, number> = {};

        complaints.forEach(complaint => {
            const dept = complaint.department;
            departmentStats[dept] = (departmentStats[dept] || 0) + 1;
        });

        return departmentStats;
    } catch (error) {
        console.error('Error getting department stats:', error);
        throw new Error('Failed to get department stats');
    }
}

/**
 * Get SLA compliance rate
 */
export async function getSLAComplianceRate(): Promise<number> {
    try {
        const complaintsRef = collection(db, 'complaints');
        const querySnapshot = await getDocs(complaintsRef);

        const complaints = querySnapshot.docs.map(doc => doc.data() as Complaint);
        const closedComplaints = complaints.filter(c => c.status === 'resolved' || c.status === 'closed');

        if (closedComplaints.length === 0) return 100;

        const compliantComplaints = closedComplaints.filter(c => {
            if (c.resolvedAt) {
                return c.resolvedAt.toMillis() <= c.sla.deadline.toMillis();
            }
            return false;
        });

        return Math.round((compliantComplaints.length / closedComplaints.length) * 100);
    } catch (error) {
        console.error('Error getting SLA compliance rate:', error);
        throw new Error('Failed to get SLA compliance rate');
    }
}
