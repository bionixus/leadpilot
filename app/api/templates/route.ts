import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List templates
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;

  const { searchParams } = new URL(request.url);
  const industry = searchParams.get('industry');
  const useCase = searchParams.get('use_case');

  let query = supabase
    .from('sequence_templates')
    .select('*')
    .or(`is_public.eq.true,org_id.eq.${orgId},org_id.is.null`);

  if (industry) query = query.eq('industry', industry);
  if (useCase) query = query.eq('use_case', useCase);

  const { data, error } = await query.order('usage_count', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create template
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  const body = await request.json();
  const { name, description, industry, use_case, steps, channels } = body;

  if (!name || !steps) {
    return NextResponse.json({ error: 'Name and steps are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sequence_templates')
    .insert({
      org_id: orgId,
      name,
      description,
      industry,
      use_case,
      steps,
      channels: channels || ['email'],
      is_public: false,
      is_system: false,
    } as never)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
