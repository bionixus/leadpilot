import { getLLMProvider } from '@/lib/llm';
import type {
  AgentConfig,
  AgentRule,
  AgentMemory,
  AgentDecision,
  AgentTool,
  StructuredCondition,
} from './types';

export class AgentBrain {
  private config: AgentConfig;
  private rules: AgentRule[];
  private tools: AgentTool[];
  private llmProvider: ReturnType<typeof getLLMProvider>;

  constructor(config: AgentConfig, rules: AgentRule[], tools: AgentTool[]) {
    this.config = config;
    this.rules = rules.filter((r) => r.is_enabled).sort((a, b) => b.priority - a.priority);
    this.tools = tools;
    this.llmProvider = getLLMProvider(config.llm_provider as 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq');
  }

  // Main decision-making method
  async decide(
    context: string,
    memories: AgentMemory[],
    availableActions: string[]
  ): Promise<AgentDecision> {
    const systemPrompt = this.buildSystemPrompt();
    const contextPrompt = this.buildContextPrompt(context, memories, availableActions);

    const response = await this.llmProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ],
      { temperature: this.config.temperature }
    );

    return this.parseDecision(response.content);
  }

  // Evaluate rules against a situation
  async evaluateRules(situation: Record<string, unknown>): Promise<AgentRule[]> {
    const triggeredRules: AgentRule[] = [];

    for (const rule of this.rules) {
      if (await this.checkRuleCondition(rule, situation)) {
        triggeredRules.push(rule);
      }
    }

    return triggeredRules;
  }

  // Check if a specific rule condition is met
  private async checkRuleCondition(
    rule: AgentRule,
    situation: Record<string, unknown>
  ): Promise<boolean> {
    // If structured condition exists, evaluate it
    if (rule.condition_json) {
      return this.evaluateStructuredCondition(
        rule.condition_json as unknown as StructuredCondition,
        situation
      );
    }

    // Otherwise, use LLM to evaluate natural language condition
    const prompt = `Evaluate if this condition is TRUE or FALSE based on the situation.

CONDITION: "${rule.condition}"

SITUATION:
${JSON.stringify(situation, null, 2)}

Respond with only TRUE or FALSE.`;

    const response = await this.llmProvider.chat(
      [
        { role: 'system', content: 'You evaluate conditions. Respond only TRUE or FALSE.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0 }
    );

    return response.content.trim().toUpperCase() === 'TRUE';
  }

  // Evaluate structured condition (JSON-based rules)
  private evaluateStructuredCondition(
    condition: StructuredCondition,
    situation: Record<string, unknown>
  ): boolean {
    const { field, operator, value } = condition;
    const actualValue = field ? this.getNestedValue(situation, field) : undefined;

    switch (operator) {
      case 'equals':
        return actualValue === value;
      case 'not_equals':
        return actualValue !== value;
      case 'contains':
        return String(actualValue).toLowerCase().includes(String(value).toLowerCase());
      case 'not_contains':
        return !String(actualValue).toLowerCase().includes(String(value).toLowerCase());
      case 'greater_than':
        return Number(actualValue) > Number(value);
      case 'less_than':
        return Number(actualValue) < Number(value);
      case 'in':
        return Array.isArray(value) && value.includes(actualValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(actualValue);
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'not_exists':
        return actualValue === undefined || actualValue === null;
      case 'and':
        return (
          condition.conditions?.every((c) => this.evaluateStructuredCondition(c, situation)) ??
          false
        );
      case 'or':
        return (
          condition.conditions?.some((c) => this.evaluateStructuredCondition(c, situation)) ?? false
        );
      default:
        return false;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((o, k) => {
      if (o && typeof o === 'object' && k in o) {
        return (o as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj);
  }

  // Build system prompt with rules
  private buildSystemPrompt(): string {
    const rulesText =
      this.rules.map((r) => `- ${r.name}: IF ${r.condition} THEN ${r.action}`).join('\n') ||
      'No specific rules defined.';

    const toolsText = this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

    return `You are the LeadPilot Agent, an autonomous AI assistant for B2B sales outreach.

YOUR GOAL: Help the user find leads, reach out to them, handle replies, and book meetings.

RULES YOU MUST FOLLOW:
${rulesText}

TOOLS AVAILABLE:
${toolsText}

CONSTRAINTS:
- Max ${this.config.max_messages_per_day} messages per day
- Max ${this.config.max_leads_per_day} new leads per day
- Only operate during: ${this.config.schedule_days.join(', ')} ${this.config.schedule_start_time}-${this.config.schedule_end_time} ${this.config.schedule_timezone}
${
  this.config.require_approval_for.length > 0
    ? `- Require human approval for: ${this.config.require_approval_for.join(', ')}`
    : ''
}

BEHAVIOR:
- Always explain your reasoning
- Be proactive but respect the rules
- Escalate to human when uncertain
- Learn from what works and what doesn't

When making a decision, respond in this JSON format:
{
  "action": "action_name",
  "reasoning": "Why you chose this action",
  "confidence": 0.0-1.0,
  "requires_approval": true/false,
  "data": { ... any relevant data ... }
}`;
  }

  // Build context prompt
  private buildContextPrompt(
    context: string,
    memories: AgentMemory[],
    availableActions: string[]
  ): string {
    const memoryText =
      memories.length > 0
        ? `RELEVANT MEMORIES:\n${memories.map((m) => `- [${m.memory_type}] ${m.key}: ${m.value}`).join('\n')}`
        : '';

    return `CURRENT SITUATION:
${context}

${memoryText}

AVAILABLE ACTIONS:
${availableActions.map((a) => `- ${a}`).join('\n')}

What should I do next? Respond with a JSON decision.`;
  }

  // Parse LLM response into decision
  private parseDecision(content: string): AgentDecision {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Check if action requires approval based on config
      const requiresApproval =
        parsed.requires_approval || this.config.require_approval_for.includes(parsed.action);

      return {
        action: parsed.action || 'none',
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence ?? 0.5,
        requires_approval: requiresApproval,
        data: parsed.data || {},
      };
    } catch {
      return {
        action: 'error',
        reasoning: `Failed to parse decision: ${content}`,
        confidence: 0,
        requires_approval: true,
        data: { raw_response: content },
      };
    }
  }
}
