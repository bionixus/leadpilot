'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  X,
  Zap,
  Settings,
  Mail,
  Users,
  Sparkles,
  Check,
  ChevronRight,
  Rocket,
} from 'lucide-react';

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  completed: boolean;
};

type OnboardingProgress = {
  hasBusinessContext: boolean;
  hasEmailAccount: boolean;
  hasCampaign: boolean;
  hasLeads: boolean;
  hasSequences: boolean;
};

type Props = {
  userName?: string;
  progress: OnboardingProgress;
};

export default function OnboardingModal({ userName, progress }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const steps: OnboardingStep[] = [
    {
      id: 'business-context',
      title: 'Set up your business context',
      description: 'Help AI generate better emails by describing your business',
      icon: <Settings className="w-5 h-5" />,
      href: '/settings',
      completed: progress.hasBusinessContext,
    },
    {
      id: 'email-account',
      title: 'Connect an email account',
      description: 'Add Gmail, Outlook, or custom SMTP to send emails',
      icon: <Mail className="w-5 h-5" />,
      href: '/email-accounts',
      completed: progress.hasEmailAccount,
    },
    {
      id: 'campaign',
      title: 'Create your first campaign',
      description: 'Organize your outreach into campaigns',
      icon: <Rocket className="w-5 h-5" />,
      href: '/campaigns/new',
      completed: progress.hasCampaign,
    },
    {
      id: 'leads',
      title: 'Import leads',
      description: 'Add leads via CSV or scraping integrations',
      icon: <Users className="w-5 h-5" />,
      href: '/leads',
      completed: progress.hasLeads,
    },
    {
      id: 'sequences',
      title: 'Generate AI sequences',
      description: 'Let AI create personalized email sequences',
      icon: <Sparkles className="w-5 h-5" />,
      href: '/sequences',
      completed: progress.hasSequences,
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const isComplete = completedCount === steps.length;

  useEffect(() => {
    // Check localStorage to see if the modal was already dismissed
    const wasDismissed = localStorage.getItem('leadpilot-onboarding-dismissed');
    if (wasDismissed === 'true' || isComplete) {
      setDismissed(true);
    } else if (!progress.hasBusinessContext && !progress.hasEmailAccount && !progress.hasCampaign) {
      // Show modal if user is brand new
      setIsOpen(true);
    }
  }, [isComplete, progress]);

  function handleDismiss() {
    localStorage.setItem('leadpilot-onboarding-dismissed', 'true');
    setDismissed(true);
    setIsOpen(false);
  }

  function handleSkip() {
    setIsOpen(false);
  }

  if (dismissed && !isOpen) {
    return null;
  }

  // Render as a sidebar card when dismissed, or as a modal when open
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-white border shadow-lg rounded-xl p-4 flex items-center gap-3 hover:shadow-xl transition-shadow z-50"
      >
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium">Setup Progress</p>
          <p className="text-xs text-gray-500">{completedCount} of {steps.length} complete</p>
        </div>
        <div className="ml-2">
          <div className="w-12 h-12 relative">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="#e5e7eb"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${(completedCount / steps.length) * 125.6} 125.6`}
                className="text-primary"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
              {Math.round((completedCount / steps.length) * 100)}%
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Welcome to LeadPilot!</h2>
                <p className="text-sm text-white/80">
                  {userName ? `Hi ${userName}! ` : ''}Let&apos;s get you started
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Setup progress</span>
            <span className="text-sm text-gray-500">{completedCount} of {steps.length}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="p-4 max-h-80 overflow-y-auto">
          <ul className="space-y-2">
            {steps.map((step, index) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    step.completed
                      ? 'bg-green-50 text-green-800'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {step.completed ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="font-medium">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${step.completed ? 'line-through text-green-700' : ''}`}>
                      {step.title}
                    </p>
                    <p className={`text-sm ${step.completed ? 'text-green-600' : 'text-gray-500'}`}>
                      {step.description}
                    </p>
                  </div>
                  {!step.completed && (
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            I&apos;ll explore on my own
          </button>
          {isComplete ? (
            <button
              onClick={handleDismiss}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
            >
              Get Started
            </button>
          ) : (
            <Link
              href={steps.find(s => !s.completed)?.href || '/'}
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium inline-flex items-center gap-2"
            >
              Continue Setup
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
