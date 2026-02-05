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
  subject?: string; // Email only
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
  classification:
    | 'interested'
    | 'not_interested'
    | 'question'
    | 'out_of_office'
    | 'bounce'
    | 'unsubscribe'
    | 'other';
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
  delayDays?: number[]; // Custom delays between steps
  includeSubjects?: boolean; // For email
  language?: string;
  templateId?: string; // Use as base template
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

export type LLMProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq';
