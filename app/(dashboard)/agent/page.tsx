'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Play,
  Pause,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Activity,
  Settings,
  Zap,
  Filter,
  Shield,
  MessageSquare,
  Calendar,
  RefreshCw,
  ChevronRight,
  Trash2,
  Edit,
  X,
} from 'lucide-react';

interface AgentConfig {
  id: string;
  name: string;
  is_enabled: boolean;
  status: 'idle' | 'running' | 'paused' | 'error';
  llm_provider: string;
  llm_model: string;
  max_leads_per_day: number;
  max_messages_per_day: number;
  max_actions_per_hour: number;
  schedule_enabled: boolean;
  schedule_days: string[];
  schedule_start_time: string;
  schedule_end_time: string;
  schedule_timezone: string;
  auto_respond_to_positive: boolean;
  auto_respond_to_questions: boolean;
  auto_book_meetings: boolean;
  require_approval_for: string[];
}

interface AgentRule {
  id: string;
  name: string;
  description?: string;
  rule_type: 'filter' | 'action' | 'constraint' | 'template' | 'schedule' | 'escalation';
  condition: string;
  action: string;
  priority: number;
  is_enabled: boolean;
  times_triggered: number;
  last_triggered_at?: string;
}

interface AgentTask {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  input_data: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  scheduled_for: string;
}

interface AgentLog {
  id: string;
  log_type: string;
  message: string;
  reasoning?: string;
  confidence?: number;
  created_at: string;
}

export default function AgentPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'tasks' | 'settings'>('overview');
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AgentRule | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, rulesRes, tasksRes, logsRes] = await Promise.all([
        fetch('/api/agent/config'),
        fetch('/api/agent/rules'),
        fetch('/api/agent/tasks?limit=20'),
        fetch('/api/agent/logs?limit=30'),
      ]);

      if (configRes.ok) setConfig(await configRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (error) {
      console.error('Failed to load agent data:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleAgent = async () => {
    if (!config) return;

    const endpoint = config.status === 'running' ? '/api/agent/stop' : '/api/agent/start';
    await fetch(endpoint, { method: 'POST' });
    loadData();
  };

  const updateConfig = async (updates: Partial<AgentConfig>) => {
    await fetch('/api/agent/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    loadData();
  };

  const deleteRule = async (ruleId: string) => {
    await fetch(`/api/agent/rules/${ruleId}`, { method: 'DELETE' });
    loadData();
  };

  const toggleRule = async (rule: AgentRule) => {
    await fetch(`/api/agent/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !rule.is_enabled }),
    });
    loadData();
  };

  const approveTask = async (taskId: string) => {
    await fetch(`/api/agent/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    loadData();
  };

  const rejectTask = async (taskId: string) => {
    await fetch(`/api/agent/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reason: 'Rejected by user' }),
    });
    loadData();
  };

  const getRuleTypeIcon = (type: string) => {
    switch (type) {
      case 'filter':
        return <Filter className="w-4 h-4" />;
      case 'action':
        return <Zap className="w-4 h-4" />;
      case 'escalation':
        return <AlertTriangle className="w-4 h-4" />;
      case 'constraint':
        return <Shield className="w-4 h-4" />;
      case 'template':
        return <MessageSquare className="w-4 h-4" />;
      case 'schedule':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Settings className="w-4 h-4" />;
    }
  };

  const getRuleTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'filter':
        return 'bg-red-100 text-red-700';
      case 'action':
        return 'bg-blue-100 text-blue-700';
      case 'escalation':
        return 'bg-orange-100 text-orange-700';
      case 'constraint':
        return 'bg-purple-100 text-purple-700';
      case 'template':
        return 'bg-green-100 text-green-700';
      case 'schedule':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'decision':
        return <Bot className="w-4 h-4 text-blue-600" />;
      case 'action':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'approval':
        return <Clock className="w-4 h-4 text-orange-600" />;
      case 'rule_triggered':
        return <Zap className="w-4 h-4 text-purple-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTaskStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'running':
        return 'bg-blue-100 text-blue-700';
      case 'awaiting_approval':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'cancelled':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Control Center</h1>
          <p className="text-gray-500">Configure and monitor your autonomous AI agent</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={toggleAgent}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
              config?.status === 'running'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {config?.status === 'running' ? (
              <>
                <Pause className="w-5 h-5" />
                Stop Agent
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Agent
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-4 mb-6">
          <div
            className={`p-4 rounded-xl ${
              config?.status === 'running' ? 'bg-green-100' : 'bg-gray-100'
            }`}
          >
            <Bot
              className={`w-8 h-8 ${
                config?.status === 'running' ? 'text-green-600' : 'text-gray-400'
              }`}
            />
          </div>
          <div>
            <h2 className="text-xl font-bold">{config?.name || 'LeadPilot Agent'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-1 text-xs rounded-full font-medium ${
                  config?.status === 'running'
                    ? 'bg-green-100 text-green-700'
                    : config?.status === 'error'
                      ? 'bg-red-100 text-red-700'
                      : config?.status === 'paused'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                }`}
              >
                {config?.status || 'idle'}
              </span>
              {config?.schedule_enabled && (
                <span className="text-sm text-gray-500">
                  {config.schedule_days.map(d => d.charAt(0).toUpperCase()).join(', ')}{' '}
                  {config.schedule_start_time}-{config.schedule_end_time}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{config?.max_leads_per_day || 0}</div>
            <div className="text-sm text-gray-500">Max Leads/Day</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{config?.max_messages_per_day || 0}</div>
            <div className="text-sm text-gray-500">Max Messages/Day</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{rules.filter((r) => r.is_enabled).length}</div>
            <div className="text-sm text-gray-500">Active Rules</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">
              {tasks.filter((t) => t.status === 'awaiting_approval').length}
            </div>
            <div className="text-sm text-gray-500">Pending Approvals</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-6">
          {(['overview', 'rules', 'tasks', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending Approvals */}
          {tasks.filter((t) => t.status === 'awaiting_approval').length > 0 && (
            <div className="bg-white rounded-xl border col-span-full">
              <div className="px-6 py-4 border-b flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold">Pending Approvals</h3>
              </div>
              <div className="divide-y">
                {tasks
                  .filter((t) => t.status === 'awaiting_approval')
                  .map((task) => (
                    <div key={task.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{task.task_type.replace(/_/g, ' ')}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(task.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveTask(task.id)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectTask(task.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold">Recent Activity</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No activity yet. Start the agent to see logs.
                </div>
              ) : (
                <div className="divide-y">
                  {logs.slice(0, 15).map((log) => (
                    <div key={log.id} className="px-6 py-3 flex items-start gap-3">
                      <div
                        className={`mt-1 p-1.5 rounded ${
                          log.log_type === 'error'
                            ? 'bg-red-100'
                            : log.log_type === 'decision'
                              ? 'bg-blue-100'
                              : log.log_type === 'action'
                                ? 'bg-green-100'
                                : 'bg-gray-100'
                        }`}
                      >
                        {getLogIcon(log.log_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{log.message}</div>
                        {log.reasoning && (
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            Reasoning: {log.reasoning}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Rules Summary */}
          <div className="bg-white rounded-xl border">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold">Active Rules</h3>
              </div>
              <button
                onClick={() => setActiveTab('rules')}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y">
              {rules.filter((r) => r.is_enabled).length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No rules configured. Add rules to control agent behavior.
                </div>
              ) : (
                rules
                  .filter((r) => r.is_enabled)
                  .slice(0, 5)
                  .map((rule) => (
                    <div key={rule.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded ${getRuleTypeBadgeColor(rule.rule_type)}`}>
                          {getRuleTypeIcon(rule.rule_type)}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{rule.name}</div>
                          <div className="text-xs text-gray-500">
                            Triggered {rule.times_triggered}x
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-xl border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Agent Rules</h3>
            <button
              onClick={() => {
                setEditingRule(null);
                setShowRuleModal(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No rules configured. Add rules to control agent behavior.
            </div>
          ) : (
            <div className="divide-y">
              {rules.map((rule) => (
                <div key={rule.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleRule(rule)}
                        className={`mt-1 w-10 h-6 rounded-full transition-colors ${
                          rule.is_enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            rule.is_enabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${getRuleTypeBadgeColor(rule.rule_type)}`}
                          >
                            {rule.rule_type}
                          </span>
                          <span className="text-xs text-gray-400">Priority: {rule.priority}</span>
                        </div>
                        {rule.description && (
                          <p className="text-sm text-gray-500 mt-1">{rule.description}</p>
                        )}
                        <div className="text-sm text-gray-600 mt-2">
                          <span className="text-gray-400">IF</span> {rule.condition}{' '}
                          <span className="text-gray-400">THEN</span> {rule.action}
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          Triggered {rule.times_triggered} times
                          {rule.last_triggered_at &&
                            ` • Last: ${new Date(rule.last_triggered_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingRule(rule);
                          setShowRuleModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="bg-white rounded-xl border">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold">Task Queue</h3>
          </div>

          {tasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No tasks in queue.</div>
          ) : (
            <div className="divide-y">
              {tasks.map((task) => (
                <div key={task.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.task_type.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${getTaskStatusBadge(task.status)}`}>
                          {task.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Created: {new Date(task.created_at).toLocaleString()}
                        {task.scheduled_for && ` • Scheduled: ${new Date(task.scheduled_for).toLocaleString()}`}
                      </div>
                      {task.error_message && (
                        <div className="text-sm text-red-600 mt-1">{task.error_message}</div>
                      )}
                    </div>
                    {task.status === 'awaiting_approval' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveTask(task.id)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectTask(task.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && config && (
        <div className="space-y-6">
          {/* General Settings */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">General Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => updateConfig({ name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
                <select
                  value={config.llm_model}
                  onChange={(e) => updateConfig({ llm_model: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
              </div>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Rate Limits</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Leads/Day</label>
                <input
                  type="number"
                  value={config.max_leads_per_day}
                  onChange={(e) => updateConfig({ max_leads_per_day: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Messages/Day</label>
                <input
                  type="number"
                  value={config.max_messages_per_day}
                  onChange={(e) => updateConfig({ max_messages_per_day: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Actions/Hour</label>
                <input
                  type="number"
                  value={config.max_actions_per_hour}
                  onChange={(e) => updateConfig({ max_actions_per_hour: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Schedule Settings */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Schedule</h3>
              <button
                onClick={() => updateConfig({ schedule_enabled: !config.schedule_enabled })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  config.schedule_enabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    config.schedule_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {config.schedule_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={config.schedule_start_time}
                    onChange={(e) => updateConfig({ schedule_start_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={config.schedule_end_time}
                    onChange={(e) => updateConfig({ schedule_end_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={config.schedule_timezone}
                    onChange={(e) => updateConfig({ schedule_timezone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Automation Settings */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Automation</h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-respond to positive replies</span>
                <button
                  onClick={() => updateConfig({ auto_respond_to_positive: !config.auto_respond_to_positive })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.auto_respond_to_positive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      config.auto_respond_to_positive ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-respond to questions</span>
                <button
                  onClick={() => updateConfig({ auto_respond_to_questions: !config.auto_respond_to_questions })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.auto_respond_to_questions ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      config.auto_respond_to_questions ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-book meetings</span>
                <button
                  onClick={() => updateConfig({ auto_book_meetings: !config.auto_book_meetings })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.auto_book_meetings ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      config.auto_book_meetings ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Rule Modal */}
      {showRuleModal && (
        <RuleModal
          rule={editingRule}
          onClose={() => {
            setShowRuleModal(false);
            setEditingRule(null);
          }}
          onSave={loadData}
        />
      )}
    </div>
  );
}

// Rule Modal Component
function RuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule: AgentRule | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [ruleType, setRuleType] = useState<AgentRule['rule_type']>(rule?.rule_type || 'action');
  const [condition, setCondition] = useState(rule?.condition || '');
  const [action, setAction] = useState(rule?.action || '');
  const [priority, setPriority] = useState(rule?.priority || 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);

    const data = {
      name,
      description,
      rule_type: ruleType,
      condition,
      action,
      priority,
    };

    const url = rule ? `/api/agent/rules/${rule.id}` : '/api/agent/rules';
    const method = rule ? 'PATCH' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{rule ? 'Edit Rule' : 'Add Rule'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Skip Competitors"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as AgentRule['rule_type'])}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="filter">Filter</option>
                <option value="action">Action</option>
                <option value="constraint">Constraint</option>
                <option value="template">Template</option>
                <option value="schedule">Schedule</option>
                <option value="escalation">Escalation</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IF (Condition)</label>
            <textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g., Reply is classified as 'interested'"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">THEN (Action)</label>
            <textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g., Send calendar link and suggest times"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name || !condition || !action || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
