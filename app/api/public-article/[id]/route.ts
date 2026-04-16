import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

// Always hit this route at request time — never prerender or cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /api/public-article/[id]
// Returns an article plus thread info, tag ids, and related thread items.
// Works for anonymous and authenticated callers — does NOT look up user state.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const articleId = params.id

    const { data: article, error: articleErr } = await supabaseAdmin
      .from('final_items')
      .select(`
        id, title, summary, body, content_type, severity, locality, impact, published_at, thread_id,
        source_name, source_url, space_id
      `)
      .eq('id', articleId)
      .single()

    if (articleErr || !article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    // Tags
    const { data: tagRows } = await supabaseAdmin
      .from('article_tags')
      .select('tag_id')
      .eq('final_item_id', articleId)

    const tagIds = (tagRows ?? []).map(r => r.tag_id as string)

    // Thread title
    let thread: { id: string; title: string } | null = null
    if (article.thread_id) {
      const { data: threadRow } = await supabaseAdmin
        .from('event_threads')
        .select('id, title')
        .eq('id', article.thread_id)
        .single()
      if (threadRow) thread = { id: threadRow.id, title: threadRow.title }
    }

    // Related thread articles
    let related: { id: string; title: string; published_at: string }[] = []
    if (article.thread_id) {
      const { data: relatedData } = await supabaseAdmin
        .from('final_items')
        .select('id, title, published_at')
        .eq('thread_id', article.thread_id)
        .neq('id', articleId)
        .order('published_at', { ascending: false })
        .limit(4)
      related = relatedData ?? []
    }

    return NextResponse.json({
      article: {
        ...article,
        thread,
        article_tags: tagIds.map(id => ({ tag_id: id })),
        related,
      },
    })
  } catch (err) {
    console.error('[public-article] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
