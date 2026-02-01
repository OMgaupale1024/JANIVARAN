'use client';

import React from 'react';
import Image from 'next/image';

export default function ThreeDMap() {
    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {/* Subtle background glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <div className="w-[400px] h-[400px] bg-gradient-to-br from-slate-200/60 via-blue-100/40 to-emerald-100/40 rounded-full blur-[120px]"></div>
            </div>

            {/* Clean India Map */}
            <div className="relative w-full max-w-[550px] h-auto">
                <Image
                    src="/india-map-clean.png"
                    alt="India Political Map"
                    width={550}
                    height={550}
                    className="w-full h-auto opacity-95 transition-opacity duration-500 hover:opacity-100"
                    priority
                    style={{
                        filter: 'drop-shadow(0px 20px 50px rgba(0,0,0,0.12))'
                    }}
                />
            </div>
        </div>
    );
}
