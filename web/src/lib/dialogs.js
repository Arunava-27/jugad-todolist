// Imperative replacement for window.confirm/prompt/alert, so the app never
// shows a native browser dialog. DialogHost (mounted once near the app root)
// registers itself here; call sites just `await confirmDialog(...)` etc.
// exactly like the native versions, but backed by a real in-app modal.

let listener = null;

export function registerDialogHost(fn) {
  listener = fn;
}

function show(config) {
  return new Promise((resolve) => {
    if (!listener) {
      // No host mounted (shouldn't happen) — fail safe rather than throw.
      resolve(config.type === 'prompt' ? null : false);
      return;
    }
    listener({ ...config, resolve });
  });
}

export function confirmDialog(message, { title = 'Please confirm', danger = false } = {}) {
  return show({ type: 'confirm', message, title, danger });
}

export function promptDialog(message, defaultValue = '', { title = 'Input needed' } = {}) {
  return show({ type: 'prompt', message, defaultValue, title });
}

export function alertDialog(message, { title = 'Notice' } = {}) {
  return show({ type: 'alert', message, title });
}
