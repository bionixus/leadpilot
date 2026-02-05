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
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }
  }
}
