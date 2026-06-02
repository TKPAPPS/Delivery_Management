-- Migration: prevent duplicate LINE groups (would cause double-sends).
-- Partial unique index so two rows can't share the same target id (null allowed for unconfigured rows).

create unique index if not exists idx_line_groups_target_unique
  on line_groups (line_target_id)
  where line_target_id is not null;
