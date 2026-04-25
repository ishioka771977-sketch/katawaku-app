-- ============================================================
-- 型知 KATACHI — knowledge-base バケット & RLS ポリシー設定
-- Supabase SQL Editor で1回実行する
-- ============================================================

-- 1) バケット作成（非公開）
--    Supabase Dashboard → Storage → New bucket でも可
insert into storage.buckets (id, name, public)
values ('knowledge-base', 'knowledge-base', false)
on conflict (id) do nothing;

-- ============================================================
-- 2) RLS ポリシー
--    storage.objects には既に RLS が有効になっている前提
-- ============================================================

-- 既存の同名ポリシーがあれば一旦消す（再実行できるように）
drop policy if exists "kb_select_authenticated" on storage.objects;
drop policy if exists "kb_insert_field_notes" on storage.objects;
drop policy if exists "kb_update_field_notes" on storage.objects;
drop policy if exists "kb_write_core_admin" on storage.objects;

-- 2-1) 読み取り: 認証済みユーザーなら全ファイル閲覧可
create policy "kb_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'knowledge-base');

-- 2-2) field_notes/ への挿入: 認証済みユーザーなら誰でもOK
create policy "kb_insert_field_notes"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = 'field_notes'
);

-- 2-3) field_notes/ の上書き: 認証済みユーザーなら誰でもOK
--     （同名ファイル upsert=true で使う）
create policy "kb_update_field_notes"
on storage.objects for update
to authenticated
using (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = 'field_notes'
)
with check (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = 'field_notes'
);

-- 2-4) core/ の書込み（挿入・更新・削除）: 管理者のみ
--     profiles.role = 'admin' で判定
--     ※ profiles テーブルの構造は石岡組 Auth システムに合わせること
create policy "kb_write_core_admin"
on storage.objects for all
to authenticated
using (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = 'core'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = 'core'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ============================================================
-- 確認クエリ
-- select policyname, cmd, roles from pg_policies
--  where tablename = 'objects' and policyname like 'kb_%';
-- ============================================================
