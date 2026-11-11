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
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
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

// Start server
async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully.');
  } catch (err) {
    console.error('Failed to connect to the database on startup (possibly a Neon cold start):', err);
    // Don't process.exit(1) so the app stays alive for health checks, 
    // but the clear error is logged.
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
