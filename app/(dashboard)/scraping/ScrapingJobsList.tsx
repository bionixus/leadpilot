'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Job = {
  id: string;
  job_type: string;
  status: string;
  campaign_id: string | null;
  campaignName: string | null | undefined;
  results_count: number | null;
  leads_created: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type Campaign = {
  id: string;
  name: string;
};

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

const jobTypeLabels: Record<string, string> = {
  linkedin_search: 'LinkedIn Search',
  linkedin_profile: 'LinkedIn Profile',
  apollo_search: 'Apollo Search',
  apollo_enrich: 'Apollo Enrich',
  google_maps: 'Google Maps',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ScrapingJobsList({
  jobs,
  campaigns,
}: {
  jobs: Job[];
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [pollingJobs, setPollingJobs] = useState<Set<string>>(new Set());

  // Poll running jobs for status updates
  useEffect(() => {
    const runningJobIds = jobs.filter(j => j.status === 'running').map(j => j.id);
    if (runningJobIds.length === 0) return;

    setPollingJobs(new Set(runningJobIds));

    const interval = setInterval(async () => {
      let hasChanges = false;

      for (const jobId of runningJobIds) {
        try {
          const res = await fetch(`/api/scraping/jobs/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status !== 'running') {
              hasChanges = true;
            }
          }
        } catch {
          // Ignore errors
        }
      }

      if (hasChanges) {
        router.refresh();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobs, router]);

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <p className="text-gray-500">No scraping jobs yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Start a new job to import leads from LinkedIn or Apollo
        </p>
        <Link
          href="/scraping/new"
          className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
        >
          New Scraping Job
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 text-left text-sm text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Campaign</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Results</th>
            <th className="px-4 py-3 font-medium">Leads Created</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className="font-medium">
                  {jobTypeLabels[job.job_type] || job.job_type}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {job.campaignName ? (
                  <Link
                    href={`/campaigns/${job.campaign_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {job.campaignName}
                  </Link>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[job.status] || statusColors.pending
                  }`}
                >
                  {job.status === 'running' && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  )}
                  {job.status}
                </span>
                {job.error_message && (
                  <p className="text-xs text-red-500 mt-1 truncate max-w-xs">
                    {job.error_message}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                {job.results_count ?? '-'}
              </td>
              <td className="px-4 py-3 text-sm">
                {job.leads_created ?? '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {formatDate(job.started_at)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {formatDate(job.completed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
