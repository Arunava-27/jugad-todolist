import crypto from 'node:crypto';

// One structured JSON line per request, logged after the response actually
// finishes (so status/latency are real, not assumed) — request id, method,
// path, status, latency, and *safe* actor context only (user/org/workspace
// ids, never email/name/tokens/bodies). Mounted first in app.js so req.id
// and the X-Request-Id response header exist for every route, including
// ones that 404 or error before reaching any real handler.
export function requestLogger(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = {
      ts: new Date().toISOString(),
      reqId: req.id,
      method: req.method,
      path: req.baseUrl + (req.route?.path || req.path),
      status: res.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100,
      // req.user is set by requireAuth (or left undefined for public routes)
      // well before 'finish' fires, since that only happens after every
      // downstream handler has already run.
      userId: req.user?.id ?? null,
      orgId: req.user?.organization_id ?? null,
      workspaceId: req.workspaceId ?? null,
    };
    console.log(JSON.stringify(entry));
  });

  next();
}
