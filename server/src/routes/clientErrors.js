import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

// Public — the whole point is to catch errors on screens a person can hit
// before or without being signed in (Login, Register, the landing page).
// Rate-limited per IP so a broken client in a reload loop can't flood the
// server's own logs; deliberately generous since this only ever logs, it
// never causes a write anyone would rely on.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many error reports — try again in a minute.' },
});

// Bounds on what actually gets logged — an attacker-controlled payload
// should never be able to write unbounded data into the server's own logs.
const MAX_FIELD_LENGTH = 2000;
function clip(value) {
  if (typeof value !== 'string') return null;
  return value.slice(0, MAX_FIELD_LENGTH);
}

router.post('/', clientErrorLimiter, (req, res) => {
  const b = req.body || {};
  const entry = {
    ts: new Date().toISOString(),
    reqId: req.id,
    kind: 'client_error',
    message: clip(b.message),
    stack: clip(b.stack),
    url: clip(b.url),
    userId: req.user?.id ?? null, // present only if a session cookie happens to be attached; most reports here are pre-auth
  };
  console.error(JSON.stringify(entry));
  res.status(204).end();
});

export default router;
