# Applying the SM-2 migration on Neon

Neon initially failed to connect, then became reachable during verification. A read-only check confirmed the SM-2 fields are absent. No app tables or migration records were changed by the assistant; the default HTTP integration test uses a mocked Prisma client until the migration is applied. SQL was generated offline with the installed Prisma 5 CLI, and the client was regenerated.

## Recovering the existing Neon database (verified 2026-11-11)

The pasted run got P1001 while connecting to Neon, so the baseline was not recorded before `migrate deploy` tried to create the existing `ActivityType` enum (P3018 / 42710). The latest read-only check found a failed `0000_initial_schema` record, no SM-2 columns, and an empty diff against the pre-SM-2 schema. The manual HNSW migration is recorded as applied, but its named index is absent. Do not reset the database or rerun the baseline SQL.

From the repository root, use this fail-fast sequence for that verified state. It contains no shell comment lines, so it can be pasted into interactive zsh. Stop if a step fails; in particular, reconnect or wake Neon before retrying a P1001. If the baseline has since been marked applied, skip the resolve step.

```sh
cd api-server &&
npx prisma migrate resolve --applied 0000_initial_schema &&
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/0001_manual_vector_index/migration.sql &&
npx prisma migrate deploy &&
npx prisma generate &&
npx prisma migrate status &&
CHESSTRACE_LIVE_DB_TEST=1 node --test src/routes/vault.test.js
```

`resolve --applied` reconciles the failed baseline with the existing schema. The index command reuses the original idempotent SQL and can take time on a populated Position table. The live HTTP test creates and cleans up its own fixtures. See [Prisma's failed migration recovery guidance](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing).

Migration order:

1. `0000_initial_schema`: baseline of the schema before SM-2 (the original history had no table creation migration).
2. `0001_manual_vector_index`: original pgvector HNSW migration, preserved byte for byte.
3. `0002_saved_puzzle_sm2`: adds five fields with defaults and the user/review-date index, preserving existing puzzles.

From the repository root:

```sh
cd api-server
npm ci
npx prisma generate
npx prisma migrate status
```

Set `DATABASE_URL` to the Neon pooled URL and `DIRECT_URL` to its direct URL in the ignored `api-server/.env`. Prisma's datasource uses `DIRECT_URL` for migrations. Do not use `migrate reset` or `db push` to apply this change.

For an **existing database** that already has all tables, columns, enums, constraints and indexes in `0000_initial_schema`, first baseline it if that migration is not yet recorded:

```sh
npx prisma migrate resolve --applied 0000_initial_schema
```

Compare the baseline SQL with the existing schema before marking it applied. Partial or divergent schemas need reconciliation first. If the manual HNSW migration is already recorded, leave it recorded. If the HNSW index exists but its migration is not recorded, confirm its definition matches `0001_manual_vector_index/migration.sql`, then run:

```sh
npx prisma migrate resolve --applied 0001_manual_vector_index
```

If both the HNSW index and its migration record are absent, leave the migration pending so deploy creates it. If its migration is already recorded but the index is absent, use the idempotent index command above. For an **empty database**, skip both `resolve` commands: deploy creates the baseline tables, HNSW index and SM-2 fields in order.

Apply the pending migrations and regenerate the client:

```sh
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

Then run `npm test` for the offline suite. It verifies the vault endpoints with mocked persistence, not the deployed Neon schema. After applying the migration, run the same HTTP flow against Neon (creates a uniquely named test user and deletes its fixtures afterward):

```sh
CHESSTRACE_LIVE_DB_TEST=1 node --test src/routes/vault.test.js
```

See [Prisma's baselining documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) for why existing schemas need `migrate resolve --applied`.
