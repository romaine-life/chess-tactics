// React app entry — replaces the legacy app.js string-HTML router. index.html
// loads this module. Bundles the design tokens (style.css), wires the static
// topbar auth chrome, starts background music, and mounts the React router.
import './style.css';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
// @ts-ignore — bgm.js is untyped legacy JS, imported for its side-effecting init.
import { initBgm } from './bgm.js';

// The shell ships hidden (avoids an unstyled flash); reveal it once JS runs.
const shell = document.querySelector('.shell');
if (shell instanceof HTMLElement) shell.style.visibility = 'visible';

// Topbar auth chrome, ported from app.js initAuth(). The markup is static in
// index.html so the server-rendered shell shows "Guest" before hydration.
const returnTo = (): string => window.location.pathname + window.location.search;
const accountName = document.getElementById('accountName');
const accountAvatar = document.getElementById('accountAvatar');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');

signInButton?.addEventListener('click', () => {
  window.location.href = `/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo())}`;
});
signOutButton?.addEventListener('click', async () => {
  try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
  window.location.reload();
});

fetch('/api/auth/me', { credentials: 'include' })
  .then((r) => (r.ok ? r.json() : { signed_in: false }))
  .then((u) => {
    if (!u || !u.signed_in) return;
    if (accountName) accountName.textContent = u.name || u.email || 'Player';
    const src = u.avatar_url || u.gravatar_url;
    if (accountAvatar instanceof HTMLImageElement && src) { accountAvatar.src = src; accountAvatar.hidden = false; }
    signInButton?.setAttribute('hidden', '');
    signOutButton?.removeAttribute('hidden');
  })
  .catch(() => { /* stay a guest */ });

try { initBgm(); } catch { /* background music is decorative */ }

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
