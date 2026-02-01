'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Camera, MapPin, Send, ArrowLeft, CheckCircle, Upload, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createComplaint } from '@/lib/services/complaint-service';

export default function FileComplaintPage() {
    const router = useRouter();
    const { user } = useAuth();

    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        description: '',
        location: '',
        files: null
    });
    const [trackingId, setTrackingId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            setError('You must be logged in to file a complaint');
            setTimeout(() => router.push('/citizen'), 2000);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const complaint = await createComplaint({
                title: formData.title || `${formData.category} Issue`,
                description: formData.description,
                category: formData.category,
                location: formData.location,
            }, user);

            setTrackingId(complaint.trackingId);
            setStep(4); // Success step
        } catch (err: any) {
            setError(err.message || 'Failed to submit complaint. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-noble-dark">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-noble-dark">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                    <div className="font-serif font-bold text-xl">JanNivaran</div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-12">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    {/* Progress Bar */}
                    <div className="bg-gray-100 h-2 w-full">
                        <div
                            className="bg-noble-dark h-full transition-all duration-500 ease-out"
                            style={{ width: `${(step / 3) * 100}%` }}
                        ></div>
                    </div>

                    <div className="p-8 md:p-12">
                        {step === 1 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h1 className="text-3xl font-serif mb-2">What is the issue?</h1>
                                    <p className="text-gray-500">Categorize your grievance to help us route it correctly.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {['Sanitation & Waste', 'Roads & Potholes', 'Water Supply', 'Electricity', 'Public Transport', 'Other'].map((cat) => (
                                        <button
                                            key={cat}
                                            onClick={() => { setFormData({ ...formData, category: cat }); setStep(2); }}
                                            className="p-6 text-left border rounded-xl hover:border-noble-dark hover:bg-noble-dark/5 transition-all group"
                                        >
                                            <span className="font-semibold text-lg">{cat}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h1 className="text-3xl font-serif mb-2">Details & Location</h1>
                                    <p className="text-gray-500">Provide specific details to help officials locate and fix the problem.</p>
                                </div>
                                {error && (
                                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-sm text-red-600">{error}</p>
                                    </div>
                                )}
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Title (Optional)</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none"
                                            placeholder="Brief title for the issue"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Description</label>
                                        <textarea
                                            className="w-full border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none h-32"
                                            placeholder="Describe the issue in detail..."
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        ></textarea>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Location</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                            <input
                                                type="text"
                                                className="w-full border border-gray-300 rounded-xl p-4 pl-12 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none"
                                                placeholder="Enter address or landmark"
                                                value={formData.location}
                                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                            />
                                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-600">
                                                Use GPS
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setStep(3)}
                                        disabled={!formData.description || !formData.location}
                                        className="w-full bg-noble-dark text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                                    >
                                        Next Step <ArrowRight size={20} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h1 className="text-3xl font-serif mb-2">Evidence & Submit</h1>
                                    <p className="text-gray-500">Upload photos (optional) and verify your report.</p>
                                </div>

                                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:bg-gray-50 transition-colors cursor-pointer group">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Upload className="text-gray-500" size={24} />
                                    </div>
                                    <p className="font-semibold text-gray-700">Click to upload photos</p>
                                    <p className="text-sm text-gray-400 mt-2">JPG, PNG up to 5MB</p>
                                </div>

                                <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-100">
                                    <h3 className="font-bold text-yellow-800 mb-2">Summary</h3>
                                    <ul className="text-sm text-yellow-800/80 space-y-1">
                                        <li><strong>Category:</strong> {formData.category}</li>
                                        <li><strong>Location:</strong> {formData.location}</li>
                                    </ul>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep(2)}
                                        className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition-all"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={loading}
                                        className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="animate-spin" size={20} />
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                Submit Complaint <Send size={20} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="text-center py-12 animate-fade-in">
                                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle className="text-green-600" size={48} />
                                </div>
                                <h2 className="text-3xl font-serif font-bold text-noble-dark mb-4">Complaint Filed Successfully!</h2>
                                <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
                                    Your grievance has been registered. You can track its status using the ID below.
                                </p>
                                <div className="bg-gray-100 p-6 rounded-xl inline-block mb-8">
                                    <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Tracking ID</p>
                                    <p className="text-3xl font-mono font-bold tracking-wider">{trackingId}</p>
                                </div>
                                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                                    <Link href="/citizen/dashboard" className="bg-noble-dark text-white py-3 rounded-lg font-medium hover:bg-opacity-90 text-center">
                                        Go to Dashboard
                                    </Link>
                                    <Link href="/file-complaint" onClick={() => { setStep(1); setFormData({ title: '', category: '', description: '', location: '', files: null }); }} className="text-noble-dark font-medium hover:underline">
                                        File Another Complaint
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
