// Dependency-free client error reporting — no third-party service is
// configured for this deployment, so this posts a minimal, capped payload
// (message/stack/url only, no PII) to the server's own /api/client-errors,
// which just logs it structured server-side. See server/src/routes/clientErrors.js.

const ENDPOINT = '/api/client-errors';
const MAX_FIELD_LENGTH = 2000;
let installed = false;

function send(message, stack, url) {
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true, // lets the request survive a navigation/unload that's about to happen
      body: JSON.stringify({
        message: String(message ?? '').slice(0, MAX_FIELD_LENGTH),
        stack: String(stack ?? '').slice(0, MAX_FIELD_LENGTH),
        url: url || window.location.href,
      }),
    }).catch(() => {}); // a failure to report a failure isn't worth reporting
  } catch {
    // never let error reporting itself throw
  }
}

export function installGlobalErrorReporting() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    send(event.message, event.error?.stack, window.location.href);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    send(reason?.message ?? String(reason), reason?.stack, window.location.href);
  });
}

export function reportError(err) {
  send(err?.message ?? String(err), err?.stack, window.location.href);
}
