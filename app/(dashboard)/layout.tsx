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
  Search,
  BarChart3,
  Bot,
  MessageSquare,
  Workflow,
} from 'lucide-react';
import { OnboardTrigger } from './OnboardTrigger';
import NotificationBell from './NotificationBell';
import OnboardingWrapper from './OnboardingWrapper';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  type UserData = { full_name?: string | null; organizations?: { name?: string } | null } | null;
  let user: { id: string; email?: string } | null = null;
  let userData: UserData = null;
  try {
    const supabase = await createServerSupabaseClient();
    const res = await supabase.auth.getUser();
    user = res.data.user;
    if (user) {
      const { data } = await supabase.from('users').select('*, organizations(*)').eq('auth_id', user.id).single();
      userData = data as UserData;
    }
  } catch {
    redirect('/login');
  }

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {!userData && <OnboardTrigger />}
      <aside className="w-64 bg-white border-r flex flex-col fixed h-full">
        <div className="p-4 border-b">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">LeadPilot</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/agent" icon={<Bot className="w-5 h-5" />}>Agent</NavLink>
          <NavLink href="/autopilot" icon={<Sparkles className="w-5 h-5" />}>Autopilot</NavLink>
          <NavLink href="/" icon={<LayoutDashboard className="w-5 h-5" />}>Campaigns</NavLink>
          <NavLink href="/analytics" icon={<BarChart3 className="w-5 h-5" />}>Analytics</NavLink>
          <NavLink href="/leads" icon={<Users className="w-5 h-5" />}>Leads</NavLink>
          <NavLink href="/scraping" icon={<Search className="w-5 h-5" />}>Scraping</NavLink>
          <NavLink href="/sequences" icon={<Workflow className="w-5 h-5" />}>Sequences</NavLink>
          <NavLink href="/inbox" icon={<Inbox className="w-5 h-5" />}>Inbox</NavLink>
          <NavLink href="/email-accounts" icon={<Mail className="w-5 h-5" />}>Email Accounts</NavLink>
          <NavLink href="/messaging" icon={<MessageSquare className="w-5 h-5" />}>Messaging</NavLink>
          <div className="pt-4 mt-4 border-t">
            <NavLink href="/settings" icon={<Settings className="w-5 h-5" />}>Settings</NavLink>
          </div>
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              {userData?.full_name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userData?.full_name || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">{userData?.organizations?.name || 'Organization'}</p>
            </div>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-64">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div />
          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
      <OnboardingWrapper userName={userData?.full_name ?? undefined} />
    </div>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-2 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors">
      {icon}
      <span className="font-medium">{children}</span>
    </Link>
  );
}
