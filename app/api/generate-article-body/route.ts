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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'arcee-ai/trinity-large-preview:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })

    // Clear timeout after fetch completes — body reading has no time pressure
    clearTimeout(timeout)

    console.log('[generate-article-body] OpenRouter fetch done — status:', res.status)

    // Read response as text first so we can log it raw
    const rawResponse = await res.text()
    console.log('[generate-article-body] Raw response:', rawResponse.substring(0, 800))

    if (!res.ok) {
      console.log('[generate-article-body] OpenRouter HTTP error:', res.status)
      return NextResponse.json({ body: null })
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(rawResponse)
    } catch (parseErr) {
      console.log('[generate-article-body] JSON parse failed:', parseErr)
      return NextResponse.json({ body: null })
    }

    console.log('[generate-article-body] Full data:', JSON.stringify(data).substring(0, 500))

    // Log if OpenRouter returned an error inside a 200 response
    if (data.error) {
      console.log('[generate-article-body] OpenRouter returned error:', data.error)
      return NextResponse.json({ body: null })
    }

    const choices = data.choices as Array<Record<string, unknown>> | undefined
    console.log('[generate-article-body] choices count:', choices?.length ?? 0)

    if (choices?.[0]) {
      console.log('[generate-article-body] choice[0] keys:', Object.keys(choices[0]))
      const message = choices[0].message as Record<string, unknown> | undefined
      console.log('[generate-article-body] message:', JSON.stringify(message)?.substring(0, 300))
      console.log('[generate-article-body] message.content type:', typeof message?.content)
      console.log('[generate-article-body] message.content value:', String(message?.content)?.substring(0, 200))
    }

    // Extract content — try all known response shapes
    const choice0 = choices?.[0] as Record<string, unknown> | undefined
    const message = choice0?.message as Record<string, unknown> | undefined
    const messageContent = message?.content
    const choiceText = choice0?.text

    const content =
      (typeof messageContent === 'string' && messageContent.trim()) ||
      (typeof choiceText === 'string' && choiceText.trim()) ||
      null

    console.log('[generate-article-body] Extracted content:', content?.substring(0, 200) ?? 'NULL')

    // Record token usage (fire-and-forget)
    const usage = extractOpenRouterUsage({ ...data, _promptLength: Math.ceil(prompt.length / 4) })
    recordTokenUsage({
      spaceId, jobType: 'article_body', model: 'arcee-ai/trinity-large-preview:free',
      promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    }).catch(() => {})

    const responseData = { body: content }
    console.log('[generate-article-body] Returning:', JSON.stringify(responseData).substring(0, 300))

    return NextResponse.json(responseData)
  } catch (err) {
    console.error('[generate-article-body] Uncaught error:', err)
    return NextResponse.json({ body: null })
  }
}
