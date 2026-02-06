'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Zap,
  Bot,
  Mail,
  Users,
  Target,
  BarChart3,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  Play,
  Star,
  ChevronRight,
  Sparkles,
  Globe,
  Shield,
  Clock,
} from 'lucide-react';

const ROTATING_WORDS = ['leads', 'campaigns', 'sequences', 'replies', 'revenue'];

export default function MarketingPage() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        setIsVisible(true);
      }, 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">LeadPilot</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </Link>
              <Link href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">
                How it works
              </Link>
              <Link href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">
                Pricing
              </Link>
              <Link href="#testimonials" className="text-gray-600 hover:text-gray-900 transition-colors">
                Testimonials
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/app"
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-6">
          {/* Announcement Badge */}
          <div className="flex justify-center mb-8">
            <Link
              href="#"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm hover:shadow-md transition-all group"
            >
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">
                New
              </span>
              <span className="text-sm text-gray-600">Introducing Multi-LLM Support</span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Main Headline */}
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight mb-6">
              Generate more{' '}
              <span
                className={`inline-block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent transition-all duration-200 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                }`}
              >
                {ROTATING_WORDS[currentWordIndex]}
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              AI-powered outreach that finds leads, writes personalized sequences, and sends them
              automatically. Your sales team on autopilot.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-lg shadow-gray-900/25 flex items-center justify-center gap-2"
              >
                Start free trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 bg-white text-gray-900 rounded-2xl font-semibold text-lg border border-gray-200 hover:border-gray-300 transition-all hover:shadow-md flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                Watch demo
              </button>
            </div>

            {/* Social Proof */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <span className="text-gray-600">
                  <strong className="text-gray-900">4.9/5</strong> from 200+ reviews
                </span>
              </div>
            </div>
          </div>

          {/* Hero Image/Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative mx-auto max-w-5xl rounded-2xl overflow-hidden shadow-2xl shadow-gray-900/10 border border-gray-200">
              <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-gray-400 text-sm">app.leadpilot.io</div>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-white p-8">
                <div className="flex gap-6">
                  {/* Sidebar Preview */}
                  <div className="w-48 flex-shrink-0 space-y-2">
                    {['Autopilot', 'Campaigns', 'Leads', 'Inbox', 'Sequences'].map((item, i) => (
                      <div
                        key={item}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
                          i === 0 ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  {/* Main Content Preview */}
                  <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="h-3 bg-gray-100 rounded w-5/6" />
                      <div className="h-3 bg-gray-100 rounded w-4/6" />
                    </div>
                    <div className="mt-6 flex gap-2">
                      <div className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
                        Send message
                      </div>
                      <div className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg">
                        View leads
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos Section */}
      <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-gray-500 text-sm font-medium mb-8">
            TRUSTED BY SALES TEAMS AT
          </p>
          <div className="flex items-center justify-center gap-12 md:gap-16 flex-wrap opacity-50 grayscale">
            {['Company 1', 'Company 2', 'Company 3', 'Company 4', 'Company 5'].map((company) => (
              <div key={company} className="text-2xl font-bold text-gray-400">
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Features
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to scale outreach
            </h2>
            <p className="text-xl text-gray-600">
              From lead discovery to personalized sequences, LeadPilot handles it all with AI.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Bot,
                title: 'AI Autopilot',
                description:
                  'Chat with AI to set up campaigns. Just answer 5 questions and watch it find leads and create sequences.',
                color: 'blue',
              },
              {
                icon: Users,
                title: 'Lead Discovery',
                description:
                  'Find leads from LinkedIn, Apollo, Google Maps, and more. Automatic enrichment with emails and phone numbers.',
                color: 'purple',
              },
              {
                icon: Mail,
                title: 'Email Sequences',
                description:
                  'AI-generated personalized emails that get replies. Multi-step sequences with smart follow-ups.',
                color: 'green',
              },
              {
                icon: MessageSquare,
                title: 'Multi-Channel',
                description:
                  'Reach leads via Email, WhatsApp, and SMS. All channels unified in one inbox.',
                color: 'orange',
              },
              {
                icon: Target,
                title: 'Smart Classification',
                description:
                  'AI automatically classifies replies as interested, not interested, or needs follow-up.',
                color: 'pink',
              },
              {
                icon: BarChart3,
                title: 'Analytics',
                description:
                  'Track opens, clicks, replies, and conversions. Know what&apos;s working and optimize.',
                color: 'cyan',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group p-8 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-xl transition-all duration-300"
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                    feature.color === 'blue'
                      ? 'bg-blue-100 text-blue-600'
                      : feature.color === 'purple'
                        ? 'bg-purple-100 text-purple-600'
                        : feature.color === 'green'
                          ? 'bg-green-100 text-green-600'
                          : feature.color === 'orange'
                            ? 'bg-orange-100 text-orange-600'
                            : feature.color === 'pink'
                              ? 'bg-pink-100 text-pink-600'
                              : 'bg-cyan-100 text-cyan-600'
                  }`}
                >
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full text-sm font-medium mb-4">
              <Clock className="w-4 h-4" />
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              From zero to sending in minutes
            </h2>
            <p className="text-xl text-gray-600">
              Set up your first campaign in under 5 minutes with our AI-guided flow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Chat with AI',
                description:
                  'Tell our AI about your ideal customers, target markets, and what you offer. Just like talking to a colleague.',
              },
              {
                step: '02',
                title: 'Review & Approve',
                description:
                  'AI finds leads and generates personalized sequences. Review everything or let it run on full autopilot.',
              },
              {
                step: '03',
                title: 'Watch It Work',
                description:
                  'Sequences send automatically at optimal times. Get notified when leads reply. Close deals.',
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-gray-300 to-transparent -translate-x-1/2" />
                )}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 relative">
                  <div className="text-6xl font-bold text-gray-100 absolute top-4 right-4">
                    {item.step}
                  </div>
                  <div className="relative">
                    <div className="w-12 h-12 bg-gray-900 text-white rounded-xl flex items-center justify-center text-lg font-bold mb-6">
                      {item.step}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                    <p className="text-gray-600 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-sm font-medium mb-4">
              <Star className="w-4 h-4" />
              Testimonials
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Loved by sales teams
            </h2>
            <p className="text-xl text-gray-600">
              See what our customers are saying about LeadPilot.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote:
                  'LeadPilot has transformed how we do outreach. The AI writes better emails than we ever did, and the autopilot feature saves us hours every day.',
                author: 'Sarah Chen',
                role: 'VP of Sales, TechCorp',
                avatar: 'SC',
              },
              {
                quote:
                  'We went from 50 to 500 leads per month using LeadPilot. The multi-channel approach really works - combining email with WhatsApp doubled our reply rate.',
                author: 'Marcus Johnson',
                role: 'Founder, GrowthStack',
                avatar: 'MJ',
              },
              {
                quote:
                  "The best part is the AI classification. I only see interested replies now, which means I'm spending time on leads that actually want to talk.",
                author: 'Emily Rodriguez',
                role: 'SDR Manager, ScaleUp Inc',
                avatar: 'ER',
              },
            ].map((testimonial) => (
              <div
                key={testimonial.author}
                className="p-8 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex mb-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-6">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.author}</div>
                    <div className="text-sm text-gray-500">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section id="pricing" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              Pricing
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-gray-600">
              Start free, upgrade when you&apos;re ready. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: 'Starter',
                price: 'Free',
                description: 'Perfect for trying out LeadPilot',
                features: [
                  '100 leads/month',
                  '500 emails/month',
                  'Basic AI sequences',
                  'Email support',
                ],
                cta: 'Get started',
                highlighted: false,
              },
              {
                name: 'Pro',
                price: '$79',
                period: '/month',
                description: 'For growing sales teams',
                features: [
                  'Unlimited leads',
                  '5,000 emails/month',
                  'Advanced AI + Multi-LLM',
                  'WhatsApp & SMS',
                  'Priority support',
                ],
                cta: 'Start free trial',
                highlighted: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                description: 'For large organizations',
                features: [
                  'Unlimited everything',
                  'Custom integrations',
                  'Dedicated account manager',
                  'SLA guarantee',
                  'Custom training',
                ],
                cta: 'Contact sales',
                highlighted: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`p-8 rounded-2xl border ${
                  plan.highlighted
                    ? 'bg-gray-900 text-white border-gray-900 scale-105 shadow-2xl'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="mb-6">
                  <h3
                    className={`text-xl font-bold mb-2 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}
                  >
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-4xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}
                    >
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className={plan.highlighted ? 'text-gray-400' : 'text-gray-500'}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 ${plan.highlighted ? 'text-gray-400' : 'text-gray-500'}`}>
                    {plan.description}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <CheckCircle
                        className={`w-5 h-5 flex-shrink-0 ${plan.highlighted ? 'text-green-400' : 'text-green-500'}`}
                      />
                      <span className={plan.highlighted ? 'text-gray-300' : 'text-gray-600'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.name === 'Enterprise' ? '#' : '/signup'}
                  className={`block w-full py-3 px-4 rounded-xl font-semibold text-center transition-all ${
                    plan.highlighted
                      ? 'bg-white text-gray-900 hover:bg-gray-100'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-3xl" />
        
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to automate your outreach?
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Join thousands of sales teams using LeadPilot to find leads, write personalized
            sequences, and close more deals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-white text-gray-900 rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
            >
              Start your free trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#"
              className="w-full sm:w-auto px-8 py-4 text-white border border-gray-700 rounded-2xl font-semibold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-6 text-gray-500 text-sm">
            No credit card required. 14-day free trial.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-5 gap-12">
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-gray-900">LeadPilot</span>
              </Link>
              <p className="text-gray-500 mb-6 max-w-sm">
                AI-powered sales outreach that finds leads, writes sequences, and sends them on
                autopilot.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <Globe className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <MessageSquare className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-3">
                {['Features', 'Pricing', 'Integrations', 'Changelog'].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Resources</h4>
              <ul className="space-y-3">
                {['Documentation', 'Blog', 'Support', 'API'].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3">
                {['About', 'Careers', 'Privacy', 'Terms'].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} LeadPilot. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              SOC 2 Compliant
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
