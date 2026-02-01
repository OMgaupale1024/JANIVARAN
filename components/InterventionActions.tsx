'use client';

import React, { useState } from 'react';
import { Phone, AlertCircle, X } from 'lucide-react';
import { AuthorityContact } from '@/lib/services/intervention-service';

interface InterventionActionsProps {
    complaintId: string;
    userId: string;
    userName: string;
    onActionComplete?: () => void;
}

export default function InterventionActions({
    complaintId,
    userId,
    userName,
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
            const response = await fetch(`/api/complaints/${complaintId}/intervene`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'call',
                    userId,
                    userName,
                }),
            });

            const data = await response.json();
            if (data.success) {
                setContact(data.contact);
                setShowCallModal(true);
                onActionComplete?.();
            }
        } catch (error) {
            console.error('Error initiating call:', error);
            alert('Failed to retrieve contact information');
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
            const response = await fetch(`/api/complaints/${complaintId}/intervene`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'escalation',
                    userId,
                    userName,
                    reason: escalationReason,
                    message: escalationMessage || undefined,
                }),
            });

            const data = await response.json();
            if (data.success) {
                alert(`Escalation submitted successfully!\nEscalation ID: ${data.escalationId}`);
                setShowEscalationModal(false);
                setEscalationReason('');
                setEscalationMessage('');
                onActionComplete?.();
            }
        } catch (error) {
            console.error('Error raising escalation:', error);
            alert('Failed to submit escalation request');
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
                💡 <strong>Call Authority:</strong> Get contact details to speak directly with the responsible official.
                <strong className="ml-2">Raise Issue:</strong> Submit an escalation request to senior authorities.
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
                                    <p className="text-sm text-slate-600">{contact.level}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCallModal(false)}
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
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="font-semibold text-forest-600 hover:text-forest-700"
                                >
                                    {contact.phone}
                                </a>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-600 mb-1">Email</p>
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="font-semibold text-forest-600 hover:text-forest-700 break-all"
                                >
                                    {contact.email}
                                </a>
                            </div>
                        </div>

                        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-800">
                                📞 This action has been logged. You can now contact the authority directly using the information above.
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
                                    <p className="text-sm text-slate-600">Submit to senior authorities</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowEscalationModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Reason for Escalation <span className="text-red-600">*</span>
                                </label>
                                <select
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
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Additional Message (Optional)
                                </label>
                                <textarea
                                    value={escalationMessage}
                                    onChange={(e) => setEscalationMessage(e.target.value)}
                                    placeholder="Provide any additional context or details..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-forest-500 resize-none"
                                />
                            </div>

                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-xs text-amber-800">
                                    ⚠️ This will notify senior officials and create an escalation record. Use this action when your complaint genuinely requires higher-level intervention.
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
