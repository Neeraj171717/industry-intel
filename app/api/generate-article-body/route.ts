import { NextRequest, NextResponse } from 'next/server'
import { recordTokenUsage, extractOpenRouterUsage } from '@/lib/token-usage'

export async function POST(req: NextRequest) {
  console.log('[generate-article-body] ========== Route hit ==========')

  try {
    const { rawText, spaceId } = (await req.json()) as { rawText?: string; spaceId?: string }
    console.log('[generate-article-body] rawText length:', rawText?.length ?? 'missing')

    if (!rawText || typeof rawText !== 'string') {
      console.log('[generate-article-body] Early exit — missing rawText')
      return NextResponse.json({ body: null })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.log('[generate-article-body] Early exit — missing OPENROUTER_API_KEY')
      return NextResponse.json({ body: null })
    }

    // Take first 800 words of raw text
    const words = rawText.split(/\s+/).slice(0, 800).join(' ')
    console.log('[generate-article-body] Sending', words.split(/\s+/).length, 'words to OpenRouter')

    const prompt = `You are an editor for an industry intelligence platform. Based on the following raw content — write a concise professional article body of 150 to 200 words.

Focus on:
- What happened or what was announced
- Why it matters to industry professionals
- Key facts and figures if present
- Avoid promotional language
- Write in third person
- No bullet points — flowing paragraphs only

Raw content:
${words}`

    const MODELS = [
      'openai/gpt-oss-120b',
      'nvidia/nemotron-3-super',
      'z-ai/glm-4.5-air',
    ]

    let content: string | null = null
    let usedModel = MODELS[0]

    for (let i = 0; i < MODELS.length; i++) {
      const model = MODELS[i]
      console.log(`[generate-article-body] Trying model ${i + 1}/${MODELS.length}: ${model}`)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000)

      let res: Response
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 400,
            temperature: 0.3,
          }),
          signal: controller.signal,
        })
      } catch (fetchErr) {
        clearTimeout(timeout)
        const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'AbortError'
        console.log(`[generate-article-body] Model ${i + 1} ${isTimeout ? 'timed out' : 'network error'} — trying next`)
        continue
      }
      clearTimeout(timeout)

      console.log(`[generate-article-body] Model ${i + 1} HTTP status:`, res.status)

      if (!res.ok) {
        console.log(`[generate-article-body] Model ${i + 1} failed with ${res.status} — trying next`)
        continue
      }

      const rawResponse = await res.text()
      console.log('[generate-article-body] Raw response:', rawResponse.substring(0, 800))

      let data: Record<string, unknown>
      try {
        data = JSON.parse(rawResponse)
      } catch (parseErr) {
        console.log('[generate-article-body] JSON parse failed:', parseErr)
        continue
      }

      if (data.error) {
        console.log('[generate-article-body] OpenRouter returned error in body:', data.error)
        continue
      }

      const choices = data.choices as Array<Record<string, unknown>> | undefined
      const choice0 = choices?.[0] as Record<string, unknown> | undefined
      const message = choice0?.message as Record<string, unknown> | undefined
      const messageContent = message?.content
      const choiceText = choice0?.text

      const extracted =
        (typeof messageContent === 'string' && messageContent.trim()) ||
        (typeof choiceText === 'string' && choiceText.trim()) ||
        null

      if (extracted) {
        content = extracted
        usedModel = model

        // Record token usage (fire-and-forget)
        const usage = extractOpenRouterUsage({ ...data, _promptLength: Math.ceil(prompt.length / 4) })
        recordTokenUsage({
          spaceId, jobType: 'article_body', model: usedModel,
          promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
        }).catch(() => {})

        break
      }

      console.log(`[generate-article-body] Model ${i + 1} returned empty content — trying next`)
    }

    console.log('[generate-article-body] Extracted content:', content?.substring(0, 200) ?? 'NULL', '| model:', usedModel)

    const responseData = { body: content }
    console.log('[generate-article-body] Returning:', JSON.stringify(responseData).substring(0, 300))

    return NextResponse.json(responseData)
  } catch (err) {
    console.error('[generate-article-body] Uncaught error:', err)
    return NextResponse.json({ body: null })
  }
}
