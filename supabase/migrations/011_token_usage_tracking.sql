-- Token usage and cost tracking for all AI operations
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES industry_spaces(id),
  job_type TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost_usd DECIMAL(10,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON token_usage(space_id);
CREATE INDEX ON token_usage(created_at);
CREATE INDEX ON token_usage(job_type);

-- Super admin can read all rows
CREATE POLICY "Super admin can read token usage"
ON token_usage FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Enable RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
