import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { BaseLLMProvider } from './base';
import type { LLMMessage, LLMResponse, LLMProviderConfig } from './types';

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-1.5-pro';

  constructor(apiKey?: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_AI_API_KEY!);
  }

  async chat(messages: LLMMessage[], config?: LLMProviderConfig): Promise<LLMResponse> {
    try {
      const model = this.client.getGenerativeModel({
        model: config?.model || this.defaultModel,
      });

      // Convert messages to Gemini format
      const systemInstruction = messages.find((m) => m.role === 'system')?.content;
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const history: Content[] = nonSystemMessages.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const lastMessage = nonSystemMessages.slice(-1)[0];

      const chat = model.startChat({
        history,
        systemInstruction: systemInstruction || undefined,
      });

      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;

      return {
        content: response.text(),
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount || 0,
              outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
        model: config?.model || this.defaultModel,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API error: ${errorMessage}`);
    }
  }
}
