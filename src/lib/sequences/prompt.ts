import type { BusinessContext } from '@/types/database';
import type { Lead } from '@/types/database';

function formatLeadLocation(lead: Lead): string {
  const parts = [lead.city, lead.state, lead.country].filter(Boolean);
  return parts.join(', ') || '';
}

/**
 * Builds the system + user prompt for Claude to generate a cold email sequence.
 */
export function generateSequencePrompt(
  businessContext: BusinessContext,
  lead: Lead
): string {
  const sequenceLength = businessContext.sequence_length ?? 3;
  const painPoints = businessContext.key_pain_points?.join(', ') ?? '';
  const caseStudies = businessContext.case_studies?.join(', ') ?? '';
  const location = formatLeadLocation(lead);

  return `You are an expert cold email copywriter. Generate a ${sequenceLength}-email sequence.

## BUSINESS CONTEXT
Company: ${businessContext.company_name ?? ''}
Industry: ${businessContext.industry ?? ''}
Value Proposition: ${businessContext.value_proposition ?? ''}
Target Audience: ${businessContext.target_audience ?? ''}
Tone: ${businessContext.tone ?? 'professional'}
Key Pain Points We Solve: ${painPoints}
Case Studies: ${caseStudies}
CTA: ${businessContext.cta ?? ''}
Sender: ${businessContext.sender_name ?? ''}, ${businessContext.sender_title ?? ''}

## LEAD INFORMATION
Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
Company: ${lead.company ?? ''}
Title: ${lead.job_title ?? ''}
Location: ${location}
LinkedIn: ${lead.linkedin_url ?? ''}
Additional Context: ${JSON.stringify(lead.enrichment_data ?? {})}

## REQUIREMENTS
1. Email 1: Pattern interrupt opener, personalized to their company/role, soft CTA
2. Email 2: Value-add follow-up (share insight or resource), remind of CTA
3. Email 3: Breakup email, final ask, create urgency without being pushy

Each email should be:
- Under 150 words
- No spammy language (avoid "just following up", "touching base")
- Personalized to the lead's specific situation
- Mobile-friendly (short paragraphs)

Return JSON format:
{
  "emails": [
    {"step": 1, "delay_days": 0, "subject": "...", "body": "..."},
    {"step": 2, "delay_days": 3, "subject": "Re: {previous_subject}", "body": "..."},
    {"step": 3, "delay_days": 5, "subject": "...", "body": "..."}
  ]
}
`;
}
