-- Add LLM provider columns to organizations table
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS llm_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS llm_settings JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN organizations.llm_provider IS 'LLM provider: anthropic, openai, gemini, deepseek, groq';
COMMENT ON COLUMN organizations.llm_api_key_encrypted IS 'Encrypted API key for custom LLM provider (optional)';
COMMENT ON COLUMN organizations.llm_settings IS 'Provider-specific settings like model, temperature, etc.';
