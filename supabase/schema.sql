-- Cap sur mes 40 ans : stockage du suivi
-- À exécuter une fois dans Supabase > SQL Editor.
-- Chaque ligne est un « document » JSON (un mois du journal, une année du registre, les jalons…),
-- toujours rattaché à l'utilisateur connecté.

create table if not exists public.suivi_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.suivi_docs enable row level security;

-- Chacun ne voit et ne modifie que ses propres lignes.
drop policy if exists "suivi: lire mes données" on public.suivi_docs;
create policy "suivi: lire mes données" on public.suivi_docs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "suivi: ajouter mes données" on public.suivi_docs;
create policy "suivi: ajouter mes données" on public.suivi_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "suivi: modifier mes données" on public.suivi_docs;
create policy "suivi: modifier mes données" on public.suivi_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "suivi: supprimer mes données" on public.suivi_docs;
create policy "suivi: supprimer mes données" on public.suivi_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.suivi_docs to authenticated;
revoke all on public.suivi_docs from anon;
