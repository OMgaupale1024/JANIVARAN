'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface CityData {
    name: string;
    x: number;
    y: number;
    size: number;
    solved: number;
    pending: number;
    color: string;
}

export default function DottedIndiaMap() {
    const [activeCity, setActiveCity] = useState<CityData | null>(null);
    const [randomPopup, setRandomPopup] = useState<CityData | null>(null);

    // Major cities with coordinates (relative to 400x500 canvas)
    const cities: CityData[] = useMemo(() => [
        { name: "Kashmir", x: 200, y: 40, size: 12, solved: 450, pending: 85, color: "#22c55e" },
        { name: "Delhi", x: 210, y: 120, size: 18, solved: 1200, pending: 340, color: "#16a34a" },
        { name: "Jaipur", x: 190, y: 140, size: 14, solved: 680, pending: 125, color: "#15803d" },
        { name: "Mumbai", x: 145, y: 230, size: 20, solved: 2100, pending: 520, color: "#166534" },
        { name: "Bangalore", x: 180, y: 310, size: 18, solved: 1650, pending: 280, color: "#14532d" },
        { name: "Chennai", x: 210, y: 320, size: 16, solved: 890, pending: 195, color: "#15803d" },
        { name: "Kolkata", x: 280, y: 200, size: 17, solved: 1340, pending: 410, color: "#16a34a" },
        { name: "Hyderabad", x: 200, y: 270, size: 15, solved: 920, pending: 240, color: "#166534" },
        { name: "Ahmedabad", x: 155, y: 180, size: 14, solved: 730, pending: 160, color: "#15803d" },
        { name: "Pune", x: 165, y: 245, size: 13, solved: 540, pending: 110, color: "#14532d" },
        { name: "Guwahati", x: 330, y: 150, size: 12, solved: 380, pending: 95, color: "#22c55e" },
    ], []);

    // Generate grid of dots to form India's shape
    const dots = useMemo(() => {
        const dotGrid = [];
        const gridSize = 400;
        const spacing = 15;

        // Rough outline of India's shape using dots
        for (let y = 0; y < 500; y += spacing) {
            for (let x = 0; x < gridSize; x += spacing) {
                // Simple approximation of India's shape
                const isIndia = (
                    // Kashmir region
                    (y < 100 && x > 180 && x < 240) ||
                    // North India
                    (y >= 100 && y < 200 && x > 140 && x < 290) ||
                    // Central India (wider)
                    (y >= 200 && y < 280 && x > 120 && x < 300) ||
                    // South India (narrowing)
                    (y >= 280 && y < 380 && x > 150 && x < 250) ||
                    // Southern tip
                    (y >= 380 && y < 450 && x > 180 && x < 220) ||
                    // Northeast extension
                    (y >= 120 && y < 200 && x > 290 && x < 350)
                );

                if (isIndia) {
                    const distanceFromCenter = Math.sqrt(Math.pow(x - 200, 2) + Math.pow(y - 250, 2));
                    const alpha = Math.max(0.3, 1 - distanceFromCenter / 300);

                    dotGrid.push({
                        x,
                        y,
                        size: Math.random() * 3 + 2,
                        opacity: alpha,
                        delay: Math.random() * 2,
                    });
                }
            }
        }
        return dotGrid;
    }, []);

    // Random popup effect
    useEffect(() => {
        const interval = setInterval(() => {
            const randomCity = cities[Math.floor(Math.random() * cities.length)];
            setRandomPopup(randomCity);
            setTimeout(() => setRandomPopup(null), 2500);
        }, 4000);

        return () => clearInterval(interval);
    }, [cities]);

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <div className="relative" style={{ width: '450px', height: '550px' }}>
                <svg
                    viewBox="0 0 400 500"
                    className="w-full h-full drop-shadow-2xl"
                    style={{
                        filter: 'drop-shadow(0px 10px 30px rgba(34, 197, 94, 0.3))',
                    }}
                >
                    {/* Background dots forming India's shape */}
                    {dots.map((dot, i) => (
                        <circle
                            key={`dot-${i}`}
                            cx={dot.x}
                            cy={dot.y}
                            r={dot.size}
                            fill={`rgba(134, 239, 172, ${dot.opacity})`}
                            className="transition-all duration-1000"
                            style={{
                                animation: `pulse ${3 + dot.delay}s ease-in-out infinite`,
                                animationDelay: `${dot.delay}s`,
                            }}
                        />
                    ))}

                    {/* Major cities with larger dots */}
                    {cities.map((city, i) => (
                        <g key={`city-${i}`}>
                            <circle
                                cx={city.x}
                                cy={city.y}
                                r={city.size}
                                fill={city.color}
                                className="cursor-pointer transition-all duration-300 hover:scale-125"
                                style={{
                                    filter: 'drop-shadow(0px 0px 8px rgba(34, 197, 94, 0.6))',
                                    animation: `ping 2s cubic-bezier(0, 0, 0.2, 1) infinite`,
                                    animationDelay: `${i * 0.3}s`,
                                }}
                                onMouseEnter={() => setActiveCity(city)}
                                onMouseLeave={() => setActiveCity(null)}
                            />
                            {/* Ripple effect */}
                            <circle
                                cx={city.x}
                                cy={city.y}
                                r={city.size + 8}
                                fill="none"
                                stroke={city.color}
                                strokeWidth="2"
                                opacity="0.4"
                                className="animate-ping"
                                style={{
                                    animationDuration: '3s',
                                    animationDelay: `${i * 0.3}s`,
                                }}
                            />
                        </g>
                    ))}

                    {/* "INDIA" text */}
                    <text
                        x="220"
                        y="420"
                        fontSize="48"
                        fontWeight="600"
                        fill="#1A3D24"
                        letterSpacing="8"
                        fontFamily="sans-serif"
                    >
                        INDIA
                    </text>
                </svg>

                {/* Hover Popup */}
                {activeCity && (
                    <div
                        className="absolute z-50 pointer-events-none animate-fade-in"
                        style={{
                            left: `${(activeCity.x / 400) * 100}%`,
                            top: `${(activeCity.y / 500) * 100}%`,
                            transform: 'translate(-50%, -120%)',
                        }}
                    >
                        <div className="bg-gradient-to-br from-green-600 to-green-800 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-green-400 min-w-[200px]">
                            <div className="font-bold text-lg mb-2 text-center border-b border-green-300 pb-2">
                                {activeCity.name}
                            </div>
                            <div className="flex justify-between items-center text-sm mb-1">
                                <span className="text-green-100">✓ Solved</span>
                                <span className="font-bold text-green-200">{activeCity.solved}</span>
                            </div>
                            <div className="w-full bg-green-900 rounded-full h-2 mb-2">
                                <div
                                    className="bg-green-300 h-2 rounded-full transition-all"
                                    style={{
                                        width: `${(activeCity.solved / (activeCity.solved + activeCity.pending)) * 100}%`,
                                    }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-red-200">⚠ Pending</span>
                                <span className="font-bold text-red-300">{activeCity.pending}</span>
                            </div>
                        </div>
                        {/* Arrow pointer */}
                        <div
                            className="w-0 h-0 mx-auto"
                            style={{
                                borderLeft: '10px solid transparent',
                                borderRight: '10px solid transparent',
                                borderTop: '10px solid rgb(22, 101, 52)',
                            }}
                        ></div>
                    </div>
                )}

                {/* Random Auto-Popup */}
                {randomPopup && !activeCity && (
                    <div
                        className="absolute z-40 animate-bounce"
                        style={{
                            left: `${(randomPopup.x / 400) * 100}%`,
                            top: `${(randomPopup.y / 500) * 100}%`,
                            transform: 'translate(-50%, -120%)',
                        }}
                    >
                        <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-2 rounded-xl shadow-xl border-2 border-yellow-300 text-center text-sm font-bold animate-pulse">
                            🔔 {randomPopup.name}: {randomPopup.pending} new complaints!
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 0.5;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.1);
                    }
                }
                @keyframes ping {
                    75%, 100% {
                        transform: scale(1.5);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}
