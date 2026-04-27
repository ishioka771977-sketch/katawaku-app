-- ============================================================
-- 型知/鉄知 v3.4 — 知見循環システム DBマイグレーション
-- 指令書: 2026-04-27 v3.4 第6章
-- 前提: v2.0 の project_master が既に存在
-- ============================================================

-- ── 1. json_versions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.json_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.project_master(project_id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('katachi', 'tetchi')),
  version_number INT NOT NULL,
  file_path TEXT NOT NULL,
  json_content JSONB NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_final BOOLEAN DEFAULT false,
  UNIQUE(project_id, app, version_number)
);
CREATE INDEX IF NOT EXISTS idx_json_versions_project ON public.json_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_json_versions_app ON public.json_versions(app);

-- ── 2. field_notes (DB版、ファイル版と併存) ──────────
CREATE TABLE IF NOT EXISTS public.field_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'ishioka',
  project_id TEXT REFERENCES public.project_master(project_id) ON DELETE SET NULL,
  app TEXT CHECK (app IN ('katachi', 'tetchi', 'unknown')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  raw_session_text TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_field_notes_project ON public.field_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_field_notes_org ON public.field_notes(org_id);
CREATE INDEX IF NOT EXISTS idx_field_notes_app ON public.field_notes(app);

-- ── 3. setup_md_versions ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.setup_md_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'ishioka',
  app TEXT NOT NULL CHECK (app IN ('katachi', 'tetchi')),
  version_number INT NOT NULL,
  md_content TEXT NOT NULL,
  change_summary TEXT,
  integrated_project_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by TEXT DEFAULT 'hide',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, app, version_number)
);
CREATE INDEX IF NOT EXISTS idx_setup_md_app ON public.setup_md_versions(app);

-- ── 4. field_notes_failed (退避先) ───────────────────
CREATE TABLE IF NOT EXISTS public.field_notes_failed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,
  project_id TEXT,
  app TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  retry_count INT DEFAULT 0
);

-- ── 5. RLS 有効化 + ポリシー ─────────────────────────
ALTER TABLE public.json_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setup_md_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_notes_failed ENABLE ROW LEVEL SECURITY;

-- json_versions
DROP POLICY IF EXISTS "jv_select_authenticated" ON public.json_versions;
DROP POLICY IF EXISTS "jv_insert_authenticated" ON public.json_versions;
CREATE POLICY "jv_select_authenticated" ON public.json_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "jv_insert_authenticated" ON public.json_versions FOR INSERT TO authenticated WITH CHECK (true);

-- field_notes
DROP POLICY IF EXISTS "fn_select_authenticated" ON public.field_notes;
DROP POLICY IF EXISTS "fn_insert_authenticated" ON public.field_notes;
CREATE POLICY "fn_select_authenticated" ON public.field_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "fn_insert_authenticated" ON public.field_notes FOR INSERT TO authenticated WITH CHECK (true);

-- setup_md_versions: 読取は誰でも、書き込みは admin のみ
DROP POLICY IF EXISTS "smv_select_authenticated" ON public.setup_md_versions;
DROP POLICY IF EXISTS "smv_write_admin" ON public.setup_md_versions;
CREATE POLICY "smv_select_authenticated" ON public.setup_md_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "smv_write_admin" ON public.setup_md_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users_profile p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- field_notes_failed: 認証ユーザー全員 INSERT 可、SELECT は admin のみ（プライベート性）
DROP POLICY IF EXISTS "fnf_insert_authenticated" ON public.field_notes_failed;
DROP POLICY IF EXISTS "fnf_select_admin" ON public.field_notes_failed;
CREATE POLICY "fnf_insert_authenticated" ON public.field_notes_failed FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fnf_select_admin" ON public.field_notes_failed FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ── 6. 確認 ────────────────────────────────────────
SELECT table_name, (
  SELECT COUNT(*) FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = t.table_name
) AS column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN ('json_versions', 'field_notes', 'setup_md_versions', 'field_notes_failed')
ORDER BY table_name;
