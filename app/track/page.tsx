'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Home, AlertTriangle } from 'lucide-react';
import { getComplaintByTrackingId } from '@/lib/services/complaint-service';
import { Complaint } from '@/types/backend';
import ComplaintTimeline from '@/components/ComplaintTimeline';

export default function TrackComplaint() {
    const [trackingId, setTrackingId] = useState('');
    const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
    const [complaint, setComplaint] = useState<Complaint | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackingId.trim()) return;

        setStatus('searching');
        setComplaint(null);
        setErrorMsg('');

        try {
            const result = await getComplaintByTrackingId(trackingId.trim());

            if (result) {
                setComplaint(result);
                setStatus('found');
            } else {
                setStatus('error');
                setErrorMsg('Complaint not found. Please check the ID and try again.');
            }
        } catch (error) {
            console.error('Search error:', error);
            setStatus('error');
            setErrorMsg('An error occurred while tracking. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-noble-dark">
            <header className="bg-white border-b border-gray-200 py-4 px-6 md:px-12 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Link href="/" className="font-serif font-bold text-xl">JanNivaran</Link>
                    <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-md font-medium uppercase tracking-wider">Citizen Track</span>
                </div>
                <Link href="/" className="text-sm text-gray-500 hover:text-noble-dark flex items-center gap-1">
                    <Home size={16} /> Home
                </Link>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-12">

                {/* Search Box */}
                <div className="text-center mb-12">
                    <h1 className="text-3xl font-serif font-bold mb-4">Track Your Grievance</h1>
                    <p className="text-gray-500 mb-8">Enter your unique complaint ID to see real-time progress.</p>

                    <form onSubmit={handleSearch} className="max-w-md mx-auto relative">
                        <input
                            type="text"
                            className="w-full border-2 border-gray-200 rounded-full py-4 pl-6 pr-14 text-lg focus:border-noble-dark focus:ring-0 outline-none transition-colors"
                            placeholder="e.g. JAN-82910"
                            value={trackingId}
                            onChange={(e) => setTrackingId(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="absolute right-2 top-2 bottom-2 bg-noble-dark text-white w-12 rounded-full flex items-center justify-center hover:bg-opacity-90 transition-all"
                            disabled={status === 'searching'}
                        >
                            {status === 'searching' ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <Search size={20} />
                            )}
                        </button>
                    </form>
                    {status === 'error' && (
                        <div className="mt-4 text-red-500 bg-red-50 inline-block px-4 py-2 rounded-lg text-sm font-medium animate-shake">
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Result */}
                {status === 'found' && complaint && (
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up">
                        <div className={`p-6 flex justify-between items-center ${complaint.status === 'escalated' ? 'bg-red-900' : 'bg-noble-dark'} text-white transition-colors`}>
                            <div>
                                <div className="text-xs text-white/60 uppercase tracking-widest mb-1">Complaint ID</div>
                                <div className="text-2xl font-mono font-bold">{complaint.trackingId}</div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${complaint.status === 'escalated' ? 'bg-red-500 animate-pulse' :
                                complaint.status === 'resolved' ? 'bg-green-500' :
                                    'bg-white/20'
                                }`}>
                                {complaint.status}
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="flex flex-col md:flex-row gap-6 md:gap-12 mb-8 border-b border-gray-100 pb-8">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">{complaint.title}</h2>
                                    <p className="text-gray-600">{complaint.description}</p>
                                </div>
                                <div className="shrink-0 space-y-2 text-sm text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <MapPin size={16} />
                                        <span>{complaint.location}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${complaint.priority === 'critical' ? 'bg-red-500' :
                                            complaint.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'
                                            }`}></div>
                                        <span className="capitalize">{complaint.priority} Priority</span>
                                    </div>
                                </div>
                            </div>

                            {/* TIMELINE COMPONENT */}
                            <ComplaintTimeline complaint={complaint} />

                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
