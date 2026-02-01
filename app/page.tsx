'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Shield, Activity, Users, FileText, CheckCircle, Search, Home as HomeIcon } from 'lucide-react';
import ThreeDMap from '@/components/ThreeDMap';

// Testimonial Data
const TESTIMONIALS = [
    {
        id: 0,
        role: "Graphic Designer",
        location: "Bangalore, Karnataka",
        quote: "Managing civic complaints used to be overwhelming, but JanNivaran made it effortless.",
        author: "Taylor M., 28 years old",
        avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80"
    },
    {
        id: 1,
        role: "Software Engineer",
        location: "Hyderabad, Telangana",
        quote: "I can finally track my street light complaint in real-time. The transparency is a game changer.",
        author: "Rahul S., 32 years old",
        avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80"
    },
    {
        id: 2,
        role: "Small Business Owner",
        location: "Mumbai, Maharashtra",
        quote: "Getting my shop license renewal done was so fast. No more running around government offices.",
        author: "Priya K., 45 years old",
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80"
    }
];

import { useAuth } from '@/lib/auth-context';

// Auth Button Component
function AuthButton() {
    const { user, loading } = useAuth();
    const [imageError, setImageError] = useState(false);

    if (loading) return <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>;

    if (user) {
        // Logged In: Profile Avatar (Google Style)
        return (
            <Link href={user.role === 'citizen' ? '/citizen/dashboard' : '/admin/dashboard'} className="group relative">
                <div className="p-[2px] rounded-full bg-gradient-to-tr from-blue-500 via-green-500 to-yellow-500 group-hover:rotate-12 transition-transform duration-500">
                    <div className="w-10 h-10 rounded-full bg-white p-[2px] overflow-hidden flex items-center justify-center">
                        {user.photoURL && !imageError ? (
                            <img
                                src={user.photoURL}
                                alt="Profile"
                                className="w-full h-full object-cover rounded-full"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-noble-dark text-white flex items-center justify-center font-bold text-lg rounded-full">
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                            </div>
                        )}
                    </div>
                </div>
            </Link>
        );
    }

    // Logged Out: Account Center Button
    return (
        <Link
            href="/citizen"
            className="bg-noble-dark text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-black hover:scale-105 transition-all shadow-lg hover:shadow-xl active:scale-95"
        >
            Account Center
        </Link>
    );
}

export default function Home() {
    const [activeTestimonial, setActiveTestimonial] = useState(0);

    return (
        <main className="min-h-screen font-sans text-noble-dark selection:bg-noble-dark selection:text-white pb-20 overflow-x-hidden">

            {/* Header */}
            <header className="fixed top-0 w-full z-50 px-6 py-6 flex justify-between items-center bg-transparent backdrop-blur-md transition-all">
                <div className="font-serif text-2xl font-bold tracking-tight cursor-pointer hover:opacity-80 transition-opacity">JanNivaran</div>
                <div className="flex items-center gap-4 md:gap-6">
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium opacity-80">
                        <a href="#about" className="hover:opacity-100 transition-opacity">About</a>
                    </nav>
                    <AuthButton />
                </div>
            </header>

            {/* Hero Section - Premium Layout */}
            <section className="pt-36 px-6 md:px-16 max-w-[1400px] mx-auto min-h-[92vh] flex flex-col md:flex-row items-center gap-16">

                {/* Left Content - Refined Typography */}
                <div className="md:w-1/2 z-10 animate-fade-in-up">
                    <h1 className="text-6xl md:text-[5.5rem] font-serif font-medium leading-[0.92] mb-10 tracking-tight">
                        Civic Clarity <br />
                        <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-noble-dark via-green-800 to-noble-dark">You Can Trust</span>
                    </h1>
                    <p className="text-xl md:text-2xl opacity-75 max-w-xl leading-relaxed mb-12 font-light">
                        Trusted governance guidance for every stage of life and business. We handle the complexity so you can focus on what matters.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Link
                            href="/file-complaint"
                            className="bg-noble-dark text-white px-9 py-4 rounded-full text-lg font-bold hover:bg-black hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-2 group w-fit"
                        >
                            File a Complain
                            <ArrowRight className="group-hover:translate-x-2 transition-transform" size={20} />
                        </Link>
                    </div>

                    <div className="mt-14 flex items-center gap-4 text-sm font-bold uppercase tracking-widest opacity-50">
                        <span className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            Serving Citizens since 2026
                        </span>
                    </div>
                </div>

                {/* Right Visual - Premium Map Presentation */}
                <div className="md:w-1/2 h-[550px] md:h-[680px] w-full flex items-center justify-center relative animate-fade-in-right delay-100">
                    <ThreeDMap />
                </div>
            </section>

            {/* Features Grid (Noble Style) */}
            <section id="about" className="px-6 md:px-12 max-w-7xl mx-auto mb-32 scroll-mt-24">
                <div className="mb-20 animate-on-scroll">
                    <h2 className="text-5xl md:text-6xl font-serif font-medium mb-6">
                        Smart Governance for <br /> everyone
                    </h2>
                    <p className="max-w-xl text-lg opacity-70">
                        At JanNivaran, we believe that civic confidence should be accessible to everyone—whether you're a daily commuter, a business owner, or a community leader.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-noble-dark/20 pt-12">

                    {/* Col 1 */}
                    <div className="group p-6 rounded-2xl hover:bg-white/40 transition-colors duration-300">
                        <div className="mb-6 transform group-hover:scale-110 transition-transform duration-300 origin-left text-noble-dark">
                            <FileText size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-medium mb-4">For Citizens</h3>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-50 mb-6 group-hover:opacity-100 transition-opacity">Simplicity & Control</div>
                        <p className="opacity-80 leading-relaxed mb-8 min-h-[100px]">
                            Stay in charge of your civic issues with seamless complaint tracking, automated updates, and smart routing strategies—so you can live hassle-free.
                        </p>
                    </div>

                    {/* Col 2 */}
                    <div className="group md:border-l md:border-noble-dark/10 md:pl-12 p-6 rounded-2xl hover:bg-white/40 transition-colors duration-300">
                        <div className="mb-6 transform group-hover:scale-110 transition-transform duration-300 origin-left text-noble-dark">
                            <Shield size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-medium mb-4">For Families</h3>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-50 mb-6 group-hover:opacity-100 transition-opacity">Stability & Security</div>
                        <p className="opacity-80 leading-relaxed mb-8 min-h-[100px]">
                            From sanitation to safety, we help you plan for a better future, maximize community resources, and keep your household infrastructure running smoothly.
                        </p>
                    </div>

                    {/* Col 3 */}
                    <div className="group md:border-l md:border-noble-dark/10 md:pl-12 p-6 rounded-2xl hover:bg-white/40 transition-colors duration-300">
                        <div className="mb-6 transform group-hover:scale-110 transition-transform duration-300 origin-left text-noble-dark">
                            <Activity size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-medium mb-4">For Businesses</h3>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-50 mb-6 group-hover:opacity-100 transition-opacity">Speed & Efficiency</div>
                        <p className="opacity-80 leading-relaxed mb-8 min-h-[100px]">
                            Effortless licensing, zone feedback, and expert-backed infrastructure support—so you can spend less time on bureaucracy and more time scaling your business.
                        </p>
                    </div>
                </div>
            </section>

            {/* Testimonial Section (Dynamic Fixed) */}
            <section className="px-6 md:px-12 max-w-7xl mx-auto mb-32">
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-serif font-medium">Hear From Our Happy Citizens</h2>
                </div>

                <div className="flex flex-col md:flex-row items-stretch min-h-[400px]">
                    {/* Left Card - Selection List */}
                    <div className="md:w-1/3 bg-noble-dark text-white p-10 rounded-2xl flex flex-col justify-center relative overflow-hidden transition-all hover:shadow-2xl">
                        <div className="relative z-10 space-y-8">
                            {TESTIMONIALS.map((t, index) => (
                                <div
                                    key={t.id}
                                    onClick={() => setActiveTestimonial(index)}
                                    className={`cursor-pointer transition-all duration-300 group ${activeTestimonial === index ? 'opacity-100 translate-x-2' : 'opacity-40 hover:opacity-70'}`}
                                >
                                    <div className="text-sm font-bold uppercase tracking-widest mb-2 group-hover:text-green-300 transition-colors">{t.role}</div>
                                    <h3 className="text-xl font-medium mb-1">{t.location}</h3>
                                    {activeTestimonial === index && <div className="h-0.5 w-12 bg-white mt-2 animate-width"></div>}
                                </div>
                            ))}
                        </div>

                        <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
                            <div className="absolute -top-10 -right-10 w-60 h-60 border border-white/20 rounded-full animate-spin-slow"></div>
                        </div>
                    </div>

                    {/* Right Quote - Display Area - Full Height Alignment */}
                    <div className="md:w-2/3 md:pl-16 flex">
                        <div className="max-w-2xl relative w-full">
                            <div className="h-full border-l-4 border-noble-dark/10 pl-16 py-10 transition-all duration-500 ease-in-out flex flex-col justify-center">
                                <p key={TESTIMONIALS[activeTestimonial].id} className="text-3xl md:text-4xl font-serif leading-tight mb-8 animate-fade-in">
                                    "{TESTIMONIALS[activeTestimonial].quote}"
                                </p>
                                <div className="flex items-center gap-4 animate-fade-in delay-100">
                                    <div
                                        className="w-12 h-12 bg-gray-300 rounded-full bg-cover border-2 border-white shadow-md transition-transform hover:scale-110"
                                        style={{ backgroundImage: `url(${TESTIMONIALS[activeTestimonial].avatar})` }}
                                    ></div>
                                    <div className="font-bold text-sm text-noble-dark/80">{TESTIMONIALS[activeTestimonial].author}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer CTA */}
            <section className="px-6 md:px-12 max-w-7xl mx-auto text-center py-32 border-t border-noble-dark/10 relative">
                <h2 className="text-4xl md:text-6xl font-serif font-medium mb-8 max-w-4xl mx-auto leading-tight">
                    Let us handle the issues, <br />
                    so you can handle your success.
                </h2>
                <div className="mb-8 opacity-60 font-medium">Serving individuals and small businesses since 2026</div>
                <Link
                    href="/citizen"
                    className="bg-noble-dark text-white px-10 py-5 rounded-full text-lg font-bold hover:bg-black hover:scale-105 transition-all shadow-xl inline-block"
                >
                    Account Center
                </Link>

                <div className="absolute bottom-4 right-12">
                    <Link href="/admin/login" className="text-[10px] font-bold uppercase tracking-widest text-noble-dark/20 hover:text-noble-dark transition-colors">
                        Admin Access
                    </Link>
                </div>
            </section>

        </main>
    );
}
