import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMemory, AgentTask, StoreMemoryInput } from './types';

export class AgentMemoryManager {
  private supabase: SupabaseClient;
  private orgId: string;

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
  }

  // Store a memory
  async store(memory: StoreMemoryInput): Promise<void> {
    await this.supabase.from('agent_memory').upsert(
      {
        org_id: this.orgId,
        memory_type: memory.memory_type,
        key: memory.key,
        value: memory.value,
        metadata: memory.metadata || {},
        importance: memory.importance ?? 0.5,
        lead_id: memory.lead_id,
        campaign_id: memory.campaign_id,
        expires_at: memory.expires_at,
      } as never,
      {
        onConflict: 'org_id,memory_type,key',
      }
    );
  }

  // Get memories relevant to a task
  async getRelevant(task: AgentTask, limit: number = 10): Promise<AgentMemory[]> {
    const queries = [];

    // Get task-type specific learnings
    queries.push(
      this.supabase
        .from('agent_memory')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('memory_type', 'learning')
        .ilike('key', `%${task.task_type}%`)
        .order('importance', { ascending: false })
        .limit(3)
    );

    // Get lead-specific context if applicable
    if (task.lead_id) {
      queries.push(
        this.supabase
          .from('agent_memory')
          .select('*')
          .eq('org_id', this.orgId)
          .eq('lead_id', task.lead_id)
          .order('updated_at', { ascending: false })
          .limit(5)
      );
    }

    // Get campaign-specific context if applicable
    if (task.campaign_id) {
      queries.push(
        this.supabase
          .from('agent_memory')
          .select('*')
          .eq('org_id', this.orgId)
          .eq('campaign_id', task.campaign_id)
          .order('updated_at', { ascending: false })
          .limit(3)
      );
    }

    // Get general strategies
    queries.push(
      this.supabase
        .from('agent_memory')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('memory_type', 'strategy')
        .order('importance', { ascending: false })
        .limit(3)
    );

    const results = await Promise.all(queries);
    const memories = results.flatMap((r) => (r.data as AgentMemory[]) || []);

    // Dedupe and sort by importance
    const seen = new Set<string>();
    return memories
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  // Get all memories for a lead
  async getForLead(leadId: string): Promise<AgentMemory[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    return (data as AgentMemory[]) || [];
  }

  // Search memories
  async search(query: string, limit: number = 10): Promise<AgentMemory[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('*')
      .eq('org_id', this.orgId)
      .or(`key.ilike.%${query}%,value.ilike.%${query}%`)
      .order('importance', { ascending: false })
      .limit(limit);

    return (data as AgentMemory[]) || [];
  }

  // Get memories by type
  async getByType(memoryType: string, limit: number = 20): Promise<AgentMemory[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('memory_type', memoryType)
      .order('importance', { ascending: false })
      .limit(limit);

    return (data as AgentMemory[]) || [];
  }

  // Update memory importance
  async updateImportance(memoryId: string, importance: number): Promise<void> {
    await this.supabase
      .from('agent_memory')
      .update({ importance } as never)
      .eq('id', memoryId)
      .eq('org_id', this.orgId);
  }

  // Delete a memory
  async delete(memoryId: string): Promise<void> {
    await this.supabase
      .from('agent_memory')
      .delete()
      .eq('id', memoryId)
      .eq('org_id', this.orgId);
  }

  // Clear old memories
  async cleanup(olderThanDays: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const { count } = await this.supabase
      .from('agent_memory')
      .delete()
      .eq('org_id', this.orgId)
      .lt('updated_at', cutoff.toISOString())
      .lt('importance', 0.8); // Keep important memories

    return count || 0;
  }

  // Clear all memories for the organization
  async clearAll(): Promise<void> {
    await this.supabase.from('agent_memory').delete().eq('org_id', this.orgId);
  }
}
