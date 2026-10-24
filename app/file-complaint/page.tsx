'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { MapPin, Send, ArrowLeft, CheckCircle, Upload, ArrowRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { storage } from '@/lib/firebase-config';
import { apiFetch, ApiError } from '@/lib/api-client';
import { MAX_LOCATION, MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, withGpsFix } from '@/lib/complaint-policy';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EMPTY_FORM = { title: '', category: '', description: '', location: '' };
const PHOTO_TIMEOUT_MS = 120_000; // per photo, upload plus download link; progress is shown meanwhile
// Covers an unanswered permission prompt too, which the geolocation timeout option does not
const GPS_WAIT_MS = 20_000;
const DRAFT_KEY = 'jannivaran:complaint-draft';
const SIGN_IN_URL = '/citizen?next=/file-complaint';

type FormState = typeof EMPTY_FORM;
type Draft = { formData: FormState; step: number; requestId: string | null };
type FormError = { message: string; signIn?: boolean; savedAs?: string; detail?: string; withoutPhotos?: boolean };
// Where a photo failed (sending the file, or fetching its link afterwards) and the SDK's error code
type UploadFailure = { stage: 'upload' | 'link'; code: string; status?: number };

// The draft survives a sign-in round trip or a reload (photos have to be re-attached)
function readDraft(): Draft | null {
    try {
        return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    } catch {
        return null;
    }
}
function writeDraft(draft: Draft | null) {
    try {
        if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
        // storage unavailable: the draft stays in memory only
    }
}

// Upload one photo to the citizen's own folder (Storage rules enforce owner, type and size).
// Settles within PHOTO_TIMEOUT_MS; rejects with an UploadFailure; `signal` cancels it (leaving the page).
function uploadPhoto(uid: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<string> {
    const objectRef = ref(storage, `complaints/${uid}/${crypto.randomUUID()}/photo.${EXTENSIONS[file.type]}`);
    const task = uploadBytesResumable(objectRef, file, { contentType: file.type });
    let stage: UploadFailure['stage'] = 'upload';
    return new Promise<string>((resolve, reject) => {
        const fail = (code: string, status?: number) => {
            task.cancel();
            reject({ stage, code, status } satisfies UploadFailure);
        };
        const timer = setTimeout(() => fail('timeout'), PHOTO_TIMEOUT_MS);
        const abort = () => fail('aborted');
        signal.addEventListener('abort', abort, { once: true });
        const settle = <T,>(then: (value: T) => void) => (value: T) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            then(value);
        };
        const sdkFailure = settle((err: { code?: string; status?: number }) => reject({ stage, code: err?.code ?? 'unknown', status: err?.status || undefined } satisfies UploadFailure));
        task.on('state_changed',
            snap => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            sdkFailure,
            () => {
                stage = 'link';
                getDownloadURL(objectRef).then(settle(resolve), sdkFailure);
            });
    });
}

function describeUploadFailure({ stage, code, status }: UploadFailure): FormError {
    const detail = `Photo ${stage === 'upload' ? 'upload' : 'link'} failed: ${code}${status ? ` (HTTP ${status})` : ''}`;
    const tail = 'Your details are kept. Try again, or submit without photos.';
    if (stage === 'link') {
        return { message: `A photo was uploaded but its link could not be fetched. ${tail}`, detail, withoutPhotos: true };
    }
    // A bucket that doesn't exist answers 404, which the SDK reports as storage/unknown
    if (code === 'storage/bucket-not-found' || code === 'storage/no-default-bucket' || (code === 'storage/unknown' && status === 404)) {
        return { message: "Photo storage isn't set up on this site yet, so photos can't be attached right now. You can submit without photos.", detail, withoutPhotos: true };
    }
    if (code === 'storage/unauthenticated') {
        return { message: 'Your session has expired. Sign in again; your details are kept on this device.', signIn: true, detail };
    }
    if (code === 'storage/unauthorized' || code === 'storage/unauthorized-app') {
        return { message: `Photo storage refused the upload. Each photo must be a JPG, PNG or WebP image under 5MB. ${tail}`, detail, withoutPhotos: true };
    }
    if (code === 'storage/quota-exceeded') {
        return { message: `Photo storage is over its quota, so photos can't be attached right now. ${tail}`, detail, withoutPhotos: true };
    }
    if (code === 'storage/retry-limit-exceeded' || code === 'timeout') {
        return { message: `Couldn't reach photo storage. Check your connection. ${tail}`, detail, withoutPhotos: true };
    }
    return { message: `Photo upload failed. ${tail}`, detail, withoutPhotos: true };
}

// Why the browser gave no position; the permission state separates a site block from device settings
async function describeGpsError(err: GeolocationPositionError): Promise<string> {
    const manual = 'You can type the address or a landmark instead.';
    if (err.code === err.POSITION_UNAVAILABLE) return `Your device couldn't work out its location (location services off, or no GPS or Wi-Fi signal). ${manual}`;
    if (err.code === err.TIMEOUT) return `Finding your location took too long. Press Use GPS to try again. ${manual}`;
    let state: PermissionState | undefined;
    try {
        state = (await navigator.permissions?.query({ name: 'geolocation' }))?.state;
    } catch {
        // Permissions API unavailable: fall back to the general message
    }
    if (state === 'granted') return `This site may use your location, but your device's location services are off or blocked for this browser. Turn them on in system settings. ${manual}`;
    if (state === 'prompt') return `Location access wasn't given. Press Use GPS to be asked again. ${manual}`;
    return `Location access is blocked for this site. Allow it in your browser's site settings to use GPS. ${manual}`;
}

function describeFailure(error: unknown): FormError {
    if (!(error instanceof ApiError)) return { message: 'Something went wrong. Your details are kept, so please try again.' };
    switch (error.kind) {
        case 'no-response':
        case 'invalid-response':
            return { message: "We couldn't confirm that your complaint was received. It may already be saved: press Submit again to check. This won't create a duplicate." };
        case 'signed-out':
            return { message: 'Your session has expired. Sign in again; your details are kept on this device.', signIn: true };
        case 'not-sent':
            return { message: error.message };
    }
    if (error.status === 409 && typeof error.body.trackingId === 'string') {
        return { message: `This complaint was already submitted as ${error.body.trackingId}.`, savedAs: error.body.trackingId };
    }
    if (error.status >= 500) return { message: 'The service is temporarily unavailable. Your details are kept, so please try again in a moment.' };
    return { message: error.message };
}

export default function FileComplaintPage() {
    const router = useRouter();
    const { user, firebaseUser, loading: authLoading, authError } = useAuth();

    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [files, setFiles] = useState<File[]>([]);
    const [fileError, setFileError] = useState('');
    const [trackingId, setTrackingId] = useState('');
    const [progress, setProgress] = useState(''); // non-empty while a submission is running
    const [error, setError] = useState<FormError | null>(null);
    const [gpsStatus, setGpsStatus] = useState('');
    const [locating, setLocating] = useState(false);
    const [restored, setRestored] = useState(false);

    const submitting = useRef(false);
    const requestId = useRef<string | null>(null); // one per complaint, kept across retries
    // Photos already uploaded, reused on retry; only for the account that uploaded them
    const uploaded = useRef({ uid: '', urls: new Map<File, string>() });
    const uploads = useRef<AbortController | null>(null);
    const gpsRequest = useRef(0); // the live location request; callbacks for any other number are ignored
    const gpsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const busy = progress !== '';
    const needsSignIn = !authLoading && !firebaseUser;
    const profileProblem = !authLoading && firebaseUser && !user
        ? authError ?? 'We could not load your account. Check your connection and refresh the page.'
        : null;

    useEffect(() => {
        const draft = readDraft();
        if (!draft) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring client-only storage after hydration
        setFormData(draft.formData);
        setStep(Math.min(draft.step, 3));
        setRestored(true);
        requestId.current = draft.requestId;
    }, []);

    // Leaving the page cancels uploads in flight and ignores any late location fix
    useEffect(() => () => {
        uploads.current?.abort();
        gpsRequest.current++;
        clearTimeout(gpsTimer.current);
    }, []);

    const goToSignIn = () => {
        writeDraft({ formData, step, requestId: requestId.current });
        router.push(SIGN_IN_URL);
    };

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

    // Ends the live location request (if any): its callbacks will be ignored from now on
    const stopGps = (message: string) => {
        gpsRequest.current++;
        clearTimeout(gpsTimer.current);
        setLocating(false);
        setGpsStatus(message);
    };

    const fillGpsLocation = () => {
        if (locating) return;
        const manual = 'Type the address or a landmark instead.';
        if (!window.isSecureContext) return setGpsStatus(`Location only works over a secure (https) connection. ${manual}`);
        if (!('geolocation' in navigator)) return setGpsStatus(`This browser can't share your location. ${manual}`);
        const policy = (document as Document & { featurePolicy?: { allowsFeature(feature: string): boolean } }).featurePolicy;
        if (policy && !policy.allowsFeature('geolocation')) return setGpsStatus(`Location is blocked on this page by the site showing it. ${manual}`);

        const id = ++gpsRequest.current;
        setLocating(true);
        setGpsStatus('Locating… If your browser asks, allow location access.');
        gpsTimer.current = setTimeout(() => {
            if (gpsRequest.current === id) stopGps(`No location yet. If your browser is asking for permission, answer it and press Use GPS again. ${manual}`);
        }, GPS_WAIT_MS);
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                if (gpsRequest.current !== id) return; // timed out, superseded, location edited, or page left
                setFormData(prev => ({ ...prev, location: withGpsFix(prev.location, coords) }));
                stopGps(coords.accuracy > 1000
                    ? `Approximate location added (within about ${(coords.accuracy / 1000).toFixed(1)} km): your device only gave a broad estimate. Add a street or landmark so officials can find the spot.`
                    : `Coordinates added (accurate to about ${Math.round(coords.accuracy)} m). Only you and the officials handling this complaint can see them.`);
            },
            async err => {
                if (gpsRequest.current !== id) return;
                const message = await describeGpsError(err);
                if (gpsRequest.current === id) stopGps(message);
            },
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
        );
    };

    const editLocation = (location: string) => {
        // Typing wins: a fix arriving afterwards must not rewrite what the citizen just entered
        if (locating) stopGps('Location request stopped because you edited the location. Press Use GPS again to add coordinates.');
        setFormData(prev => ({ ...prev, location }));
    };

    const handleSubmit = async (photos: File[] = files) => {
        if (submitting.current) return; // double click or a second tap while running
        if (needsSignIn) return goToSignIn();
        if (!firebaseUser || !user) return;
        submitting.current = true;
        setError(null);
        requestId.current ??= crypto.randomUUID();

        if (uploaded.current.uid !== firebaseUser.uid) uploaded.current = { uid: firebaseUser.uid, urls: new Map() };
        const { urls } = uploaded.current;
        uploads.current = new AbortController();
        const { signal } = uploads.current;

        let stage: 'upload' | 'save' = 'upload';
        try {
            const photoURLs: string[] = [];
            for (const [i, file] of photos.entries()) {
                const label = `Uploading photo ${i + 1} of ${photos.length}`;
                setProgress(`${label}…`);
                const url = urls.get(file)
                    ?? await uploadPhoto(firebaseUser.uid, file, percent => setProgress(`${label} (${percent}%)…`), signal);
                urls.set(file, url);
                photoURLs.push(url);
            }

            stage = 'save';
            setProgress('Saving your complaint…');
            const result = await apiFetch<{ data?: { trackingId?: unknown } }>('/api/complaints', {
                method: 'POST',
                headers: { 'Idempotency-Key': requestId.current },
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description,
                    category: formData.category,
                    location: formData.location,
                    photoURLs,
                }),
            });
            const saved = result.data?.trackingId;
            if (typeof saved !== 'string' || !/^JAN-\d{6}$/.test(saved)) {
                throw new ApiError('The server sent an unexpected response.', 'invalid-response');
            }

            // Confirmed by the server: the next complaint starts fresh
            setTrackingId(saved);
            setStep(4);
            requestId.current = null;
            urls.clear();
            writeDraft(null);
        } catch (err) {
            if (stage === 'upload') {
                // Stage and SDK code only: never the file name or a tokenised URL
                console.warn('Complaint photo upload failed', err);
                if ((err as UploadFailure).code === 'aborted') return;
            }
            setError(stage === 'upload' ? describeUploadFailure(err as UploadFailure) : describeFailure(err));
            writeDraft({ formData, step: 3, requestId: requestId.current });
        } finally {
            submitting.current = false;
            setProgress('');
        }
    };

    const startNewComplaint = () => {
        requestId.current = null;
        handleSubmit();
    };

    const submitWithoutPhotos = () => {
        setFiles([]);
        handleSubmit([]);
    };

    const resetForm = () => {
        setStep(1);
        setFormData(EMPTY_FORM);
        setFiles([]);
        setFileError('');
        setError(null);
        stopGps('');
        setRestored(false);
        requestId.current = null;
        uploaded.current.urls.clear();
        writeDraft(null);
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
                {step < 4 && authLoading && (
                    <p role="status" className="mb-4 text-sm text-gray-500">Checking your sign-in…</p>
                )}
                {step < 4 && profileProblem && (
                    <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between gap-4">
                        <span>{profileProblem} Your answers are kept.</span>
                        <button type="button" onClick={() => window.location.reload()} className="shrink-0 font-semibold underline">Try again</button>
                    </div>
                )}
                {step < 4 && needsSignIn && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 flex items-center justify-between gap-4">
                        <span>You&apos;ll need to sign in to submit. Your answers are kept on this device.</span>
                        <button type="button" onClick={goToSignIn} className="shrink-0 font-semibold underline">Sign in</button>
                    </div>
                )}

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
                                            type="button"
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
                                                maxLength={MAX_LOCATION}
                                                aria-describedby="gps-status"
                                                className="w-full border border-gray-300 rounded-xl p-4 pl-12 pr-28 focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none"
                                                placeholder="Enter address or landmark"
                                                value={formData.location}
                                                onChange={(e) => editLocation(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                onClick={fillGpsLocation}
                                                disabled={locating}
                                                aria-busy={locating}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-600 disabled:cursor-wait flex items-center gap-1"
                                            >
                                                {locating ? <><Loader2 className="animate-spin" size={12} /> Locating…</> : 'Use GPS'}
                                            </button>
                                        </div>
                                        <p id="gps-status" role="status" className="text-xs text-gray-500 mt-1 min-h-4">{gpsStatus}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { if (locating) stopGps(''); setStep(3); }}
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
                                    {restored && files.length === 0 && (
                                        <p className="text-sm text-gray-500 mt-2">Your draft was restored. Re-attach any photos you had selected.</p>
                                    )}
                                </div>

                                <label
                                    htmlFor="photo-upload"
                                    className={`block border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center transition-colors group focus-within:ring-2 focus-within:ring-noble-dark ${files.length >= MAX_PHOTOS || busy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}`}
                                >
                                    <input
                                        id="photo-upload"
                                        type="file"
                                        accept={PHOTO_CONTENT_TYPES.join(',')}
                                        multiple
                                        className="sr-only"
                                        onChange={handleFiles}
                                        disabled={files.length >= MAX_PHOTOS || busy}
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
                                                    disabled={busy}
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
                                    <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 space-y-2">
                                        <p>{error.message}</p>
                                        {error.detail && <p className="text-xs text-red-500">{error.detail}</p>}
                                        {error.withoutPhotos && files.length > 0 && (
                                            <button type="button" onClick={submitWithoutPhotos} className="font-semibold underline">Submit without photos</button>
                                        )}
                                        {error.signIn && (
                                            <button type="button" onClick={goToSignIn} className="font-semibold underline">Sign in again</button>
                                        )}
                                        {error.savedAs && (
                                            <p className="flex flex-wrap gap-4">
                                                <Link href="/citizen/dashboard" className="font-semibold underline">View it in your dashboard</Link>
                                                <button type="button" onClick={startNewComplaint} className="font-semibold underline">Submit these details as a new complaint</button>
                                            </p>
                                        )}
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
                                        type="button"
                                        onClick={() => setStep(2)}
                                        disabled={busy}
                                        className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSubmit()}
                                        disabled={busy || authLoading || !!profileProblem}
                                        className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {busy ? (
                                            <>
                                                <Loader2 className="animate-spin" size={20} />
                                                <span role="status">{progress}</span>
                                            </>
                                        ) : needsSignIn ? (
                                            <>Sign in to submit <ArrowRight size={20} /></>
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
                                    <p data-testid="tracking-id" className="text-3xl font-mono font-bold tracking-wider">{trackingId}</p>
                                </div>
                                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                                    <Link href="/citizen/dashboard" className="bg-noble-dark text-white py-3 rounded-lg font-medium hover:bg-opacity-90 text-center">
                                        Go to Dashboard
                                    </Link>
                                    <button type="button" onClick={resetForm} className="text-noble-dark font-medium hover:underline">
                                        File Another Complaint
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
