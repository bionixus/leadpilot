'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Calls onboard API when user is signed in but has no public.users row (e.g. after email confirm). */
export function OnboardTrigger() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/auth/onboard', { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => {});
  }, [router]);
  return null;
}
