// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'industry_admin' | 'editor' | 'contributor' | 'user'
export type UserStatus = 'pending' | 'active' | 'suspended'
export type SpaceStatus = 'active' | 'inactive'
export type SourceType = 'blog' | 'official' | 'youtube' | 'ai_tool' | 'other'
export type SourceCredibility = 'high' | 'medium' | 'low'
export type TagType = 'topic' | 'content_type' | 'severity' | 'locality' | 'impact'
export type ThreadStatus = 'active' | 'inactive'
export type RawItemStatus = 'pending' | 'in_review' | 'processed' | 'rejected'
export type SuggestionType = 'duplicate' | 'related' | 'tag' | 'thread'
export type ContentType = 'news_update' | 'editorial' | 'official' | 'analysis'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Locality = 'global' | 'regional' | 'local'
export type Impact = 'strategic' | 'tactical' | 'informational'
export type ReadingFormat = 'quick_cards' | 'short_brief' | 'deep_read'
export type AlertIntensity = 'low' | 'medium' | 'high'
export type InteractionAction = 'read' | 'ignored' | 'saved' | 'unsaved'

// ─── Table 1 — industry_spaces ────────────────────────────────────────────────

export interface IndustrySpace {
  id: string
  name: string
  description: string | null
  status: SpaceStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Table 2 — users ─────────────────────────────────────────────────────────

export interface User {
  id: string
  space_id: string | null
  name: string
  email: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

// ─── Table 3 — sources ───────────────────────────────────────────────────────

export interface Source {
  id: string
  space_id: string
  name: string
  url: string
  type: SourceType | null
  credibility: SourceCredibility
  status: string
  created_at: string
}

// ─── Table 4 — tags ──────────────────────────────────────────────────────────

export interface Tag {
  id: string
  space_id: string
  name: string
  type: TagType
  description: string | null
  status: string
  created_at: string
}

// ─── Table 5 — event_threads ─────────────────────────────────────────────────

export interface EventThread {
  id: string
  space_id: string
  title: string
  description: string | null
  status: ThreadStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Table 6 — raw_items ─────────────────────────────────────────────────────

export interface RawItem {
  id: string
  space_id: string
  submitted_by: string
  source_id: string | null
  source_url: string | null
  raw_text: string
  notes: string | null
  status: RawItemStatus
  ai_processed: boolean
  created_at: string
  updated_at: string
}

// ─── Table 7 — ai_suggestions ────────────────────────────────────────────────

export interface AiSuggestion {
  id: string
  raw_item_id: string
  suggestion_type: SuggestionType
  suggested_value: string
  similarity_score: number | null
  confidence_score: number | null
  accepted: boolean | null
  created_at: string
}

// ─── Table 8 — article_vectors ───────────────────────────────────────────────

export interface ArticleVector {
  id: string
  final_item_id: string
  embedding: number[]
  model_used: string
  created_at: string
}

// ─── Table 9 — final_items ───────────────────────────────────────────────────

export interface FinalItem {
  id: string
  space_id: string
  raw_item_id: string | null
  thread_id: string | null
  author_id: string
  title: string
  summary: string
  body: string
  content_type: ContentType | null
  severity: Severity | null
  locality: Locality | null
  impact: Impact | null
  status: string
  published_at: string
  created_at: string
}

// ─── Table 10 — article_tags ─────────────────────────────────────────────────

export interface ArticleTag {
  id: string
  final_item_id: string
  tag_id: string
  applied_by: string | null
  created_at: string
}

// ─── Table 11 — user_preferences ─────────────────────────────────────────────

export interface UserPreferences {
  id: string
  user_id: string
  space_id: string
  followed_tag_ids: string[]
  reading_format: ReadingFormat
  alert_intensity: AlertIntensity
  updated_at: string
}

// ─── Table 12 — user_interactions ────────────────────────────────────────────

export interface UserInteraction {
  id: string
  user_id: string
  final_item_id: string
  thread_id: string | null
  action: InteractionAction
  interacted_at: string
}

// ─── Table 13 — user_tag_weights ─────────────────────────────────────────────

export interface UserTagWeight {
  id: string
  user_id: string
  tag_id: string
  weight: number
  interaction_count: number
  updated_at: string
}

// ─── Composite / extended types ───────────────────────────────────────────────

export interface FinalItemWithTags extends FinalItem {
  tags: Tag[]
  thread: EventThread | null
}

export interface FeedItem extends FinalItemWithTags {
  score: number
  is_thread_update: boolean
}
