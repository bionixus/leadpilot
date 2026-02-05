'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Bot,
  User,
  Loader2,
  Settings2,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  Users,
  FileText,
  Zap,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  status: string;
  target_customer?: string;
  target_countries?: string[];
  target_titles?: string[];
  company_size?: string;
  competitors?: string[];
  business_description?: string;
  benefits?: string;
  cta?: string;
  autopilot_level?: string;
  leads_found?: number;
  sequences_generated?: number;
  conversation_history: Message[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  onboarding: { label: 'Setting up', color: 'blue', icon: Settings2 },
  collecting_info: { label: 'Collecting info', color: 'blue', icon: FileText },
  finding_leads: { label: 'Finding leads', color: 'yellow', icon: Users },
  generating: { label: 'Generating', color: 'yellow', icon: Zap },
  awaiting_approval: { label: 'Awaiting approval', color: 'orange', icon: Clock },
  sending: { label: 'Sending', color: 'green', icon: Send },
  paused: { label: 'Paused', color: 'gray', icon: Clock },
  completed: { label: 'Completed', color: 'green', icon: CheckCircle2 },
};

export default function AutopilotPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Welcome to LeadPilot Autopilot! 🚀

I'm here to help you find leads and create personalized outreach campaigns.

Here's how this works:
1. I'll ask you a few questions about your ideal customers
2. You'll tell me about your business and what you're offering
3. You choose how much control you want (full autopilot or review first)
4. I'll find leads, write personalized sequences, and send them for you

**Ready to get started?** Tell me about your ideal customer. For example:
- "Marketing managers at B2B SaaS companies"
- "Founders of early-stage startups"
- "HR directors at enterprise companies"`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setLoading(true);

    try {
      const response = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session?.id,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setSession(data.session);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, session?.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewSession = () => {
    setSession(null);
    setMessages([
      {
        role: 'assistant',
        content: `Let's start fresh! Tell me about your ideal customer.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const statusConfig = session?.status ? STATUS_CONFIG[session.status] : null;

  return (
    <div className="h-[calc(100vh-120px)] flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autopilot</h1>
            <p className="text-gray-500">Chat with AI to find leads and create outreach</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={startNewSession}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-6 h-6 text-blue-600" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-5 py-3 ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <p
                    className={`text-xs mt-2 ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <span className="text-gray-500">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session Status Sidebar */}
      {session && (
        <div className="w-80 ml-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
            <h3 className="font-semibold text-gray-900 mb-4">Session Progress</h3>

            {/* Status Badge */}
            {statusConfig && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${
                  statusConfig.color === 'blue'
                    ? 'bg-blue-50 text-blue-700'
                    : statusConfig.color === 'yellow'
                      ? 'bg-yellow-50 text-yellow-700'
                      : statusConfig.color === 'orange'
                        ? 'bg-orange-50 text-orange-700'
                        : statusConfig.color === 'green'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-50 text-gray-700'
                }`}
              >
                <statusConfig.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{statusConfig.label}</span>
              </div>
            )}

            {/* Collected Info */}
            <div className="space-y-3">
              <InfoItem label="Target Customer" value={session.target_customer} />
              <InfoItem label="Countries" value={session.target_countries?.join(', ')} />
              <InfoItem label="Job Titles" value={session.target_titles?.join(', ')} />
              <InfoItem label="Company Size" value={session.company_size} />
              <InfoItem label="Competitors" value={session.competitors?.join(', ')} />

              {session.business_description && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <InfoItem label="Business" value={session.business_description} />
                  <InfoItem label="Benefits" value={session.benefits} />
                  <InfoItem label="CTA" value={session.cta} />
                </>
              )}

              {session.autopilot_level && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <InfoItem
                    label="Autopilot Level"
                    value={
                      session.autopilot_level === 'full_autopilot'
                        ? 'Full Autopilot'
                        : session.autopilot_level === 'approve_list'
                          ? 'Approve List First'
                          : 'Approve Everything'
                    }
                  />
                </>
              )}

              {(session.leads_found || session.sequences_generated) && (
                <>
                  <div className="h-px bg-gray-200 my-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {session.leads_found || 0}
                      </div>
                      <div className="text-xs text-gray-500">Leads Found</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {session.sequences_generated || 0}
                      </div>
                      <div className="text-xs text-gray-500">Sequences</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            {session.status === 'awaiting_approval' && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => router.push(`/autopilot/${session.id}/review`)}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  Review & Approve
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}
