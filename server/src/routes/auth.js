import { Router } from 'express';
import bcrypt from 'bcryptjs';

const router = Router();

// Single-user auth. Credentials come from env vars:
//   ADMIN_USERNAME  - plain username
//   ADMIN_PASSWORD_HASH - bcrypt hash of the password (generate with scripts/hash-password.js)
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUser || !expectedHash) {
    return res.status(500).json({ error: 'Server auth is not configured' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username !== expectedUser) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = { username };
  res.json({ username });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ username: req.session.user.username });
  }
  res.status(401).json({ error: 'Not authenticated' });
});

export default router;
