-- Cap sur mes 40 ans : stockage du suivi
-- À exécuter dans Supabase > SQL Editor (le script peut être relancé sans risque).
-- Chaque ligne est un « document » JSON (un mois du journal, une année du registre, les jalons…).
--
-- Droits :
--   * le propriétaire (jeanphi.veigne@gmail.com) lit et modifie ses données ;
--   * toute autre personne connectée (elle a reçu un code de ma part) lit les données du propriétaire, sans rien modifier ;
--   * sans connexion : aucun accès.

create table if not exists public.suivi_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.suivi_docs enable row level security;

-- Identifiant du compte propriétaire (les utilisateurs connectés ne peuvent pas lire auth.users eux-mêmes).
create or replace function public.cap40_owner_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = 'jeanphi.veigne@gmail.com' limit 1
$$;
revoke execute on function public.cap40_owner_id() from public, anon;
grant execute on function public.cap40_owner_id() to authenticated;

-- Anciennes règles
drop policy if exists "suivi: lire mes données" on public.suivi_docs;
drop policy if exists "suivi: ajouter mes données" on public.suivi_docs;
drop policy if exists "suivi: modifier mes données" on public.suivi_docs;
drop policy if exists "suivi: supprimer mes données" on public.suivi_docs;
drop policy if exists "suivi: propriétaire uniquement" on public.suivi_docs;

-- Lecture : les données du propriétaire, pour tout compte connecté.
drop policy if exists "suivi: lire le suivi du propriétaire" on public.suivi_docs;
create policy "suivi: lire le suivi du propriétaire" on public.suivi_docs
  for select to authenticated
  using (user_id = (select public.cap40_owner_id()));

-- Écriture : le propriétaire seulement, sur ses propres lignes.
drop policy if exists "suivi: le propriétaire ajoute" on public.suivi_docs;
create policy "suivi: le propriétaire ajoute" on public.suivi_docs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select auth.uid()) = (select public.cap40_owner_id()));

drop policy if exists "suivi: le propriétaire modifie" on public.suivi_docs;
create policy "suivi: le propriétaire modifie" on public.suivi_docs
  for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = (select public.cap40_owner_id()))
  with check (user_id = (select auth.uid()) and (select auth.uid()) = (select public.cap40_owner_id()));

drop policy if exists "suivi: le propriétaire supprime" on public.suivi_docs;
create policy "suivi: le propriétaire supprime" on public.suivi_docs
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = (select public.cap40_owner_id()));

grant select, insert, update, delete on public.suivi_docs to authenticated;
revoke all on public.suivi_docs from anon;
