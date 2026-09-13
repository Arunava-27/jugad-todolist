// The externally-reachable base URL of this deployment, no trailing slash —
// used anywhere a fully-qualified link back to Punchlist itself has to be
// resolvable from outside this container: invite emails, and (Phase 9) the
// OAuth authorization server's issuer/endpoint URLs, which a connecting
// client fetches directly. APP_URL wins if set explicitly; otherwise derived
// from DOMAIN (the same env var Caddy already routes on in production),
// falling back to the Vite dev server's address for local dev.
export const APP_URL = (process.env.APP_URL || `https://${process.env.DOMAIN || 'localhost:5173'}`).replace(/\/+$/, '');
