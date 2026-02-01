'use client';

import React, { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const INDIA_TOPO_JSON = "https://raw.githubusercontent.com/Anujarya300/india-maps/master/india-states.json";

interface CityMarker {
    name: string;
    coordinates: [number, number];
    solved: number;
    pending: number;
}

const cities: CityMarker[] = [
    { name: "Delhi", coordinates: [77.2090, 28.6139], solved: 1200, pending: 340 },
    { name: "Mumbai", coordinates: [72.8777, 19.0760], solved: 2100, pending: 520 },
    { name: "Bangalore", coordinates: [77.5946, 12.9716], solved: 1650, pending: 280 },
    { name: "Chennai", coordinates: [80.2707, 13.0827], solved: 890, pending: 195 },
    { name: "Kolkata", coordinates: [88.3639, 22.5726], solved: 1340, pending: 410 },
    { name: "Hyderabad", coordinates: [78.4867, 17.3850], solved: 920, pending: 240 },
];

export default function GradientIndiaMap() {
    const [activeCity, setActiveCity] = useState<CityMarker | null>(null);
    const [randomPopup, setRandomPopup] = useState<CityMarker | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const interval = setInterval(() => {
            const randomCity = cities[Math.floor(Math.random() * cities.length)];
            setRandomPopup(randomCity);
            setTimeout(() => setRandomPopup(null), 3000);
        }, 5000);

        return () => clearInterval(interval);
    }, [mounted]);

    // Convert lat/long to SVG coordinates (simplified projection)
    const projectCoordinates = (coords: [number, number]): [number, number] => {
        const [lon, lat] = coords;
        const scale = 1000;
        const centerLon = 78.9629;
        const centerLat = 22.5937;

        const x = (lon - centerLon) * scale / 10 + 400;
        const y = (centerLat - lat) * scale / 10 + 400;

        return [x, y];
    };

    if (!mounted) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="animate-pulse text-noble-dark">Loading map...</div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <div
                className="relative transition-transform duration-500 hover:scale-105"
                style={{
                    filter: 'drop-shadow(0px 20px 40px rgba(0,0,0,0.15))',
                }}
            >
                <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                        scale: 1000,
                        center: [78.9629, 22.5937]
                    }}
                    width={800}
                    height={800}
                    className="w-full h-full"
                >
                    <defs>
                        <linearGradient id="indiaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#FDE047" />
                            <stop offset="50%" stopColor="#FBBF24" />
                            <stop offset="100%" stopColor="#F97316" />
                        </linearGradient>
                    </defs>

                    <Geographies geography={INDIA_TOPO_JSON}>
                        {({ geographies }) =>
                            geographies.map((geo) => (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    fill="url(#indiaGradient)"
                                    stroke="#FFFFFF"
                                    strokeWidth={0.5}
                                    style={{
                                        default: { outline: 'none' },
                                        hover: { outline: 'none', fill: 'url(#indiaGradient)', opacity: 0.9 },
                                        pressed: { outline: 'none' }
                                    }}
                                />
                            ))
                        }
                    </Geographies>

                    {/* Custom Pin Markers */}
                    {cities.map((city) => {
                        const [x, y] = projectCoordinates(city.coordinates);
                        return (
                            <g
                                key={city.name}
                                transform={`translate(${x}, ${y})`}
                                onMouseEnter={() => setActiveCity(city)}
                                onMouseLeave={() => setActiveCity(null)}
                                className="cursor-pointer"
                            >
                                {/* Pin shadow */}
                                <ellipse
                                    cx="0"
                                    cy="30"
                                    rx="8"
                                    ry="3"
                                    fill="rgba(0,0,0,0.3)"
                                />
                                {/* Pin body */}
                                <path
                                    d="M0,-20 C-8,-20 -15,-13 -15,-5 C-15,3 0,20 0,20 C0,20 15,3 15,-5 C15,-13 8,-20 0,-20 Z"
                                    fill="#DC2626"
                                    stroke="#FFFFFF"
                                    strokeWidth="2"
                                    className="transition-transform duration-300 hover:scale-110"
                                    style={{
                                        filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))',
                                    }}
                                />
                                {/* Pin center circle */}
                                <circle
                                    cx="0"
                                    cy="-8"
                                    r="5"
                                    fill="#FCD34D"
                                    stroke="#FFFFFF"
                                    strokeWidth="1.5"
                                />
                                {/* Pulse animation */}
                                <circle
                                    cx="0"
                                    cy="-8"
                                    r="8"
                                    fill="none"
                                    stroke="#DC2626"
                                    strokeWidth="2"
                                    opacity="0.6"
                                >
                                    <animate
                                        attributeName="r"
                                        from="8"
                                        to="15"
                                        dur="2s"
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="opacity"
                                        from="0.6"
                                        to="0"
                                        dur="2s"
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            </g>
                        );
                    })}
                </ComposableMap>

                {/* Hover Popup */}
                {activeCity && (
                    <div className="absolute top-4 right-4 z-50 animate-fade-in pointer-events-none">
                        <div className="bg-gradient-to-br from-red-600 to-red-800 text-white px-5 py-4 rounded-2xl shadow-2xl border-2 border-red-400 min-w-[220px]">
                            <div className="font-bold text-xl mb-3 text-center border-b border-red-300 pb-2 flex items-center justify-center gap-2">
                                <span className="text-2xl">📍</span>
                                {activeCity.name}
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-green-200 text-sm">✓ Solved</span>
                                    <span className="font-bold text-lg text-green-100">{activeCity.solved}</span>
                                </div>
                                <div className="w-full bg-red-900 rounded-full h-2">
                                    <div
                                        className="bg-green-400 h-2 rounded-full transition-all duration-500"
                                        style={{
                                            width: `${(activeCity.solved / (activeCity.solved + activeCity.pending)) * 100}%`,
                                        }}
                                    ></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-yellow-200 text-sm">⚠ Pending</span>
                                    <span className="font-bold text-lg text-yellow-100">{activeCity.pending}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Random Auto-Popup */}
                {randomPopup && !activeCity && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 animate-bounce">
                        <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-white px-6 py-3 rounded-full shadow-2xl border-3 border-white text-center font-bold text-lg">
                            🔔 {randomPopup.name}: {randomPopup.pending} new complaints!
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
