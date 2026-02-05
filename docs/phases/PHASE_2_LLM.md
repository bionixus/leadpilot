# Phase 2: Multi-LLM System

> **Objective**: Implement provider-agnostic LLM system supporting Anthropic, OpenAI, Gemini, DeepSeek, and Groq.

---

## 2.1 Overview

The LLM system needs to:
1. Support multiple providers with a common interface
2. Allow organizations to use their own API keys
3. Handle sequence generation and reply classification
4. Track token usage for billing

---

## 2.2 LLM Types

### File: `src/lib/llm/types.ts`

```typescript
// Message format for chat completions
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Response from any LLM provider
export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model?: string;
  finishReason?: string;
}

// Sequence step for outreach
export interface SequenceStep {
  step: number;
  delay_days: number;
  channel: 'email' | 'whatsapp' | 'sms';
  subject?: string;  // Email only
  body: string;
}

// Full generated sequence
export interface GeneratedSequence {
  steps: SequenceStep[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: string;
  model: string;
}

// Reply classification result
export interface ReplyClassification {
  classification: 'interested' | 'not_interested' | 'question' | 'out_of_office' | 'bounce' | 'unsubscribe' | 'other';
  confidence: number;
  reason: string;
  suggestedAction?: 'follow_up' | 'stop_sequence' | 'escalate' | 'none';
}

// Provider configuration
export interface LLMProviderConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Common interface all providers must implement
export interface LLMProvider {
  name: string;
  
  // Basic chat completion
  chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse>;
  
  // Generate personalized outreach sequence
  generateSequence(
    lead: LeadContext,
    business: BusinessContext,
    options: SequenceOptions
  ): Promise<GeneratedSequence>;
  
  // Classify incoming reply
  classifyReply(
    replyContent: string,
    originalOutreach: string,
    leadContext?: LeadContext
  ): Promise<ReplyClassification>;
}

// Context for sequence generation
export interface LeadContext {
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  industry?: string;
  linkedinUrl?: string;
  customFields?: Record<string, string>;
}

export interface BusinessContext {
  companyName: string;
  industry?: string;
  valueProposition: string;
  targetAudience?: string;
  keyBenefits?: string[];
  painPointsSolved?: string[];
  caseStudies?: string[];
  tone?: 'professional' | 'casual' | 'friendly' | 'formal';
  senderName: string;
  senderTitle?: string;
  cta?: string;
}

export interface SequenceOptions {
  numberOfSteps: number;
  channels: ('email' | 'whatsapp' | 'sms')[];
  delayDays?: number[];  // Custom delays between steps
  includeSubjects?: boolean;  // For email
  language?: string;
  templateId?: string;  // Use as base template
}

export type LLMProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq';
```

---

## 2.3 Base Provider Class

### File: `src/lib/llm/base.ts`

```typescript
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMProviderConfig,
  GeneratedSequence,
  ReplyClassification,
  LeadContext,
  BusinessContext,
  SequenceOptions,
} from './types';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;
  
  abstract chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse>;
  
  // Shared sequence generation logic
  async generateSequence(
    lead: LeadContext,
    business: BusinessContext,
    options: SequenceOptions
  ): Promise<GeneratedSequence> {
    const prompt = this.buildSequencePrompt(lead, business, options);
    
    const response = await this.chat([
      {
        role: 'system',
        content: `You are an expert cold outreach copywriter. Generate personalized ${options.numberOfSteps}-step outreach sequences.

Rules:
- Be concise and value-focused
- Personalize using provided lead information
- Each step should build on the previous
- Include clear calls-to-action
- Tone: ${business.tone || 'professional'}
- Always respond with valid JSON only, no markdown`
      },
      { role: 'user', content: prompt }
    ]);
    
    const parsed = this.parseSequenceResponse(response.content);
    
    return {
      steps: parsed,
      usage: response.usage,
      provider: this.name,
      model: response.model || 'unknown',
    };
  }
  
  // Shared classification logic
  async classifyReply(
    replyContent: string,
    originalOutreach: string,
    leadContext?: LeadContext
  ): Promise<ReplyClassification> {
    const prompt = `Classify this email reply to a cold outreach.

ORIGINAL OUTREACH:
${originalOutreach}

REPLY:
${replyContent}

${leadContext ? `LEAD INFO: ${leadContext.firstName} ${leadContext.lastName} at ${leadContext.company}` : ''}

Classify as one of:
- INTERESTED: Positive response, wants to learn more or schedule a call
- NOT_INTERESTED: Clear rejection or negative response
- QUESTION: Asking for more information
- OUT_OF_OFFICE: Auto-reply or vacation message
- BOUNCE: Delivery failure notification
- UNSUBSCRIBE: Request to stop emails
- OTHER: Doesn't fit other categories

Return JSON only:
{
  "classification": "...",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation",
  "suggestedAction": "follow_up|stop_sequence|escalate|none"
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You classify email replies. Respond with valid JSON only, no markdown or explanation.'
      },
      { role: 'user', content: prompt }
    ]);
    
    return this.parseClassificationResponse(response.content);
  }
  
  // Build the sequence generation prompt
  protected buildSequencePrompt(
    lead: LeadContext,
    business: BusinessContext,
    options: SequenceOptions
  ): string {
    const channels = options.channels.join(', ');
    const delays = options.delayDays || [0, 3, 5, 7, 10].slice(0, options.numberOfSteps);
    
    return `Generate a ${options.numberOfSteps}-step outreach sequence for:

LEAD:
- Name: ${lead.firstName || 'there'} ${lead.lastName || ''}
- Company: ${lead.company || 'their company'}
- Title: ${lead.jobTitle || 'professional'}
- Industry: ${lead.industry || 'unknown'}
${lead.customFields ? `- Custom: ${JSON.stringify(lead.customFields)}` : ''}

BUSINESS:
- Company: ${business.companyName}
- Value Proposition: ${business.valueProposition}
- Key Benefits: ${business.keyBenefits?.join(', ') || 'Not specified'}
- Pain Points Solved: ${business.painPointsSolved?.join(', ') || 'Not specified'}
- Sender: ${business.senderName}${business.senderTitle ? `, ${business.senderTitle}` : ''}
- CTA: ${business.cta || 'Schedule a call'}

REQUIREMENTS:
- Channels: ${channels}
- Delays between steps (days): ${delays.join(', ')}
${options.includeSubjects ? '- Include email subjects' : ''}
${options.language ? `- Language: ${options.language}` : ''}

Return JSON:
{
  "steps": [
    {
      "step": 1,
      "delay_days": ${delays[0]},
      "channel": "email",
      "subject": "Subject line here",
      "body": "Email body with {{firstName}} placeholders if needed"
    },
    ...
  ]
}`;
  }
  
  // Parse sequence JSON from response
  protected parseSequenceResponse(content: string): any[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.steps || parsed.emails || parsed.sequence || [];
    } catch (error) {
      console.error('Failed to parse sequence response:', content);
      throw new Error('Invalid sequence response format');
    }
  }
  
  // Parse classification JSON from response
  protected parseClassificationResponse(content: string): ReplyClassification {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        classification: parsed.classification?.toLowerCase() || 'other',
        confidence: parsed.confidence || 0.5,
        reason: parsed.reason || 'Unknown',
        suggestedAction: parsed.suggestedAction || 'none',
      };
    } catch (error) {
      console.error('Failed to parse classification response:', content);
      return {
        classification: 'other',
        confidence: 0,
        reason: 'Failed to parse response',
        suggestedAction: 'none',
      };
    }
  }
}
```

---

## 2.4 Anthropic Provider

### File: `src/lib/llm/anthropic.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class AnthropicProvider extends BaseLLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';
  
  constructor(apiKey?: string) {
    super();
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }
  
  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    // Separate system message from others
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    try {
      const response = await this.client.messages.create({
        model: config?.model || this.defaultModel,
        max_tokens: config?.maxTokens || 4096,
        temperature: config?.temperature,
        system: systemMessage?.content || '',
        messages: otherMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });
      
      const textContent = response.content.find(c => c.type === 'text');
      
      return {
        content: textContent?.text || '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason || undefined,
      };
    } catch (error: any) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}
```

---

## 2.5 OpenAI Provider

### File: `src/lib/llm/openai.ts`

```typescript
import OpenAI from 'openai';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  private client: OpenAI;
  private defaultModel = 'gpt-4o';
  
  constructor(apiKey?: string) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }
  
  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model || this.defaultModel,
        max_tokens: config?.maxTokens || 4096,
        temperature: config?.temperature,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });
      
      const choice = response.choices[0];
      
      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
        model: response.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}
```

---

## 2.6 Gemini Provider

### File: `src/lib/llm/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-1.5-pro';
  
  constructor(apiKey?: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_AI_API_KEY!);
  }
  
  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    try {
      const model = this.client.getGenerativeModel({
        model: config?.model || this.defaultModel,
      });
      
      // Convert messages to Gemini format
      const systemInstruction = messages.find(m => m.role === 'system')?.content;
      const history = messages
        .filter(m => m.role !== 'system')
        .slice(0, -1)
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      
      const lastMessage = messages.filter(m => m.role !== 'system').slice(-1)[0];
      
      const chat = model.startChat({
        history,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      });
      
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      
      return {
        content: response.text(),
        usage: response.usageMetadata ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        } : undefined,
        model: config?.model || this.defaultModel,
      };
    } catch (error: any) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}
```

---

## 2.7 DeepSeek Provider

### File: `src/lib/llm/deepseek.ts`

```typescript
import OpenAI from 'openai';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

// DeepSeek uses OpenAI-compatible API
export class DeepSeekProvider extends BaseLLMProvider {
  name = 'deepseek';
  private client: OpenAI;
  private defaultModel = 'deepseek-chat';
  
  constructor(apiKey?: string) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  
  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model || this.defaultModel,
        max_tokens: config?.maxTokens || 4096,
        temperature: config?.temperature,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });
      
      const choice = response.choices[0];
      
      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
        model: response.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: any) {
      console.error('DeepSeek API error:', error);
      throw new Error(`DeepSeek API error: ${error.message}`);
    }
  }
}
```

---

## 2.8 Groq Provider

### File: `src/lib/llm/groq.ts`

```typescript
import Groq from 'groq-sdk';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class GroqProvider extends BaseLLMProvider {
  name = 'groq';
  private client: Groq;
  private defaultModel = 'llama-3.3-70b-versatile';
  
  constructor(apiKey?: string) {
    super();
    this.client = new Groq({
      apiKey: apiKey || process.env.GROQ_API_KEY,
    });
  }
  
  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model || this.defaultModel,
        max_tokens: config?.maxTokens || 4096,
        temperature: config?.temperature,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });
      
      const choice = response.choices[0];
      
      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
        model: response.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: any) {
      console.error('Groq API error:', error);
      throw new Error(`Groq API error: ${error.message}`);
    }
  }
}
```

---

## 2.9 LLM Factory

### File: `src/lib/llm/index.ts`

```typescript
import type { LLMProvider, LLMProviderName } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { DeepSeekProvider } from './deepseek';
import { GroqProvider } from './groq';

// Create provider instance
export function getLLMProvider(
  provider: LLMProviderName,
  apiKey?: string
): LLMProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'gemini':
      return new GeminiProvider(apiKey);
    case 'deepseek':
      return new DeepSeekProvider(apiKey);
    case 'groq':
      return new GroqProvider(apiKey);
    default:
      // Default to Anthropic
      return new AnthropicProvider(apiKey);
  }
}

// Get provider from organization settings
export async function getLLMProviderForOrg(
  supabase: any,
  orgId: string
): Promise<LLMProvider> {
  const { data: org } = await supabase
    .from('organizations')
    .select('llm_provider, llm_api_key_encrypted')
    .eq('id', orgId)
    .single();
  
  const provider = (org?.llm_provider as LLMProviderName) || 'anthropic';
  
  // Decrypt API key if organization has their own
  let apiKey: string | undefined;
  if (org?.llm_api_key_encrypted) {
    const { decrypt } = await import('@/lib/encryption');
    apiKey = decrypt(org.llm_api_key_encrypted);
  }
  
  return getLLMProvider(provider, apiKey);
}

// Available models per provider
export const AVAILABLE_MODELS: Record<LLMProviderName, { id: string; name: string }[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  gemini: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fast)' },
  ],
};

// Re-export types
export * from './types';
```

---

## 2.10 LLM Settings API

### File: `app/api/settings/llm/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

// GET - Get current LLM settings
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  if (!userData?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('llm_provider, llm_settings')
    .eq('id', userData.org_id)
    .single();

  // Don't return the encrypted API key, just indicate if one is set
  return NextResponse.json({
    provider: org?.llm_provider || 'anthropic',
    settings: org?.llm_settings || {},
    hasCustomApiKey: !!org?.llm_api_key_encrypted,
  });
}

// PATCH - Update LLM settings
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single();

  if (!userData?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  // Only owners and admins can change LLM settings
  if (!['owner', 'admin'].includes(userData.role)) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  const body = await request.json();
  const { provider, apiKey, settings } = body;

  const updateData: any = {};

  if (provider) {
    updateData.llm_provider = provider;
  }

  if (apiKey !== undefined) {
    // Empty string = remove custom key, non-empty = encrypt and store
    updateData.llm_api_key_encrypted = apiKey ? encrypt(apiKey) : null;
  }

  if (settings) {
    updateData.llm_settings = settings;
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(updateData)
    .eq('id', userData.org_id)
    .select('llm_provider, llm_settings')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    provider: data.llm_provider,
    settings: data.llm_settings,
    hasCustomApiKey: !!updateData.llm_api_key_encrypted,
  });
}
```

---

## 2.11 Test LLM API

### File: `app/api/llm/test/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getLLMProviderForOrg } from '@/lib/llm';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  if (!userData?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const { prompt } = body;

  try {
    const provider = await getLLMProviderForOrg(supabase, userData.org_id);
    
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
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
```

---

## 2.12 Install Dependencies

```bash
npm install @anthropic-ai/sdk openai @google/generative-ai groq-sdk
```

---

## 2.13 Verification Checklist

After completing Phase 2, verify:

- [ ] All provider files created
- [ ] Dependencies installed
- [ ] LLM factory returns correct provider
- [ ] GET `/api/settings/llm` returns settings
- [ ] PATCH `/api/settings/llm` updates provider
- [ ] POST `/api/llm/test` successfully calls provider
- [ ] Anthropic provider works
- [ ] OpenAI provider works (if API key set)
- [ ] Sequence generation returns valid JSON
- [ ] Classification returns valid JSON

---

## Next Steps

Once Phase 2 is complete, proceed to:
- **Phase 3**: Template Library (`docs/phases/PHASE_3_TEMPLATES.md`)
