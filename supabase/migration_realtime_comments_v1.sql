-- ============================================================
-- Add `comments` to the supabase_realtime publication so the board can
-- live-update the latest-comment preview when a comment is added.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE comments;
