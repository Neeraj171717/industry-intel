-- Migration 018 — article_likes table
--
-- Separate likes from user_interactions so a user can both save AND like the
-- same article. The existing user_interactions table has UNIQUE(user_id, final_item_id),
-- which would block a second action row for the same article.
--
-- Likes are toggled (insert on first click, delete on second click).
-- Anonymous likes are stored in localStorage (anon:liked_ids) — no DB row.

CREATE TABLE article_likes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_item_id UUID        NOT NULL REFERENCES final_items(id) ON DELETE CASCADE,
  liked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, final_item_id)
);

CREATE INDEX idx_article_likes_user_id       ON article_likes(user_id);
CREATE INDEX idx_article_likes_final_item_id ON article_likes(final_item_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_likes_select"
  ON article_likes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "article_likes_insert"
  ON article_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "article_likes_delete"
  ON article_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
