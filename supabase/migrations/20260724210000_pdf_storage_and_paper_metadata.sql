-- Paper-level PDF attachment + richer bibliographic metadata.
-- Supports: PDF upload/viewer, Crossref prefill, and the spreadsheet importer.

ALTER TABLE public.papers
  ADD COLUMN IF NOT EXISTS pdf_path   text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_name   text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS journal    text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes      text  NOT NULL DEFAULT '',
  -- Free-form bibliographic extras from Crossref (volume, issue, pages,
  -- keywords, full author list, dates, reference count, etc.).
  ADD COLUMN IF NOT EXISTS meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Marks which fields were auto-filled and not yet confirmed by a human,
  -- e.g. { "title": true, "year": true }.
  ADD COLUMN IF NOT EXISTS auto_filled jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Storage bucket for uploaded PDFs. Public read so the in-app viewer can load
-- them without a signed URL, matching the app's single-user, open-RLS model.
INSERT INTO storage.buckets (id, name, public)
VALUES ('papers', 'papers', true)
ON CONFLICT (id) DO NOTHING;

-- Open storage policies for the papers bucket (anon + authenticated).
DROP POLICY IF EXISTS "papers bucket read"   ON storage.objects;
DROP POLICY IF EXISTS "papers bucket insert" ON storage.objects;
DROP POLICY IF EXISTS "papers bucket update" ON storage.objects;
DROP POLICY IF EXISTS "papers bucket delete" ON storage.objects;

CREATE POLICY "papers bucket read"   ON storage.objects
  FOR SELECT USING (bucket_id = 'papers');
CREATE POLICY "papers bucket insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'papers');
CREATE POLICY "papers bucket update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'papers') WITH CHECK (bucket_id = 'papers');
CREATE POLICY "papers bucket delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'papers');
