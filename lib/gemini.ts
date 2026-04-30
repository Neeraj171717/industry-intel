// ─── AI Services Client ───────────────────────────────────────────────────────
// Server-only — import only from API routes and server components.
//
// SERVICE 1 — OpenRouter (text generation)
//   Model: meta-llama/llama-3.3-70b-instruct:free
//   Used by: suggestTags(), matchThread()
//
// SERVICE 2 — Cohere (embeddings)
//   Model: embed-english-v3.0
//   Used by: generateEmbedding(), generateAndStoreArticleVector()

import { CohereClient } from 'cohere-ai'
import { supabaseAdmin } from '@/lib/supabase-server'
import { recordTokenUsage, extractOpenRouterUsage } from '@/lib/token-usage'
import type { Tag, EventThread } from '@/types'

// ─── Clients ──────────────────────────────────────────────────────────────────

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS = [
  'openai/gpt-oss-120b',
  'nvidia/nemotron-3-super',
  'z-ai/glm-4.5-air',
]
// Per-model timeout in milliseconds — abort and fall to next model if exceeded
const MODEL_TIMEOUT_MS = 30_000

// Cohere embed-english-v3.0 outputs 1024 dimensions — truncate input to ~8k chars
const EMBED_MAX_CHARS = 8_000
// Keep text prompts reasonable for the free model
const TEXT_MAX_CHARS = 12_000

// ─── Exported types ───────────────────────────────────────────────────────────

export interface TagSuggestion {
  tag_id: string
  confidence_score: number
}

export interface ThreadMatch {
  thread_id: string
  confidence_score: number
}

// ─── Internal: OpenRouter chat completion ─────────────────────────────────────

interface OpenRouterResult {
  text: string
  model: string
  promptTokens: number
  completionTokens: number
  modelIndex: number
}

async function openRouterChat(prompt: string): Promise<OpenRouterResult> {
  let lastError = ''

  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const model = OPENROUTER_MODELS[i]
    const modelNum = i + 1
    console.log(`[OpenRouter] Trying model ${modelNum}: ${model}`)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
        signal: controller.signal,
      })
    } catch (networkErr) {
      clearTimeout(timer)
      const isTimeout = networkErr instanceof DOMException && networkErr.name === 'AbortError'
      lastError = `Model ${modelNum} ${isTimeout ? 'timed out' : `network error: ${String(networkErr)}`}`
      console.log(`[OpenRouter] Model ${modelNum} ${isTimeout ? 'timed out' : 'network error'}, trying next`)
      continue
    }
    clearTimeout(timer)

    console.log(`[OpenRouter] Model ${modelNum} HTTP status: ${res.status}`)

    if (!res.ok) {
      const detail = await res.text()
      lastError = `Model ${modelNum} failed [${res.status}]: ${detail}`
      console.log(`[OpenRouter] Model ${modelNum} failed with ${res.status}, trying model ${modelNum + 1}`)
      continue
    }

    const data = await res.json()
    const text: string = data?.choices?.[0]?.message?.content ?? ''
    const usage = extractOpenRouterUsage({ ...data, _promptLength: Math.ceil(prompt.length / 4) })
    console.log(`[OpenRouter] Model ${modelNum} succeeded — response: ${text.slice(0, 300)}`)
    return { text, model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, modelIndex: i }
  }

  throw new Error(`All OpenRouter models failed. Last error: ${lastError}`)
}

// ─── 1. generateEmbedding ─────────────────────────────────────────────────────
// Returns a 1024-dimension vector using Cohere embed-english-v3.0.
// input_type: search_document — used when storing vectors for articles.

export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, EMBED_MAX_CHARS)

  const response = await cohere.embed({
    model: 'embed-english-v3.0',
    texts: [truncated],
    inputType: 'search_document',
    embeddingTypes: ['float'],
  })

  const embeddings = response.embeddings
  const floatEmbeddings = Array.isArray(embeddings)
    ? embeddings
    : (embeddings as { float?: number[][] }).float

  if (!Array.isArray(floatEmbeddings) || floatEmbeddings.length === 0) {
    throw new Error(`Cohere returned no embeddings`)
  }

  const vector = floatEmbeddings[0]
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`Cohere embedding vector is empty`)
  }

  console.log(`[Cohere] generateEmbedding — vector dimensions: ${vector.length}`)
  return vector
}

// ─── 2. suggestTags ───────────────────────────────────────────────────────────
// Sends content + tag list to OpenRouter and returns tag suggestions ≥ 0.5 confidence.

// ─── Keyword fallback for tag suggestions ─────────────────────────────────────
// Used when the model returns an empty array. Checks whether each tag name
// appears as a word or phrase in the text (case-insensitive).

function keywordFallbackTags(
  text: string,
  tags: Pick<Tag, 'id' | 'name' | 'type'>[],
): TagSuggestion[] {
  const lower = text.toLowerCase()
  const results: TagSuggestion[] = []

  for (const tag of tags) {
    const tagLower = tag.name.toLowerCase()
    // Match whole word / phrase — wrap in non-word boundary check
    const pattern = new RegExp(`(?<![a-z0-9])${tagLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i')
    if (pattern.test(lower)) {
      results.push({ tag_id: tag.id, confidence_score: 0.6 })
    }
  }

  console.log(`[suggestTags] keyword fallback — ${results.length} matches`)
  return results.slice(0, 10)
}

export async function suggestTags(
  text: string,
  tags: Pick<Tag, 'id' | 'name' | 'type'>[],
  spaceId?: string,
): Promise<TagSuggestion[]> {
  if (tags.length === 0) return []

  const truncated = text.slice(0, TEXT_MAX_CHARS)

  // Format tag list as "name (id)" — easier for the model to match by name
  const tagList = tags.map((t) => `${t.name} (${t.id})`).join('\n')

  const prompt = `Read this text and pick relevant tags from the list.

Text: ${truncated}

Tags to choose from:
${tagList}

Reply with ONLY a JSON array. Example:
[{"tag_id":"abc123","confidence_score":0.9}]

If no tags match, reply with: []`

  const result = await openRouterChat(prompt)
  const raw = result.text

  // Strip markdown code fences if the model wrapped the JSON
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

  // Extract a JSON array from the response even if there is extra text around it
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const jsonStr = arrayMatch ? arrayMatch[0] : cleaned

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error(`[OpenRouter] suggestTags — JSON parse failed on: ${cleaned.slice(0, 300)}`)
    console.log(`[suggestTags] Falling back to keyword matching`)
    return keywordFallbackTags(text, tags)
  }

  if (!Array.isArray(parsed)) {
    console.log(`[suggestTags] Model returned non-array — falling back to keyword matching`)
    return keywordFallbackTags(text, tags)
  }

  const validTagIds = new Set(tags.map((t) => t.id))
  const BARE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  // Normalise tag_id — model can return three formats:
  //   1. Bare UUID:              "9f2d7217-..."
  //   2. Name + UUID in parens:  "SEO (9f2d7217-...)"
  //   3. Name only:              "SEO"
  const normalised = (parsed as Array<Record<string, unknown>>).map((s) => {
    if (typeof s.tag_id !== 'string') return s

    const trimmed = s.tag_id.trim()
    console.log(`[suggestTags] Processing tag_id: "${trimmed}"`)

    // Case 1: already a bare UUID — use directly
    if (BARE_UUID_RE.test(trimmed)) {
      console.log(`[suggestTags] Case 1 — bare UUID: "${trimmed}"`)
      return { ...s, tag_id: trimmed }
    }

    // Case 2: UUID embedded in the string (e.g. "SEO (uuid)")
    const uuidMatch = trimmed.match(UUID_RE)
    if (uuidMatch) {
      console.log(`[suggestTags] Case 2 — extracted UUID from "${trimmed}" → "${uuidMatch[0]}"`)
      return { ...s, tag_id: uuidMatch[0] }
    }

    // Case 3: plain name — look up by name in the tags array
    const byName = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (byName) {
      console.log(`[suggestTags] Resolved name "${trimmed}" → "${byName.id}"`)
      return { ...s, tag_id: byName.id }
    }

    console.log(`[suggestTags] Could not resolve tag_id: "${trimmed}" — will be filtered out`)
    return s
  })

  const results = (normalised as unknown as TagSuggestion[])
    .filter(
      (s) =>
        typeof s.tag_id === 'string' &&
        typeof s.confidence_score === 'number' &&
        s.confidence_score >= 0.5 &&
        s.confidence_score <= 1.0 &&
        validTagIds.has(s.tag_id),
    )
    .slice(0, 10)

  console.log(`[OpenRouter] suggestTags — ${results.length} valid suggestions from model`)

  // Record token usage (fire-and-forget)
  recordTokenUsage({
    spaceId, jobType: 'tag_suggestions', model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens,
  }).catch(() => {})

  // Model returned empty array — try keyword fallback
  if (results.length === 0) {
    console.log(`[suggestTags] Model returned [] — trying keyword fallback`)
    return keywordFallbackTags(text, tags)
  }

  return results
}

// ─── 3. matchThread ───────────────────────────────────────────────────────────
// Sends content + active thread list to OpenRouter and returns the best match.

export async function matchThread(
  text: string,
  threads: Pick<EventThread, 'id' | 'title' | 'description'>[],
  spaceId?: string,
): Promise<ThreadMatch | null> {
  if (threads.length === 0) return null

  const truncated = text.slice(0, TEXT_MAX_CHARS)
  const threadList = threads
    .map((t) => `${t.id} | ${t.title} | ${t.description ?? ''}`)
    .join('\n')

  const prompt = `You are an AI assistant helping editors match news content to ongoing story threads.

Given the content below and the list of active event threads, identify the single best matching thread.
Return null if no thread is a good match (confidence below 0.5).
Only use thread IDs from the provided list.

CONTENT:
${truncated}

ACTIVE THREADS (id | title | description):
${threadList}

Return ONLY one of these two formats and nothing else — no markdown, no explanation:
{"thread_id": "uuid-here", "confidence_score": 0.8}
or
null`

  const result = await openRouterChat(prompt)
  const raw = result.text

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error(`[OpenRouter] matchThread — JSON parse failed on: ${cleaned.slice(0, 300)}`)
    throw new Error(`OpenRouter returned invalid JSON for thread: ${cleaned.slice(0, 200)}`)
  }

  if (!parsed || typeof parsed !== 'object') return null

  const match = parsed as ThreadMatch
  if (typeof match.thread_id !== 'string') return null
  if (typeof match.confidence_score !== 'number') return null
  if (match.confidence_score < 0.5) return null
  if (!threads.some((t) => t.id === match.thread_id)) return null

  console.log(`[OpenRouter] matchThread — matched thread_id=${match.thread_id} confidence=${match.confidence_score}`)

  // Record token usage (fire-and-forget)
  recordTokenUsage({
    spaceId, jobType: 'thread_matching', model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens,
  }).catch(() => {})

  return match
}

// ─── 4. generateAndStoreArticleVector ────────────────────────────────────────
// Called when an editor publishes an article (Stage 6).
// Generates an embedding and upserts it into article_vectors table.

export async function generateAndStoreArticleVector(
  finalItemId: string,
  text: string,
  spaceId?: string,
): Promise<void> {
  const embedding = await generateEmbedding(text)

  // Record embedding token usage (fire-and-forget)
  recordTokenUsage({
    spaceId, jobType: 'embedding', model: 'embed-english-v3.0',
    promptTokens: Math.ceil(text.slice(0, EMBED_MAX_CHARS).length / 4),
    completionTokens: 0,
  }).catch(() => {})

  // pgvector expects the vector as a formatted string: [val1,val2,...]
  const vectorString = `[${embedding.join(',')}]`

  const { error } = await supabaseAdmin
    .from('article_vectors')
    .upsert(
      {
        final_item_id: finalItemId,
        embedding: vectorString,
        model_used: 'embed-english-v3.0',
      },
      { onConflict: 'final_item_id' },
    )

  if (error) {
    throw new Error(`Failed to store article vector: ${error.message}`)
  }

  console.log(`[Cohere] generateAndStoreArticleVector — stored vector for ${finalItemId}`)
}

// ─── 5. prepareAiInput ────────────────────────────────────────────────────────
// 3-tier input preparation for tag suggestions, thread matching, and duplicate
// detection. Uses full_content when available; falls back to raw_text.
//
// Tier 1 — short  (full_content ≤ 1 500 chars): use full_content directly.
// Tier 2 — medium (1 500 – 4 000 chars):         light summary, 3–5 sentences.
// Tier 3 — long   (> 4 000 chars):               strong summary, 5–8 sentences.
// Fallback (full_content null/empty):             use raw_text as-is.
//
// Summaries are generated via OpenRouter and used only in-memory — they are
// NOT stored in the database.

// Max chars of full_content fed into the summarisation prompt.
// Keeps prompt size reasonable even for very long articles (80 000 char cap).
const SUMMARISE_INPUT_CAP = 8_000

export async function prepareAiInput(
  fullContent: string | null | undefined,
  rawText: string,
): Promise<string> {
  const content = fullContent?.trim() ?? ''

  // Fallback — no full_content available
  if (!content) {
    console.log('[prepareAiInput] Tier: fallback (no full_content) — using raw_text')
    return rawText
  }

  const len = content.length

  // ── Tier 1: short — use directly ─────────────────────────────────────────
  if (len <= 1_500) {
    console.log(`[prepareAiInput] Tier 1 (short, ${len} chars) — using full_content directly`)
    return content
  }

  // ── Tier 2: medium — light summary ───────────────────────────────────────
  if (len <= 4_000) {
    console.log(`[prepareAiInput] Tier 2 (medium, ${len} chars) — generating 3–5 line summary`)
    const prompt =
      `Summarize the following article in 3–5 clear sentences. ` +
      `Focus on what happened, who is involved, and why it matters for industry professionals. ` +
      `Be factual and concise. Write in third person. No bullet points.\n\n${content}`
    try {
      const result = await openRouterChat(prompt)
      if (result.text.trim()) return result.text.trim()
    } catch (err) {
      console.warn('[prepareAiInput] Tier 2 summarisation failed — using first 2000 chars of full_content:', err)
    }
    // full_content exists but summary failed — use a safe slice, never raw_text
    return content.slice(0, 2_000)
  }

  // ── Tier 3: long — strong summary ────────────────────────────────────────
  console.log(`[prepareAiInput] Tier 3 (long, ${len} chars) — generating 5–8 line summary`)
  const excerpt = content.slice(0, SUMMARISE_INPUT_CAP)
  const prompt =
    `Summarize the following article in 5–8 clear sentences. ` +
    `Capture the full context, key facts, main stakeholders, and industry implications. ` +
    `Be comprehensive but concise. Write in third person. No bullet points.\n\n${excerpt}`
  try {
    const result = await openRouterChat(prompt)
    if (result.text.trim()) return result.text.trim()
  } catch (err) {
    console.warn('[prepareAiInput] Tier 3 summarisation failed — using first 2000 chars of full_content:', err)
  }
  // full_content exists but summary failed — use a safe slice, never raw_text
  return content.slice(0, 2_000)
}
