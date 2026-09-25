-- ============================================================
-- 型知 — 設計書セッション／対話記録／知見（2026-09-25）
-- 目的: 設計書→AI抽出→代理人との対話（質問・回答・補足・設計変更）→割付 を
--       1セッションとして記録し、得られた知見を次の現場のAIプロンプトに自動で載せる。
-- アクセス: service_role（API）のみ。RLS有効・ポリシーなし＝匿名/authenticatedは遮断。
-- 冪等（何度流しても同じ）
-- ============================================================

-- 1. セッション（工事×構造物×1回の設計書読取）
CREATE TABLE IF NOT EXISTS public.katachi_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'ishioka',
  project_name TEXT NOT NULL,
  structure_type TEXT NOT NULL,            -- deck_slab など
  structure_name TEXT,
  employee_number TEXT,                    -- 作った人（代理人）
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  mode TEXT,                               -- standard / precise
  source_files TEXT[] DEFAULT ARRAY[]::TEXT[],
  params_initial JSONB,                    -- AIの初回読取
  params_current JSONB,                    -- 対話で更新された最新
  json_current JSONB,                      -- 最新の型知JSON
  round_count INT NOT NULL DEFAULT 0,      -- 対話の往復回数
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_katachi_sessions_status ON public.katachi_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_katachi_sessions_emp ON public.katachi_sessions(employee_number);

-- 2. 対話記録（AIの質問・人の回答・補足・設計変更・AIの変更）
CREATE TABLE IF NOT EXISTS public.katachi_dialogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.katachi_sessions(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ai', 'human')),
  kind TEXT NOT NULL CHECK (kind IN ('question', 'answer', 'remark', 'change_request', 'change', 'summary')),
  content TEXT NOT NULL,
  field TEXT,                              -- 変更に関わるパラメータ名（あれば）
  old_value JSONB,
  new_value JSONB,
  ref_seq INT,                             -- 回答が対応する質問の seq
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_katachi_dialogue_session ON public.katachi_dialogue(session_id, seq);

-- 3. 知見（対話から抽出。次回のプロンプトに自動で載る）
CREATE TABLE IF NOT EXISTS public.katachi_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'ishioka',
  session_id UUID REFERENCES public.katachi_sessions(id) ON DELETE SET NULL,
  project_name TEXT,
  structure_type TEXT,                     -- 適用対象（deck_slab など・NULL=全構造物）
  category TEXT NOT NULL,                  -- 読取り／設計変更／現場条件／型枠工法／失敗 など
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_katachi_lessons_type ON public.katachi_lessons(structure_type, status, created_at DESC);

-- 4. RLS（service_role 以外は遮断）
ALTER TABLE public.katachi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.katachi_dialogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.katachi_lessons  ENABLE ROW LEVEL SECURITY;

-- 5. updated_at 自動更新（project_master と同じ関数を再利用）
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS katachi_sessions_touch ON public.katachi_sessions;
CREATE TRIGGER katachi_sessions_touch
  BEFORE UPDATE ON public.katachi_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. 確認
SELECT table_name,
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name) AS column_count,
  (SELECT relrowsecurity FROM pg_class WHERE relname=t.table_name) AS rls
FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_name IN ('katachi_sessions','katachi_dialogue','katachi_lessons')
ORDER BY table_name;
