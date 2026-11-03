// Partagé entre la page de connexion (publique) et l'application (protégée).
// Ne rien mettre ici qui concerne le contenu du plan : ce fichier est servi à tout le monde.
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const sb = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;

// Le middleware Vercel lit ce cookie pour décider s'il sert l'application.
const COOKIE = 'cap40-at';
export function saveCookie(session) {
  if (!session) return clearCookie();
  document.cookie = COOKIE + '=' + session.access_token + '; Path=/; Max-Age=2592000; SameSite=Lax' +
    (location.protocol === 'https:' ? '; Secure' : '');
}
export function clearCookie() {
  document.cookie = COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax';
}
