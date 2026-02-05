'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Campaign = {
  id: string;
  name: string;
};

type JobType = 'linkedin_search' | 'linkedin_profile' | 'apollo_search' | 'google_maps';

const jobTypeOptions: { value: JobType; label: string; description: string }[] = [
  {
    value: 'linkedin_search',
    label: 'LinkedIn Search',
    description: 'Search LinkedIn for people by keywords, title, company, etc.',
  },
  {
    value: 'linkedin_profile',
    label: 'LinkedIn Profiles',
    description: 'Scrape profiles from a list of LinkedIn URLs.',
  },
  {
    value: 'apollo_search',
    label: 'Apollo Search',
    description: 'Search Apollo.io for contacts with email addresses.',
  },
  {
    value: 'google_maps',
    label: 'Google Maps',
    description: 'Find local businesses from Google Maps.',
  },
];

export default function NewScrapingForm({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [jobType, setJobType] = useState<JobType>('linkedin_search');
  const [campaignId, setCampaignId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LinkedIn Search fields
  const [searchUrl, setSearchUrl] = useState('');
  const [maxResults, setMaxResults] = useState(100);

  // LinkedIn Profile fields
  const [profileUrls, setProfileUrls] = useState('');

  // Apollo Search fields
  const [apolloQuery, setApolloQuery] = useState('');
  const [apolloTitles, setApolloTitles] = useState('');

  // Google Maps fields
  const [mapsQuery, setMapsQuery] = useState('');
  const [mapsLocation, setMapsLocation] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Build input_config based on job type
    let inputConfig: Record<string, unknown> = {};
    let endpoint = '/api/scraping/linkedin';

    switch (jobType) {
      case 'linkedin_search':
        if (!searchUrl) {
          setError('Please enter a LinkedIn search URL');
          setLoading(false);
          return;
        }
        inputConfig = {
          searchUrl,
          maxResults,
        };
        endpoint = '/api/scraping/linkedin';
        break;

      case 'linkedin_profile':
        if (!profileUrls.trim()) {
          setError('Please enter LinkedIn profile URLs');
          setLoading(false);
          return;
        }
        inputConfig = {
          profileUrls: profileUrls.split('\n').map(u => u.trim()).filter(Boolean),
        };
        endpoint = '/api/scraping/linkedin';
        break;

      case 'apollo_search':
        if (!apolloQuery.trim()) {
          setError('Please enter search criteria');
          setLoading(false);
          return;
        }
        inputConfig = {
          searchQuery: apolloQuery,
          titles: apolloTitles.split(',').map(t => t.trim()).filter(Boolean),
          maxResults,
        };
        endpoint = '/api/scraping/apollo';
        break;

      case 'google_maps':
        if (!mapsQuery.trim()) {
          setError('Please enter a search query');
          setLoading(false);
          return;
        }
        inputConfig = {
          searchQuery: mapsQuery,
          location: mapsLocation || undefined,
          maxResults,
        };
        endpoint = '/api/scraping/google-maps';
        break;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId || null,
          job_type: jobType,
          input_config: inputConfig,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start job');
      }

      // Redirect to scraping jobs page
      router.push('/scraping');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Job Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Source</label>
        <div className="grid grid-cols-2 gap-3">
          {jobTypeOptions.map((option) => (
            <label
              key={option.value}
              className={`relative flex flex-col p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors ${
                jobType === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="jobType"
                value={option.value}
                checked={jobType === option.value}
                onChange={(e) => setJobType(e.target.value as JobType)}
                className="sr-only"
              />
              <span className="font-medium">{option.label}</span>
              <span className="text-sm text-gray-500 mt-1">
                {option.description}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Campaign Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Campaign (optional)
        </label>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">No campaign - import as standalone leads</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Dynamic fields based on job type */}
      {jobType === 'linkedin_search' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">
              LinkedIn Search URL
            </label>
            <input
              type="url"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              Perform a search on LinkedIn and paste the URL here
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Max Results
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              min={1}
              max={1000}
              className="w-32 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}

      {jobType === 'linkedin_profile' && (
        <div>
          <label className="block text-sm font-medium mb-2">
            LinkedIn Profile URLs (one per line)
          </label>
          <textarea
            value={profileUrls}
            onChange={(e) => setProfileUrls(e.target.value)}
            placeholder="https://www.linkedin.com/in/example1/&#10;https://www.linkedin.com/in/example2/"
            rows={6}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      )}

      {jobType === 'apollo_search' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">
              Search Query
            </label>
            <input
              type="text"
              value={apolloQuery}
              onChange={(e) => setApolloQuery(e.target.value)}
              placeholder="e.g., SaaS companies in San Francisco"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Job Titles (comma separated)
            </label>
            <input
              type="text"
              value={apolloTitles}
              onChange={(e) => setApolloTitles(e.target.value)}
              placeholder="CEO, CTO, VP of Engineering"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Max Results
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              min={1}
              max={1000}
              className="w-32 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}

      {jobType === 'google_maps' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">
              Search Query
            </label>
            <input
              type="text"
              value={mapsQuery}
              onChange={(e) => setMapsQuery(e.target.value)}
              placeholder="e.g., restaurants, dentists, law firms"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Location
            </label>
            <input
              type="text"
              value={mapsLocation}
              onChange={(e) => setMapsLocation(e.target.value)}
              placeholder="e.g., New York, NY"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Max Results
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              min={1}
              max={1000}
              className="w-32 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50 hover:bg-primary/90"
        >
          {loading ? 'Starting...' : 'Start Scraping'}
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-6 py-2 border rounded-lg font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
