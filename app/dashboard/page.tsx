import { redirect } from 'next/navigation';

// Legacy unauthenticated console; the secured staff dashboard replaces it.
export default function Dashboard() {
    redirect('/admin/dashboard');
}
