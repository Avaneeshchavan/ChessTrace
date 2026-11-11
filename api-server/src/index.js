require('dotenv').config();
const express = require('express');
const cors = require('cors');

const createSearchRouter = require('./routes/searchRoutes');
const authRoutes = require('./routes/authRoutes');
const vaultRoutes = require('./routes/vaultRoutes');
const gameRoutes = require('./routes/gameRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// Database connection
const prisma = require('./db');

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(null, false);
  },
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/search', createSearchRouter());
app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

async function startServer() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production.');
  }
  const compact = process.env.USE_COMPACT_STORAGE === 'true';
  const tables = compact ? ['"Game"', 'compact_game', 'position_v2', 'position_game'] : ['"Game"', '"Position"'];
  const checks = await prisma.$queryRaw`
    SELECT name, to_regclass(name) IS NOT NULL AS present
    FROM unnest(${tables}::text[]) AS names(name)`;
  const missing = checks.filter(check => !check.present).map(check => check.name);
  if (missing.length) throw new Error(`Missing search tables: ${missing.join(', ')}`);

  const [stats] = compact
    ? await prisma.$queryRaw`SELECT (SELECT count(*)::text FROM compact_game) AS games,
        count(*)::text AS positions, count(vector)::text AS vectors FROM position_v2`
    : await prisma.$queryRaw`SELECT (SELECT count(*)::text FROM "Game") AS games,
        (SELECT reltuples::bigint::text FROM pg_class WHERE oid = '"Position"'::regclass) AS "estimatedPositions"`;
  console.log('Search corpus', { mode: compact ? 'compact' : 'legacy', ...stats });
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

startServer().catch(async error => {
  console.error('API startup failed:', error.code || error.message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
