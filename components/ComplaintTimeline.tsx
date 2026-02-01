'use client';

import React from 'react';
import { Complaint } from '@/types/backend';
import { CheckCircle, Clock, AlertTriangle, ArrowRight, Circle } from 'lucide-react';

interface ComplaintTimelineProps {
    complaint: Complaint;
}

export default function ComplaintTimeline({ complaint }: ComplaintTimelineProps) {
    const steps = [
        {
            id: 'submitted',
            label: 'Complaint Submitted',
            date: complaint.createdAt,
            status: 'completed',
            icon: CheckCircle,
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
            label: 'Resolved',
            date: complaint.resolvedAt,
            status: complaint.resolvedAt ? 'completed' : (complaint.status === 'resolved' ? 'active' : 'pending'),
            icon: CheckCircle,
        }
    ];

    // Insert escalation if present
    if (complaint.escalatedAt || complaint.status === 'escalated') {
        steps.splice(3, 0, {
            id: 'escalated',
            label: 'Escalated',
            date: complaint.escalatedAt,
            status: 'active', // Escalated is distinct
            icon: AlertTriangle,
        });
    }

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        // Handle Firestore Timestamp or JS Date
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-US', {
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
                    {steps.map((step, index) => {
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
                    <div className={`p-2 rounded-lg ${complaint.sla?.status === 'breached' ? 'bg-red-100 text-red-600' :
                            complaint.sla?.status === 'at-risk' ? 'bg-yellow-100 text-yellow-600' :
                                'bg-green-100 text-green-600'
                        }`}>
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">SLA Status</div>
                        <div className={`text-sm font-bold capitalize ${complaint.sla?.status === 'breached' ? 'text-red-700' :
                                complaint.sla?.status === 'at-risk' ? 'text-yellow-700' :
                                    'text-green-700'
                            }`}>
                            {complaint.sla?.status?.replace('-', ' ') || 'On Track'}
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-1/2">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Progress</span>
                        <span>{complaint.sla?.remainingHours > 0 ? `${Math.round(complaint.sla.remainingHours)}h remaining` : 'Breached'}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${complaint.sla?.status === 'breached' ? 'bg-red-500' :
                                    complaint.sla?.status === 'at-risk' ? 'bg-yellow-500' :
                                        'bg-green-500'
                                }`}
                            style={{ width: `${Math.max(0, Math.min(100, (1 - (complaint.sla?.remainingHours / complaint.sla?.assignedHours)) * 100))}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
