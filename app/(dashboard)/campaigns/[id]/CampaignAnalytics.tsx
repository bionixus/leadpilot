'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Mail, Eye, MessageSquare, ThumbsUp, AlertCircle } from 'lucide-react';

type CampaignStats = {
  overview: {
    totalLeads: number;
    contacted: number;
    replied: number;
    interested: number;
    notInterested: number;
    bounced: number;
    emailsSent: number;
    emailsOpened: number;
    replyRate: number;
    openRate: number;
  };
  timeline: Array<{ date: string; sent: number; replies: number }>;
  funnel: Array<{ stage: string; count: number; color: string }>;
};

type Props = {
  campaignId: string;
};

export function CampaignAnalytics({ campaignId }: Props) {
  const [data, setData] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [campaignId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analytics`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch campaign analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
        <div className="h-48 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { overview, timeline, funnel } = data;

  const formattedTimeline = timeline.map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<Mail className="w-4 h-4" />}
          label="Sent"
          value={overview.emailsSent}
          color="purple"
        />
        <StatCard
          icon={<Eye className="w-4 h-4" />}
          label="Opened"
          value={overview.emailsOpened}
          subtitle={`${overview.openRate}%`}
          color="blue"
        />
        <StatCard
          icon={<MessageSquare className="w-4 h-4" />}
          label="Replied"
          value={overview.replied}
          subtitle={`${overview.replyRate}%`}
          color="cyan"
        />
        <StatCard
          icon={<ThumbsUp className="w-4 h-4" />}
          label="Interested"
          value={overview.interested}
          color="green"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Not Interested"
          value={overview.notInterested}
          color="orange"
        />
        <StatCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Bounced"
          value={overview.bounced}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Lead Funnel</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="stage" width={100} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funnel.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Timeline Chart */}
        {formattedTimeline.length > 0 && (
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-medium mb-4">Activity Over Time</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={formattedTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="displayDate" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="Sent"
                />
                <Line
                  type="monotone"
                  dataKey="replies"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={false}
                  name="Replies"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  color: 'purple' | 'blue' | 'cyan' | 'green' | 'orange' | 'red';
}) {
  const colorClasses = {
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold">{value.toLocaleString()}</div>
      {subtitle && (
        <div className="text-xs text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}
