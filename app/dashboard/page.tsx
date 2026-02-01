'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, AlertTriangle, CheckCircle, Search, Bell, Menu, FileText, ArrowUpRight, Clock, ChevronDown } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase-config';
import { Complaint } from '@/types/backend';

export default function Dashboard() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch real complaints from Firestore
    useEffect(() => {
        const q = query(
            collection(db, 'complaints'),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const complaintsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Complaint[];
            setComplaints(complaintsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Calculate stats from real data
    const stats = {
        total: complaints.length,
        onTrack: complaints.filter(c => c.sla.status === 'on-track').length,
        atRisk: complaints.filter(c => c.sla.status === 'at-risk').length,
        breached: complaints.filter(c => c.sla.status === 'breached').length,
        escalated: complaints.filter(c => c.status === 'escalated').length,
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'in-progress': return 'bg-blue-100 text-blue-800';
            case 'resolved': return 'bg-green-100 text-green-800';
            case 'escalated': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getSLAColor = (remainingHours: number) => {
        if (remainingHours < 0) return 'text-red-600';
        if (remainingHours < 6) return 'text-yellow-600';
        return 'text-green-600';
    };

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-noble-dark">

            {/* Sidebar (Fixed) */}
            <aside className="w-64 bg-noble-dark text-white hidden md:flex flex-col fixed h-full z-20">
                <div className="p-6 border-b border-white/10">
                    <div className="text-2xl font-serif font-bold">JanNivaran</div>
                    <div className="text-xs text-white/50 mt-1">Admin Console</div>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-4 mb-2">Main</div>
                    <a href="#" className="flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg shadow-green-900/20">
                        <LayoutDashboard size={18} /> Dashboard
                    </a>
                    <a href="#" className="flex items-center gap-3 text-white/70 hover:bg-white/5 px-4 py-3 rounded-lg transition-colors">
                        <FileText size={18} /> All Complaints
                    </a>
                    <a href="#" className="flex items-center gap-3 text-white/70 hover:bg-white/5 px-4 py-3 rounded-lg transition-colors">
                        <Users size={18} /> Workforce
                    </a>

                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-4 mt-6 mb-2">Management</div>
                    <a href="#" className="flex items-center gap-3 text-white/70 hover:bg-white/5 px-4 py-3 rounded-lg transition-colors">
                        <AlertTriangle size={18} /> Escalations
                        <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">3</span>
                    </a>
                    <a href="#" className="flex items-center gap-3 text-white/70 hover:bg-white/5 px-4 py-3 rounded-lg transition-colors">
                        <Clock size={18} /> SLA Reports
                    </a>
                </nav>
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 border border-white/20"></div>
                        <div>
                            <div className="text-sm font-bold">Admin Officer</div>
                            <div className="text-xs text-white/50">Zone 1 • Active</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-8">
                {/* Header */}
                <header className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-serif font-bold text-noble-dark">Command Center</h1>
                        <p className="text-gray-500 text-sm">Real-time governance activity • {currentTime.toLocaleTimeString()}</p>
                    </div>
                    <div className="flex gap-4">
                        <Link href="/" className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium">
                            View Site
                        </Link>
                        <button className="p-2 bg-noble-dark text-white rounded-lg shadow-lg hover:bg-opacity-90 relative">
                            <Bell size={20} />
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-noble-dark rounded-full"></span>
                        </button>
                    </div>
                </header>

                {/* KPI Cards (Specific Requirement) */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10">
                    {/* Total */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <FileText size={40} className="text-gray-500" />
                        </div>
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Total Complaints</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.total}</div>
                        <div className="text-xs text-gray-500 font-medium mt-1">Live data</div>
                    </div>

                    {/* SLA On Track (Green) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <CheckCircle size={40} className="text-green-500" />
                        </div>
                        <div className="text-green-600 text-xs font-bold uppercase tracking-widest mb-2">SLA On Track</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.onTrack}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${stats.total > 0 ? (stats.onTrack / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>

                    {/* SLA At Risk (Yellow) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Clock size={40} className="text-yellow-500" />
                        </div>
                        <div className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-2">SLA At Risk</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.atRisk}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: `${stats.total > 0 ? (stats.atRisk / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>

                    {/* SLA Breached (Red) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <AlertTriangle size={40} className="text-red-500" />
                        </div>
                        <div className="text-red-600 text-xs font-bold uppercase tracking-widest mb-2">SLA Breached</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.breached}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${stats.total > 0 ? (stats.breached / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>

                    {/* Escalated (Dark/Purple) */}
                    <div className="bg-noble-dark text-white p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <ArrowUpRight size={40} />
                        </div>
                        <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Escalated</div>
                        <div className="text-3xl font-bold">{stats.escalated}</div>
                        <div className="text-xs text-white/50 mt-1">Requires Action</div>
                    </div>
                </div>

                {/* Live Feed & Monitor */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Live Feed Table */}
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                Live Complaints Feed
                            </h3>
                            <button className="text-sm text-gray-400 hover:text-noble-dark flex items-center gap-1">
                                Filter <ChevronDown size={14} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-400 font-medium">
                                    <tr>
                                        <th className="px-6 py-4">Complaint</th>
                                        <th className="px-6 py-4">Category</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">SLA Timer</th>
                                        <th className="px-6 py-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                                Loading complaints...
                                            </td>
                                        </tr>
                                    ) : complaints.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                                No complaints found
                                            </td>
                                        </tr>
                                    ) : (
                                        complaints.map((complaint) => (
                                            <tr key={complaint.id} className={`hover:bg-gray-50/50 transition-colors ${complaint.sla.status === 'breached' ? 'bg-red-50/10' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-noble-dark">{complaint.title}</div>
                                                    <div className="text-xs text-gray-400">{complaint.trackingId}</div>
                                                </td>
                                                <td className="px-6 py-4">{complaint.category}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(complaint.status)}`}>
                                                        {complaint.status.replace('-', ' ').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className={`font-mono font-bold ${getSLAColor(complaint.sla.remainingHours)} ${complaint.sla.status === 'breached' ? 'animate-pulse' : ''}`}>
                                                        {complaint.sla.remainingHours > 0
                                                            ? formatTime(Math.round(complaint.sla.remainingHours * 3600))
                                                            : `-${formatTime(Math.abs(Math.round(complaint.sla.remainingHours * 3600)))}`
                                                        }
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button className="text-noble-dark hover:text-black font-semibold text-xs">
                                                        View →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Critical Alerts Sidebar */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-6">
                        <h3 className="font-bold text-lg text-gray-800">Priority Actions</h3>

                        <div className="bg-red-50 border border-red-100 rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-red-100 text-red-600 rounded-lg"><AlertTriangle size={18} /></div>
                                <span className="text-[10px] font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">CRITICAL</span>
                            </div>
                            <div className="font-bold text-red-900 mb-1">Mass Power Failure</div>
                            <p className="text-xs text-red-700/70 mb-3">Zone 3 • Updated 5m ago</p>
                            <button className="w-full py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">
                                Trigger Emergency Protocol
                            </button>
                        </div>

                        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Clock size={18} /></div>
                                <span className="text-[10px] font-bold bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">HIGH RISK</span>
                            </div>
                            <div className="font-bold text-orange-900 mb-1">Potential SLA Breach</div>
                            <p className="text-xs text-orange-700/70 mb-3">15 tickets expiring in 1 hour</p>
                            <button className="w-full py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors">
                                Auto-Reassign
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
