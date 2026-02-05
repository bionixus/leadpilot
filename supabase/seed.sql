-- LeadPilot seed data
-- Run after migrations: supabase db seed (or supabase db reset)

-- BioNixus organization with business context for LLM personalization
INSERT INTO organizations (name, business_context)
SELECT
  'BioNixus',
  '{
    "company_name": "BioNixus",
    "industry": "Pharmaceutical Market Research",
    "target_audience": "Pharma brand managers, medical affairs directors",
    "value_proposition": "We provide KOL mapping and market access strategy for MENA markets",
    "tone": "professional but warm",
    "key_pain_points": ["finding the right KOLs", "understanding MENA regulatory landscape"],
    "case_studies": ["Helped AZ launch biologics in UAE"],
    "cta": "15-minute discovery call",
    "sender_name": "Mohammad",
    "sender_title": "Founder"
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'BioNixus');
