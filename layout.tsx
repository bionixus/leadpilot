import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  Zap,
  LayoutDashboard,
  Users,
  Mail,
  Inbox,
  Settings,
  LogOut,
  Sparkles,
  Bell,
} from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  // Get user's organization
  const { data: userRow } = await supabase
    .from('users')
    .select('*, organizations(*)')
    .eq('auth_id', user.id)
    .single();
  const userData = userRow as { full_name?: string | null; organizations?: { name?: string | null } | null } | null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col fixed h-full">
        {/* Logo */}
        <div className="p-4 border-b">
          <Link href="/campaigns" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">LeadPilot</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/campaigns" icon={<LayoutDashboard className="w-5 h-5" />}>
            Campaigns
          </NavLink>
          <NavLink href="/leads" icon={<Users className="w-5 h-5" />}>
            Leads
          </NavLink>
          <NavLink href="/sequences" icon={<Sparkles className="w-5 h-5" />}>
            Sequences
          </NavLink>
          <NavLink href="/inbox" icon={<Inbox className="w-5 h-5" />}>
            Inbox
          </NavLink>
          <NavLink href="/email-accounts" icon={<Mail className="w-5 h-5" />}>
            Email Accounts
          </NavLink>
          
          <div className="pt-4 mt-4 border-t">
            <NavLink href="/settings" icon={<Settings className="w-5 h-5" />}>
              Settings
            </NavLink>
          </div>
        </nav>

        {/* User */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              {(userData?.full_name?.charAt(0) || user.email?.charAt(0))?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {userData?.full_name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {userData?.organizations?.name || 'Organization'}
              </p>
            </div>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        {/* Top bar */}
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            {/* Breadcrumb or page title will go here */}
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>
        
        {/* Page content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {icon}
      <span className="font-medium">{children}</span>
    </Link>
  );
}
