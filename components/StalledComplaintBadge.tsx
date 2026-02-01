'use client';

import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

interface StalledComplaintBadgeProps {
    status: 'ACTION_REQUIRED' | 'DELAYED';
    className?: string;
}

export default function StalledComplaintBadge({ status, className = '' }: StalledComplaintBadgeProps) {
    if (status === 'DELAYED') {
        return (
            <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full ${className}`}
                title="SLA deadline has been breached - complaint is overdue"
            >
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Delayed</span>
            </div>
        );
    }

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full ${className}`}
            title="Complaint has not progressed for a significant time - action may be needed"
        >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Action Required</span>
        </div>
    );
}
