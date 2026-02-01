import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import AIChatSupport from '@/components/AIChatSupport';

export const metadata: Metadata = {
    title: 'JanNivaran - Citizen Grievance Portal',
    description: 'Next-Gen Grievance Redressal System',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="antialiased min-h-screen">
                <AuthProvider>
                    {children}
                    <AIChatSupport />
                </AuthProvider>
            </body>
        </html>
    );
}
