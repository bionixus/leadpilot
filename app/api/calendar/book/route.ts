import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { CalendarService } from '@/lib/calendar';

// POST - Book a meeting
export async function POST(request: Request) {
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

  const body = await request.json();
  const {
    lead_id,
    calendar_account_id,
    title,
    description,
    duration_minutes,
    preferred_datetime,
    timezone,
  } = body;

  // Validate required fields
  if (!lead_id || !title) {
    return NextResponse.json({ error: 'lead_id and title are required' }, { status: 400 });
  }

  // Get lead info
  const { data: lead } = await supabase
    .from('leads')
    .select('email, first_name, last_name, timezone')
    .eq('id', lead_id)
    .eq('org_id', userTyped.org_id)
    .single();

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const leadTyped = lead as { email?: string | null; first_name?: string; last_name?: string; timezone?: string } | null;
  if (!leadTyped?.email) {
    return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 });
  }

  const calendarService = new CalendarService(supabase, userTyped.org_id);

  const result = await calendarService.bookMeeting(
    {
      lead_id,
      title,
      description,
      duration_minutes: duration_minutes || 30,
      preferred_datetime: preferred_datetime ? new Date(preferred_datetime) : undefined,
      timezone: timezone || leadTyped.timezone || 'UTC',
      attendee_email: leadTyped.email,
      attendee_name: `${leadTyped.first_name || ''} ${leadTyped.last_name || ''}`.trim() || 'Lead',
    },
    calendar_account_id
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Update lead status
  await supabase
    .from('leads')
    .update({ status: 'interested' } as never)
    .eq('id', lead_id);

  return NextResponse.json(result);
}
