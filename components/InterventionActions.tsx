'use client';

import React, { useState } from 'react';
import { Phone, AlertCircle, X } from 'lucide-react';
import { AuthorityContact } from '@/lib/services/intervention-service';
import { apiFetch } from '@/lib/api-client';

interface InterventionActionsProps {
    complaintId: string;
    onActionComplete?: () => void;
}

export default function InterventionActions({
    complaintId,
    onActionComplete,
}: InterventionActionsProps) {
    const [showCallModal, setShowCallModal] = useState(false);
    const [showEscalationModal, setShowEscalationModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [contact, setContact] = useState<AuthorityContact | null>(null);
    const [escalationReason, setEscalationReason] = useState('');
    const [escalationMessage, setEscalationMessage] = useState('');

    // Handle call authority action
    const handleCallAuthority = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<{ contact: AuthorityContact }>(`/api/complaints/${complaintId}/intervene`, {
                method: 'POST',
                body: JSON.stringify({ action: 'call' }),
            });
            setContact(data.contact);
            setShowCallModal(true);
            onActionComplete?.();
        } catch (error) {
            console.error('Error initiating call:', error);
            alert(error instanceof Error ? error.message : 'Failed to retrieve contact information');
        } finally {
            setLoading(false);
        }
    };

    // Handle raise escalation action
    const handleRaiseEscalation = async () => {
        if (!escalationReason.trim()) {
            alert('Please provide a reason for escalation');
            return;
        }

        setLoading(true);
        try {
            const data = await apiFetch<{ ticketId: string }>(`/api/complaints/${complaintId}/intervene`, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'raise-ticket',
                    reason: escalationReason,
                    message: escalationMessage,
                }),
            });
            alert(`Escalation submitted successfully!\nTicket ID: ${data.ticketId}`);
            setShowEscalationModal(false);
            setEscalationReason('');
            setEscalationMessage('');
            onActionComplete?.();
        } catch (error) {
            console.error('Error raising escalation:', error);
            alert(error instanceof Error ? error.message : 'Failed to submit escalation request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-900">Your Complaint Needs Attention</h4>
                    <p className="text-xs text-amber-700 mt-1">
                        This complaint has not progressed as expected. You can take action to expedite resolution.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
                {/* Call Authority Button */}
                <button
                    onClick={handleCallAuthority}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-amber-600 text-amber-700 rounded-lg font-semibold text-sm hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                    <Phone className="w-4 h-4" />
                    Call Authority
                </button>

                {/* Raise Issue Button */}
                <button
                    onClick={() => setShowEscalationModal(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                    <AlertCircle className="w-4 h-4" />
                    Raise Issue
                </button>
            </div>

            <p className="text-xs text-amber-600 mt-1">
                💡 <strong>Call Authority:</strong> Shows the department contact (demo data in this version).
                <strong className="ml-2">Raise Issue:</strong> Records why this needs attention and raises its priority to High.
            </p>

            {/* Call Authority Modal */}
            {showCallModal && contact && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-forest-600 rounded-full flex items-center justify-center">
                                    <Phone className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Authority Contact</h3>
                                    <p className="text-sm text-slate-600">{contact.level} · Demo data</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCallModal(false)}
                                aria-label="Close"
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Name</p>
                                <p className="font-semibold text-slate-900">{contact.name}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Designation</p>
                                <p className="font-semibold text-slate-900">{contact.designation}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Department</p>
                                <p className="font-semibold text-slate-900">{contact.department}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Phone</p>
                                <p className="font-semibold text-slate-900">{contact.phone}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Email</p>
                                <p className="font-semibold text-slate-900 break-all">{contact.email}</p>
                            </div>
                        </div>

                        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-800">
                                📞 Your request was logged on this complaint. These are demo placeholder details, not a real official: do not call or email them.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Raise Escalation Modal */}
            {showEscalationModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Raise Escalation</h3>
                                    <p className="text-sm text-slate-600">Ask staff to prioritise this complaint</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowEscalationModal(false)}
                                aria-label="Close"
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="escalation-reason" className="block text-sm font-semibold text-slate-700 mb-2">
                                    Reason for Escalation <span className="text-red-600">*</span>
                                </label>
                                <select
                                    id="escalation-reason"
                                    value={escalationReason}
                                    onChange={(e) => setEscalationReason(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500"
                                >
                                    <option value="">Select a reason</option>
                                    <option value="No progress for extended period">No progress for extended period</option>
                                    <option value="SLA deadline breached">SLA deadline breached</option>
                                    <option value="Unsatisfactory response">Unsatisfactory response</option>
                                    <option value="Urgent matter requiring immediate attention">Urgent matter requiring immediate attention</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="escalation-message" className="block text-sm font-semibold text-slate-700 mb-2">
                                    Additional Message (Optional)
                                </label>
                                <textarea
                                    id="escalation-message"
                                    maxLength={1000}
                                    value={escalationMessage}
                                    onChange={(e) => setEscalationMessage(e.target.value)}
                                    placeholder="Provide any additional context or details..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500 resize-none"
                                />
                            </div>

                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-xs text-amber-800">
                                    ⚠️ This records your reason on the complaint and raises its priority to High so staff see it first. It does not notify anyone automatically, so use it only when the complaint genuinely needs attention.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowEscalationModal(false)}
                                    className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRaiseEscalation}
                                    disabled={loading || !escalationReason}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Submitting...' : 'Submit Escalation'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
