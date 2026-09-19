import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // better-sqlite3 is a native addon — isolate each test file in its own
    // process rather than a worker thread, and give each its own fresh
    // DATA_DIR (see test/helpers/testApp.js) so tests never share a database.
    pool: 'forks',
    testTimeout: 15000,
  },
});
