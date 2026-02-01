'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Briefcase, UserCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AdminLogin() {
    const router = useRouter();
    const [role, setRole] = useState<'OFFICIAL' | 'AUTHORITY'>('OFFICIAL');
    const [loading, setLoading] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate login delay for effect
        setTimeout(() => {
            // Save role to local storage for demo purposes
            localStorage.setItem('adminRole', role);
            router.push('/admin/dashboard');
        }, 1500);
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

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                                    Secure ID
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-noble-dark transition-colors">
                                        <Briefcase size={18} />
                                    </div>
                                    <input
                                        type="text"
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-noble-dark/20 focus:border-noble-dark transition-all outline-none text-sm font-medium text-noble-dark placeholder-gray-400"
                                        placeholder={role === 'OFFICIAL' ? "Start with OFF..." : "Start with AUTH..."}
                                        defaultValue="DEMO_USER_01"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                                    Password
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-noble-dark transition-colors">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        type="password"
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-noble-dark/20 focus:border-noble-dark transition-all outline-none text-sm font-medium text-noble-dark placeholder-gray-400"
                                        placeholder="••••••••"
                                        defaultValue="password"
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
