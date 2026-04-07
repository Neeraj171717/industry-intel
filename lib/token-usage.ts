// ─── Token Usage Tracking ─────────────────────────────────────────────────────
// Server-only — records AI token consumption to the token_usage table.
// All inserts use supabaseAdmin (service role) to bypass RLS.

import { supabaseAdmin } from '@/lib/supabase-server'

export type JobType = 'tag_suggestions' | 'thread_matching' | 'editor_notes' | 'article_body' | 'embedding'

interface TokenUsageRecord {
  spaceId?: string | null
  jobType: JobType
  model: string
  promptTokens: number
  completionTokens: number
}

// Cost rates per token (for projected cost calculations)
const COST_RATES: Record<string, { prompt: number; completion: number }> = {
  // Free models — $0
  default: { prompt: 0, completion: 0 },
}

export async function recordTokenUsage(record: TokenUsageRecord): Promise<void> {
  const totalTokens = record.promptTokens + record.completionTokens
  const rates = COST_RATES[record.model] ?? COST_RATES.default
  const cost = record.promptTokens * rates.prompt + record.completionTokens * rates.completion

  const { error } = await supabaseAdmin.from('token_usage').insert({
    space_id: record.spaceId ?? null,
    job_type: record.jobType,
    model: record.model,
    prompt_tokens: record.promptTokens,
    completion_tokens: record.completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: cost,
  })

  if (error) {
    console.error('[TokenUsage] Failed to record:', error.message)
  }
}

// Extract usage from OpenRouter response data
export function extractOpenRouterUsage(data: Record<string, unknown>): { promptTokens: number; completionTokens: number } {
  const usage = data.usage as Record<string, number> | undefined
  if (usage) {
    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    }
  }
  // Estimate from content if usage not provided (free tier)
  const prompt = data._promptLength as number | undefined
  const content = (data.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown> | undefined
  const text = (content?.content as string) ?? ''
  return {
    promptTokens: prompt ?? 0,
    completionTokens: Math.ceil(text.length / 4),
  }
}
