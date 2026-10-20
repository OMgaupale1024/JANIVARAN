'use client';

import React from 'react';
import { ComplaintStatus } from '@/types/backend';
import { CheckCircle, Clock, AlertTriangle, Circle, Search } from 'lucide-react';
import { calculateSLA, toMillis } from '@/lib/services/sla-service';

// Works with Firestore records and the JSON public tracking view
export interface TimelineComplaint {
    status: ComplaintStatus;
    category?: string;
    sla?: { assignedHours?: number; deadline?: unknown } | null;
    createdAt?: unknown;
    updatedAt?: unknown;
    underReviewAt?: unknown;
    assignedAt?: unknown;
    inProgressAt?: unknown;
    escalatedAt?: unknown;
    resolvedAt?: unknown;
    closedAt?: unknown;
}

interface ComplaintTimelineProps {
    complaint: TimelineComplaint;
}

export default function ComplaintTimeline({ complaint }: ComplaintTimelineProps) {
    const isClosed = complaint.status === 'closed' && !complaint.resolvedAt;
    const steps = [
        {
            id: 'submitted',
            label: 'Complaint Submitted',
            date: complaint.createdAt,
            status: 'completed',
            icon: CheckCircle,
        },
        {
            id: 'under-review',
            label: 'Under Review',
            date: complaint.underReviewAt,
            status: complaint.underReviewAt ? 'completed' : (complaint.status === 'under-review' ? 'active' : 'pending'),
            icon: Search,
        },
        {
            id: 'assigned',
            label: 'Assigned to Department',
            date: complaint.assignedAt,
            status: complaint.assignedAt ? 'completed' : (complaint.status !== 'pending' ? 'skipped' : 'pending'),
            icon: complaint.assignedAt ? CheckCircle : Circle,
        },
        {
            id: 'in-progress',
            label: 'In Progress',
            date: complaint.inProgressAt,
            status: complaint.inProgressAt ? 'completed' : (complaint.status === 'in-progress' ? 'active' : 'pending'),
            icon: Clock,
        },
        {
            id: 'resolved',
            label: isClosed ? 'Closed' : 'Resolved',
            date: isClosed ? complaint.closedAt : complaint.resolvedAt,
            status: complaint.resolvedAt || isClosed ? 'completed' : (complaint.status === 'resolved' ? 'active' : 'pending'),
            icon: CheckCircle,
        }
    ];

    // Insert escalation (before the final step) if present
    if (complaint.escalatedAt || complaint.status === 'escalated') {
        steps.splice(steps.length - 1, 0, {
            id: 'escalated',
            label: 'Escalated',
            date: complaint.escalatedAt,
            status: 'active', // Escalated is distinct
            icon: AlertTriangle,
        });
    }

    const sla = calculateSLA(complaint);
    const slaColor = sla.status === 'breached' ? 'red' : sla.status === 'at-risk' && !sla.closed ? 'yellow' : 'green';

    const formatDate = (timestamp: unknown) => {
        const ms = toMillis(timestamp);
        if (ms === null) return '';
        return new Date(ms).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="w-full py-6">
            <h3 className="text-lg font-serif font-bold text-noble-dark mb-6">Track Status</h3>
            <div className="relative">
                {/* Vertical Line for Mobile */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 md:hidden"></div>

                {/* Horizontal Line for Desktop */}
                <div className="hidden md:block absolute top-4 left-0 right-0 h-0.5 bg-gray-200"></div>

                <div className="flex flex-col md:flex-row justify-between relative z-10 gap-8 md:gap-0">
                    {steps.map((step) => {
                        const isCompleted = step.status === 'completed';
                        const isActive = step.status === 'active';
                        const isPending = step.status === 'pending';

                        let colorClass = 'text-gray-400 bg-gray-50 border-gray-200';
                        if (isCompleted) colorClass = 'text-green-600 bg-green-50 border-green-200';
                        if (isActive && step.id === 'escalated') colorClass = 'text-red-600 bg-red-50 border-red-200';
                        else if (isActive) colorClass = 'text-blue-600 bg-blue-50 border-blue-200';

                        return (
                            <div key={step.id} className="flex md:flex-col items-center flex-1 md:text-center group">
                                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex items-center justify-center shrink-0 ${colorClass} transition-all duration-300`}>
                                    <step.icon size={16} className="md:w-5 md:h-5" />
                                </div>
                                <div className="ml-4 md:ml-0 md:mt-4">
                                    <p className={`text-sm font-bold ${isPending ? 'text-gray-400' : 'text-gray-800'}`}>
                                        {step.label}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 h-4">
                                        {formatDate(step.date)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SLA Status Bar */}
            <div className="mt-8 bg-gray-50 rounded-xl p-4 md:p-6 border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${slaColor === 'red' ? 'bg-red-100 text-red-600' :
                            slaColor === 'yellow' ? 'bg-yellow-100 text-yellow-600' :
                                'bg-green-100 text-green-600'
                        }`}>
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">SLA Status</div>
                        <div className={`text-sm font-bold capitalize ${slaColor === 'red' ? 'text-red-700' :
                                slaColor === 'yellow' ? 'text-yellow-700' :
                                    'text-green-700'
                            }`}>
                            {sla.closed ? (sla.status === 'breached' ? 'Closed after deadline' : 'Closed within SLA') : sla.status.replace('-', ' ')}
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-1/2">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Progress</span>
                        <span>{sla.closed ? 'Closed' : sla.remainingHours > 0 ? `${Math.round(sla.remainingHours)}h remaining` : 'Breached'}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${slaColor === 'red' ? 'bg-red-500' :
                                    slaColor === 'yellow' ? 'bg-yellow-500' :
                                        'bg-green-500'
                                }`}
                            style={{ width: `${sla.progress}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
