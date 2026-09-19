import app from './app.js';

const PORT = process.env.PORT || 3000;

// Process-level crash visibility — belongs here (the real entry point), not
// in app.js, since app.js is also imported directly by tests and shouldn't
// install process-wide handlers. Node terminates on an unhandled rejection
// by default once any 'unhandledRejection' listener exists (this one), so
// without this the process would already die silently on one; logging it
// structured first at least makes the cause visible before that happens.
// An uncaughtException leaves Node's internal state unreliable, so that one
// logs and then exits deliberately rather than trying to keep running.
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), kind: 'unhandled_rejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }));
});
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), kind: 'uncaught_exception', message: err.message, stack: err.stack,
  }));
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Punchlist server listening on :${PORT}`);
});
