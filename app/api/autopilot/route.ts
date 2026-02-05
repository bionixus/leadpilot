import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getLLMProviderForOrg } from '@/lib/llm';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AutopilotSession {
  id: string;
  org_id: string;
  user_id: string | null;
  status: string;
  conversation_history: ConversationMessage[];
  target_customer: string | null;
  target_countries: string[] | null;
  target_titles: string[] | null;
  company_size: string | null;
  competitors: string[] | null;
  business_description: string | null;
  benefits: string | null;
  cta: string | null;
  autopilot_level: string | null;
  leads_found: number;
  sequences_generated: number;
}

// GET - List autopilot sessions
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
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('autopilot_sessions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST - Create new session or continue conversation
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  const userId = (userData as { id?: string } | null)?.id;

  if (!orgId) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const { session_id, message, action } = body;

  // Handle special actions
  if (action) {
    return handleAction(supabase, orgId, session_id, action, body);
  }

  // Get or create session
  let session: AutopilotSession | null = null;
  if (session_id) {
    const { data } = await supabase
      .from('autopilot_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('org_id', orgId)
      .single();
    session = data as AutopilotSession | null;
  }

  if (!session) {
    // Create new session
    const { data, error } = await supabase
      .from('autopilot_sessions')
      .insert({
        org_id: orgId,
        user_id: userId,
        status: 'onboarding',
        conversation_history: [],
      } as never)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    session = data as AutopilotSession;
  }

  // Add user message to history
  const history: ConversationMessage[] = [...(session.conversation_history || [])];
  if (message) {
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Get LLM provider
    const provider = await getLLMProviderForOrg(supabase, orgId);

    // Build context-aware system prompt
    const systemPrompt = buildSystemPrompt(session);

    // Get AI response
    const response = await provider.chat([
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
    ]);

    // Add assistant response to history
    history.push({
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
    });

    // Extract structured data from conversation
    const extracted = await extractDataFromConversation(provider, history, session);

    // Determine new status
    const newStatus = determineStatus(session, extracted);

    // Update session
    const { data: updatedSession, error: updateError } = await supabase
      .from('autopilot_sessions')
      .update({
        conversation_history: history,
        status: newStatus,
        ...extracted,
      } as never)
      .eq('id', session.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      session: updatedSession,
      message: response.content,
      usage: response.usage,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

function buildSystemPrompt(session: AutopilotSession): string {
  const status = session.status;

  const basePrompt = `You are LeadPilot's AI assistant, helping users set up automated lead generation and outreach campaigns.

Your personality:
- Friendly and professional
- Concise but helpful
- Guide users step by step
- Ask one question at a time

Current session status: ${status}
`;

  if (status === 'onboarding') {
    return (
      basePrompt +
      `
You need to collect 5 pieces of information through natural conversation:
1. Target customer profile (who they sell to)
2. Target countries/regions
3. Target job titles
4. Company size preference (1-10, 11-50, 51-200, 201-500, 500+)
5. Top 3 competitors

Already collected:
- Target customer: ${session.target_customer || 'Not yet'}
- Countries: ${session.target_countries?.join(', ') || 'Not yet'}
- Titles: ${session.target_titles?.join(', ') || 'Not yet'}
- Company size: ${session.company_size || 'Not yet'}
- Competitors: ${session.competitors?.join(', ') || 'Not yet'}

Ask for the NEXT missing piece naturally. When all are collected, transition to asking for business details.`
    );
  }

  if (status === 'collecting_info') {
    return (
      basePrompt +
      `
You have the targeting info. Now collect:
1. Brief business description (what they do, their product/service)
2. Key benefits for customers
3. Preferred call-to-action (e.g., "book a demo", "schedule a call")

Already collected:
- Business description: ${session.business_description || 'Not yet'}
- Benefits: ${session.benefits || 'Not yet'}
- CTA: ${session.cta || 'Not yet'}

When done, summarize everything and ask which autopilot level they prefer:
- **Full Autopilot**: AI finds leads and sends automatically
- **Approve List First**: User approves lead list before AI proceeds
- **Approve Everything**: User approves leads AND content before sending`
    );
  }

  if (status === 'finding_leads') {
    return (
      basePrompt +
      `
Lead search is in progress. Keep the user informed about status.
Found so far: ${session.leads_found || 0} leads`
    );
  }

  if (status === 'awaiting_approval') {
    return (
      basePrompt +
      `
Waiting for user approval. 
- Leads found: ${session.leads_found}
- Sequences generated: ${session.sequences_generated}

Help them review and approve or make changes.`
    );
  }

  return basePrompt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractDataFromConversation(
  provider: any,
  history: ConversationMessage[],
  currentSession: AutopilotSession
): Promise<Partial<AutopilotSession>> {
  // Only extract after enough conversation
  if (history.length < 4) return {};

  const recentMessages = history
    .slice(-6)
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');

  const extractPrompt = `Based on this conversation, extract any new information mentioned.

CONVERSATION:
${recentMessages}

CURRENT DATA:
- target_customer: ${currentSession.target_customer || 'null'}
- target_countries: ${JSON.stringify(currentSession.target_countries || null)}
- target_titles: ${JSON.stringify(currentSession.target_titles || null)}
- company_size: ${currentSession.company_size || 'null'}
- competitors: ${JSON.stringify(currentSession.competitors || null)}
- business_description: ${currentSession.business_description || 'null'}
- benefits: ${currentSession.benefits || 'null'}
- cta: ${currentSession.cta || 'null'}
- autopilot_level: ${currentSession.autopilot_level || 'null'}

Return ONLY new information that was mentioned. Return JSON:
{
  "target_customer": "string or null",
  "target_countries": ["array"] or null,
  "target_titles": ["array"] or null,
  "company_size": "string or null",
  "competitors": ["array"] or null,
  "business_description": "string or null",
  "benefits": "string or null",
  "cta": "string or null",
  "autopilot_level": "full_autopilot|approve_list|approve_all or null"
}

Only include fields that have NEW values. Omit fields with no new info.`;

  try {
    const response = await provider.chat([
      { role: 'system', content: 'Extract structured data from conversation. Return valid JSON only.' },
      { role: 'user', content: extractPrompt },
    ]);

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      // Filter out null values
      return Object.fromEntries(
        Object.entries(extracted).filter(([, v]) => v !== null)
      ) as Partial<AutopilotSession>;
    }
  } catch (e) {
    console.error('Failed to extract data:', e);
  }

  return {};
}

function determineStatus(
  session: AutopilotSession,
  extracted: Partial<AutopilotSession>
): string {
  const merged = { ...session, ...extracted };

  // Check if all onboarding questions answered
  const onboardingComplete =
    merged.target_customer &&
    merged.target_countries &&
    merged.target_countries.length > 0 &&
    merged.target_titles &&
    merged.target_titles.length > 0 &&
    merged.company_size &&
    merged.competitors &&
    merged.competitors.length > 0;

  // Check if business info complete
  const businessInfoComplete =
    merged.business_description && merged.benefits && merged.cta;

  // Check if autopilot level selected
  const autopilotSelected = merged.autopilot_level;

  if (!onboardingComplete) return 'onboarding';
  if (!businessInfoComplete) return 'collecting_info';
  if (!autopilotSelected) return 'collecting_info';

  // Ready to proceed
  if (session.status === 'collecting_info' && autopilotSelected) {
    return 'finding_leads';
  }

  return session.status;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAction(
  supabase: any,
  orgId: string,
  sessionId: string,
  action: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  switch (action) {
    case 'approve_leads': {
      const { lead_ids } = body as { lead_ids: string[] };
      await supabase
        .from('leads')
        .update({ status: 'sequenced' } as never)
        .in('id', lead_ids);

      await supabase
        .from('autopilot_sessions')
        .update({ leads_approved: lead_ids.length } as never)
        .eq('id', sessionId);

      return NextResponse.json({ success: true, approved: lead_ids.length });
    }

    case 'approve_sequences': {
      const { data: session } = await supabase
        .from('autopilot_sessions')
        .select('campaign_id')
        .eq('id', sessionId)
        .single();

      if (session?.campaign_id) {
        await supabase
          .from('sequences')
          .update({ is_approved: true, approved_at: new Date().toISOString() } as never)
          .eq('campaign_id', session.campaign_id);
      }

      return NextResponse.json({ success: true });
    }

    case 'start_sending': {
      await supabase
        .from('autopilot_sessions')
        .update({ status: 'sending' } as never)
        .eq('id', sessionId);

      return NextResponse.json({ success: true, status: 'sending' });
    }

    case 'pause': {
      await supabase
        .from('autopilot_sessions')
        .update({ status: 'paused' } as never)
        .eq('id', sessionId);

      return NextResponse.json({ success: true, status: 'paused' });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
