'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogOut } from 'lucide-react';

export default function Navbar() {
    const pathname = usePathname();
    const isCitizen = pathname.startsWith('/citizen');
    const isOfficial = pathname.startsWith('/dashboard');

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 p-4">
            <div className="container mx-auto">
                <div className="glass-panel px-6 py-3 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform">
                            JN
                        </div>
                        <span className="font-bold text-xl tracking-tight hidden sm:block">
                            Jan<span className="text-blue-600">Nivaran</span>
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {isCitizen && <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider">Citizen Portal</span>}
                        {isOfficial && <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider">Official Authority</span>}

                        <button
                            onClick={() => {
                                const html = document.documentElement;
                                if (html.getAttribute('data-theme') === 'dark') {
                                    html.setAttribute('data-theme', 'light');
                                    localStorage.setItem('theme', 'light');
                                } else {
                                    html.setAttribute('data-theme', 'dark');
                                    localStorage.setItem('theme', 'dark');
                                }
                            }}
                            className="glass-button p-2 rounded-full hover:bg-gray-100/20"
                            title="Toggle Theme"
                        >
                            <span className="sr-only">Toggle Theme</span>
                            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 shadow-sm dark:hidden"></div>
                            <div className="hidden dark:block w-4 h-4 rounded-full bg-slate-200 shadow-sm"></div>
                        </button>

                        <Link href="/" className="glass-button flex items-center gap-2 text-sm hover:text-red-500 overflow-hidden">
                            <LogOut size={16} />
                            <span className="hidden sm:inline">Exit</span>
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}
