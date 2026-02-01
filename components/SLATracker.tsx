'use client';

import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Package, Wrench, ThumbsUp } from 'lucide-react';
import { Complaint } from '@/types/backend';

interface SLATrackerProps {
    complaint: Complaint;
}

export default function SLATracker({ complaint }: SLATrackerProps) {
    const stages = [
        {
            id: 'filed',
            label: 'Complaint Filed',
            icon: Package,
            completed: true,
            timestamp: complaint.createdAt,
        },
        {
            id: 'under-review',
            label: 'Under Review',
            icon: Clock,
            completed: complaint.status !== 'pending',
            timestamp: complaint.status !== 'pending' ? complaint.updatedAt : null,
        },
        {
            id: 'in-progress',
            label: 'In Progress',
            icon: Wrench,
            completed: complaint.status === 'in-progress' || complaint.status === 'resolved' || complaint.status === 'closed',
            timestamp: complaint.status === 'in-progress' || complaint.status === 'resolved' ? complaint.updatedAt : null,
        },
        {
            id: 'resolved',
            label: 'Resolved',
            icon: ThumbsUp,
            completed: complaint.status === 'resolved' || complaint.status === 'closed',
            timestamp: complaint.resolvedAt || complaint.closedAt || null,
        },
    ];

    const getSLAStatusColor = () => {
        switch (complaint.sla.status) {
            case 'on-track':
                return 'text-green-600 bg-green-50 border-green-200';
            case 'at-risk':
                return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'breached':
                return 'text-red-600 bg-red-50 border-red-200';
            default:
                return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    const getProgressPercentage = () => {
        const completedStages = stages.filter(s => s.completed).length;
        return (completedStages / stages.length) * 100;
    };

    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return null;
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getEstimatedResolution = () => {
        if (complaint.sla.deadline) {
            const deadline = complaint.sla.deadline.toDate();
            return deadline.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        }
        return 'Not available';
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Complaint Progress</h3>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold border ${getSLAStatusColor()}`}>
                    SLA: {complaint.sla.status.replace('-', ' ').toUpperCase()}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                    <span className="text-sm font-bold text-gray-900">{Math.round(getProgressPercentage())}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                        className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${getProgressPercentage()}%` }}
                    ></div>
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-6">
                {stages.map((stage, index) => {
                    const Icon = stage.icon;
                    const isLast = index === stages.length - 1;

                    return (
                        <div key={stage.id} className="relative">
                            {/* Connecting Line */}
                            {!isLast && (
                                <div
                                    className={`absolute left-6 top-12 w-0.5 h-full ${stage.completed ? 'bg-green-500' : 'bg-gray-200'
                                        }`}
                                ></div>
                            )}

                            {/* Stage Content */}
                            <div className="flex items-start gap-4">
                                {/* Icon */}
                                <div
                                    className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center border-2 ${stage.completed
                                        ? 'bg-green-500 border-green-500 text-white'
                                        : 'bg-white border-gray-300 text-gray-400'
                                        }`}
                                >
                                    {stage.completed ? (
                                        <CheckCircle2 size={24} />
                                    ) : (
                                        <Icon size={24} />
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 pt-1">
                                    <div className="flex items-center justify-between">
                                        <h4
                                            className={`font-semibold ${stage.completed ? 'text-gray-900' : 'text-gray-400'
                                                }`}
                                        >
                                            {stage.label}
                                        </h4>
                                        {stage.timestamp && (
                                            <span className="text-sm text-gray-500" suppressHydrationWarning>
                                                {formatTimestamp(stage.timestamp)}
                                            </span>
                                        )}
                                    </div>
                                    {!stage.completed && index === stages.findIndex(s => !s.completed) && (
                                        <p className="text-sm text-gray-500 mt-1">In progress...</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SLA Information */}
            <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Time Remaining</p>
                        <p className={`font-semibold ${complaint.sla.remainingHours > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {complaint.sla.remainingHours > 0
                                ? `${Math.round(complaint.sla.remainingHours)} hours`
                                : `Overdue by ${Math.abs(Math.round(complaint.sla.remainingHours))} hours`}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Expected Resolution</p>
                        <p className="font-semibold text-gray-900" suppressHydrationWarning>
                            {getEstimatedResolution()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tracking ID */}
            <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Tracking ID</p>
                <p className="font-mono font-bold text-noble-dark">{complaint.trackingId}</p>
            </div>
        </div>
    );
}
