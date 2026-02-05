# LeadPilot 2.0 — True Autopilot Workflow

This document outlines the updated vision for LeadPilot as the **first real autopilot lead generation and qualification platform**.

---

## Core Philosophy

> **"Talk to AI, get leads and meetings."**

Users shouldn't need to understand sequences, SMTP, or lead lists. They talk to an AI assistant that handles everything — from finding leads to sending personalized outreach across email, WhatsApp, and SMS.

---

## Two Main Modes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   OPTION 1: SEMI-AUTOPILOT                 OPTION 2: FULL AUTOPILOT         │
│   (All Users)                              (Premium Users)                  │
│   ─────────────────────                    ─────────────────────            │
│                                                                             │
│   User uploads lead list                   User chats with AI               │
│           ↓                                        ↓                        │
│   Choose template OR                       AI asks 5 questions              │
│   AI builds sequences                              ↓                        │
│           ↓                                AI finds leads automatically     │
│   Review & approve                                 ↓                        │
│           ↓                                AI generates sequences           │
│   Send (Email only)                                ↓                        │
│                                            Choose approval level:           │
│                                            • Full autopilot                 │
│                                            • Approve list only              │
│                                            • Approve list + content         │
│                                                     ↓                       │
│                                            Send (Email + WhatsApp + SMS)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Option 1: Semi-Autopilot (Standard Users)

### Flow

1. **Upload Leads**
   - CSV upload (existing)
   - Google Sheets sync
   - Manual entry

2. **Choose Sequence Approach**

   **A) Template Library**
   - Pre-built templates by industry/use case:
     - "SaaS Cold Outreach"
     - "Agency New Client"
     - "Recruitment Candidate"
     - "Real Estate Investor"
     - "Consulting Services"
     - "Event Invitation"
     - Custom templates (user-created)
   - Each template has 3-5 email steps with placeholders
   - User selects template → AI personalizes for each lead

   **B) AI Conversation Builder**
   - User describes what they want in natural language
   - Example: "I sell HR software to mid-size companies. I want to reach HR directors and show them how we reduce hiring time by 50%."
   - AI generates a custom sequence based on the description
   - User can iterate: "Make it more casual" / "Add a case study mention"

3. **Review & Approve**
   - Preview generated sequences
   - Edit if needed
   - Approve to send

4. **Send**
   - Email only (standard tier)
   - Scheduled with warmup and limits

---

## Option 2: Full Autopilot (Premium Users)

### Flow

1. **Conversational Onboarding**
   
   User opens chat interface. AI asks structured questions:

   ```
   AI: "Hi! I'm going to help you find and reach your ideal customers. 
        Let me ask you a few questions to get started."
   
   AI: "Question 1: Who is your ideal customer? 
        (e.g., 'Marketing managers at e-commerce companies')"
   
   AI: "Question 2: Which countries or regions do you want to target?
        (e.g., 'USA and UK' or 'Global')"
   
   AI: "Question 3: What job titles should I look for?
        (e.g., 'CMO, VP Marketing, Head of Growth')"
   
   AI: "Question 4: What company size are you targeting?
        (e.g., '50-500 employees' or '$10M-$100M revenue')"
   
   AI: "Question 5: Who are your top 3 competitors?
        (This helps me understand your market positioning)"
   
   AI: "Great! Now tell me about your business:
        - What do you offer?
        - What's your main benefit/advantage?
        - Any specific results or case studies?
        - What's your call-to-action (book a call, free trial, etc.)?"
   ```

2. **Choose Autopilot Level**

   ```
   AI: "Perfect! I have everything I need. How would you like to proceed?"
   
   [ ] Full Autopilot
       → I'll find leads, create sequences, and start sending automatically.
         You'll get notifications when people reply.
   
   [ ] Approve List First
       → I'll find leads and show you the list for approval.
         Once approved, I'll create sequences and send automatically.
   
   [ ] Approve List + Content
       → I'll find leads and create sequences.
         You'll review and approve both before I send anything.
   ```

3. **AI Executes**

   Based on the chosen level:

   **Full Autopilot:**
   - AI searches databases (Apollo, LinkedIn, etc.) for matching leads
   - AI generates personalized sequences for each lead
   - AI starts sending immediately (respecting limits)
   - User gets notifications on replies only

   **Approve List:**
   - AI finds leads → presents list for approval
   - User approves (or removes some leads)
   - AI generates sequences and sends

   **Approve List + Content:**
   - AI finds leads → user approves
   - AI generates sequences → user reviews/edits
   - User approves → AI sends

4. **Multi-Channel Outreach**

   Premium users get:
   - **Email** (existing)
   - **WhatsApp** (via WhatsApp Business API or Twilio)
   - **SMS** (via Twilio)
   
   AI determines best channel based on:
   - Lead data (has mobile? has WhatsApp?)
   - Geography (SMS works better in US, WhatsApp in EU/LATAM)
   - User preference

5. **Ongoing Autopilot**

   - AI monitors replies and classifies them
   - AI can auto-respond to common questions (optional)
   - AI suggests follow-up actions
   - Weekly summary: "Found 150 leads, sent 500 messages, got 23 replies, 8 interested"

---

## Multi-LLM Support

### Supported Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus | Default for sequences, classification |
| **OpenAI** | GPT-4o, GPT-4 Turbo | Alternative, good for conversation |
| **Google** | Gemini Pro, Gemini Ultra | Cost-effective option |
| **DeepSeek** | DeepSeek Chat, DeepSeek Coder | Budget option |
| **Groq** | Llama 3, Mixtral | Fast inference |
| **Local** | Ollama (Llama, Mistral) | Self-hosted option |

### Implementation

```typescript
// src/lib/llm/index.ts

interface LLMProvider {
  name: string;
  generateSequence(prompt: string): Promise<SequenceResult>;
  classifyReply(email: string): Promise<Classification>;
  chat(messages: Message[]): Promise<string>;
}

// Factory pattern
function getLLMProvider(provider: string): LLMProvider {
  switch (provider) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    case 'gemini': return new GeminiProvider();
    case 'deepseek': return new DeepSeekProvider();
    case 'groq': return new GroqProvider();
    default: return new AnthropicProvider();
  }
}
```

### User Choice

- In Settings, user selects preferred LLM provider
- User adds their own API key (or uses platform credits)
- Different models for different tasks (e.g., cheap model for classification, smart model for sequences)

---

## New Database Schema Additions

```sql
-- Sequence templates library
CREATE TABLE sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id), -- NULL for system templates
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT, -- 'saas', 'agency', 'recruiting', etc.
  use_case TEXT, -- 'cold_outreach', 'follow_up', 'event', etc.
  steps JSONB NOT NULL, -- [{ step, delay_days, subject_template, body_template }]
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Autopilot sessions (conversation state)
CREATE TABLE autopilot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  
  -- Conversation state
  status TEXT DEFAULT 'onboarding', -- 'onboarding', 'finding_leads', 'generating', 'sending', 'paused', 'completed'
  conversation_history JSONB DEFAULT '[]', -- Chat messages
  
  -- Collected info from questions
  target_customer TEXT,
  target_countries TEXT[],
  target_titles TEXT[],
  company_size TEXT,
  competitors TEXT[],
  business_description TEXT,
  benefits TEXT,
  cta TEXT,
  
  -- Autopilot settings
  autopilot_level TEXT DEFAULT 'approve_all', -- 'full', 'approve_list', 'approve_all'
  channels TEXT[] DEFAULT '{email}', -- 'email', 'whatsapp', 'sms'
  
  -- Progress
  leads_found INTEGER DEFAULT 0,
  leads_approved INTEGER,
  sequences_generated INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  
  -- Linked campaign (created by autopilot)
  campaign_id UUID REFERENCES campaigns(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LLM provider settings per org
ALTER TABLE organizations ADD COLUMN llm_provider TEXT DEFAULT 'anthropic';
ALTER TABLE organizations ADD COLUMN llm_api_key_encrypted TEXT; -- User's own key
ALTER TABLE organizations ADD COLUMN llm_settings JSONB DEFAULT '{}';

-- WhatsApp/SMS accounts
CREATE TABLE messaging_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  
  provider TEXT NOT NULL, -- 'twilio', 'whatsapp_business', 'messagebird'
  channel TEXT NOT NULL, -- 'whatsapp', 'sms'
  
  phone_number TEXT,
  account_sid_encrypted TEXT,
  auth_token_encrypted TEXT,
  
  is_active BOOLEAN DEFAULT true,
  daily_limit INTEGER DEFAULT 100,
  messages_sent_today INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table (extends emails to multi-channel)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  campaign_id UUID REFERENCES campaigns(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  
  channel TEXT NOT NULL, -- 'email', 'whatsapp', 'sms'
  
  -- For email: link to email_accounts
  email_account_id UUID REFERENCES email_accounts(id),
  -- For WhatsApp/SMS: link to messaging_accounts
  messaging_account_id UUID REFERENCES messaging_accounts(id),
  
  -- Content
  subject TEXT, -- Email only
  body TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  
  -- Provider metadata
  provider_message_id TEXT,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Updated UI Flow

### New Sidebar

```
┌─────────────────────┐
│ 🚀 LeadPilot        │
├─────────────────────┤
│ 💬 Autopilot Chat   │  ← NEW: Main entry point
│ 📊 Dashboard        │
│ 📧 Campaigns        │
│ 👥 Leads            │
│ 📝 Sequences        │
│ 📨 Inbox            │
│ 📱 Messaging        │  ← NEW: WhatsApp/SMS
│ 📋 Templates        │  ← NEW: Sequence templates
├─────────────────────┤
│ ⚙️ Settings         │
│ 💳 Billing          │
└─────────────────────┘
```

### Autopilot Chat Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│  🤖 Autopilot Assistant                                    [Model ▾]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ AI: Hi! I'm your autopilot assistant. I can help you:       │   │
│  │     • Find your ideal customers                             │   │
│  │     • Create personalized outreach sequences                │   │
│  │     • Send messages via email, WhatsApp, or SMS            │   │
│  │                                                             │   │
│  │     How would you like to get started?                      │   │
│  │                                                             │   │
│  │     [📤 Upload a lead list]  [🔍 Find leads for me]         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ User: Find leads for me                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ AI: Great! Let me ask you a few questions...                │   │
│  │                                                             │   │
│  │     Who is your ideal customer?                             │   │
│  │     (e.g., "Marketing managers at SaaS companies")          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Type your message...]                                    [Send ➤] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Updated Tech Stack

| Component | Technology |
|-----------|------------|
| **LLM** | Multi-provider: Anthropic, OpenAI, Gemini, DeepSeek, Groq |
| **WhatsApp** | Twilio WhatsApp API or WhatsApp Business API |
| **SMS** | Twilio SMS |
| **Lead Databases** | Apollo, LinkedIn (Apify), Hunter.io, Clearbit, ZoomInfo |
| **Chat UI** | Custom or Vercel AI SDK |
| **Real-time** | Server-Sent Events or WebSocket for chat |

---

## Implementation Priority

### Phase 1: Foundation Updates
1. Multi-LLM provider system (`src/lib/llm/`)
2. Sequence templates table + seed templates
3. Template selector UI

### Phase 2: Autopilot Chat
4. Chat interface UI (Autopilot page)
5. Autopilot sessions table
6. Conversation flow (5 questions → business info → approval level)
7. Lead finding integration (Apollo/LinkedIn based on answers)

### Phase 3: Multi-Channel
8. Messaging accounts (Twilio setup)
9. WhatsApp sending
10. SMS sending
11. Unified inbox (email + WhatsApp + SMS)

### Phase 4: Full Autopilot
12. Automated lead finding based on criteria
13. Automated sequence generation
14. Approval workflows
15. Progress notifications

---

## Key Differentiators

| Feature | LeadPilot 2.0 | Competitors |
|---------|---------------|-------------|
| **Conversational setup** | ✅ Chat with AI | ❌ Forms/wizards |
| **Full autopilot mode** | ✅ AI does everything | ❌ Manual steps |
| **Multi-LLM choice** | ✅ 6+ providers | ❌ Usually 1 |
| **Multi-channel** | ✅ Email + WhatsApp + SMS | ⚠️ Usually email only |
| **Lead generation included** | ✅ Built-in | ❌ Separate tool |
| **Approval levels** | ✅ 3 levels | ❌ All or nothing |

---

## Summary

LeadPilot 2.0 transforms from a "cold email tool" to an **AI-powered sales autopilot**:

1. **Talk, don't configure** — Users describe what they want, AI figures out the rest
2. **Find + Send in one place** — No need for separate lead gen tools
3. **True autopilot** — Premium users can let AI run completely
4. **Multi-channel** — Email, WhatsApp, SMS from one platform
5. **Choose your AI** — Support for multiple LLM providers
6. **Flexible control** — From full autopilot to approve-everything

This positions LeadPilot as the **first real autopilot outreach platform** rather than just another email tool.
