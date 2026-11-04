# Applying the SM-2 migration on Neon

Neon initially failed to connect, then became reachable during verification. A read-only check confirmed the SM-2 fields are absent. No Neon schema or data was changed; the default HTTP integration test uses a mocked Prisma client until the migration is applied. SQL was generated offline with the installed Prisma 5 CLI, and the client was regenerated.

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

If the HNSW index does not exist, leave its migration pending so deploy creates it. For an **empty database**, skip both `resolve` commands: deploy creates the baseline tables, HNSW index and SM-2 fields in order.

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
