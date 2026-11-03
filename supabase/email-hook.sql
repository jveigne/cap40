-- Cap sur mes 40 ans : tous les e-mails d'authentification partent vers le propriétaire.
--
-- Quand quelqu'un demande l'accès avec son e-mail, Supabase génère un code. Au lieu de l'envoyer
-- à cette personne, cette fonction l'envoie à jeanphi.veigne@gmail.com (via Resend), qui décide
-- de le transmettre ou non. Sans ce code, impossible d'entrer.
--
-- Avant d'exécuter ce script :
--   1. Crée un compte gratuit sur https://resend.com AVEC l'adresse jeanphi.veigne@gmail.com
--      (sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte : c'est exactement ce qu'on veut).
--   2. Crée une clé API (API Keys → Create API Key, droit « Sending access »).
--   3. Dans SQL Editor, exécute UNE FOIS (en remplaçant la clé ; ne la mets pas dans ce fichier) :
--        select vault.create_secret('re_xxxxxxxxxxxx', 'resend_api_key');
--
-- Ensuite : Authentication → Hooks → Send Email hook → type Postgres → fonction public.cap40_send_email.

create extension if not exists pg_net with schema extensions;

create or replace function public.cap40_send_email(event jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  owner     text := 'jeanphi.veigne@gmail.com';
  requester text := lower(event -> 'user' ->> 'email');
  action    text := event -> 'email_data' ->> 'email_action_type';
  code      text := coalesce(event -> 'email_data' ->> 'token', event -> 'email_data' ->> 'token_new');
  api_key   text;
  subject   text;
  body      text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 500, 'message', 'Clé Resend absente du Vault (resend_api_key).'));
  end if;

  if action in ('magiclink', 'signup', 'email') and requester = owner then
    subject := 'Ton code de connexion : ' || code;
    body    := 'Ton code pour entrer dans « Cap sur mes 40 ans » : ' || code;
  elsif action in ('magiclink', 'signup', 'email') then
    subject := 'Demande d''accès de ' || requester;
    body    := requester || ' demande à voir ton plan « Cap sur mes 40 ans » (lecture seule).' || E'\n\n'
            || 'Si tu es d''accord, transmets-lui ce code : ' || code || E'\n\n'
            || 'Sinon, ignore cet e-mail : sans ce code, personne ne peut entrer.' || E'\n'
            || 'Pour retirer un accès plus tard : Supabase → Authentication → Users → supprimer le compte.';
  else
    subject := 'Supabase : action « ' || coalesce(action, '?') || ' » pour ' || coalesce(requester, '?');
    body    := 'Action : ' || coalesce(action, '?') || E'\n' || 'Compte : ' || coalesce(requester, '?') || E'\n' || 'Code : ' || coalesce(code, '-');
  end if;

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'from', 'Cap sur mes 40 ans <onboarding@resend.dev>',
      'to', jsonb_build_array(owner),
      'subject', subject,
      'text', body
    )
  );
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.cap40_send_email(jsonb) to supabase_auth_admin;
revoke execute on function public.cap40_send_email(jsonb) from public, anon, authenticated;
