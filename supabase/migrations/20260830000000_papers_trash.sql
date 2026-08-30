-- Soft-delete ("trash") support for papers. Trashed papers are hidden from the
-- Browse tree unless the user selects "View trash".
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS trashed    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trash_note text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

CREATE INDEX IF NOT EXISTS papers_trashed_idx ON papers (trashed);
