'use client';

import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { differenceInMilliseconds } from 'date-fns';

interface SLAIndicatorProps {
    deadline: string;
    className?: string;
    virtualTime: string; // The current simulated time from server
    status: string; // Grievance status
}

export default function SLAIndicator({ deadline, virtualTime, status, className }: SLAIndicatorProps) {
    const [remaining, setRemaining] = useState<number>(0);

    useEffect(() => {
        if (!virtualTime || !deadline) return;
        const diff = differenceInMilliseconds(new Date(deadline), new Date(virtualTime));
        setRemaining(diff);
    }, [virtualTime, deadline]);

    if (status === 'RESOLVED') {
        return <span className="text-green-500 font-bold flex items-center gap-1"><CheckCircle size={14} /> Resolved</span>;
    }

    const isBreached = remaining <= 0;
    const isRisk = remaining < (12 * 60 * 60 * 1000) && !isBreached; // Arbitrary 12h risk window for visual, or use prop

    // Format milliseconds to HH:MM:SS
    const formatTime = (ms: number) => {
        if (ms < 0) return "BREACHED";
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}h ${m}m`;
    };

    return (
        <div className={`flex items-center gap-2 font-mono font-bold ${className} ${isBreached ? 'text-red-500' : isRisk ? 'text-yellow-500' : 'text-green-500'
            }`}>
            {isBreached ? <AlertCircle size={16} /> : <Clock size={16} />}
            <span>{isBreached ? `overdue by ${formatTime(Math.abs(remaining))}` : formatTime(remaining)}</span>
        </div>
    );
}
