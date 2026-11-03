import './style.css';
import { sb, saveCookie } from './auth.js';

const $ = (id) => document.getElementById(id);
const msg = (t) => { $('msg').textContent = t || ''; };

// Où revenir après la connexion : uniquement un chemin du site (pas de redirection vers un autre domaine).
function nextUrl() {
  const n = new URLSearchParams(location.search).get('next') || '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}
const enter = () => location.replace(nextUrl());

function showEmail() {
  $('stepCode').hidden = true;
  $('stepEmail').hidden = false;
  $('email').focus();
}
function showCode(email) {
  $('stepEmail').hidden = true;
  $('stepCode').hidden = false;
  $('codeInfo').textContent = 'Ta demande pour ' + email + ' a été transmise à Jean Philippe. ' +
    'Il te communiquera un code : saisis-le ci-dessous.';
  $('code').value = '';
  $('code').focus();
}

let email = '';

$('stepEmail').addEventListener('submit', async (e) => {
  e.preventDefault();
  email = $('email').value.trim().toLowerCase();
  msg('Envoi de la demande…');
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) { msg('Erreur : ' + error.message); return; }
  msg('');
  showCode(email);
});

$('stepCode').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg('Vérification…');
  const { data, error } = await sb.auth.verifyOtp({ email, token: $('code').value.trim(), type: 'email' });
  if (error || !data.session) { msg('Code incorrect ou expiré.'); return; }
  saveCookie(data.session);
  enter();
});

$('back').addEventListener('click', () => { msg(''); showEmail(); });

(async () => {
  if (!sb) { enter(); return; } // mode local (développement sans Supabase)
  const { data } = await sb.auth.getSession(); // renouvelle le jeton s'il a expiré
  if (data.session) { saveCookie(data.session); enter(); return; }
  showEmail();
})();
