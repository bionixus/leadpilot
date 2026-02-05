import type { InboxMessage } from '@/types/database';

/**
 * Builds the prompt for Claude to classify an email reply to cold outreach.
 * Use the returned string with Claude, then parse JSON: { classification, confidence, reason }.
 */
export function classifyReplyPrompt(
  email: InboxMessage,
  originalOutreach: string
): string {
  return `Classify this email reply to a cold outreach.

ORIGINAL OUTREACH:
${originalOutreach}

REPLY:
From: ${email.from_email}
Subject: ${email.subject ?? ''}
Body: ${email.body_text ?? ''}

Classify as one of:
- INTERESTED: Shows genuine interest, wants to learn more, asks questions, agrees to call
- NOT_INTERESTED: Explicitly declines, unsubscribe request, negative response
- OUT_OF_OFFICE: Auto-reply indicating absence
- BOUNCE: Delivery failure, invalid email
- QUESTION: Has questions but hasn't committed either way
- OTHER: Doesn't fit above categories

Return JSON: {"classification": "...", "confidence": 0.0-1.0, "reason": "..."}
`;
}
