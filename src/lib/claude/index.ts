import Anthropic from '@anthropic-ai/sdk';

export type SequenceEmail = {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
};

export type GenerateSequenceResult = {
  emails: SequenceEmail[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

const MODEL = 'claude-sonnet-4-20250514';

/**
 * Calls Anthropic Messages API to generate a cold email sequence.
 * Expects the prompt to request JSON output.
 */
export async function generateSequence(prompt: string): Promise<GenerateSequenceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: 'You are an expert cold email copywriter. Reply only with valid JSON matching the requested schema. Do not include any markdown formatting or code blocks.',
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text from the response
  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let rawText = textBlock.text.trim();

  // Strip markdown code blocks if present
  if (rawText.startsWith('```json')) {
    rawText = rawText.slice(7);
  } else if (rawText.startsWith('```')) {
    rawText = rawText.slice(3);
  }
  if (rawText.endsWith('```')) {
    rawText = rawText.slice(0, -3);
  }
  rawText = rawText.trim();

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText.slice(0, 200)}`);
  }

  // Validate structure
  if (!parsed || typeof parsed !== 'object' || !('emails' in parsed)) {
    throw new Error('Response missing "emails" array');
  }

  const obj = parsed as { emails: unknown };
  if (!Array.isArray(obj.emails)) {
    throw new Error('"emails" is not an array');
  }

  const emails: SequenceEmail[] = obj.emails.map((item: unknown, idx: number) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Email at index ${idx} is not an object`);
    }
    const e = item as Record<string, unknown>;

    const step = typeof e.step === 'number' ? e.step : parseInt(String(e.step), 10);
    const delay_days = typeof e.delay_days === 'number' ? e.delay_days : parseInt(String(e.delay_days), 10);
    const subject = String(e.subject ?? '');
    const body = String(e.body ?? '');

    if (isNaN(step) || isNaN(delay_days)) {
      throw new Error(`Email at index ${idx} has invalid step or delay_days`);
    }
    if (!subject || !body) {
      throw new Error(`Email at index ${idx} missing subject or body`);
    }

    return { step, delay_days, subject, body };
  });

  if (emails.length === 0) {
    throw new Error('No emails generated');
  }

  return {
    emails,
    usage: message.usage
      ? { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }
      : undefined,
  };
}
