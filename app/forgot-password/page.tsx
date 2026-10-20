'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase-config';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            setSent(true);
        } catch (err) {
            const code = (err as { code?: string }).code;
            // Don't reveal whether an account exists
            if (code === 'auth/user-not-found') setSent(true);
            else setError(code === 'auth/invalid-email' ? 'Please enter a valid email address.' : 'Could not send the reset email. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans flex items-center justify-center p-6">
            <Link
                href="/citizen"
                className="absolute top-6 left-6 flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-noble-dark transition-colors"
            >
                <ArrowLeft size={16} /> Back to Login
            </Link>

            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 md:p-10">
                <div className="text-center mb-8">
                    <h1 className="font-serif text-3xl font-bold text-noble-dark mb-2">Reset Password</h1>
                    <p className="text-gray-500 text-sm">We&apos;ll email you a link to choose a new password</p>
                </div>

                {sent ? (
                    <div role="status" className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                        If an account exists for {email}, a password reset link is on its way. Check your inbox and spam folder.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-sm text-red-600">{error}</p>
                            </div>
                        )}
                        <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-noble-dark mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="Enter your Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-noble-dark focus:border-transparent outline-none transition-all bg-gray-50 hover:bg-white"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-noble-dark text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (<><Loader2 className="animate-spin" size={20} /> Sending...</>) : 'Send Reset Link'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
