import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { AVAILABLE_MODELS, PROVIDER_NAMES, type LLMProviderName } from '@/lib/llm';

// GET - Get current LLM settings
export async function GET() {
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

  const { data: org } = await supabase
    .from('organizations')
    .select('llm_provider, llm_settings, llm_api_key_encrypted')
    .eq('id', orgId)
    .single();

  const orgData = org as {
    llm_provider?: string | null;
    llm_settings?: Record<string, unknown> | null;
    llm_api_key_encrypted?: string | null;
  } | null;

  // Don't return the encrypted API key, just indicate if one is set
  return NextResponse.json({
    provider: orgData?.llm_provider || 'anthropic',
    settings: orgData?.llm_settings || {},
    hasCustomApiKey: !!orgData?.llm_api_key_encrypted,
    availableProviders: Object.entries(PROVIDER_NAMES).map(([id, name]) => ({
      id,
      name,
      models: AVAILABLE_MODELS[id as LLMProviderName],
    })),
  });
}

// PATCH - Update LLM settings
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  const userRole = (userData as { role?: string } | null)?.role;
  if (!orgId) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  // Only owners and admins can change LLM settings
  if (!['owner', 'admin'].includes(userRole || '')) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  const body = await request.json();
  const { provider, apiKey, settings } = body;

  const updateData: Record<string, unknown> = {};

  if (provider) {
    // Validate provider
    if (!['anthropic', 'openai', 'gemini', 'deepseek', 'groq'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    updateData.llm_provider = provider;
  }

  if (apiKey !== undefined) {
    // Empty string = remove custom key, non-empty = encrypt and store
    updateData.llm_api_key_encrypted = apiKey ? encrypt(apiKey) : null;
  }

  if (settings) {
    updateData.llm_settings = settings;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(updateData as never)
    .eq('id', orgId)
    .select('llm_provider, llm_settings, llm_api_key_encrypted')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const responseData = data as {
    llm_provider?: string | null;
    llm_settings?: Record<string, unknown> | null;
    llm_api_key_encrypted?: string | null;
  } | null;

  return NextResponse.json({
    provider: responseData?.llm_provider,
    settings: responseData?.llm_settings,
    hasCustomApiKey: !!responseData?.llm_api_key_encrypted,
  });
}
