// ─── AI Brain API Route ───────────────────────────────────────────────────────
// Triggered by a Supabase Database Webhook when a new row is inserted into
// raw_items. Runs duplicate detection, tag suggestions, and thread matching
// in parallel, then marks the raw item as AI processed.
//
// Accepts two payload formats:
//   Supabase webhook: { type: "INSERT", table: "raw_items", record: { id, ... } }
//   Direct POST:      { raw_item_id: "uuid" }

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateEmbedding, suggestTags, matchThread, prepareAiInput } from '@/lib/gemini'
import type { Tag, EventThread } from '@/types'

// Allow up to 60 seconds — Gemini calls can take several seconds each.
// On Vercel Hobby this cap is 10s; upgrade to Pro for the full 60s.
export const maxDuration = 60

// ─── Webhook secret verification ─────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!secret) return true // No secret configured — allow in development

  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

// ─── Job 1 — Duplicate detection ─────────────────────────────────────────────

async function runDuplicateDetection(
  rawItemId: string,
  rawText: string,
): Promise<void> {
  console.log(`[AI Brain] Job 1 — embedding for ${rawItemId}`)

  const embedding = await generateEmbedding(rawText)
  const vectorString = `[${embedding.join(',')}]`

  // Search article_vectors using cosine similarity via RPC
  const { data: matches, error: rpcError } = await supabaseAdmin.rpc(
    'match_article_vectors',
    {
      query_embedding: vectorString,
      match_threshold: 0.5,
      match_count: 10,
    },
  )

  if (rpcError) {
    throw new Error(`Vector search RPC failed: ${rpcError.message}`)
  }

  if (!matches || matches.length === 0) {
    console.log(`[AI Brain] Job 1 — no similar articles found`)
    return
  }

  type VectorMatch = { final_item_id: string; similarity: number }

  const suggestions = (matches as VectorMatch[]).map((match) => ({
    raw_item_id: rawItemId,
    suggestion_type: match.similarity >= 0.85 ? 'duplicate' : 'related',
    suggested_value: match.final_item_id,
    similarity_score: match.similarity,
    confidence_score: match.similarity,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('ai_suggestions')
    .insert(suggestions)

  if (insertError) {
    throw new Error(`Failed to insert duplicate/related suggestions: ${insertError.message}`)
  }

  const duplicates = suggestions.filter((s) => s.suggestion_type === 'duplicate').length
  const related = suggestions.filter((s) => s.suggestion_type === 'related').length
  console.log(`[AI Brain] Job 1 — ${duplicates} duplicates, ${related} related`)
}

// ─── Job 2 — Tag suggestions ──────────────────────────────────────────────────

async function runTagSuggestions(
  rawItemId: string,
  rawText: string,
  spaceId: string,
): Promise<void> {
  console.log(`[AI Brain] Job 2 — tag suggestions for ${rawItemId}`)

  const { data: tags, error: tagsError } = await supabaseAdmin
    .from('tags')
    .select('id, name, type')
    .eq('space_id', spaceId)
    .eq('status', 'active')

  console.log(`[AI Brain] Job 2 — tags query: spaceId=${spaceId}, error=${tagsError?.message ?? 'none'}, count=${tags?.length ?? 0}`)

  if (tagsError) {
    throw new Error(`Failed to fetch tags: ${tagsError.message}`)
  }

  if (!tags || tags.length === 0) {
    console.log(`[AI Brain] Job 2 — no active tags in space, skipping`)
    return
  }

  console.log(`[AI Brain] Job 2 — tags being sent to Gemini:`, tags.map((t) => `${t.name} (${t.type})`).join(', '))

  const suggestions = await suggestTags(rawText, tags as Pick<Tag, 'id' | 'name' | 'type'>[], spaceId)

  if (suggestions.length === 0) {
    console.log(`[AI Brain] Job 2 — no tag suggestions returned`)
    return
  }

  const rows = suggestions.map((s) => ({
    raw_item_id: rawItemId,
    suggestion_type: 'tag',
    suggested_value: s.tag_id,
    confidence_score: s.confidence_score,
    similarity_score: null,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('ai_suggestions')
    .insert(rows)

  if (insertError) {
    throw new Error(`Failed to insert tag suggestions: ${insertError.message}`)
  }

  console.log(`[AI Brain] Job 2 — inserted ${rows.length} tag suggestions`)
}

// ─── Job 3 — Thread matching ──────────────────────────────────────────────────

async function runThreadMatching(
  rawItemId: string,
  rawText: string,
  spaceId: string,
): Promise<void> {
  console.log(`[AI Brain] Job 3 — thread matching for ${rawItemId}`)

  const { data: threads, error: threadsError } = await supabaseAdmin
    .from('event_threads')
    .select('id, title, description')
    .eq('space_id', spaceId)
    .eq('status', 'active')

  if (threadsError) {
    throw new Error(`Failed to fetch threads: ${threadsError.message}`)
  }

  if (!threads || threads.length === 0) {
    console.log(`[AI Brain] Job 3 — no active threads in space, skipping`)
    return
  }

  const match = await matchThread(
    rawText,
    threads as Pick<EventThread, 'id' | 'title' | 'description'>[],
    spaceId,
  )

  if (!match) {
    console.log(`[AI Brain] Job 3 — no thread match above threshold`)
    return
  }

  const { error: insertError } = await supabaseAdmin
    .from('ai_suggestions')
    .insert({
      raw_item_id: rawItemId,
      suggestion_type: 'thread',
      suggested_value: match.thread_id,
      confidence_score: match.confidence_score,
      similarity_score: null,
    })

  if (insertError) {
    throw new Error(`Failed to insert thread suggestion: ${insertError.message}`)
  }

  console.log(`[AI Brain] Job 3 — thread matched with confidence ${match.confidence_score}`)
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret
  if (!isAuthorized(req)) {
    console.warn('[AI Brain] Unauthorized request — missing or wrong webhook secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse payload — handle both Supabase webhook and direct POST formats
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Supabase webhook sends: { type: "INSERT", record: { id, ... } }
  // Direct test call sends: { raw_item_id: "uuid" }
  let rawItemId: string | undefined

  if (body.record && typeof (body.record as Record<string, unknown>).id === 'string') {
    rawItemId = (body.record as Record<string, unknown>).id as string
  } else if (typeof body.raw_item_id === 'string') {
    rawItemId = body.raw_item_id
  }

  if (!rawItemId) {
    return NextResponse.json(
      { error: 'Missing raw_item_id — send { raw_item_id } or use Supabase webhook format' },
      { status: 400 },
    )
  }

  console.log(`[AI Brain] Processing raw_item: ${rawItemId}`)

  // 3. Fetch the raw item (include full_content for 3-tier AI input logic)
  const { data: rawItem, error: fetchError } = await supabaseAdmin
    .from('raw_items')
    .select('id, space_id, raw_text, full_content, ai_processed')
    .eq('id', rawItemId)
    .single()

  if (fetchError || !rawItem) {
    console.error(`[AI Brain] Raw item not found: ${rawItemId}`)
    return NextResponse.json({ error: 'Raw item not found' }, { status: 404 })
  }

  // Skip if already processed (webhook may fire twice on retries)
  if (rawItem.ai_processed) {
    console.log(`[AI Brain] Already processed — skipping ${rawItemId}`)
    return NextResponse.json({ success: true, skipped: true })
  }

  const { raw_text, full_content, space_id } = rawItem

  // 4. Prepare AI input using 3-tier logic:
  //    Tier 1 (≤1500 chars): full_content used directly
  //    Tier 2 (1500–4000):   light 3–5 sentence summary generated via OpenRouter
  //    Tier 3 (>4000 chars): strong 5–8 sentence summary generated via OpenRouter
  //    Fallback:             raw_text (when full_content is null)
  //    The summary is used only in-memory — not stored in the database.
  const aiInput = await prepareAiInput(full_content, raw_text)

  // 5. Run all three jobs in parallel — use allSettled so one failure doesn't kill the rest
  const [job1, job2, job3] = await Promise.allSettled([
    runDuplicateDetection(rawItemId, aiInput),
    runTagSuggestions(rawItemId, aiInput, space_id),
    runThreadMatching(rawItemId, aiInput, space_id),
  ])

  if (job1.status === 'rejected') {
    console.error('[AI Brain] Job 1 (duplicate detection) failed:', (job1.reason as Error)?.message ?? job1.reason)
  }
  if (job2.status === 'rejected') {
    console.error('[AI Brain] Job 2 (tag suggestions) FAILED')
    console.error('[AI Brain] Job 2 error message:', (job2.reason as Error)?.message ?? String(job2.reason))
    console.error('[AI Brain] Job 2 full error:', job2.reason)
  }
  if (job3.status === 'rejected') {
    console.error('[AI Brain] Job 3 (thread matching) failed:', (job3.reason as Error)?.message ?? job3.reason)
  }

  // 5. Mark raw item as AI processed regardless of individual job failures
  const { error: updateError } = await supabaseAdmin
    .from('raw_items')
    .update({ ai_processed: true, updated_at: new Date().toISOString() })
    .eq('id', rawItemId)

  if (updateError) {
    console.error(`[AI Brain] Failed to mark ai_processed=true: ${updateError.message}`)
  }

  console.log(`[AI Brain] Complete for ${rawItemId}`)

  return NextResponse.json({
    success: true,
    raw_item_id: rawItemId,
    jobs: {
      duplicate_detection: job1.status,
      tag_suggestions: job2.status,
      thread_matching: job3.status,
    },
  })
}
