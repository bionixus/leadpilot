'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowLeft, Send, Users, Mail, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job_title: string;
}

interface SequenceStep {
  step: number;
  delay_days: number;
  channel: string;
  subject?: string;
  body: string;
}

interface Sequence {
  id: string;
  lead_id: string;
  emails?: SequenceStep[];
  steps?: SequenceStep[];
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get session
      const sessionRes = await fetch(`/api/autopilot/${sessionId}`);
      const sessionData = await sessionRes.json();

      // Get leads for this session's campaign
      if (sessionData.campaign_id) {
        const leadsRes = await fetch(`/api/campaigns/${sessionData.campaign_id}/leads`);
        const leadsData = await leadsRes.json();
        setLeads(leadsData || []);

        // Pre-select all leads
        setSelectedLeads(new Set((leadsData || []).map((l: Lead) => l.id)));

        // Get sequences
        const seqRes = await fetch(`/api/sequences?campaign_id=${sessionData.campaign_id}`);
        const seqData = await seqRes.json();
        setSequences(seqData || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const toggleAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)));
    }
  };

  const approveAndStart = async () => {
    setApproving(true);
    try {
      // Approve selected leads
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve_leads',
          lead_ids: Array.from(selectedLeads),
        }),
      });

      // Approve sequences
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve_sequences',
        }),
      });

      // Start sending
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'start_sending',
        }),
      });

      router.push('/autopilot');
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review & Approve</h1>
            <p className="text-gray-500">Review leads and sequences before sending</p>
          </div>
        </div>
        <button
          onClick={approveAndStart}
          disabled={approving || selectedLeads.size === 0}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {approving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Approving...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Approve & Start ({selectedLeads.size})
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{leads.length}</div>
              <div className="text-sm text-gray-500">Total Leads</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{selectedLeads.size}</div>
              <div className="text-sm text-gray-500">Selected</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{sequences.length}</div>
              <div className="text-sm text-gray-500">Sequences</div>
            </div>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Leads to Contact</h2>
          <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline">
            {selectedLeads.size === leads.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {leads.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No leads found for this session yet.
          </div>
        ) : (
          <div className="divide-y">
            {leads.map((lead) => {
              const sequence = sequences.find((s) => s.lead_id === lead.id);
              const isExpanded = expandedSequence === lead.id;
              const steps = sequence?.steps || sequence?.emails || [];

              return (
                <div key={lead.id}>
                  <div
                    className={`px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 ${
                      selectedLeads.has(lead.id) ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleLead(lead.id)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedLeads.has(lead.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedLeads.has(lead.id) && <Check className="w-4 h-4 text-white" />}
                    </button>

                    <div className="flex-1">
                      <div className="font-medium">
                        {lead.first_name} {lead.last_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {lead.job_title} at {lead.company}
                      </div>
                      <div className="text-sm text-gray-400">{lead.email}</div>
                    </div>

                    {sequence && steps.length > 0 && (
                      <button
                        onClick={() => setExpandedSequence(isExpanded ? null : lead.id)}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                      >
                        View sequence
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded Sequence Preview */}
                  {isExpanded && sequence && steps.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 border-t">
                      <div className="space-y-4">
                        {steps.map((step: SequenceStep, i: number) => (
                          <div key={i} className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                              {step.step}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">
                                  {step.channel || 'email'}
                                </span>
                                <span className="text-xs text-gray-500">Day {step.delay_days}</span>
                              </div>
                              {step.subject && (
                                <div className="font-medium text-sm mb-1">{step.subject}</div>
                              )}
                              <div className="text-sm text-gray-600 whitespace-pre-wrap">
                                {step.body}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
