'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard, AlertTriangle, FileText, Clock, Play,
    MapPin, Camera, X, ShieldAlert, Eye, CheckSquare, LogOut, ArrowRightLeft
} from 'lucide-react';
import { Grievance } from '@/lib/types';
import DemoControls from '@/components/DemoControls';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { listenToComplaints } from '@/lib/services/complaint-query-service';
import { complaintToGrievance, grievanceSLA, isCompleted } from '@/lib/utils/type-mappers';
import { formatRemainingTime } from '@/lib/services/sla-service';
import { DEPARTMENTS } from '@/lib/complaint-policy';

const slaFor = (g: Grievance, now: Date) => grievanceSLA(g, now.getTime());

const STATUS_LABELS: Record<Grievance['status'], string> = {
    NEW: 'New', PENDING: 'Pending', UNDER_REVIEW: 'Under Review', IN_PROGRESS: 'In Progress',
    ESCALATED: 'Escalated', RESOLVED: 'Resolved', CLOSED: 'Closed',
};
const statusLabel = (g: Grievance) =>
    g.status === 'CLOSED' && g.closedReason === 'withdrawn-by-citizen' ? 'Withdrawn' : STATUS_LABELS[g.status];

// Authority moves a complaint to the right department; keyed by complaint so the form resets per complaint
function TransferForm({ grievance, disabled, onTransfer }: {
    grievance: Grievance;
    disabled: boolean;
    onTransfer: (department: string, reason: string) => Promise<boolean>;
}) {
    const [department, setDepartment] = useState('');
    const [reason, setReason] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await onTransfer(department, reason)) {
            setDepartment('');
            setReason('');
        }
    };
    return (
        <form onSubmit={submit} className="mt-4 p-4 bg-white border border-gray-200 rounded-lg space-y-3">
            <p className="text-sm text-gray-600">
                Wrong department? Transfer keeps the tracking ID, status, evidence and SLA deadline.
            </p>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                New department
                <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-lg p-2 text-sm font-normal normal-case tracking-normal text-gray-800"
                >
                    <option value="">Choose a department…</option>
                    {DEPARTMENTS.filter(d => d !== grievance.department).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                Reason
                <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    minLength={5}
                    maxLength={200}
                    placeholder="e.g. Water pipe leak filed under Electricity"
                    className="mt-1 block w-full border border-gray-300 rounded-lg p-2 text-sm font-normal normal-case tracking-normal text-gray-800"
                />
            </label>
            <button
                type="submit"
                disabled={disabled || !department || reason.trim().length < 5}
                className="w-full flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-800 font-bold hover:bg-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Transfer to department
                <ArrowRightLeft size={20} />
            </button>
        </form>
    );
}

export default function AdminDashboard() {
    const router = useRouter();
    const { user, loading: authLoading, authError, signOut } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [grievances, setGrievances] = useState<Grievance[]>([]);
    const [listenError, setListenError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // RBAC comes from the signed-in user's trusted profile
    const isStaff = user?.role === 'admin' || user?.role === 'official';
    const role: 'AUTHORITY' | 'OFFICIAL' = user?.role === 'admin' ? 'AUTHORITY' : 'OFFICIAL';
    const userDepartment = user?.role === 'official' ? user.department ?? null : null;
    const missingDepartment = user?.role === 'official' && !userDepartment;
    const loadError = missingDepartment
        ? 'Your official account has no department assigned. Please contact an administrator.'
        : listenError;

    const [filter, setFilter] = useState<'ALL' | 'ESCALATED'>('ALL');
    const [scope, setScope] = useState<'active' | 'completed' | 'all'>('active');
    const [view, setView] = useState<'dashboard' | 'all-complaints'>('dashboard');
    // Track the selection by ID so the details always show the live record
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedGrievance = grievances.find(g => g.id === selectedId) ?? null;
    // The open complaint left the live feed (e.g. transferred to another department): its details close
    const selectionGone = selectedId !== null && !selectedGrievance;
    const [savingId, setSavingId] = useState<string | null>(null);
    const saving = useRef(false); // current even inside timers, unlike savingId
    const autoReviewed = useRef(new Set<string>());

    // Deny access to anyone who is not an official or authority (a profile that failed to load is shown, not redirected)
    useEffect(() => {
        if (!authLoading && !authError && !isStaff) router.replace('/admin/login');
    }, [authLoading, authError, isStaff, router]);

    // Real-time listener scoped by role; never falls back to all complaints
    useEffect(() => {
        if (!user || !isStaff || missingDepartment) return;

        const options = user.role === 'admin'
            ? { role: 'admin' as const }
            : { role: 'official' as const, department: user.department as string };

        const unsubscribe = listenToComplaints(
            options,
            (complaints) => {
                // Newest first
                setGrievances(complaints.map(complaintToGrievance).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
                setListenError(null);
            },
            () => setListenError('Could not load complaints. Check your access or connection and refresh.')
        );

        return unsubscribe;
    }, [user, isStaff, missingDepartment]);

    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Stats (active complaints only for SLA figures)
    const stats = { total: 0, onTrack: 0, atRisk: 0, breached: 0, escalated: 0 };
    grievances.forEach(g => {
        if (g.status === 'ESCALATED') stats.escalated++;
        if (isCompleted(g)) return;
        stats.total++;
        const { status } = slaFor(g, currentTime);
        if (status === 'on-track') stats.onTrack++;
        else if (status === 'at-risk') stats.atRisk++;
        else stats.breached++;
    });
    const pct = (n: number) => (stats.total ? (n / stats.total) * 100 : 0);

    // Status and/or priority are saved together server-side. The page shows only what the
    // server confirmed (via the live listener), so there is nothing to roll back on failure,
    // and one change at a time means requests cannot overlap.
    const patchComplaint = async (id: string, body: Record<string, unknown>): Promise<boolean> => {
        saving.current = true;
        setSavingId(id);
        setActionError(null);
        setNotice(null);
        try {
            await apiFetch(`/api/complaints/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
            return true;
        } catch (error) {
            console.error('Update failed:', error);
            setActionError(error instanceof Error ? error.message : 'Update failed');
            return false;
        } finally {
            saving.current = false;
            setSavingId(null);
        }
    };

    const updateGrievance = async (id: string, changes: { status?: string; priority?: string }) => {
        if (saving.current) return;
        autoReviewed.current.add(id); // an explicit change supersedes the automatic "under review"
        await patchComplaint(id, { action: 'updateStatus', ...changes });
    };

    // fromDepartment is what this view shows, so a transfer based on a stale view is refused
    const transferGrievance = async (g: Grievance, department: string, reason: string) => {
        if (saving.current) return false;
        const ok = await patchComplaint(g.id, { action: 'transfer', department, fromDepartment: g.department, reason });
        if (ok) setNotice(`Transferred to ${department}. Same tracking ID, status, evidence and SLA deadline.`);
        return ok;
    };

    // Auto-mark as under review when staff open a pending complaint: once per complaint, so a failure cannot loop
    const selectedStatus = selectedGrievance?.status;
    useEffect(() => {
        if (!selectedId || selectedStatus !== 'PENDING' || autoReviewed.current.has(selectedId)) return;
        const timer = setTimeout(() => {
            if (!autoReviewed.current.has(selectedId)) updateGrievance(selectedId, { status: 'under-review' });
        }, 1000);
        return () => clearTimeout(timer);
    }, [selectedId, selectedStatus]);

    const handlePrioritize = (id: string) => {
        const g = grievances.find(x => x.id === id);
        // Keep an already-active status; otherwise move it into progress
        const status = g && ['IN_PROGRESS', 'ESCALATED'].includes(g.status) ? undefined : 'in-progress';
        return updateGrievance(id, { priority: 'critical', ...(status ? { status } : {}) });
    };
    const handleClose = (id: string) => updateGrievance(id, { status: 'resolved' });
    const handleInProgress = (id: string) => updateGrievance(id, { status: 'in-progress' });

    const handleSignOut = async () => {
        await signOut();
        router.replace('/admin/login');
    };

    // Filter Logic: completed (resolved/closed) complaints stay findable under Completed and All
    const filteredGrievances = grievances.filter(g => {
        if (filter === 'ESCALATED') return g.status === 'ESCALATED';
        if (scope === 'active') return !isCompleted(g);
        if (scope === 'completed') return isCompleted(g);
        return true;
    });

    if (authError) {
        return (
            <div role="alert" className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-sm text-red-600">
                {authError}
            </div>
        );
    }

    if (authLoading || !isStaff) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
                Checking access…
            </div>
        );
    }

    // Helper to format SLA Timer
    const getSLADisplay = (g: Grievance) => {
        if (isCompleted(g)) {
            return (
                <div className="text-right">
                    <div className="font-mono font-bold text-gray-400">Done</div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">Closed</div>
                </div>
            );
        }

        const { status, remainingHours } = slaFor(g, currentTime);
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
        }
        return (
            <div className="text-right">
                <div className="font-mono font-bold text-green-600">{timeStr}</div>
                <div className="text-[10px] uppercase font-bold text-green-500">On Track</div>
            </div>
        );
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
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{user?.displayName || (role === 'AUTHORITY' ? 'Authority Admin' : 'Field Official')}</div>
                            <div className="text-xs text-white/50">
                                {role === 'OFFICIAL' && userDepartment ? `${userDepartment} Dept` : 'All Departments'} • Active
                            </div>
                        </div>
                        <button onClick={handleSignOut} className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10" title="Sign out" aria-label="Sign out">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 md:ml-64 p-4 md:p-8">
                {/* Header */}
                <header className="flex flex-wrap justify-between items-center gap-4 mb-10">
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
                    {process.env.NODE_ENV !== 'production' && role === 'AUTHORITY' && <DemoControls />}
                </header>

                {(loadError || actionError) && (
                    <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                        {loadError || actionError}
                    </div>
                )}
                {selectionGone && (
                    <p role="status" className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                        The complaint you had open is no longer in your queue (it was transferred to another department or removed).
                    </p>
                )}
                {notice && !selectedId && (
                    <p role="status" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">{notice}</p>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                    {/* Total */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Active Complaints</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.total}</div>
                    </div>

                    {/* On Track */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-green-600 text-xs font-bold uppercase tracking-widest mb-2">SLA On Track</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.onTrack}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct(stats.onTrack)}%` }}></div>
                        </div>
                    </div>

                    {/* At Risk */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-2">SLA At Risk</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.atRisk}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: `${pct(stats.atRisk)}%` }}></div>
                        </div>
                    </div>

                    {/* Breached */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 relative overflow-hidden">
                        <div className="text-red-600 text-xs font-bold uppercase tracking-widest mb-2">SLA Breached</div>
                        <div className="text-3xl font-bold text-gray-800">{stats.breached}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${pct(stats.breached)}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Live Feed Table - Only show in All Complaints view */}
                {view === 'all-complaints' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                {filter === 'ESCALATED' ? 'Escalated Complaints Feed' :
                                    role === 'OFFICIAL' && userDepartment ? `${userDepartment} Department Complaints` :
                                        'Live Complaints Feed'}
                            </h3>
                            {filter === 'ALL' && (
                                <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold" aria-label="Show complaints">
                                    {([['active', 'Active'], ['completed', 'Completed'], ['all', 'All']] as const).map(([s, label]) => (
                                        <button
                                            key={s}
                                            type="button"
                                            aria-pressed={scope === s}
                                            onClick={() => setScope(s)}
                                            className={`px-3 py-1.5 rounded-md ${scope === s ? 'bg-white shadow-sm text-noble-dark' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                                                    <div className="text-xs text-gray-400">{g.trackingId || g.id} • {g.location}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{g.category}</span>
                                                    {role === 'AUTHORITY' && <div className="text-xs text-gray-400 mt-1">{g.department}</div>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {g.status === 'ESCALATED' ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                                                            Escalated
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${g.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : g.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-800'
                                                            }`}>
                                                            {statusLabel(g).toUpperCase()}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getSLADisplay(g)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => { setActionError(null); setSelectedId(g.id); }}
                                                        className="p-2 hover:bg-noble-dark/5 text-noble-dark rounded-full transition-colors group relative"
                                                        title="View Details"
                                                        aria-label={`View details for ${g.title}`}
                                                    >
                                                        <Eye size={18} />
                                                        {!isCompleted(g) && role === 'OFFICIAL' && <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>}
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
                    <div role="dialog" aria-modal="true" aria-labelledby="complaint-dialog-title" className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">

                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{selectedGrievance.trackingId || selectedGrievance.id}</div>
                                <h2 id="complaint-dialog-title" className="text-2xl font-serif font-bold text-noble-dark">{selectedGrievance.title}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                    <span data-testid="complaint-status" className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">{statusLabel(selectedGrievance)}</span>
                                    <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">Filed as {selectedGrievance.category}</span>
                                    <span data-testid="complaint-department" className="bg-indigo-50 text-indigo-800 px-2 py-1 rounded text-xs font-bold">{selectedGrievance.department}</span>
                                    {selectedGrievance.priority === 'CRITICAL' && <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">CRITICAL PRIORITY</span>}
                                </div>
                            </div>
                            <button onClick={() => { setSelectedId(null); setNotice(null); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors" aria-label="Close details">
                                <X size={24} className="text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

                            {/* Left Column: Context */}
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                                        <Camera size={16} /> Photo Evidence
                                    </h4>
                                    {selectedGrievance.photoURLs?.length ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {selectedGrievance.photoURLs.map((url, i) => (
                                                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                                                    {/* eslint-disable-next-line @next/next/no-img-element -- private evidence must not pass through the shared image optimizer cache */}
                                                    <img src={url} alt={`Evidence photo ${i + 1} uploaded by citizen`} className="w-full h-full object-cover" />
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="aspect-video bg-gray-200 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 text-gray-400">
                                            <Camera size={48} />
                                            <span className="text-xs font-bold mt-2">No photos uploaded</span>
                                        </div>
                                    )}
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
                                    {actionError && (
                                        <p role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{actionError}</p>
                                    )}
                                    {savingId === selectedGrievance.id && (
                                        <p role="status" className="mb-3 text-sm text-gray-500">Saving…</p>
                                    )}
                                    {notice && (
                                        <p role="status" className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{notice}</p>
                                    )}

                                    <div className="space-y-3">
                                        {/* Authority Actions */}
                                        {role === 'AUTHORITY' && (
                                            <button
                                                onClick={() => handlePrioritize(selectedGrievance.id)}
                                                disabled={!!savingId || selectedGrievance.priority === 'CRITICAL' || isCompleted(selectedGrievance)}
                                                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-red-300 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span className="font-medium text-gray-700 group-hover:text-red-600">Mark as Critical Priority</span>
                                                <ShieldAlert size={20} className="text-gray-400 group-hover:text-red-500" />
                                            </button>
                                        )}

                                        {/* Official & Authority Actions */}
                                        <button
                                            onClick={() => handleInProgress(selectedGrievance.id)}
                                            disabled={!!savingId || selectedGrievance.status === 'IN_PROGRESS' || isCompleted(selectedGrievance) || selectedGrievance.status === 'ESCALATED'}
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
                                                    disabled={!!savingId || isCompleted(selectedGrievance)}
                                                    className="w-full flex items-center justify-between p-4 bg-noble-dark text-white rounded-lg hover:bg-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                                >
                                                    <span className="font-bold">Close & Resolve Complaint</span>
                                                    <CheckSquare size={20} />
                                                </button>

                                                <button
                                                    onClick={() => updateGrievance(selectedGrievance.id, { status: 'under-review' })}
                                                    disabled={!!savingId || selectedGrievance.status === 'UNDER_REVIEW' || isCompleted(selectedGrievance)}
                                                    className="w-full flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 text-amber-800 transition-all mt-4 disabled:opacity-50 disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed group"
                                                    title="Flag this complaint for review (e.g., if it appears fake or invalid)"
                                                >
                                                    <span className="font-bold">Flag for Review</span>
                                                    <AlertTriangle size={20} className="group-hover:scale-110 transition-transform" />
                                                </button>

                                                {!isCompleted(selectedGrievance) && (
                                                    <TransferForm
                                                        key={selectedGrievance.id}
                                                        grievance={selectedGrievance}
                                                        disabled={!!savingId}
                                                        onTransfer={(department, reason) => transferGrievance(selectedGrievance, department, reason)}
                                                    />
                                                )}
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
                                                {isCompleted(selectedGrievance)
                                                    ? 'Done'
                                                    : formatRemainingTime(slaFor(selectedGrievance, currentTime).remainingHours)}
                                            </div>
                                            <div className="text-xs text-gray-500 uppercase font-bold">Time Remaining</div>
                                        </div>
                                    </div>
                                    {selectedGrievance.history.some(h => h.action === 'TRANSFERRED') && (
                                        <ul aria-label="Transfer history" className="mt-3 space-y-1 text-xs text-gray-600">
                                            {selectedGrievance.history.filter(h => h.action === 'TRANSFERRED').map(h => (
                                                <li key={h.timestamp} suppressHydrationWarning>
                                                    {new Date(h.timestamp).toLocaleString()}: transferred {h.details}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
