-- ============================================================
-- 型知/鉄知 v2.0 — project_master テーブル新設
-- 指令書: 2026-04-27 v2.0 第3章
-- ============================================================

-- ── 1. テーブル本体 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_master (
  project_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL DEFAULT 'ishioka',
  project_name TEXT NOT NULL,
  location TEXT,
  contractor TEXT,
  start_date DATE,
  planned_end_date DATE,
  actual_end_date DATE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed_pool', 'integrated')),
  -- 旧形式とのマッピング (実データ0件のため当面は未使用、将来発生時のため確保)
  legacy_slugs TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- メタ
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_master_status ON public.project_master(status);
CREATE INDEX IF NOT EXISTS idx_project_master_org ON public.project_master(org_id);

-- ── 2. updated_at 自動更新トリガ ────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_master_touch ON public.project_master;
CREATE TRIGGER project_master_touch
  BEFORE UPDATE ON public.project_master
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 3. RLS 有効化 + ポリシー ────────────────────────
ALTER TABLE public.project_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_select_authenticated" ON public.project_master;
DROP POLICY IF EXISTS "pm_insert_authenticated" ON public.project_master;
DROP POLICY IF EXISTS "pm_update_authenticated" ON public.project_master;
DROP POLICY IF EXISTS "pm_delete_admin" ON public.project_master;

-- 読取: 認証済みユーザー全員可（プルダウン候補生成のため）
CREATE POLICY "pm_select_authenticated" ON public.project_master
  FOR SELECT TO authenticated USING (true);

-- 挿入: 認証済みユーザー誰でも可（工事登録）
CREATE POLICY "pm_insert_authenticated" ON public.project_master
  FOR INSERT TO authenticated WITH CHECK (true);

-- 更新: 認証済みユーザー誰でも可（status変更・legacy_slugs編集）
--       ※将来 admin のみに絞ることも可だが、運用初期は緩めに
CREATE POLICY "pm_update_authenticated" ON public.project_master
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 削除: admin のみ
CREATE POLICY "pm_delete_admin" ON public.project_master
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ── 4. 確認 ─────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'project_master'
ORDER BY ordinal_position;
