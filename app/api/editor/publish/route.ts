import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'
import { generateAndStoreArticleVector } from '@/lib/gemini'

interface PublishPayload {
  raw_item_id: string
  space_id: string
  title: string
  summary: string
  body: string
  content_type: string
  severity: string
  locality: string
  impact: string
  thread_id: string | null
  tag_ids: string[]
  accepted_suggestion_ids: string[]
  rejected_suggestion_ids: string[]
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verify session ───────────────────────────────────────────────────
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: editorUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, role, space_id')
      .eq('id', authUser.id)
      .single()

    if (userError || !editorUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    if (editorUser.role !== 'editor') {
      return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })
    }

    const payload: PublishPayload = await req.json()

    if (editorUser.space_id !== payload.space_id) {
      return NextResponse.json({ error: 'Space mismatch' }, { status: 403 })
    }

    const editorId = editorUser.id

    // ── 2. Fetch source fields from raw_items ───────────────────────────────
    const { data: rawItem } = await supabaseAdmin
      .from('raw_items')
      .select('source_url, source_name')
      .eq('id', payload.raw_item_id)
      .single()

    // ── 3. INSERT into final_items ──────────────────────────────────────────
    const { data: finalItem, error: insertError } = await supabaseAdmin
      .from('final_items')
      .insert({
        space_id: payload.space_id,
        raw_item_id: payload.raw_item_id,
        thread_id: payload.thread_id ?? null,
        author_id: editorId,
        title: payload.title,
        summary: payload.summary,
        body: payload.body,
        content_type: payload.content_type,
        severity: payload.severity,
        locality: payload.locality,
        impact: payload.impact,
        source_url: rawItem?.source_url ?? null,
        source_name: rawItem?.source_name ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !finalItem) {
      console.error('[Publish] final_items insert error — code:', insertError?.code)
      console.error('[Publish] final_items insert error — message:', insertError?.message)
      console.error('[Publish] final_items insert error — details:', insertError?.details)
      console.error('[Publish] final_items insert error — hint:', insertError?.hint)
      return NextResponse.json({ error: 'Failed to create final item' }, { status: 500 })
    }

    // ── 4. INSERT article_tags ──────────────────────────────────────────────
    if (payload.tag_ids.length > 0) {
      const tagRows = payload.tag_ids.map((tag_id) => ({
        final_item_id: finalItem.id,
        tag_id,
        applied_by: editorId,
      }))
      const { error: tagsError } = await supabaseAdmin.from('article_tags').insert(tagRows)
      if (tagsError) {
        console.error('[Publish] article_tags insert error:', tagsError)
        // Non-fatal — continue
      }
    }

    // ── 5. UPDATE raw_items status → processed ─────────────────────────────
    await supabaseAdmin
      .from('raw_items')
      .update({ status: 'processed', updated_at: new Date().toISOString() })
      .eq('id', payload.raw_item_id)

    // ── 6. UPDATE accepted suggestions ─────────────────────────────────────
    if (payload.accepted_suggestion_ids.length > 0) {
      await supabaseAdmin
        .from('ai_suggestions')
        .update({ accepted: true })
        .in('id', payload.accepted_suggestion_ids)
    }

    // ── 7. UPDATE rejected suggestions ─────────────────────────────────────
    if (payload.rejected_suggestion_ids.length > 0) {
      await supabaseAdmin
        .from('ai_suggestions')
        .update({ accepted: false })
        .in('id', payload.rejected_suggestion_ids)
    }

    // ── 8. Async vector generation (fire and forget) ────────────────────────
    const vectorText = `${payload.title} ${payload.summary} ${payload.body}`
    console.log(`[Publish] Triggering vector generation for final_item_id: ${finalItem.id}`)
    generateAndStoreArticleVector(finalItem.id, vectorText)
      .then(() => console.log(`[Publish] Vector generation completed for final_item_id: ${finalItem.id}`))
      .catch((err) => console.error('[Publish] Vector generation failed:', err))

    return NextResponse.json({ success: true, final_item_id: finalItem.id })
  } catch (err) {
    console.error('[Publish] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
