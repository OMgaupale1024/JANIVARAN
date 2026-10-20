'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MapPin, Send, ArrowLeft, CheckCircle, Upload, ArrowRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { storage } from '@/lib/firebase-config';
import { apiFetch } from '@/lib/api-client';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from '@/lib/complaint-policy';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EMPTY_FORM = { title: '', category: '', description: '', location: '' };

export default function FileComplaintPage() {
    const router = useRouter();
    const { user } = useAuth();

    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [files, setFiles] = useState<File[]>([]);
    const [fileError, setFileError] = useState('');
    const [trackingId, setTrackingId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? []);
        e.target.value = ''; // allow re-selecting the same file
        const rejected: string[] = [];
        const accepted = selected.filter(file => {
            if (!PHOTO_CONTENT_TYPES.includes(file.type)) rejected.push(`${file.name}: only JPG, PNG or WebP images`);
            else if (file.size > MAX_PHOTO_BYTES) rejected.push(`${file.name}: larger than 5MB`);
            else return true;
            return false;
        });
        const room = MAX_PHOTOS - files.length;
        if (accepted.length > room) rejected.push(`Only ${MAX_PHOTOS} photos can be attached`);
        setFiles(prev => [...prev, ...accepted.slice(0, room)]);
        setFileError(rejected.join('. '));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            setError('You must be logged in to file a complaint');
            setTimeout(() => router.push('/citizen'), 2000);
            return;
        }

        setLoading(true);
        setError('');

        let stage = 'upload';
        try {
            // Upload evidence to the citizen's own folder (Storage rules enforce owner, type and size)
            const photoURLs: string[] = [];
            for (const file of files) {
                const objectRef = ref(storage, `complaints/${user.uid}/${crypto.randomUUID()}/photo.${EXTENSIONS[file.type]}`);
                await uploadBytes(objectRef, file, { contentType: file.type });
                photoURLs.push(await getDownloadURL(objectRef));
            }

            stage = 'submit';
            const { data } = await apiFetch<{ data: { trackingId: string } }>('/api/complaints', {
                method: 'POST',
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description,
                    category: formData.category,
                    location: formData.location,
                    photoURLs,
                }),
            });

            setTrackingId(data.trackingId);
            setStep(4); // Success step
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            setError(stage === 'upload'
                ? `Photo upload failed. Please try again or remove the photos. ${message}`.trim()
                : message || 'Failed to submit complaint. Please try again.');
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
                                        <label htmlFor="complaint-title" className="block text-sm font-medium mb-2">Title (Optional)</label>
                                        <input
                                            id="complaint-title"
                                            type="text"
                                            maxLength={120}
                                            className="w-full border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none"
                                            placeholder="Brief title for the issue"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="complaint-description" className="block text-sm font-medium mb-2">Description</label>
                                        <textarea
                                            id="complaint-description"
                                            maxLength={2000}
                                            aria-describedby="description-help"
                                            className="w-full border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none h-32"
                                            placeholder="Describe the issue in detail..."
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        ></textarea>
                                        <p id="description-help" className="text-xs text-gray-400 mt-1">At least 10 characters.</p>
                                    </div>
                                    <div>
                                        <label htmlFor="complaint-location" className="block text-sm font-medium mb-2">Location</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                            <input
                                                id="complaint-location"
                                                type="text"
                                                maxLength={300}
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
                                        disabled={formData.description.trim().length < 10 || formData.location.trim().length < 3}
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

                                <label
                                    htmlFor="photo-upload"
                                    className={`block border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center transition-colors group focus-within:ring-2 focus-within:ring-noble-dark ${files.length >= MAX_PHOTOS || loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}`}
                                >
                                    <input
                                        id="photo-upload"
                                        type="file"
                                        accept={PHOTO_CONTENT_TYPES.join(',')}
                                        multiple
                                        className="sr-only"
                                        onChange={handleFiles}
                                        disabled={files.length >= MAX_PHOTOS || loading}
                                        aria-describedby="photo-help"
                                    />
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Upload className="text-gray-500" size={24} />
                                    </div>
                                    <p className="font-semibold text-gray-700">Click to upload photos</p>
                                    <p id="photo-help" className="text-sm text-gray-400 mt-2">JPG, PNG or WebP up to 5MB each (max {MAX_PHOTOS})</p>
                                </label>

                                {fileError && (
                                    <p role="alert" className="text-sm text-red-600">{fileError}</p>
                                )}

                                {files.length > 0 && (
                                    <ul className="space-y-2" aria-label="Selected photos">
                                        {files.map((file, i) => (
                                            <li key={`${file.name}-${i}`} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm">
                                                <span className="truncate">{file.name} <span className="text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                                                <button
                                                    type="button"
                                                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                                    disabled={loading}
                                                    className="p-1 text-gray-500 hover:text-red-600 rounded"
                                                    aria-label={`Remove ${file.name}`}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {error && (
                                    <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-sm text-red-600">{error}</p>
                                    </div>
                                )}

                                <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-100">
                                    <h3 className="font-bold text-yellow-800 mb-2">Summary</h3>
                                    <ul className="text-sm text-yellow-800/80 space-y-1">
                                        <li><strong>Category:</strong> {formData.category}</li>
                                        <li><strong>Location:</strong> {formData.location}</li>
                                        <li><strong>Photos:</strong> {files.length}</li>
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
                                    <Link href="/file-complaint" onClick={() => { setStep(1); setFormData(EMPTY_FORM); setFiles([]); setFileError(''); }} className="text-noble-dark font-medium hover:underline">
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
