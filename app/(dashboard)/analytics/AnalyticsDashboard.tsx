'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Users, Mail, MessageSquare, TrendingUp, Sparkles, Target } from 'lucide-react';

type OverviewData = {
  totalLeads: number;
  activeCampaigns: number;
  totalCampaigns: number;
  emailsSent: number;
  emailsScheduled: number;
  totalReplies: number;
  interestedReplies: number;
  questionReplies: number;
  replyRate: number;
  totalSequences: number;
};

type LeadStatusData = {
  status: string;
  count: number;
};

type TimeSeriesData = {
  date: string;
  emails: number;
  replies: number;
};

type CampaignPerformance = {
  id: string;
  status: string;
  leads: number;
  sent: number;
  replies: number;
  positive: number;
  replyRate: number;
};

type AnalyticsData = {
  overview: OverviewData;
  leadStatusData: LeadStatusData[];
  timeSeriesData: TimeSeriesData[];
  campaignPerformance: CampaignPerformance[];
};

const STATUS_COLORS: Record<string, string> = {
  new: '#94a3b8',
  contacted: '#60a5fa',
  replied: '#a78bfa',
  interested: '#4ade80',
  not_interested: '#f87171',
  bounced: '#fb923c',
  sequenced: '#818cf8',
  active: '#2dd4bf',
};

const PIE_COLORS = ['#4ade80', '#60a5fa', '#a78bfa', '#f87171', '#fb923c', '#94a3b8', '#818cf8', '#2dd4bf'];

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${timeRange}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border p-6 h-80 animate-pulse">
          <div className="h-full bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">Failed to load analytics</p>
      </div>
    );
  }

  const { overview, leadStatusData, timeSeriesData, campaignPerformance } = data;

  // Format time series dates for display
  const formattedTimeData = timeSeriesData.map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-end gap-2">
        {[7, 14, 30, 90].map(days => (
          <button
            key={days}
            onClick={() => setTimeRange(days)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              timeRange === days
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {days}d
          </button>
        ))}
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Users className="w-5 h-5" />}
          label="Total Leads"
          value={overview.totalLeads}
          color="blue"
        />
        <MetricCard
          icon={<Target className="w-5 h-5" />}
          label="Active Campaigns"
          value={overview.activeCampaigns}
          subtitle={`of ${overview.totalCampaigns} total`}
          color="green"
        />
        <MetricCard
          icon={<Mail className="w-5 h-5" />}
          label="Emails Sent"
          value={overview.emailsSent}
          subtitle={`${overview.emailsScheduled} scheduled`}
          color="purple"
        />
        <MetricCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Reply Rate"
          value={`${overview.replyRate}%`}
          color="orange"
        />
        <MetricCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="Total Replies"
          value={overview.totalReplies}
          color="cyan"
        />
        <MetricCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Interested"
          value={overview.interestedReplies}
          color="green"
        />
        <MetricCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="Questions"
          value={overview.questionReplies}
          color="blue"
        />
        <MetricCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Sequences"
          value={overview.totalSequences}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emails & Replies Over Time */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Emails & Replies Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formattedTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="displayDate" 
                fontSize={12} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="emails"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                name="Emails Sent"
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

        {/* Lead Status Breakdown */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Lead Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={leadStatusData}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ status, percent }) => 
                  `${status} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {leadStatusData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={STATUS_COLORS[entry.status] || PIE_COLORS[index % PIE_COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign Performance */}
      {campaignPerformance.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Campaign Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={campaignPerformance.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" fontSize={12} />
              <YAxis 
                type="category" 
                dataKey="id" 
                width={80}
                fontSize={12}
                tickFormatter={(value) => value.slice(0, 8) + '...'}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="sent" fill="#8b5cf6" name="Sent" />
              <Bar dataKey="replies" fill="#4ade80" name="Replies" />
              <Bar dataKey="positive" fill="#2dd4bf" name="Positive" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'cyan';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
