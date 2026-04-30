import { NextRequest, NextResponse } from 'next/server'
import { recordTokenUsage, extractOpenRouterUsage } from '@/lib/token-usage'

interface UrlMetadata {
  title: string | null
  description: string | null
  fullText: string | null
  image: string | null
  siteName: string | null
  editorNotes: string | null
  errorCode: 'blocked' | 'unreachable' | 'no_content' | 'timeout' | null
}

const EMPTY: UrlMetadata = {
  title: null, description: null, fullText: null, image: null, siteName: null, editorNotes: null, errorCode: null,
}

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

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractArticleText(html: string): string | null {
  // Try progressively less specific containers
  const containerPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class="[^"]*(?:article|post|story|entry|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*(?:article|post|story|entry|content)[^"]*"[^>]*>([\s\S]*?)(?=<(?:footer|aside|nav)\b)/i,
  ]

  for (const pattern of containerPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      // Extract <p> tags from within the container
      const paragraphs: string[] = []
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
      let pMatch
      while ((pMatch = pRegex.exec(match[1])) !== null) {
        const text = stripTags(pMatch[1])
        if (text.length > 20) paragraphs.push(text)
      }
      if (paragraphs.length > 0) {
        return paragraphs.join('\n\n')
      }
    }
  }

  // Last resort: extract all substantial <p> tags from anywhere in the page
  const paragraphs: string[] = []
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = stripTags(pMatch[1])
    if (text.length > 30) paragraphs.push(text)
  }
  if (paragraphs.length >= 2) {
    return paragraphs.join('\n\n')
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let html: string
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })

      if (res.status === 403 || res.status === 401) {
        clearTimeout(timeout)
        return NextResponse.json({ ...EMPTY, errorCode: 'blocked' })
      }

      if (!res.ok) {
        clearTimeout(timeout)
        return NextResponse.json({ ...EMPTY, errorCode: 'unreachable' })
      }

      // Read up to 200KB for full article extraction
      const reader = res.body?.getReader()
      if (!reader) {
        clearTimeout(timeout)
        return NextResponse.json({ ...EMPTY, errorCode: 'no_content' })
      }

      const chunks: Uint8Array[] = []
      let totalBytes = 0
      const MAX_BYTES = 200_000

      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalBytes += value.length
      }
      reader.cancel()

      html = new TextDecoder().decode(Buffer.concat(chunks))
    } catch (err: unknown) {
      clearTimeout(timeout)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return NextResponse.json({ ...EMPTY, errorCode: 'timeout' })
      }
      return NextResponse.json({ ...EMPTY, errorCode: 'unreachable' })
    } finally {
      clearTimeout(timeout)
    }

    const ogTitle       = extractMeta(html, 'og:title')
    const ogDescription = extractMeta(html, 'og:description')
    const ogImage       = extractMeta(html, 'og:image')
    const ogSiteName    = extractMeta(html, 'og:site_name')
    const metaDesc      = extractMeta(html, 'description')

    let titleTag: string | null = null
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch?.[1]) titleTag = titleMatch[1].trim()

    // Extract full article text from the page body
    const fullText = extractArticleText(html)

    const hasAnyContent = !!(ogTitle || ogDescription || ogSiteName || fullText)

    // Generate editor notes via OpenRouter if we have title + description
    const finalTitle = ogTitle ?? titleTag
    const finalDescription = ogDescription ?? metaDesc
    let editorNotes: string | null = null

    if (finalTitle && finalDescription && process.env.OPENROUTER_API_KEY) {
      console.log('[EditorNotes] Starting generation...')

      const NOTES_MODELS = [
        'openai/gpt-oss-120b',
        'nvidia/nemotron-3-super',
        'z-ai/glm-4.5-air',
      ]
      const notesPrompt = `You are a content analyst for a digital marketing industry intelligence platform.\n\nArticle Title: ${finalTitle}\nArticle Summary: ${finalDescription}\n\nIn exactly 3 sentences answer:\n1. Why is this article significant for professionals in this industry?\n2. Who will be most impacted by this development and how?\n3. What background context or urgency should the editor be aware of before publishing this?\n\nBe specific and concise. Do not use bullet points. Write as flowing sentences.`

      for (let i = 0; i < NOTES_MODELS.length; i++) {
        const model = NOTES_MODELS[i]
        console.log(`[EditorNotes] Trying model ${i + 1}/${NOTES_MODELS.length}: ${model}`)

        const notesController = new AbortController()
        const notesTimeout = setTimeout(() => notesController.abort(), 25000)

        try {
          const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: notesPrompt }],
              max_tokens: 300,
            }),
            signal: notesController.signal,
          })

          clearTimeout(notesTimeout)
          console.log(`[EditorNotes] Model ${i + 1} response status:`, aiRes.status)

          if (!aiRes.ok) {
            console.log(`[EditorNotes] Model ${i + 1} failed — HTTP ${aiRes.status}, trying next`)
            continue
          }

          const aiRaw = await aiRes.text()
          const aiData = JSON.parse(aiRaw)
          const text = aiData.choices?.[0]?.message?.content?.trim()

          if (text) {
            editorNotes = text
            console.log('[EditorNotes] Notes generated successfully —', text.length, 'chars, model:', model)

            // Record token usage (fire-and-forget)
            const usage = extractOpenRouterUsage({ ...aiData, _promptLength: Math.ceil(notesPrompt.length / 4) })
            recordTokenUsage({
              jobType: 'editor_notes', model,
              promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
            }).catch(() => {})

            break
          }

          console.log(`[EditorNotes] Model ${i + 1} returned empty content — trying next`)
        } catch (err) {
          clearTimeout(notesTimeout)
          const isTimeout = err instanceof DOMException && err.name === 'AbortError'
          console.log(`[EditorNotes] Model ${i + 1} ${isTimeout ? 'timed out' : 'failed'} — trying next`)
        }
      }

      if (!editorNotes) console.log('[EditorNotes] All models failed — leaving empty')
    }

    const metadata: UrlMetadata = {
      title: finalTitle,
      description: finalDescription,
      fullText,
      image: ogImage,
      siteName: ogSiteName,
      editorNotes,
      errorCode: hasAnyContent ? null : 'no_content',
    }

    return NextResponse.json(metadata)
  } catch {
    return NextResponse.json({ ...EMPTY, errorCode: 'unreachable' })
  }
}
