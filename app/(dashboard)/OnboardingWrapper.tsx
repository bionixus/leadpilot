'use client';

import { useState, useEffect } from 'react';
import OnboardingModal from './OnboardingModal';

type Props = {
  userName?: string;
};

export default function OnboardingWrapper({ userName }: Props) {
  const [progress, setProgress] = useState<{
    hasBusinessContext: boolean;
    hasEmailAccount: boolean;
    hasCampaign: boolean;
    hasLeads: boolean;
    hasSequences: boolean;
  } | null>(null);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/onboarding/progress');
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
      }
    } catch (err) {
      console.error('Failed to fetch onboarding progress:', err);
    }
  };

  if (!progress) {
    return null;
  }

  return <OnboardingModal userName={userName} progress={progress} />;
}
