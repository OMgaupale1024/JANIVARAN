'use client';

import React from 'react';
import { FastForward, AlertTriangle, RefreshCw } from 'lucide-react';

export default function DemoControls() {
    const handleAction = async (action: string) => {
        let body = {};
        if (action === 'Forward 1 Hour') body = { action: 'FORWARD_TIME', hours: 1 };
        if (action === 'Force Breach') body = { action: 'FORCE_BREACH' };

        try {
            const res = await fetch('/api/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                // In a real app we'd use SWR/React Query trigger. For now, reload to see effect.
                window.location.reload();
            } else {
                console.error("Simulation failed");
            }
        } catch (e) {
            console.error("Error", e);
        }
    };

    return (
        <div className="flex items-center gap-2 bg-black/5 p-1 rounded-lg border border-black/5">
            <span className="text-[10px] font-bold text-gray-500 uppercase px-2">Simulate:</span>

            <button
                onClick={() => handleAction('Forward 1 Hour')}
                className="p-1.5 bg-white rounded border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-all text-xs font-bold flex items-center gap-1"
                title="Fast Forward 1 Hour"
            >
                <FastForward size={14} /> +1h
            </button>

            <button
                onClick={() => handleAction('Force Breach')}
                className="p-1.5 bg-white rounded border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 transition-all text-xs font-bold flex items-center gap-1"
                title="Force SLA Breach"
            >
                <AlertTriangle size={14} /> Breach
            </button>

            <button
                onClick={() => window.location.reload()}
                className="p-1.5 bg-white rounded border border-gray-200 text-gray-600 hover:text-green-600 hover:border-green-300 transition-all text-xs font-bold flex items-center gap-1"
                title="Reset Demo"
            >
                <RefreshCw size={14} />
            </button>
        </div>
    );
}
