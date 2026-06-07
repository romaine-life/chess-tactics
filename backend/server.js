const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'frontend');
const authBaseUrl = (process.env.AUTH_BASE_URL || 'https://auth.romaine.life').replace(/\/+$/, '');
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://chess.romaine.life').replace(/\/+$/, '');

function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function requestOrigin(req) {
  if (process.env.PUBLIC_ORIGIN) return publicOrigin;

  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return publicOrigin;
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  const pathOnly = safeReturnPath(req.query.returnTo);
  return `${requestOrigin(req)}${pathOnly}`;
}

function publicUser(session) {
  const user = session && session.user;
  if (!user || !user.email) return { signed_in: false };
  return {
    signed_in: true,
    email: user.email,
    name: user.name || user.email,
    image: user.image || null,
    role: user.role || 'pending',
  };
}

function forwardSetCookie(upstream, res) {
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : [upstream.headers.get('set-cookie')].filter(Boolean);
  cookies.forEach((cookie) => res.append('set-cookie', cookie));
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/auth/me', async (req, res) => {
  const cookie = req.get('cookie');
  if (!cookie) {
    res.status(200).json({ signed_in: false });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: {
        accept: 'application/json',
        cookie,
      },
    });
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
    return;
  }

  if (!upstream.ok) {
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
    return;
  }

  const session = await upstream.json();
  res.status(200).json(publicUser(session));
});

app.get('/api/auth/sign-in', (req, res) => {
  const next = encodeURIComponent(callbackUrl(req));
  res.redirect(302, `${authBaseUrl}/sign-in/microsoft?callbackURL=${next}`);
});

app.post('/api/auth/sign-out', async (req, res) => {
  const cookie = req.get('cookie');
  if (cookie) {
    try {
      const upstream = await fetch(`${authBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie,
          origin: requestOrigin(req),
        },
        body: '{}',
      });
      forwardSetCookie(upstream, res);
      if (!upstream.ok) {
        res.status(502).json({ error: 'sign_out_failed' });
        return;
      }
    } catch (error) {
      console.error('auth sign-out failed:', error);
      res.status(502).json({ error: 'auth_unavailable' });
      return;
    }
  }
  res.status(204).end();
});

app.use(express.static(frontendDir));

app.use((_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`chess-tactics listening on :${port}`);
});
