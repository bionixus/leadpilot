import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getLLMProviderForOrg } from '@/lib/llm';

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
  if (!orgId) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { prompt } = body;

  try {
    const provider = await getLLMProviderForOrg(supabase, orgId);

    const response = await provider.chat([
      { role: 'system', content: 'You are a helpful assistant. Be concise.' },
      { role: 'user', content: prompt || 'Say hello in one sentence.' },
    ]);

    return NextResponse.json({
      success: true,
      provider: provider.name,
      response: response.content,
      usage: response.usage,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
