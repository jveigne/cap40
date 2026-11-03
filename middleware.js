// Middleware Vercel : le plan (index.html et /private/*) n'est servi qu'avec une session Supabase valide.
// Sinon, redirection vers /login.html. La page de connexion, les styles et Supabase restent publics.
import { next } from '@vercel/functions/middleware';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const config = { matcher: ['/', '/index.html', '/private/:path*'] };

const SB_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const JWKS = SB_URL ? createRemoteJWKSet(new URL(SB_URL + '/auth/v1/.well-known/jwks.json')) : null;

function readCookie(header, name) {
  const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const token = readCookie(request.headers.get('cookie'), 'cap40-at');

  if (JWKS && token) {
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: SB_URL + '/auth/v1', audience: 'authenticated' });
      if (payload.role === 'authenticated' && !payload.is_anonymous) {
        return next({ headers: { 'Cache-Control': 'private, no-store' } });
      }
    } catch { /* jeton expiré ou invalide : on renvoie vers la connexion */ }
  }

  if (url.pathname.startsWith('/private/')) return new Response('Accès refusé', { status: 401 });
  const login = new URL('/login.html', url);
  login.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(login, 302);
}
