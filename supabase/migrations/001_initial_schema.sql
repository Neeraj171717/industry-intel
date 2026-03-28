-- ============================================================
-- Industry Intelligence — Initial Schema Migration
-- 001_initial_schema.sql
-- ============================================================


-- ============================================================
-- STEP 1: Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- STEP 2: Tables
-- ============================================================

-- Table 1 — industry_spaces
-- No space_id column — this IS the top-level tenant table.
CREATE TABLE industry_spaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
  created_by  UUID,       -- FK to users added after users table is created
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2 — users
CREATE TABLE users (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id   UUID        REFERENCES industry_spaces(id) ON DELETE SET NULL,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  role       TEXT        NOT NULL
                         CHECK (role IN (
                           'super_admin','industry_admin','editor','contributor','user'
                         )),
  status     TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now that users exists, add the FK from industry_spaces.created_by
ALTER TABLE industry_spaces
  ADD CONSTRAINT fk_industry_spaces_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Table 3 — sources
CREATE TABLE sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  type        TEXT        CHECK (type IN ('blog','official','youtube','ai_tool','other')),
  credibility TEXT        NOT NULL DEFAULT 'medium'
                          CHECK (credibility IN ('high','medium','low')),
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 4 — tags
CREATE TABLE tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL
                          CHECK (type IN ('topic','content_type','severity','locality','impact')),
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 5 — event_threads
CREATE TABLE event_threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive')),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 6 — raw_items
CREATE TABLE raw_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  submitted_by UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_id    UUID        REFERENCES sources(id) ON DELETE SET NULL,
  source_url   TEXT,
  raw_text     TEXT        NOT NULL,
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_review','processed','rejected')),
  ai_processed BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 7 — ai_suggestions
CREATE TABLE ai_suggestions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_item_id      UUID        NOT NULL REFERENCES raw_items(id) ON DELETE CASCADE,
  suggestion_type  TEXT        NOT NULL
                               CHECK (suggestion_type IN ('duplicate','related','tag','thread')),
  suggested_value  TEXT        NOT NULL,
  similarity_score FLOAT,
  confidence_score FLOAT,
  accepted         BOOLEAN,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 9 — final_items (must exist before article_vectors)
CREATE TABLE final_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  raw_item_id  UUID        REFERENCES raw_items(id) ON DELETE SET NULL,
  thread_id    UUID        REFERENCES event_threads(id) ON DELETE SET NULL,
  author_id    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title        TEXT        NOT NULL,
  summary      TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  content_type TEXT        CHECK (content_type IN ('news_update','editorial','official','analysis')),
  severity     TEXT        CHECK (severity IN ('critical','high','medium','low')),
  locality     TEXT        CHECK (locality IN ('global','regional','local')),
  impact       TEXT        CHECK (impact IN ('strategic','tactical','informational')),
  status       TEXT        NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 8 — article_vectors (depends on final_items)
CREATE TABLE article_vectors (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  final_item_id  UUID        NOT NULL REFERENCES final_items(id) ON DELETE CASCADE,
  embedding      vector(768) NOT NULL,
  model_used     TEXT        NOT NULL DEFAULT 'gemini-embedding-001',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 10 — article_tags
CREATE TABLE article_tags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  final_item_id UUID        NOT NULL REFERENCES final_items(id) ON DELETE CASCADE,
  tag_id        UUID        NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  applied_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (final_item_id, tag_id)
);

-- Table 11 — user_preferences
CREATE TABLE user_preferences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  space_id        UUID        NOT NULL REFERENCES industry_spaces(id) ON DELETE CASCADE,
  followed_tag_ids UUID[]     NOT NULL DEFAULT '{}',
  reading_format  TEXT        NOT NULL DEFAULT 'quick_cards'
                              CHECK (reading_format IN ('quick_cards','short_brief','deep_read')),
  alert_intensity TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (alert_intensity IN ('low','medium','high')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 12 — user_interactions
CREATE TABLE user_interactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_item_id UUID        NOT NULL REFERENCES final_items(id) ON DELETE CASCADE,
  thread_id     UUID        REFERENCES event_threads(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL
                            CHECK (action IN ('read','ignored','saved','unsaved')),
  interacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, final_item_id)
);

-- Table 13 — user_tag_weights
CREATE TABLE user_tag_weights (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id            UUID        NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  weight            FLOAT       NOT NULL DEFAULT 0.5
                                CHECK (weight >= 0 AND weight <= 1),
  interaction_count INTEGER     NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tag_id)
);


-- ============================================================
-- STEP 3: Performance Indexes
-- ============================================================

-- space_id indexes (multi-tenant query performance)
CREATE INDEX idx_users_space_id             ON users(space_id);
CREATE INDEX idx_sources_space_id           ON sources(space_id);
CREATE INDEX idx_tags_space_id              ON tags(space_id);
CREATE INDEX idx_event_threads_space_id     ON event_threads(space_id);
CREATE INDEX idx_raw_items_space_id         ON raw_items(space_id);
CREATE INDEX idx_final_items_space_id       ON final_items(space_id);
CREATE INDEX idx_user_preferences_space_id  ON user_preferences(space_id);

-- user_id indexes
CREATE INDEX idx_user_interactions_user_id  ON user_interactions(user_id);
CREATE INDEX idx_user_tag_weights_user_id   ON user_tag_weights(user_id);

-- tag_id indexes
CREATE INDEX idx_article_tags_tag_id        ON article_tags(tag_id);
CREATE INDEX idx_user_tag_weights_tag_id    ON user_tag_weights(tag_id);

-- published_at index (feed ranking by recency)
CREATE INDEX idx_final_items_published_at   ON final_items(published_at DESC);

-- status index (editor inbox filtering)
CREATE INDEX idx_raw_items_status           ON raw_items(status);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_article_vectors_embedding
  ON article_vectors
  USING hnsw (embedding vector_cosine_ops);


-- ============================================================
-- STEP 4: Row Level Security — Enable on all tables
-- ============================================================

ALTER TABLE industry_spaces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_vectors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tag_weights   ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 5: RLS Policies
--
-- Security model:
--   - service_role key bypasses RLS entirely (used by AI Brain
--     and server-side admin operations via supabaseAdmin client)
--   - authenticated users can only see rows where
--     space_id matches their own space_id from the users table
--   - super_admin can see all rows across all spaces
--   - users can only write their own interaction/preference rows
-- ============================================================

-- Helper function: returns the space_id of the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_space_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT space_id FROM users WHERE id = auth.uid()
$$;

-- Helper function: returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;


-- ── industry_spaces ──────────────────────────────────────────
-- super_admin: all spaces. Others: only their own space.

CREATE POLICY "spaces_select"
  ON industry_spaces FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR id = get_user_space_id()
  );

CREATE POLICY "spaces_insert"
  ON industry_spaces FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "spaces_update"
  ON industry_spaces FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'super_admin');

CREATE POLICY "spaces_delete"
  ON industry_spaces FOR DELETE
  TO authenticated
  USING (get_user_role() = 'super_admin');


-- ── users ────────────────────────────────────────────────────
-- super_admin: all users. Others: only users in same space, plus own row.

CREATE POLICY "users_select"
  ON users FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
    OR id = auth.uid()
  );

CREATE POLICY "users_insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'industry_admin')
  );

CREATE POLICY "users_update"
  ON users FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
    OR id = auth.uid()
  );

CREATE POLICY "users_delete"
  ON users FOR DELETE
  TO authenticated
  USING (get_user_role() = 'super_admin');


-- ── sources ──────────────────────────────────────────────────

CREATE POLICY "sources_select"
  ON sources FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
  );

CREATE POLICY "sources_insert"
  ON sources FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'industry_admin')
    AND space_id = get_user_space_id()
  );

CREATE POLICY "sources_update"
  ON sources FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );

CREATE POLICY "sources_delete"
  ON sources FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );


-- ── tags ─────────────────────────────────────────────────────

CREATE POLICY "tags_select"
  ON tags FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
  );

CREATE POLICY "tags_insert"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'industry_admin')
    AND space_id = get_user_space_id()
  );

CREATE POLICY "tags_update"
  ON tags FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );

CREATE POLICY "tags_delete"
  ON tags FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );


-- ── event_threads ────────────────────────────────────────────

CREATE POLICY "threads_select"
  ON event_threads FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
  );

CREATE POLICY "threads_insert"
  ON event_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'industry_admin', 'editor')
    AND space_id = get_user_space_id()
  );

CREATE POLICY "threads_update"
  ON event_threads FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() IN ('industry_admin', 'editor') AND space_id = get_user_space_id())
  );

CREATE POLICY "threads_delete"
  ON event_threads FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );


-- ── raw_items ────────────────────────────────────────────────

CREATE POLICY "raw_items_select"
  ON raw_items FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
  );

CREATE POLICY "raw_items_insert"
  ON raw_items FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'contributor', 'editor', 'industry_admin')
    AND space_id = get_user_space_id()
  );

CREATE POLICY "raw_items_update"
  ON raw_items FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() IN ('industry_admin', 'editor') AND space_id = get_user_space_id())
  );

CREATE POLICY "raw_items_delete"
  ON raw_items FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );


-- ── ai_suggestions ───────────────────────────────────────────
-- No space_id — access controlled via raw_item's space

CREATE POLICY "ai_suggestions_select"
  ON ai_suggestions FOR SELECT
  TO authenticated
  USING (
    raw_item_id IN (
      SELECT id FROM raw_items
      WHERE get_user_role() = 'super_admin'
         OR space_id = get_user_space_id()
    )
  );

CREATE POLICY "ai_suggestions_insert"
  ON ai_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (
    raw_item_id IN (
      SELECT id FROM raw_items WHERE space_id = get_user_space_id()
    )
  );

CREATE POLICY "ai_suggestions_update"
  ON ai_suggestions FOR UPDATE
  TO authenticated
  USING (
    raw_item_id IN (
      SELECT id FROM raw_items
      WHERE get_user_role() = 'super_admin'
         OR (space_id = get_user_space_id()
             AND get_user_role() IN ('industry_admin', 'editor'))
    )
  );


-- ── final_items ──────────────────────────────────────────────

CREATE POLICY "final_items_select"
  ON final_items FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR space_id = get_user_space_id()
  );

CREATE POLICY "final_items_insert"
  ON final_items FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() IN ('super_admin', 'editor', 'industry_admin')
    AND space_id = get_user_space_id()
  );

CREATE POLICY "final_items_update"
  ON final_items FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() IN ('industry_admin', 'editor') AND space_id = get_user_space_id())
  );

CREATE POLICY "final_items_delete"
  ON final_items FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (get_user_role() = 'industry_admin' AND space_id = get_user_space_id())
  );


-- ── article_vectors ──────────────────────────────────────────
-- No space_id — access controlled via final_item's space

CREATE POLICY "article_vectors_select"
  ON article_vectors FOR SELECT
  TO authenticated
  USING (
    final_item_id IN (
      SELECT id FROM final_items
      WHERE get_user_role() = 'super_admin'
         OR space_id = get_user_space_id()
    )
  );

CREATE POLICY "article_vectors_insert"
  ON article_vectors FOR INSERT
  TO authenticated
  WITH CHECK (
    final_item_id IN (
      SELECT id FROM final_items WHERE space_id = get_user_space_id()
    )
  );


-- ── article_tags ─────────────────────────────────────────────
-- No space_id — access controlled via final_item's space

CREATE POLICY "article_tags_select"
  ON article_tags FOR SELECT
  TO authenticated
  USING (
    final_item_id IN (
      SELECT id FROM final_items
      WHERE get_user_role() = 'super_admin'
         OR space_id = get_user_space_id()
    )
  );

CREATE POLICY "article_tags_insert"
  ON article_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    final_item_id IN (
      SELECT id FROM final_items
      WHERE get_user_role() IN ('super_admin', 'editor', 'industry_admin')
        AND space_id = get_user_space_id()
    )
  );

CREATE POLICY "article_tags_delete"
  ON article_tags FOR DELETE
  TO authenticated
  USING (
    final_item_id IN (
      SELECT id FROM final_items
      WHERE get_user_role() = 'super_admin'
         OR (space_id = get_user_space_id()
             AND get_user_role() IN ('industry_admin', 'editor'))
    )
  );


-- ── user_preferences ─────────────────────────────────────────

CREATE POLICY "user_preferences_select"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('super_admin', 'industry_admin')
  );

CREATE POLICY "user_preferences_insert"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_update"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());


-- ── user_interactions ────────────────────────────────────────

CREATE POLICY "user_interactions_select"
  ON user_interactions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('super_admin', 'industry_admin')
  );

CREATE POLICY "user_interactions_insert"
  ON user_interactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_interactions_update"
  ON user_interactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());


-- ── user_tag_weights ─────────────────────────────────────────

CREATE POLICY "user_tag_weights_select"
  ON user_tag_weights FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('super_admin', 'industry_admin')
  );

CREATE POLICY "user_tag_weights_insert"
  ON user_tag_weights FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_tag_weights_update"
  ON user_tag_weights FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- END OF MIGRATION
-- ============================================================
