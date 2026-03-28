-- Migration 004: Add pgvector similarity search RPC function
-- Called by the AI Brain to find duplicate and related articles.
-- Uses cosine distance (<=>): lower distance = higher similarity.
-- similarity = 1 - cosine_distance, so similarity 1.0 = identical.

CREATE OR REPLACE FUNCTION match_article_vectors(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.5,
  match_count      int   DEFAULT 10
)
RETURNS TABLE (
  final_item_id  uuid,
  similarity     float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    av.final_item_id,
    1 - (av.embedding <=> query_embedding) AS similarity
  FROM article_vectors av
  WHERE 1 - (av.embedding <=> query_embedding) > match_threshold
  ORDER BY av.embedding <=> query_embedding  -- closest first
  LIMIT match_count;
$$;

-- Grant execute to the service role (used by AI Brain)
GRANT EXECUTE ON FUNCTION match_article_vectors TO service_role;
