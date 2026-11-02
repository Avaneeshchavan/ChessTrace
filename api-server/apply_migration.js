const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_position_vector_hnsw
      ON "Position" USING hnsw (vector vector_l2_ops)
      WITH (m = 16, ef_construction = 64);
  `);
  console.log('Successfully created extension and vector index.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
