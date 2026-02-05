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
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const choice = response.choices[0];

      return {
        content: choice.message.content || '',
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
        model: response.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Groq API error:', error);
      throw new Error(`Groq API error: ${errorMessage}`);
    }
  }
}
