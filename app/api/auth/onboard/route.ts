import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ensureUserAndOrg } from '@/lib/supabase/ensure-user-org';
import { NextResponse } from 'next/server';

/** Creates an organization and public.users row for the current auth user (e.g. after sign-up). */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const result = await ensureUserAndOrg(admin, user);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Onboard error:', e);
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}
