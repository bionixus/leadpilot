import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class AnthropicProvider extends BaseLLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey?: string) {
    super();
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    // Separate system message from others
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    try {
      const response = await this.client.messages.create({
        model: config?.model || this.defaultModel,
        max_tokens: config?.maxTokens || 4096,
        temperature: config?.temperature,
        system: systemMessage?.content || '',
        messages: otherMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const textContent = response.content.find((c) => c.type === 'text');

      return {
        content: textContent?.text || '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason || undefined,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${errorMessage}`);
    }
  }
}
