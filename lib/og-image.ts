// ─── Article Enrichment (image + content extraction) ─────────────────────────
// Single-fetch utility: downloads the article HTML once and extracts:
//   • og:image / twitter:image  → stored in raw_items.featured_image
//   • Main article text         → stored in raw_items.full_content
//
// Used by:
//   - app/api/rss-ingest/route.ts  (auto_rss items, post-insert parallel pass)
//
// The manual contributor flow (fetch-url-metadata/route.ts) is untouched.

// 200 KB captures og:image (always in <head>) and the full article body on
// the vast majority of editorial pages, including long-form pieces.
const HTML_MAX_BYTES = 200_000

// Per-request network timeout — shared for both image and content extraction.
const FETCH_TIMEOUT_MS = 10_000

// 80 000 clean characters ≈ 12 000–15 000 words — more than the longest
// real-world articles. Keeps the DB column size predictable.
const CONTENT_MAX_CHARS = 80_000

// ── HTML cleaning ─────────────────────────────────────────────────────────────

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')   // remove JS blocks
    .replace(/<style[\s\S]*?<\/style>/gi, '')      // remove CSS blocks
    .replace(/<[^>]+>/g, ' ')                      // strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Meta tag extraction (same regex as fetch-url-metadata/route.ts) ───────────

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

// ── Article content extraction ────────────────────────────────────────────────
//
// Tries three strategies in order of precision:
//   1. <article> — semantically correct; most editorial sites use it
//   2. <main>    — common SPA fallback
//   3. <div> with a content-class name (article/post/story/entry/content/body)
//      → picks the *largest* matching div so boilerplate sidebars are skipped
//   4. All <p> tags across the page (last resort — still beats nothing)

const MIN_CONTENT_CHARS = 200   // discard extractions that are clearly too short

function extractArticleContent(html: string): string | null {
  // Strip chrome that is never article body before any pattern matching.
  // Greedy removal of nav/header/footer prevents them polluting div fallback.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')

  // ── 1. <article> ────────────────────────────────────────────────────────────
  const articleM = stripped.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleM) {
    const text = cleanHtml(articleM[1])
    if (text.length >= MIN_CONTENT_CHARS) return text.slice(0, CONTENT_MAX_CHARS)
  }

  // ── 2. <main> ───────────────────────────────────────────────────────────────
  const mainM = stripped.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  if (mainM) {
    const text = cleanHtml(mainM[1])
    if (text.length >= MIN_CONTENT_CHARS) return text.slice(0, CONTENT_MAX_CHARS)
  }

  // ── 3. <div> with content-related class — pick the largest match ────────────
  const divRe = /<div[^>]+class=["'][^"']*(?:article|post|story|entry|content|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  let best = ''
  let m: RegExpExecArray | null

  while ((m = divRe.exec(stripped)) !== null) {
    const text = cleanHtml(m[1])
    if (text.length > best.length) best = text
  }

  if (best.length >= MIN_CONTENT_CHARS) return best.slice(0, CONTENT_MAX_CHARS)

  // ── 4. All <p> tags as last resort ──────────────────────────────────────────
  const paragraphs: string[] = []
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi

  while ((m = pRe.exec(stripped)) !== null) {
    const text = cleanHtml(m[1])
    if (text.length > 30) paragraphs.push(text)
  }

  if (paragraphs.length >= 2) {
    return paragraphs.join('\n\n').slice(0, CONTENT_MAX_CHARS)
  }

  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
  image:       string | null   // og:image or twitter:image
  fullContent: string | null   // cleaned main article text
}

/**
 * Fetches `url` exactly once and extracts both the cover image and the main
 * article text from the same HTML response.
 *
 * Never throws — both fields are null on any network/parse failure.
 * Callers can use whichever fields succeeded independently.
 */
export async function fetchEnrichment(url: string): Promise<EnrichmentResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IndustryIntel-Bot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!res.ok) return { image: null, fullContent: null }

    const reader = res.body?.getReader()
    if (!reader) return { image: null, fullContent: null }

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (totalBytes < HTML_MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalBytes += value.length
    }
    reader.cancel()

    const html = new TextDecoder().decode(Buffer.concat(chunks))

    const image       = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image') ?? null
    const fullContent = extractArticleContent(html)

    return { image, fullContent }
  } catch {
    return { image: null, fullContent: null }
  } finally {
    clearTimeout(timer)
  }
}
