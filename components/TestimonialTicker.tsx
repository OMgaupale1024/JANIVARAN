'use client';

import React, { useState, useEffect } from 'react';
import { Quote } from 'lucide-react';

interface Testimonial {
    id: number;
    quote: string;
    name: string;
    role: string;
    location: string;
}

const TESTIMONIALS: Testimonial[] = [
    { id: 1, quote: "Reporting a broken streetlight used to be overwhelming, but JanNivaran made it effortless. It was fixed in 24 hours!", name: "Rahul M.", role: "Resident", location: "Mumbai, MH" },
    { id: 2, quote: "The transparency is incredible. I could track my complaint about the water supply in real-time.", name: "Priya S.", role: "Local Business Owner", location: "Bangalore, KA" },
    { id: 3, quote: "Finally, a system that listens. The garbage collection issue in our lane was resolved within two days.", name: "Amit K.", role: "School Principal", location: "Delhi, NCR" },
    { id: 4, quote: "User-friendly and efficient. It feels great to see active governance.", name: "Sneha R.", role: "Student", location: "Pune, MH" },
    { id: 5, quote: "I reported a pothole near my shop, and the updates were timely. Great initiative!", name: "Vikram J.", role: "Shopkeeper", location: "Chennai, TN" },
    { id: 6, quote: "JanNivaran allows us to actually be part of the solution. Highly recommended.", name: "Anjali D.", role: "Retired Officer", location: "Hyderabad, TS" }
];

export default function TestimonialTicker() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
                setIsAnimating(false);
            }, 500); // 500ms fade out transition
        }, 4000); // Change every 4 seconds

        return () => clearInterval(interval);
    }, []);

    const activeTestimonial = TESTIMONIALS[currentIndex];

    // Get next 3 for the side list
    const upNext = [
        TESTIMONIALS[(currentIndex + 1) % TESTIMONIALS.length],
        TESTIMONIALS[(currentIndex + 2) % TESTIMONIALS.length],
        TESTIMONIALS[(currentIndex + 3) % TESTIMONIALS.length],
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center bg-noble-dark text-noble-light p-12 rounded-[3rem] shadow-2xl">
            {/* Main Featured Quote */}
            <div className={`space-y-8 transition-opacity duration-500 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                <div className="bg-noble-light/10 p-8 rounded-2xl border-l-4 border-noble-light backdrop-blur-sm relative">
                    <Quote className="absolute top-4 left-4 text-noble-light/20 w-12 h-12 -z-10" />
                    <p className="text-xl md:text-2xl font-serif leading-relaxed italic">
                        "{activeTestimonial.quote}"
                    </p>
                </div>
                <div className="flex items-center gap-4 animate-fade-in">
                    <div className="w-12 h-12 bg-noble-light text-noble-dark rounded-full flex items-center justify-center font-bold text-xl uppercase">
                        {activeTestimonial.name[0]}
                    </div>
                    <div>
                        <p className="font-bold text-lg">{activeTestimonial.name}</p>
                        <p className="text-sm opacity-70">{activeTestimonial.location}</p>
                    </div>
                </div>
            </div>

            {/* Side List (Upcoming) */}
            <div className="space-y-6 text-sm md:text-base opacity-80 font-light border-l border-white/20 pl-8 hidden lg:block">
                <p className="text-xs uppercase tracking-widest opacity-50 mb-4">Recent Feedback</p>
                {upNext.map((t, i) => (
                    <div key={i} className="group cursor-default transition-all duration-500">
                        <h4 className="font-bold text-white mb-1 group-hover:text-noble-accent transition-colors">{t.role}</h4>
                        <p className="opacity-70 group-hover:opacity-100 transition-opacity">{t.location}</p>
                        {i < upNext.length - 1 && <div className="h-px bg-white/10 w-full mt-4"></div>}
                    </div>
                ))}
            </div>
        </div>
    );
}
