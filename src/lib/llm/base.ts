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
  SequenceStep,
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
- Always respond with valid JSON only, no markdown`,
      },
      { role: 'user', content: prompt },
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
        content: 'You classify email replies. Respond with valid JSON only, no markdown or explanation.',
      },
      { role: 'user', content: prompt },
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
  protected parseSequenceResponse(content: string): SequenceStep[] {
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
