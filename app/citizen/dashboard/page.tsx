'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    FileText,
    Settings,
    LogOut,
    Menu,
    X,
    Clock,
    CheckCircle2,
    AlertCircle,
    TrendingUp,
    Plus,
    Home,
    Trash2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getComplaintsByCitizen } from '@/lib/services/complaint-service';
import { Complaint } from '@/types/backend';
import { isComplaintStalled, getStalledStatusLabel, getStalledComplaints } from '@/lib/services/stalled-detection-service';
import StalledComplaintBadge from '@/components/StalledComplaintBadge';
import InterventionActions from '@/components/InterventionActions';

import SLATracker from '@/components/SLATracker';

export default function CitizenDashboard() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'complaints' | 'settings'>('overview');
    const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);

    const toggleExpansion = (id: string) => {
        setExpandedComplaintId(prev => prev === id ? null : id);
    };

    // Redirect if not logged in
    useEffect(() => {
        if (!user) {
            router.push('/citizen');
        }
    }, [user, router]);

    // Load complaints with real-time updates
    useEffect(() => {
        if (!user) return;

        setLoading(true);

        // Import the listener function
        const { listenToComplaintsByCitizen } = require('@/lib/services/complaint-service');

        // Set up real-time listener
        const unsubscribe = listenToComplaintsByCitizen(user.uid, (data: Complaint[]) => {
            setComplaints(data);
            setLoading(false);
        });

        // Cleanup listener on unmount
        return () => unsubscribe();
    }, [user]);

    const handleLogout = async () => {
        await signOut();
        router.push('/');
    };

    const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        inProgress: complaints.filter(c => c.status === 'in-progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        stalled: getStalledComplaints(complaints).length,
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
            case 'escalated': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getSLAColor = (status: string) => {
        switch (status) {
            case 'on-track': return 'text-green-600';
            case 'at-risk': return 'text-yellow-600';
            case 'breached': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="h-full flex flex-col">
                    {/* Logo */}
                    <div className="p-6 border-b">
                        <h1 className="font-serif text-2xl font-bold text-noble-dark">JanNivaran</h1>
                        <p className="text-sm text-gray-500 mt-1">Citizen Portal</p>
                    </div>

                    {/* User Info */}
                    <div className="p-6 border-b">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-noble-dark text-white flex items-center justify-center font-bold text-lg">
                                {user.displayName?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">{user.displayName}</p>
                                <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-2">
                        <Link
                            href="/"
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
                        >
                            <Home size={20} />
                            <span className="font-medium">Home</span>
                        </Link>
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-noble-dark text-white' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <LayoutDashboard size={20} />
                            <span className="font-medium">Overview</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('complaints')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'complaints' ? 'bg-noble-dark text-white' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <FileText size={20} />
                            <span className="font-medium">My Complaints</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-noble-dark text-white' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <Settings size={20} />
                            <span className="font-medium">Settings</span>
                        </button>
                    </nav>

                    {/* Logout */}
                    <div className="p-4 border-t">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <LogOut size={20} />
                            <span className="font-medium">Logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Mobile Header */}
                <header className="lg:hidden bg-white shadow-sm p-4 flex items-center justify-between">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)}>
                        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                    <h1 className="font-serif text-xl font-bold">JanNivaran</h1>
                    <div className="w-6"></div>
                </header>

                {/* Content Area */}
                <main className="flex-1 p-6 lg:p-8">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
                                    <p className="text-gray-500 mt-1">Welcome back, {user.displayName}!</p>
                                </div>
                                <Link
                                    href="/file-complaint"
                                    className="flex items-center gap-2 bg-noble-dark text-white px-6 py-3 rounded-xl font-semibold hover:bg-black transition-all shadow-lg"
                                >
                                    <Plus size={20} />
                                    File Complaint
                                </Link>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Total Complaints</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
                                        </div>
                                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                                            <FileText className="text-gray-600" size={24} />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Pending</p>
                                            <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.pending}</p>
                                        </div>
                                        <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                                            <Clock className="text-yellow-600" size={24} />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">In Progress</p>
                                            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.inProgress}</p>
                                        </div>
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                            <TrendingUp className="text-blue-600" size={24} />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Resolved</p>
                                            <p className="text-3xl font-bold text-green-600 mt-2">{stats.resolved}</p>
                                        </div>
                                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                            <CheckCircle2 className="text-green-600" size={24} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Complaints */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Complaints</h3>
                                {loading ? (
                                    <p className="text-gray-500 text-center py-8">Loading complaints...</p>
                                ) : complaints.length === 0 ? (
                                    <div className="text-center py-12">
                                        <FileText className="mx-auto text-gray-300" size={48} />
                                        <p className="text-gray-500 mt-4">No complaints filed yet</p>
                                        <Link
                                            href="/file-complaint"
                                            className="inline-block mt-4 text-noble-dark font-semibold hover:underline"
                                        >
                                            File your first complaint →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {complaints.slice(0, 5).map((complaint) => (
                                            <div
                                                key={complaint.id}
                                                className={`border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer ${expandedComplaintId === complaint.id ? 'ring-2 ring-noble-dark bg-gray-50' : 'bg-white'}`}
                                                onClick={() => toggleExpansion(complaint.id)}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                            <span className="font-mono text-sm font-semibold text-noble-dark">
                                                                {complaint.trackingId}
                                                            </span>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(complaint.status)}`}>
                                                                {complaint.status.replace('-', ' ').toUpperCase()}
                                                            </span>
                                                            {isComplaintStalled(complaint) && (
                                                                <StalledComplaintBadge status={getStalledStatusLabel(complaint)!} />
                                                            )}
                                                        </div>
                                                        <h4 className="font-semibold text-gray-900 mb-1">{complaint.title}</h4>
                                                        <p className="text-sm text-gray-500 mb-2">{complaint.category} • {complaint.department}</p>
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <span className={`font-medium ${getSLAColor(complaint.sla.status)}`}>
                                                                SLA: {complaint.sla.status.replace('-', ' ')}
                                                            </span>
                                                            <span className="text-gray-400">•</span>
                                                            <span className="text-gray-600">
                                                                {complaint.sla.remainingHours > 0
                                                                    ? `${Math.round(complaint.sla.remainingHours)}h remaining`
                                                                    : 'Overdue'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Tracker View */}
                                                {expandedComplaintId === complaint.id && (
                                                    <div className="mt-4 pt-4 border-t border-gray-200 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                                        <SLATracker complaint={complaint} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Complaints Tab */}
                    {activeTab === 'complaints' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-3xl font-bold text-gray-900">My Complaints</h2>
                                <Link
                                    href="/file-complaint"
                                    className="flex items-center gap-2 bg-noble-dark text-white px-6 py-3 rounded-xl font-semibold hover:bg-black transition-all shadow-lg"
                                >
                                    <Plus size={20} />
                                    New Complaint
                                </Link>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                {loading ? (
                                    <p className="text-gray-500 text-center py-8">Loading complaints...</p>
                                ) : complaints.length === 0 ? (
                                    <div className="text-center py-12">
                                        <FileText className="mx-auto text-gray-300" size={48} />
                                        <p className="text-gray-500 mt-4">No complaints filed yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {complaints.map((complaint) => (
                                            <div
                                                key={complaint.id}
                                                className={`border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all cursor-pointer ${expandedComplaintId === complaint.id ? 'ring-2 ring-noble-dark bg-gray-50' : 'bg-white'}`}
                                                onClick={() => toggleExpansion(complaint.id)}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                            <span className="font-mono text-sm font-semibold text-noble-dark">
                                                                {complaint.trackingId}
                                                            </span>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(complaint.status)}`}>
                                                                {complaint.status.replace('-', ' ').toUpperCase()}
                                                            </span>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${complaint.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                                complaint.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                                    complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                                }`}>
                                                                {complaint.priority.toUpperCase()}
                                                            </span>
                                                            {isComplaintStalled(complaint) && (
                                                                <StalledComplaintBadge status={getStalledStatusLabel(complaint)!} />
                                                            )}
                                                        </div>
                                                        <h4 className="font-bold text-gray-900 text-lg mb-1">{complaint.title}</h4>
                                                        <p className="text-sm text-gray-600 mb-2">{complaint.description}</p>
                                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                                            <span>{complaint.category}</span>
                                                            <span>•</span>
                                                            <span>{complaint.department}</span>
                                                            <span>•</span>
                                                            <span suppressHydrationWarning>
                                                                {new Date(complaint.createdAt.toDate()).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <AlertCircle size={16} className={getSLAColor(complaint.sla.status)} />
                                                        <span className={`font-medium ${getSLAColor(complaint.sla.status)}`}>
                                                            SLA: {complaint.sla.status.replace('-', ' ')}
                                                        </span>
                                                        <span className="text-gray-400">•</span>
                                                        <span className="text-gray-600">
                                                            {complaint.sla.remainingHours > 0
                                                                ? `${Math.round(complaint.sla.remainingHours)} hours remaining`
                                                                : `Overdue by ${Math.abs(Math.round(complaint.sla.remainingHours))} hours`}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Expanded Tracker View */}
                                                {expandedComplaintId === complaint.id && (
                                                    <div className="mt-6 pt-6 border-t border-gray-200 animate-fade-in cursor-auto" onClick={(e) => e.stopPropagation()}>
                                                        <SLATracker complaint={complaint} />
                                                    </div>
                                                )}

                                                {/* Intervention Actions for Stalled Complaints */}
                                                {isComplaintStalled(complaint) && user && (
                                                    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                                                        <InterventionActions
                                                            complaintId={complaint.id}
                                                            userId={user.uid}
                                                            userName={user.displayName || user.email || 'User'}
                                                        />
                                                    </div>
                                                )}

                                                {/* Delete Option for Citizen */}
                                                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) {
                                                                fetch(`/api/complaints/${complaint.id}`, { method: 'DELETE' })
                                                                    .then(res => {
                                                                        if (!res.ok) alert('Failed to delete');
                                                                        // Listener will handle UI update
                                                                    });
                                                            }
                                                        }}
                                                        className="text-red-500 text-sm font-medium hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                                                    >
                                                        <Trash2 size={16} />
                                                        Delete Complaint
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-gray-900">Settings</h2>

                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-6">Profile Information</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            value={user.displayName || ''}
                                            disabled
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={user.email || ''}
                                            disabled
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                                        <input
                                            type="text"
                                            value={user.role.toUpperCase()}
                                            disabled
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-600"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-4">Account Actions</h3>
                                <button
                                    onClick={handleLogout}
                                    className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                ></div>
            )}
        </div>
    );
}
