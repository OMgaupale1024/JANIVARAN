import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ServiceCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    category: string;
}

export default function ServiceCard({ title, description, icon: Icon, category }: ServiceCardProps) {
    return (
        <div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-noble-dark/10 hover:bg-white/80 transition-all duration-300 group cursor-pointer h-full flex flex-col justify-between">
            <div>
                <div className="mb-6 text-noble-dark group-hover:scale-110 transition-transform origin-left">
                    <Icon size={32} />
                </div>
                <div className="bg-transparent mb-4">
                    <h4 className="text-xl font-medium text-noble-dark mb-2">{category}</h4>
                </div>

                <h3 className="text-2xl font-serif text-noble-dark mb-4">{title}</h3>
            </div>

            <div>
                <div className="h-px w-FULL bg-noble-dark/10 my-4"></div>
                <p className="text-noble-dark/70 text-sm leading-relaxed">{description}</p>
            </div>
        </div>
    );
}
