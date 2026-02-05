import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { CalendarService } from '@/lib/calendar';

// GET - Get available time slots
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const userTyped = userData as { org_id?: string | null } | null;
  if (!userTyped?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('account_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const duration = searchParams.get('duration_minutes');
  const timezone = searchParams.get('timezone') || 'UTC';

  const calendarService = new CalendarService(supabase, userTyped.org_id);

  try {
    const slots = await calendarService.getAvailability(
      {
        start_date: startDate ? new Date(startDate) : new Date(),
        end_date: endDate ? new Date(endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        duration_minutes: duration ? parseInt(duration) : 30,
        timezone,
      },
      accountId || undefined
    );

    return NextResponse.json({ slots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
