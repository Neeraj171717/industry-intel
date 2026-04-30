// ─── RSS Ingestion Pipeline ───────────────────────────────────────────────────
// Fetches approved RSS sources for a given industry space, parses each feed,
// and inserts new items into raw_items as pending content for editor review.
//
// Runs as a parallel system alongside the manual contributor submission flow.
// Does NOT touch the AI pipeline or editor logic — new raw_items trigger the
// existing Supabase webhook → ai-brain automatically.
//
// POST /api/rss-ingest
//   Body (optional): { space_id: "uuid" }
//   Auth: Bearer $RSS_INGEST_SECRET  (skipped in dev if env var not set)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { fetchEnrichment } from '@/lib/og-image'

export const maxDuration = 60

// Max items to read from each feed per run (keeps the queue manageable)
const ITEMS_PER_FEED = 10

// ─── Types ───────────────────────────────────────────────────────────────────

interface RssSource {
  id: string
  name: string
  url: string
}

interface FeedItem {
  title:       string
  link:        string
  description: string
  image:       string | null   // extracted from RSS before HTML is stripped
}

// ─── 1. getApprovedSources ───────────────────────────────────────────────────
// Reads all active sources for the space. The admin stores RSS feed URLs
// directly in the sources.url field via the Industry Admin console.

async function getApprovedSources(spaceId: string): Promise<RssSource[]> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, name, url')
    .eq('space_id', spaceId)
    .eq('status', 'active')

  if (error) throw new Error(`getApprovedSources failed: ${error.message}`)
  return (data ?? []) as RssSource[]
}

// ─── 2. fetchRss ─────────────────────────────────────────────────────────────
// Fetches the raw XML from the RSS/Atom feed URL.
// Aborts after 15 seconds to avoid hanging the pipeline.

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'IndustryIntel-RSS-Bot/1.0',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// ─── 3. parseFeed ────────────────────────────────────────────────────────────
// Parses RSS 2.0 and Atom feeds without external dependencies.
// Returns at most ITEMS_PER_FEED items with title, link, and description.

function extractTagContent(block: string, tag: string): string {
  // Handles plain text and CDATA: <tag>text</tag> or <tag><![CDATA[text]]></tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    'i',
  )
  const m = block.match(re)
  if (!m) return ''
  return (m[1] ?? m[2] ?? '').trim()
}

// Strips HTML from RSS text fields.
// Entities are decoded BEFORE tag-stripping so that HTML-encoded tags
// (&lt;figure&gt;) become real tags that the strip regex can remove.
// Without this, the old order (strip tags → decode entities) left encoded
// tags intact and then decoded them into literal angle-bracket HTML in the output.
// &amp; is decoded first so double-encoded entities (&amp;nbsp;) also resolve correctly.
function stripHtml(text: string): string {
  // Step 1 — decode entities so encoded tags become real tags
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Step 2 — now strip all real tags (including those just decoded from entities)
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extracts the first usable image URL from an RSS item.
// Must be called on the RAW HTML before stripHtml runs, because stripHtml
// removes the <img> tags that carry the src attribute.
//
// Priority order:
//   1. <img src="...">          — inside CDATA description / content:encoded
//   2. <media:content url="..."> — RSS Media extension (very common)
//   3. <media:thumbnail url="..."> — thumbnail variant of Media extension
//   4. <enclosure type="image/..." url="..."> — podcast / media RSS enclosures
//
// htmlContent = raw CDATA/text from <description> or <content:encoded>
// itemBlock   = full XML block for the <item> or <entry>
function extractRssImage(htmlContent: string, itemBlock: string): string | null {
  const imgM = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgM?.[1]) return imgM[1]

  const mediaM = itemBlock.match(/<media:content[^>]+url=["']([^"']+)["']/i)
  if (mediaM?.[1]) return mediaM[1]

  const thumbM = itemBlock.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)
  if (thumbM?.[1]) return thumbM[1]

  // enclosure attributes can appear in either order
  const encA = itemBlock.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i)
  if (encA?.[1]) return encA[1]
  const encB = itemBlock.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i)
  if (encB?.[1]) return encB[1]

  return null
}

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = []

  // ── RSS 2.0: look for <item> blocks ──────────────────────────────────────
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null

  while ((m = itemRe.exec(xml)) !== null) {
    if (items.length >= ITEMS_PER_FEED) break
    const block = m[1]

    const title = stripHtml(extractTagContent(block, 'title'))

    // <link>url</link> (RSS) or <link href="url"> (mixed feeds)
    let link = extractTagContent(block, 'link').trim()
    if (!link) {
      const hrefM = block.match(/<link[^>]+href=["']([^"']+)["']/i)
      if (hrefM) link = hrefM[1]
    }

    // Extract image from raw HTML BEFORE stripping so <img src> is still present
    const rawHtml            = extractTagContent(block, 'description') || extractTagContent(block, 'content:encoded')
    const image              = extractRssImage(rawHtml, block)
    const cleanedDescription = stripHtml(rawHtml)

    if (title && link) items.push({ title, link, description: cleanedDescription, image })
  }

  if (items.length > 0) return items

  // ── Atom: look for <entry> blocks ─────────────────────────────────────────
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi

  while ((m = entryRe.exec(xml)) !== null) {
    if (items.length >= ITEMS_PER_FEED) break
    const block = m[1]

    const title = stripHtml(extractTagContent(block, 'title'))

    // Atom links: <link href="url"/> or <link rel="alternate" href="url"/>
    const hrefM = block.match(/<link[^>]+href=["']([^"']+)["']/i)
    const link  = hrefM ? hrefM[1] : ''

    const rawHtml            = extractTagContent(block, 'summary') || extractTagContent(block, 'content')
    const image              = extractRssImage(rawHtml, block)
    const cleanedDescription = stripHtml(rawHtml)

    if (title && link) items.push({ title, link, description: cleanedDescription, image })
  }

  return items
}

// ─── 4. checkDuplicate ───────────────────────────────────────────────────────
// Returns true if an item with this source_url already exists in raw_items,
// preventing duplicate content from entering the editorial queue.

async function checkDuplicate(sourceUrl: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('raw_items')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  return !!data
}

// ─── 5. insertRawItem ────────────────────────────────────────────────────────
// Inserts a new raw_item. The Supabase webhook fires automatically on INSERT,
// triggering the existing AI Brain pipeline (duplicate detection, tag
// suggestions, thread matching) — no extra wiring needed here.

// Returns the new row's id so the caller can back-fill full_content later.
async function insertRawItem(params: {
  item: FeedItem
  sourceId: string
  spaceId: string
}): Promise<string> {
  const { item, sourceId, spaceId } = params

  // item.description is already HTML-stripped by stripHtml() in parseFeed.
  // Named explicitly here so it's unambiguous that raw_text is built from
  // the cleaned version, not the original HTML.
  const cleanedDescription = item.description

  // Temporary debug: confirm no HTML survives into raw_text
  console.log(`[RSS Ingest] raw_text debug — title: "${item.title.slice(0, 80)}"`)
  console.log(`[RSS Ingest] raw_text debug — cleanedDescription[0..200]: "${cleanedDescription.slice(0, 200)}"`)

  // raw_text is a short clean preview (2-3 lines) — the full article body lives
  // in full_content. AI brain uses the 3-tier logic to decide what to send to
  // the model, so raw_text only needs to be human-readable as a fallback.
  const preview = cleanedDescription.slice(0, 400)
  const rawText = [item.title, preview].filter(Boolean).join('\n\n')

  const { data, error } = await supabaseAdmin.from('raw_items').insert({
    space_id:      spaceId,
    source_id:     sourceId,
    source_url:    item.link,
    source_type:   'auto_rss',
    raw_text:      rawText,
    title:         item.title.slice(0, 500),
    description:   item.description.slice(0, 1000) || null,
    // Store RSS image immediately — no enrichment round-trip needed if found
    featured_image: item.image ?? null,
    status:        'pending',
    ai_processed:  false,
    // submitted_by is intentionally null — automated system row (migration 016)
  }).select('id').single()

  if (error) throw new Error(`insertRawItem failed: ${error.message}`)
  return (data as { id: string }).id
}

// ─── 6. applyEnrichment ──────────────────────────────────────────────────────
// Fetches the article URL once, extracts og:image and full article text,
// then writes both back in a single UPDATE.
// Called in parallel for all newly inserted items after the insert loop.
// Failures are silent — both columns stay null and the item is still usable.

// skipImage: true when the RSS feed already provided an image — in that case
// we still fetch the article for full_content, but don't overwrite featured_image.
async function applyEnrichment(rawItemId: string, articleUrl: string, skipImage: boolean): Promise<void> {
  const { image, fullContent } = await fetchEnrichment(articleUrl)

  const patch: Record<string, string> = {}
  if (!skipImage && image) patch.featured_image = image   // og:image fallback
  if (fullContent)         patch.full_content   = fullContent

  if (Object.keys(patch).length === 0) return

  await supabaseAdmin
    .from('raw_items')
    .update(patch)
    .eq('id', rawItemId)
}

// ─── POST /api/rss-ingest ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.RSS_INGEST_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Resolve space ─────────────────────────────────────────────────────────
  let spaceId: string

  const body = await req.json().catch(() => ({})) as { space_id?: string }

  if (body.space_id) {
    spaceId = body.space_id
  } else {
    // Default to Digital Marketing space
    const { data: space, error: spaceErr } = await supabaseAdmin
      .from('industry_spaces')
      .select('id')
      .ilike('name', 'Digital Marketing')
      .maybeSingle()

    if (spaceErr || !space) {
      return NextResponse.json({ error: 'Digital Marketing space not found' }, { status: 404 })
    }
    spaceId = space.id
  }

  console.log(`[RSS Ingest] Starting for space: ${spaceId}`)

  // ── Fetch approved sources ────────────────────────────────────────────────
  let sources: RssSource[]
  try {
    sources = await getApprovedSources(spaceId)
  } catch (err) {
    console.error('[RSS Ingest] Failed to load sources:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  console.log(`[RSS Ingest] Found ${sources.length} active source(s)`)

  // ── Process each source ───────────────────────────────────────────────────
  const results = {
    sources_checked: sources.length,
    items_fetched:   0,
    items_inserted:  0,
    items_skipped:   0,
    errors:          [] as string[],
  }

  // Collect inserted items so we can back-fill full_content (and og:image fallback) later
  const inserted: { id: string; sourceUrl: string; hasRssImage: boolean }[] = []

  for (const source of sources) {
    console.log(`[RSS Ingest] Processing source: ${source.name} → ${source.url}`)

    try {
      const xml   = await fetchRss(source.url)
      const items = parseFeed(xml)

      console.log(`[RSS Ingest]   Parsed ${items.length} item(s) from "${source.name}"`)
      results.items_fetched += items.length

      for (const item of items) {
        const isDuplicate = await checkDuplicate(item.link)
        if (isDuplicate) {
          results.items_skipped++
          continue
        }

        const rawItemId = await insertRawItem({ item, sourceId: source.id, spaceId })
        inserted.push({ id: rawItemId, sourceUrl: item.link, hasRssImage: !!item.image })
        results.items_inserted++
        console.log(`[RSS Ingest]   Inserted: ${item.title.slice(0, 60)}`)
      }
    } catch (err) {
      const msg = `"${source.name}" (${source.url}): ${err instanceof Error ? err.message : String(err)}`
      results.errors.push(msg)
      console.error(`[RSS Ingest] Error — ${msg}`)
    }
  }

  // ── Back-fill enrichment in batches ──────────────────────────────────────
  // Runs applyEnrichment in controlled batches instead of all-at-once so that
  // a spike in source count never saturates outbound connections.
  // • ENRICHMENT_BATCH_SIZE = 10 → at most 10 concurrent HTML fetches at a time
  // • Each batch waits for all its items to settle before the next starts
  // • A single failure never blocks the rest (Promise.allSettled per batch)
  if (inserted.length > 0) {
    const ENRICHMENT_BATCH_SIZE = 10
    const totalBatches = Math.ceil(inserted.length / ENRICHMENT_BATCH_SIZE)
    console.log(`[RSS Ingest] Enriching ${inserted.length} item(s) in ${totalBatches} batch(es) of ${ENRICHMENT_BATCH_SIZE}…`)

    for (let b = 0; b < inserted.length; b += ENRICHMENT_BATCH_SIZE) {
      const batch = inserted.slice(b, b + ENRICHMENT_BATCH_SIZE)
      await Promise.allSettled(
        batch.map(({ id, sourceUrl, hasRssImage }) => applyEnrichment(id, sourceUrl, hasRssImage)),
      )
      console.log(`[RSS Ingest] Enrichment batch ${Math.floor(b / ENRICHMENT_BATCH_SIZE) + 1}/${totalBatches} complete`)
    }

    console.log(`[RSS Ingest] Enrichment complete`)
  }

  console.log(`[RSS Ingest] Done — inserted ${results.items_inserted}, skipped ${results.items_skipped}`)

  return NextResponse.json({ success: true, ...results })
}
