
CREATE TABLE public.material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_categories TO anon, authenticated;
GRANT ALL ON public.material_categories TO service_role;
ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw categories" ON public.material_categories FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.material_categories(id) ON DELETE SET NULL,
  author text NOT NULL DEFAULT '',
  year int,
  title text NOT NULL DEFAULT '',
  doi text NOT NULL DEFAULT '',
  abstract text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  citation_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.papers TO anon, authenticated;
GRANT ALL ON public.papers TO service_role;
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw papers" ON public.papers FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX papers_category_idx ON public.papers(category_id);

CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0,
  -- values shape: { field_key: { value: <any>, state: 'filled'|'missing'|'na'|'needs_check', note?: string } }
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experiments TO anon, authenticated;
GRANT ALL ON public.experiments TO service_role;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw experiments" ON public.experiments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX experiments_paper_idx ON public.experiments(paper_id);

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER papers_touch BEFORE UPDATE ON public.papers FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER experiments_touch BEFORE UPDATE ON public.experiments FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.material_categories (name, sort_order) VALUES
  ('Ni-Cr-X', 10),
  ('Fe-Ni-Cr', 20),
  ('Binary Ni-Cr', 30),
  ('Fe-Cr RAFM', 40),
  ('Scully Group', 50);
