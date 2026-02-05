# Phase 6: Autopilot Chat Interface

> **Objective**: Build the conversational AI interface that guides users through lead generation and outreach setup.

---

## 6.1 Overview

The Autopilot Chat is the core differentiator of LeadPilot. It provides:

1. **Conversational Onboarding**: AI asks 5 key questions to understand the user's needs
2. **Business Context Collection**: Gathers details about benefits, advantages, and CTA
3. **Autopilot Level Selection**: User chooses how much control they want
4. **Progress Tracking**: Shows status of lead finding and sequence generation
5. **Approval Flow**: Users can approve leads and content before sending

---

## 6.2 The 5 Questions

The AI will ask these questions to understand the user's target audience:

1. **Target Customer**: "Who is your ideal customer? (e.g., 'Marketing managers at B2B SaaS companies')"
2. **Countries**: "Which countries are you targeting? (e.g., 'US, UK, Canada')"
3. **Job Titles**: "What job titles should I look for? (e.g., 'CEO, Founder, CMO')"
4. **Company Size**: "What company size are you targeting? (e.g., '11-50 employees')"
5. **Competitors**: "Who are your top 3 competitors? (helps with personalization)"

After these, the AI will ask for:
- Business description
- Key benefits and advantages
- Preferred call-to-action

---

## 6.3 Autopilot Session API

### File: `app/api/autopilot/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getLLMProviderForOrg } from '@/lib/llm';

// GET - List autopilot sessions
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('autopilot_sessions')
    .select('*')
    .eq('org_id', userData!.org_id)
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  if (!userData?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const { session_id, message, action } = body;

  // Handle special actions
  if (action) {
    return handleAction(supabase, userData.org_id, session_id, action, body);
  }

  // Get or create session
  let session;
  if (session_id) {
    const { data } = await supabase
      .from('autopilot_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('org_id', userData.org_id)
      .single();
    session = data;
  }

  if (!session) {
    // Create new session
    const { data, error } = await supabase
      .from('autopilot_sessions')
      .insert({
        org_id: userData.org_id,
        user_id: userData.id,
        status: 'onboarding',
        conversation_history: [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    session = data;
  }

  // Add user message to history
  const history = [...(session.conversation_history || [])];
  if (message) {
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });
  }

  // Get LLM provider
  const provider = await getLLMProviderForOrg(supabase, userData.org_id);

  // Build context-aware system prompt
  const systemPrompt = buildSystemPrompt(session);

  // Get AI response
  const response = await provider.chat([
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({
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
    })
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
}

function buildSystemPrompt(session: any): string {
  const status = session.status;
  
  const basePrompt = `You are LeadPilot's AI assistant, helping users set up automated lead generation and outreach campaigns.

Your personality:
- Friendly and professional
- Concise but helpful
- Guide users step by step
- Ask one question at a time

Current session status: ${status}
`;

  // Add context based on status
  if (status === 'onboarding') {
    return basePrompt + `
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

Ask for the NEXT missing piece naturally. When all are collected, ask for business details (description, benefits, CTA).`;
  }

  if (status === 'collecting_info') {
    return basePrompt + `
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
- **Approve Everything**: User approves leads AND content before sending`;
  }

  if (status === 'finding_leads') {
    return basePrompt + `
Lead search is in progress. Keep the user informed about status.
Found so far: ${session.leads_found || 0} leads`;
  }

  if (status === 'awaiting_approval') {
    return basePrompt + `
Waiting for user approval. 
- Leads found: ${session.leads_found}
- Sequences generated: ${session.sequences_generated}

Help them review and approve or make changes.`;
  }

  return basePrompt;
}

async function extractDataFromConversation(
  provider: any,
  history: any[],
  currentSession: any
): Promise<any> {
  // Only extract after enough conversation
  if (history.length < 4) return {};

  const recentMessages = history.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');

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
        Object.entries(extracted).filter(([_, v]) => v !== null)
      );
    }
  } catch (e) {
    console.error('Failed to extract data:', e);
  }

  return {};
}

function determineStatus(session: any, extracted: any): string {
  const merged = { ...session, ...extracted };
  
  // Check if all onboarding questions answered
  const onboardingComplete = 
    merged.target_customer &&
    merged.target_countries?.length > 0 &&
    merged.target_titles?.length > 0 &&
    merged.company_size &&
    merged.competitors?.length > 0;

  // Check if business info complete
  const businessInfoComplete =
    merged.business_description &&
    merged.benefits &&
    merged.cta;

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

async function handleAction(
  supabase: any,
  orgId: string,
  sessionId: string,
  action: string,
  body: any
): Promise<NextResponse> {
  switch (action) {
    case 'approve_leads':
      // Approve selected leads
      const { lead_ids } = body;
      await supabase
        .from('leads')
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .in('id', lead_ids);
      
      // Update session
      await supabase
        .from('autopilot_sessions')
        .update({ leads_approved: lead_ids.length })
        .eq('id', sessionId);
      
      return NextResponse.json({ success: true, approved: lead_ids.length });

    case 'approve_sequences':
      // Approve all sequences for session
      const { data: session } = await supabase
        .from('autopilot_sessions')
        .select('campaign_id')
        .eq('id', sessionId)
        .single();
      
      await supabase
        .from('sequences')
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq('campaign_id', session.campaign_id);
      
      return NextResponse.json({ success: true });

    case 'start_sending':
      // Update session status to sending
      await supabase
        .from('autopilot_sessions')
        .update({ status: 'sending' })
        .eq('id', sessionId);
      
      // Could trigger the campaign start here
      return NextResponse.json({ success: true, status: 'sending' });

    case 'pause':
      await supabase
        .from('autopilot_sessions')
        .update({ status: 'paused' })
        .eq('id', sessionId);
      return NextResponse.json({ success: true, status: 'paused' });

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
```

---

## 6.4 Autopilot Session Detail API

### File: `app/api/autopilot/[id]/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { data, error } = await supabase
    .from('autopilot_sessions')
    .select(`
      *,
      campaigns (
        id,
        name,
        status,
        stats
      )
    `)
    .eq('id', params.id)
    .eq('org_id', userData!.org_id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { error } = await supabase
    .from('autopilot_sessions')
    .delete()
    .eq('id', params.id)
    .eq('org_id', userData!.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## 6.5 Chat UI Page

### File: `app/(dashboard)/autopilot/page.tsx`

```typescript
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Bot,
  User,
  Loader2,
  Settings2,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  Users,
  FileText,
  Zap,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  status: string;
  target_customer?: string;
  target_countries?: string[];
  target_titles?: string[];
  company_size?: string;
  competitors?: string[];
  business_description?: string;
  benefits?: string;
  cta?: string;
  autopilot_level?: string;
  leads_found?: number;
  sequences_generated?: number;
  conversation_history: Message[];
}

const STATUS_CONFIG = {
  onboarding: { label: 'Setting up', color: 'blue', icon: Settings2 },
  collecting_info: { label: 'Collecting info', color: 'blue', icon: FileText },
  finding_leads: { label: 'Finding leads', color: 'yellow', icon: Users },
  generating: { label: 'Generating', color: 'yellow', icon: Zap },
  awaiting_approval: { label: 'Awaiting approval', color: 'orange', icon: Clock },
  sending: { label: 'Sending', color: 'green', icon: Send },
  paused: { label: 'Paused', color: 'gray', icon: Clock },
  completed: { label: 'Completed', color: 'green', icon: CheckCircle2 },
};

export default function AutopilotPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Welcome to LeadPilot Autopilot! 🚀

I'm here to help you find leads and create personalized outreach campaigns.

Here's how this works:
1. I'll ask you a few questions about your ideal customers
2. You'll tell me about your business and what you're offering
3. You choose how much control you want (full autopilot or review first)
4. I'll find leads, write personalized sequences, and send them for you

**Ready to get started?** Tell me about your ideal customer. For example:
- "Marketing managers at B2B SaaS companies"
- "Founders of early-stage startups"
- "HR directors at enterprise companies"`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    setLoading(true);

    try {
      const response = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session?.id,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setSession(data.session);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, session?.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewSession = () => {
    setSession(null);
    setMessages([
      {
        role: 'assistant',
        content: `Let's start fresh! Tell me about your ideal customer.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const statusConfig = session?.status ? STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] : null;

  return (
    <div className="h-[calc(100vh-120px)] flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autopilot</h1>
            <p className="text-gray-500">Chat with AI to find leads and create outreach</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="openai">GPT-4 (OpenAI)</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="deepseek">DeepSeek</option>
              <option value="groq">Groq (Fast)</option>
            </select>
            <button
              onClick={startNewSession}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-6 h-6 text-blue-600" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-5 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <p
                    className={`text-xs mt-2 ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <span className="text-gray-500">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session Status Sidebar */}
      {session && (
        <div className="w-80 ml-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
            <h3 className="font-semibold text-gray-900 mb-4">Session Progress</h3>
            
            {/* Status Badge */}
            {statusConfig && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-${statusConfig.color}-50 text-${statusConfig.color}-700 mb-4`}>
                <statusConfig.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{statusConfig.label}</span>
              </div>
            )}

            {/* Collected Info */}
            <div className="space-y-3">
              <InfoItem
                label="Target Customer"
                value={session.target_customer}
              />
              <InfoItem
                label="Countries"
                value={session.target_countries?.join(', ')}
              />
              <InfoItem
                label="Job Titles"
                value={session.target_titles?.join(', ')}
              />
              <InfoItem
                label="Company Size"
                value={session.company_size}
              />
              <InfoItem
                label="Competitors"
                value={session.competitors?.join(', ')}
              />
              
              {session.business_description && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <InfoItem
                    label="Business"
                    value={session.business_description}
                  />
                  <InfoItem
                    label="Benefits"
                    value={session.benefits}
                  />
                  <InfoItem
                    label="CTA"
                    value={session.cta}
                  />
                </>
              )}

              {session.autopilot_level && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <InfoItem
                    label="Autopilot Level"
                    value={
                      session.autopilot_level === 'full_autopilot'
                        ? 'Full Autopilot'
                        : session.autopilot_level === 'approve_list'
                        ? 'Approve List First'
                        : 'Approve Everything'
                    }
                  />
                </>
              )}

              {(session.leads_found || session.sequences_generated) && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {session.leads_found || 0}
                      </div>
                      <div className="text-xs text-gray-500">Leads Found</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {session.sequences_generated || 0}
                      </div>
                      <div className="text-xs text-gray-500">Sequences</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            {session.status === 'awaiting_approval' && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => router.push(`/autopilot/${session.id}/review`)}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  Review & Approve
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}
```

---

## 6.6 Lead Approval Page

### File: `app/(dashboard)/autopilot/[id]/review/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check,
  X,
  ArrowLeft,
  Send,
  Users,
  Mail,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job_title: string;
  is_approved: boolean;
}

interface Sequence {
  id: string;
  lead_id: string;
  steps: any[];
  is_approved: boolean;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get session
      const sessionRes = await fetch(`/api/autopilot/${sessionId}`);
      const sessionData = await sessionRes.json();
      setSession(sessionData);

      // Get leads for this session's campaign
      if (sessionData.campaign_id) {
        const leadsRes = await fetch(`/api/leads?campaign_id=${sessionData.campaign_id}`);
        const leadsData = await leadsRes.json();
        setLeads(leadsData);
        
        // Pre-select all leads
        setSelectedLeads(new Set(leadsData.map((l: Lead) => l.id)));

        // Get sequences
        const seqRes = await fetch(`/api/sequences?campaign_id=${sessionData.campaign_id}`);
        const seqData = await seqRes.json();
        setSequences(seqData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const toggleAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const approveAndStart = async () => {
    setApproving(true);
    try {
      // Approve selected leads
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve_leads',
          lead_ids: Array.from(selectedLeads),
        }),
      });

      // Approve sequences
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve_sequences',
        }),
      });

      // Start sending
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'start_sending',
        }),
      });

      router.push('/autopilot');
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review & Approve</h1>
            <p className="text-gray-500">
              Review leads and sequences before sending
            </p>
          </div>
        </div>
        <button
          onClick={approveAndStart}
          disabled={approving || selectedLeads.size === 0}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {approving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Approving...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Approve & Start ({selectedLeads.size})
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{leads.length}</div>
              <div className="text-sm text-gray-500">Total Leads</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{selectedLeads.size}</div>
              <div className="text-sm text-gray-500">Selected</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{sequences.length}</div>
              <div className="text-sm text-gray-500">Sequences</div>
            </div>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Leads to Contact</h2>
          <button
            onClick={toggleAll}
            className="text-sm text-blue-600 hover:underline"
          >
            {selectedLeads.size === leads.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="divide-y">
          {leads.map((lead) => {
            const sequence = sequences.find(s => s.lead_id === lead.id);
            const isExpanded = expandedSequence === lead.id;

            return (
              <div key={lead.id}>
                <div
                  className={`px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 ${
                    selectedLeads.has(lead.id) ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleLead(lead.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedLeads.has(lead.id)
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedLeads.has(lead.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="font-medium">
                      {lead.first_name} {lead.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {lead.job_title} at {lead.company}
                    </div>
                    <div className="text-sm text-gray-400">{lead.email}</div>
                  </div>

                  {sequence && (
                    <button
                      onClick={() =>
                        setExpandedSequence(isExpanded ? null : lead.id)
                      }
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                    >
                      View sequence
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Expanded Sequence Preview */}
                {isExpanded && sequence && (
                  <div className="px-6 py-4 bg-gray-50 border-t">
                    <div className="space-y-4">
                      {sequence.steps.map((step: any, i: number) => (
                        <div key={i} className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                            {step.step}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">
                                {step.channel}
                              </span>
                              <span className="text-xs text-gray-500">
                                Day {step.delay_days}
                              </span>
                            </div>
                            {step.subject && (
                              <div className="font-medium text-sm mb-1">
                                {step.subject}
                              </div>
                            )}
                            <div className="text-sm text-gray-600 whitespace-pre-wrap">
                              {step.body}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

---

## 6.7 Verification Checklist

After completing Phase 6, verify:

- [ ] `/api/autopilot` POST creates new sessions
- [ ] Conversations persist across messages
- [ ] AI asks appropriate questions based on status
- [ ] Structured data is extracted from conversations
- [ ] Session status progresses correctly
- [ ] Chat UI displays messages properly
- [ ] Provider selector works
- [ ] Sidebar shows collected info
- [ ] Review page loads leads and sequences
- [ ] Lead selection works
- [ ] Approve & Start triggers correct actions

---

## Next Steps

Once Phase 6 is complete, proceed to:
- **Phase 7**: Lead Finding (Apify integration)
- **Phase 8**: Multi-Channel (WhatsApp/SMS via Twilio)
