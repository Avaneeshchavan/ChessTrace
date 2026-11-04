# Blockers

## API test command failed three times

On 2026-11-04, `node --test` in `api-server/` exited with code 1 on all three attempts. The suite reports:

- `scripts/test-search.js` cannot connect to the configured Neon PostgreSQL host while calling `prisma.position.findFirst()` (`api-server/scripts/test-search.js:10`).
- `src/lib/sm2.test.js` fails at line 3 with `ReferenceError: describe is not defined` under Node's built-in test runner.

The smoke test passed in each run. No application or test code was changed to work around these failures.
