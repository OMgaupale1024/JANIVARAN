'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Briefcase, UserCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function AdminLogin() {
    const router = useRouter();
    const { signIn, signOut } = useAuth();
    const [role, setRole] = useState<'OFFICIAL' | 'AUTHORITY'>('OFFICIAL');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Role comes from the account's trusted profile, not from this form
            const profile = await signIn(email, password);
            const expected = role === 'AUTHORITY' ? 'admin' : 'official';
            if (profile?.role !== expected) {
                await signOut();
                setError(role === 'AUTHORITY'
                    ? 'This account does not have Authority access.'
                    : 'This account does not have Official access.');
                setLoading(false);
                return;
            }
            router.push('/admin/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sign in.');
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 z-0 opacity-5">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
            </div>

            <div className="w-full max-w-md p-8 relative z-10">

                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-noble-dark text-white mb-6 shadow-xl">
                        <Shield size={32} />
                    </div>
                    <h1 className="text-3xl font-serif font-bold text-noble-dark mb-2">Official Access</h1>
                    <p className="text-gray-500 text-sm font-medium">JanNivaran Secure Gateway</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">

                    {/* Role Toggles */}
                    <div className="grid grid-cols-2 bg-gray-50 p-1">
                        <button
                            type="button"
                            onClick={() => setRole('OFFICIAL')}
                            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all rounded-xl ${role === 'OFFICIAL'
                                    ? 'bg-white text-noble-dark shadow-sm ring-1 ring-black/5'
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <Briefcase size={14} />
                            Official
                        </button>
                        <button
                            type="button"
                            onClick={() => setRole('AUTHORITY')}
                            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all rounded-xl ${role === 'AUTHORITY'
                                    ? 'bg-white text-noble-dark shadow-sm ring-1 ring-black/5'
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <UserCheck size={14} />
                            Authority
                        </button>
                    </div>

                    <form onSubmit={handleLogin} className="p-8 space-y-6">

                        {error && (
                            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="official-email" className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                                    Official Email
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-noble-dark transition-colors">
                                        <Briefcase size={18} />
                                    </div>
                                    <input
                                        id="official-email"
                                        type="email"
                                        required
                                        autoComplete="username"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-noble-dark/20 focus:border-noble-dark transition-all outline-none text-sm font-medium text-noble-dark placeholder-gray-400"
                                        placeholder="name@department.gov.in"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="official-password" className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                                    Password
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-noble-dark transition-colors">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        id="official-password"
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-noble-dark/20 focus:border-noble-dark transition-all outline-none text-sm font-medium text-noble-dark placeholder-gray-400"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-noble-dark text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <span>Access Dashboard</span>
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                    </form>
                </div>

                <div className="text-center mt-8">
                    <Link href="/" className="text-gray-400 hover:text-noble-dark text-sm font-medium transition-colors">
                        ← Back to Homepage
                    </Link>
                </div>

            </div>
        </main>
    );
}
