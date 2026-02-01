'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Filter, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getComplaintsByCitizen } from '@/lib/services/complaint-service';
import { Complaint } from '@/types/backend';
import SLATracker from '@/components/SLATracker';

export default function AccountCenter() {
    const router = useRouter();
    const { user } = useAuth();
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        if (!user) {
            router.push('/citizen');
        } else {
            loadComplaints();
        }
    }, [user, router]);

    const loadComplaints = async () => {
        if (!user) return;

        try {
            setLoading(true);
            const data = await getComplaintsByCitizen(user.uid);
            setComplaints(data);
            if (data.length > 0 && !selectedComplaint) {
                setSelectedComplaint(data[0]);
            }
        } catch (error) {
            console.error('Error loading complaints:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredComplaints = complaints.filter(complaint => {
        const matchesSearch = complaint.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            complaint.trackingId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || complaint.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
            case 'escalated': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="text-gray-600 hover:text-gray-900">
                                <ArrowLeft size={24} />
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Account Center</h1>
                                <p className="text-gray-500 mt-1">Track and manage your complaints</p>
                            </div>
                        </div>
                        <Link
                            href="/citizen/dashboard"
                            className="px-6 py-3 bg-noble-dark text-white rounded-xl font-semibold hover:bg-black transition-all"
                        >
                            Dashboard
                        </Link>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Complaints List */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Search and Filter */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="text"
                                    placeholder="Search by ID or title..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-noble-dark"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-noble-dark"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="in-progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                                <option value="escalated">Escalated</option>
                            </select>
                        </div>

                        {/* Complaints */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {loading ? (
                                <p className="text-center py-8 text-gray-500">Loading...</p>
                            ) : filteredComplaints.length === 0 ? (
                                <div className="text-center py-12">
                                    <Package className="mx-auto text-gray-300" size={48} />
                                    <p className="text-gray-500 mt-4">No complaints found</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {filteredComplaints.map((complaint) => (
                                        <button
                                            key={complaint.id}
                                            onClick={() => setSelectedComplaint(complaint)}
                                            className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedComplaint?.id === complaint.id ? 'bg-noble-dark bg-opacity-5' : ''
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-mono text-sm font-semibold text-noble-dark">
                                                    {complaint.trackingId}
                                                </span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(complaint.status)}`}>
                                                    {complaint.status.toUpperCase()}
                                                </span>
                                            </div>
                                            <h4 className="font-semibold text-gray-900 mb-1">{complaint.title}</h4>
                                            <p className="text-sm text-gray-500">{complaint.category}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SLA Tracker */}
                    <div className="lg:col-span-2">
                        {selectedComplaint ? (
                            <div className="space-y-6">
                                {/* Complaint Details */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                    <h2 className="text-2xl font-bold text-gray-900 mb-4">{selectedComplaint.title}</h2>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-500">Category</p>
                                            <p className="font-semibold text-gray-900">{selectedComplaint.category}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Department</p>
                                            <p className="font-semibold text-gray-900">{selectedComplaint.department}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Priority</p>
                                            <p className="font-semibold text-gray-900">{selectedComplaint.priority.toUpperCase()}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Location</p>
                                            <p className="font-semibold text-gray-900">{selectedComplaint.location}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 mb-2">Description</p>
                                        <p className="text-gray-700">{selectedComplaint.description}</p>
                                    </div>
                                </div>

                                {/* SLA Tracker */}
                                <SLATracker complaint={selectedComplaint} />
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                                <Package className="mx-auto text-gray-300" size={64} />
                                <p className="text-gray-500 mt-4">Select a complaint to view tracking details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
