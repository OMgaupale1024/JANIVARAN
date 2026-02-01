'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    LayoutDashboard, Users, AlertTriangle, CheckCircle, Search, Bell,
    FileText, ArrowUpRight, Clock, ChevronDown, RefreshCw, Play, FastForward,
    MapPin, Camera, X, ShieldAlert, CheckSquare, Eye, Trash2
} from 'lucide-react';
import { Engines } from '@/lib/engines';
import { Grievance } from '@/lib/types';
import DemoControls from '@/components/DemoControls';

export default function AdminDashboard() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [grievances, setGrievances] = useState<Grievance[]>([]);
    const [stats, setStats] = useState({ total: 0, onTrack: 0, atRisk: 0, breached: 0, escalated: 0 });

    // RBAC & State
    const [role, setRole] = useState<'AUTHORITY' | 'OFFICIAL'>('OFFICIAL');
    const [filter, setFilter] = useState<'ALL' | 'ESCALATED'>('ALL');
    const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
    const [view, setView] = useState<'dashboard' | 'all-complaints'>('dashboard');
    const [userDepartment, setUserDepartment] = useState<string | null>(null);

    // Fetch Data
    const fetchGrievances = async () => {
        try {
            const res = await fetch('/api/grievances');
            if (res.ok) {
                const data = await res.json();
                setGrievances(data);
            }
        } catch (e) {
            console.error("Failed to fetch", e);
        }
    };

    // Initial Load & Real-Time Listener
    useEffect(() => {
        // Load role and department from storage
        const storedRole = localStorage.getItem('adminRole') as 'AUTHORITY' | 'OFFICIAL';
        const storedDepartment = localStorage.getItem('userDepartment');

        if (storedRole) setRole(storedRole);
        if (storedDepartment) setUserDepartment(storedDepartment);

        // Set up real-time Firestore listener with role-based filtering
        const { listenToComplaints } = require('@/lib/services/complaint-query-service');
        const { complaintToGrievance } = require('@/lib/utils/type-mappers');

        // Determine query options based on role
        const queryOptions: any = storedRole === 'OFFICIAL' && storedDepartment
            ? { role: 'official', department: storedDepartment }
            : { role: 'admin' };

        const unsubscribe = listenToComplaints(
            queryOptions,
            (complaints: any[]) => {
                // Convert Complaint to Grievance format
                const grievances: Grievance[] = complaints.map(complaintToGrievance);
                setGrievances(grievances);
            }
        );

        // Update current time every second
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => {
            unsubscribe();
            clearInterval(timer);
        };
    }, []);

    // Recalculate Stats
    useEffect(() => {
        const { calculateSLA } = require('@/lib/services/sla-service');
        // Total should only be active complaints (not resolved)
        const activeComplaints = grievances.filter(g => g.status !== 'RESOLVED');
        const newStats = { total: activeComplaints.length, onTrack: 0, atRisk: 0, breached: 0, escalated: 0 };

        grievances.forEach(g => {
            // Count Escalated separately (can be active or resolved, but usually active)
            if (g.status === 'ESCALATED') newStats.escalated++;

            // Skip resolved for SLA stats
            if (g.status === 'RESOLVED') return;

            // Use new SLA service (need to convert grievance back to complaint format)
            const complaint = {
                createdAt: new Date(g.submittedAt),
                priority: g.priority.toLowerCase() as any
            };
            const sla = calculateSLA(complaint as any);

            if (sla.status === 'on-track') newStats.onTrack++;
            else if (sla.status === 'at-risk') newStats.atRisk++;
            else if (sla.status === 'breached') newStats.breached++;
        });

        setStats(newStats);
    }, [grievances]);

    // Auto-update status when viewed (Moved from render to Effect to prevent dupes)
    useEffect(() => {
        if (selectedGrievance && selectedGrievance.status === 'PENDING') {
            const timer = setTimeout(() => {
                // Double check status hasn't changed in the meantime
                if (selectedGrievance.status === 'PENDING') {
                    updateGrievanceStatus(selectedGrievance.id, 'under-review');
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [selectedGrievance?.id, selectedGrievance?.status]); // Re-run only if ID or Status changes

    // Generic Status Update Handler
    const updateGrievanceStatus = async (id: string, newStatus: string, actionType: 'updateStatus' | 'assign' = 'updateStatus') => {
        console.log(`🔍 [updateStatus] ID: ${id}, Status: ${newStatus}`);

        const grievance = grievances.find(g => g.id === id);
        if (!grievance) return;

        // Optimistic Update
        const updatedGrievance = { ...grievance, status: newStatus.toUpperCase().replace('-', '_') as any };

        // Handle specific priority update case
        if (newStatus === 'critical') {
            updatedGrievance.priority = 'CRITICAL' as any;
            // Keep existing status unless explicitly changing it
            updatedGrievance.status = 'IN_PROGRESS' as any;
        }

        setGrievances(prev => prev.map(g => g.id === id ? updatedGrievance : g));
        if (selectedGrievance && selectedGrievance.id === id) {
            const updatedSelected = { ...selectedGrievance, ...updatedGrievance };
            setSelectedGrievance(updatedSelected);
        }

        try {
            const body: any = {
                action: actionType,
                user: {
                    id: 'admin-user',
                    name: role === 'AUTHORITY' ? 'Authority Admin' : 'Field Official',
                    role: role.toLowerCase()
                }
            };

            if (newStatus === 'critical') {
                body.priority = 'critical';
                body.status = 'in-progress';
            } else {
                body.status = newStatus;
            }

            const response = await fetch(`/api/complaints/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            console.log('✅ [updateStatus] Success');

        } catch (error) {
            console.error('❌ [updateStatus] Failed:', error);
            // Revert
            setGrievances(prev => prev.map(g => g.id === id ? grievance : g));
            if (selectedGrievance && selectedGrievance.id === id) {
                setSelectedGrievance(grievance);
            }
        }
    };

    const handlePrioritize = (id: string) => updateGrievanceStatus(id, 'critical');
    const handleClose = (id: string) => updateGrievanceStatus(id, 'resolved');
    const handleInProgress = (id: string) => updateGrievanceStatus(id, 'in-progress');

    // Filter Logic
    const filteredGrievances = grievances.filter(g => {
        if (g.status === 'RESOLVED') return false; // Auto-remove resolved
        if (filter === 'ESCALATED') return g.status === 'ESCALATED';
        return true; // ALL (Active)
    });

    // Helper to format SLA Timer
    const getSLADisplay = (g: Grievance) => {
        const { calculateSLA, formatRemainingTime } = require('@/lib/services/sla-service');

        // Convert grievance to complaint format for SLA calculation
        const complaint = {
            createdAt: new Date(g.submittedAt),
            priority: g.priority.toLowerCase() as any
        };

        const { status, remainingHours } = calculateSLA(complaint as any);
        const timeStr = formatRemainingTime(remainingHours);

        if (status === 'breached') {
            return (
                <div className="text-right">
                    <div className="font-mono font-bold text-red-600 animate-pulse">{timeStr}</div>
                    <div className="text-[10px] uppercase font-bold text-red-500">Breached</div>
                </div>
            );
        } else if (status === 'at-risk') {
            return (
                <div className="text-right">
                    <div className="font-mono font-bold text-yellow-600">{timeStr}</div>
                    <div className="text-[10px] uppercase font-bold text-yellow-500">At Risk</div>
                </div>
            );
        } else if (g.status === 'RESOLVED') {
            return (
                <div className="text-right">
                    <div className="font-mono font-bold text-gray-400">Done</div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">Closed</div>
                </div>
            );
        } else {
            return (
                <div className="text-right">
                    <div className="font-mono font-bold text-green-600">{timeStr}</div>
                    <div className="text-[10px] uppercase font-bold text-green-500">On Track</div>
                </div>
            );
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-noble-dark">

            {/* Sidebar (Fixed) */}
            <aside className="w-64 bg-noble-dark text-white hidden md:flex flex-col fixed h-full z-20 shadow-2xl">
                <div className="p-6 border-b border-white/10">
                    <div className="text-2xl font-serif font-bold">JanNivaran</div>
                    <div className="text-xs text-white/50 mt-1">Admin Console</div>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-4 mb-2">Navigation</div>

                    <Link
                        href="/"
                        className="w-full flex items-center gap-3 text-white/70 hover:bg-white/5 px-4 py-3 rounded-lg transition-colors text-left"
                    >
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Home
                    </Link>

                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-4 mt-6 mb-2">Main</div>

                    <button
                        onClick={() => { setView('dashboard'); setFilter('ALL'); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${view === 'dashboard' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-white/70 hover:bg-white/5'}`}
                    >
                        <LayoutDashboard size={18} /> Dashboard
                    </button>

                    <button
                        onClick={() => { setView('all-complaints'); setFilter('ALL'); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${view === 'all-complaints' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-white/70 hover:bg-white/5'}`}
                    >
                        <FileText size={18} /> All Complaints
                    </button>

                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-4 mt-6 mb-2">Management</div>

                    <button
                        onClick={() => { setView('all-complaints'); setFilter('ESCALATED'); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${filter === 'ESCALATED' ? 'bg-red-600 text-white shadow-lg' : 'text-white/70 hover:bg-white/5'}`}
                    >
                        <AlertTriangle size={18} /> Escalations
                        {stats.escalated > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{stats.escalated}</span>}
                    </button>
                </nav>
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border border-white/20 flex items-center justify-center font-bold text-xs ${role === 'AUTHORITY' ? 'bg-purple-600' : 'bg-green-600'}`}>
                            {role === 'AUTHORITY' ? 'AD' : 'OF'}
                        </div>
                        <div>
                            <div className="text-sm font-bold">{role === 'AUTHORITY' ? 'Authority Admin' : 'Field Official'}</div>
                            <div className="text-xs text-white/50">
                                {role === 'OFFICIAL' && userDepartment ? `${userDepartment} Dept` : 'All Departments'} • Active
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-8">
                {/* Header */}
                <header className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-serif font-bold text-noble-dark">
                            {view === 'dashboard' ? 'Dashboard Overview' :
                                filter === 'ESCALATED' ? 'Escalated Complaints' : 'All Complaints'}
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {role === 'OFFICIAL' && userDepartment
                                ? `${userDepartment} Department • `
                                : 'All Departments • '}
                            Real-time • <span suppressHydrationWarning>{currentTime.toLocaleTimeString()}</span>
                        </p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <DemoControls />
                        <button className="p-2 bg-white text-noble-dark border border-gray-200 rounded-lg hover:bg-gray-50 relative">
                            <Bell size={20} />
                            {stats.breached > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>}
                        </button>
                    </div>
                </header>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                    {/* Total */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Total Complaints</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.total}</div>
                    </div>

                    {/* On Track */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-green-600 text-xs font-bold uppercase tracking-widest mb-2">SLA On Track</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.onTrack}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(stats.onTrack / stats.total) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* At Risk */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-2">SLA At Risk</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.atRisk}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: `${(stats.atRisk / stats.total) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Breached */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 relative overflow-hidden">
                        <div className="text-red-600 text-xs font-bold uppercase tracking-widest mb-2">SLA Breached</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.breached}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(stats.breached / stats.total) * 100}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Live Feed Table - Only show in All Complaints view */}
                {view === 'all-complaints' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                {filter === 'ESCALATED' ? 'Escalated Complaints Feed' :
                                    role === 'OFFICIAL' && userDepartment ? `${userDepartment} Department Complaints` :
                                        'Live Complaints Feed'}
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-400 font-medium">
                                    <tr>
                                        <th className="px-6 py-4">Complaint</th>
                                        <th className="px-6 py-4">Category</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">SLA Timer</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                                    {filteredGrievances.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-400 italic">
                                                {role === 'OFFICIAL' && userDepartment
                                                    ? `No complaints found for ${userDepartment} department.`
                                                    : 'No complaints found matching this filter.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredGrievances.map((g) => (
                                            <tr key={g.id} className={`hover:bg-gray-50/50 transition-colors ${g.priority === 'CRITICAL' ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-noble-dark flex items-center gap-2">
                                                        {g.title}
                                                        {g.priority === 'CRITICAL' && <ShieldAlert size={14} className="text-red-500 fill-red-100" />}
                                                    </div>
                                                    <div className="text-xs text-gray-400">{g.id} • {g.location}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{g.category}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {g.status === 'ESCALATED' ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                                                            Escalated ({g.escalationLevel})
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${g.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                                            }`}>
                                                            {g.status.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getSLADisplay(g)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setSelectedGrievance(g)}
                                                        className="p-2 hover:bg-noble-dark/5 text-noble-dark rounded-full transition-colors group relative"
                                                        title="View Details"
                                                    >
                                                        <Eye size={18} />
                                                        {g.status !== 'RESOLVED' && role === 'OFFICIAL' && <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Details Modal */}
            {selectedGrievance && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">

                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{selectedGrievance.id}</div>
                                <h2 className="text-2xl font-serif font-bold text-noble-dark">{selectedGrievance.title}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">{selectedGrievance.category}</span>
                                    {selectedGrievance.priority === 'CRITICAL' && <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">CRITICAL PRIORITY</span>}
                                </div>
                            </div>
                            <button onClick={() => setSelectedGrievance(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X size={24} className="text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

                            {/* Left Column: Context */}
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                                        <Camera size={16} /> Photo Evidence (Mock)
                                    </h4>
                                    <div className="aspect-video bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                            <span className="text-white text-xs font-bold">Uploaded by Citizen</span>
                                        </div>
                                        <Camera size={48} className="text-gray-400" />
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                                        <MapPin size={16} /> Location Context (Mock)
                                    </h4>
                                    <div className="h-40 bg-blue-50/50 rounded-xl flex items-center justify-center border border-blue-100">
                                        <MapPin size={32} className="text-blue-400" />
                                        <span className="ml-2 text-sm font-medium text-blue-800">{selectedGrievance.location}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Actions & Details */}
                            <div className="space-y-6">
                                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                                    <h3 className="font-bold text-lg mb-4">Official Actions</h3>

                                    <div className="space-y-3">
                                        {/* Authority Actions */}
                                        {role === 'AUTHORITY' && (
                                            <button
                                                onClick={() => handlePrioritize(selectedGrievance.id)}
                                                disabled={selectedGrievance.priority === 'CRITICAL' || selectedGrievance.status === 'RESOLVED'}
                                                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-red-300 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span className="font-medium text-gray-700 group-hover:text-red-600">Mark as Critical Priority</span>
                                                <ShieldAlert size={20} className="text-gray-400 group-hover:text-red-500" />
                                            </button>
                                        )}

                                        {/* Official & Authority Actions */}
                                        <button
                                            onClick={() => handleInProgress(selectedGrievance.id)}
                                            disabled={selectedGrievance.status === 'IN_PROGRESS' || selectedGrievance.status === 'RESOLVED' || selectedGrievance.status === 'ESCALATED'}
                                            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <span className="font-medium text-gray-700 group-hover:text-blue-600">Mark as In Progress</span>
                                            <Play size={20} className="text-gray-400 group-hover:text-blue-500" />
                                        </button>

                                        {/* Authority Only Actions */}
                                        {role === 'AUTHORITY' && (
                                            <>
                                                <button
                                                    onClick={() => handleClose(selectedGrievance.id)}
                                                    disabled={selectedGrievance.status === 'RESOLVED'}
                                                    className="w-full flex items-center justify-between p-4 bg-noble-dark text-white rounded-lg hover:bg-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                                >
                                                    <span className="font-bold">Close & Resolve Complaint</span>
                                                    <CheckSquare size={20} />
                                                </button>

                                                <button
                                                    onClick={async () => {
                                                        if (confirm('Are you sure you want to PERMANENTLY DELETE this complaint? This action cannot be undone.')) {
                                                            try {
                                                                const res = await fetch(`/api/complaints/${selectedGrievance.id}`, { method: 'DELETE' });
                                                                if (res.ok) {
                                                                    setGrievances(prev => prev.filter(g => g.id !== selectedGrievance.id));
                                                                    setSelectedGrievance(null);
                                                                } else {
                                                                    alert('Failed to delete complaint');
                                                                }
                                                            } catch (e) {
                                                                console.error("Delete failed", e);
                                                                alert('Error deleting complaint');
                                                            }
                                                        }
                                                    }}
                                                    className="w-full flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 text-red-700 transition-all mt-4"
                                                >
                                                    <span className="font-bold">Delete Complaint</span>
                                                    <Trash2 size={20} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Timeline Status</h4>
                                    <div className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl">
                                        <Clock size={24} className="text-gray-400" />
                                        <div>
                                            <div className="text-2xl font-mono font-bold text-noble-dark">
                                                {(() => {
                                                    const { calculateSLA, formatRemainingTime } = require('@/lib/services/sla-service');
                                                    const complaint = {
                                                        createdAt: new Date(selectedGrievance.submittedAt),
                                                        priority: selectedGrievance.priority.toLowerCase() as any
                                                    };
                                                    const { remainingHours } = calculateSLA(complaint as any);
                                                    return formatRemainingTime(remainingHours);
                                                })()}
                                            </div>
                                            <div className="text-xs text-gray-500 uppercase font-bold">Time Remaining</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
