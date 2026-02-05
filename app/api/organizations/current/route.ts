import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { BusinessContext } from '@/types/database';

/** GET: return current user's organization (name, slug, business_context, settings). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, business_context, settings')
    .eq('id', orgId)
    .single();

  if (error || !org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  return NextResponse.json(org);
}

/** PATCH: update current user's organization (name, business_context). */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const updates: { name?: string; business_context?: BusinessContext } = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if (body.business_context && typeof body.business_context === 'object') {
    updates.business_context = body.business_context as BusinessContext;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .update(updates as never)
    .eq('id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(org);
}
