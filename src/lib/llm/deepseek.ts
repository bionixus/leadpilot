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
      console.error('DeepSeek API error:', error);
      throw new Error(`DeepSeek API error: ${errorMessage}`);
    }
  }
}
