import AppLayout from '@/components/layout/AppLayout';
import SidebarNavigation from '../../../components/AdminNavigation';

export default function AdminPageAdmins() {
    return (
        <AppLayout>
            <SidebarNavigation />
            <main className="p-4">
                <h1 className="text-2xl font-bold text-purple-400">Admins Dashboard</h1>
            </main>
        </AppLayout>
    );
}