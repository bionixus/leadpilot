import type { LLMProvider, LLMProviderName } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { DeepSeekProvider } from './deepseek';
import { GroqProvider } from './groq';

// Create provider instance
export function getLLMProvider(provider: LLMProviderName, apiKey?: string): LLMProvider {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLLMProviderForOrg(
  supabase: any,
  orgId: string
): Promise<LLMProvider> {
  const { data: org } = await supabase
    .from('organizations')
    .select('llm_provider, llm_api_key_encrypted')
    .eq('id', orgId)
    .single();

  const orgData = org as {
    llm_provider?: string | null;
    llm_api_key_encrypted?: string | null;
  } | null;

  const provider = (orgData?.llm_provider as LLMProviderName) || 'anthropic';

  // Decrypt API key if organization has their own
  let apiKey: string | undefined;
  if (orgData?.llm_api_key_encrypted) {
    const { decrypt } = await import('@/lib/encryption');
    apiKey = decrypt(orgData.llm_api_key_encrypted);
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

// Provider display names
export const PROVIDER_NAMES: Record<LLMProviderName, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  groq: 'Groq',
};

// Re-export types
export * from './types';
