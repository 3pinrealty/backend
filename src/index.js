require('dotenv').config();

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const routes = require('./routes');
const propertyRoutes = require('./routes/propertyRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

// dotenv.config();
// dotenv.config({ path: __dirname + '/../.env' });

const app = express();
const PORT = process.env.PORT || 4000;

// Connect to MongoDB
connectDB();

// Global middleware
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Railway/Reverse proxies

app.use(helmet());

const parseAllowedOrigins = () => {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
app.use(
  cors({
    origin(origin, cb) {
      // allow non-browser / server-to-server requests
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true); // default allow-all unless configured
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Basic rate limiting (tune via env if needed)
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// API routes
app.use('/api', routes);
app.use('/api/property', propertyRoutes);
app.use('/api/properties', propertyRoutes);

// Health check at root as well
app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    mongoose
      .connection
      .close(false)
      .catch(() => {})
      .finally(() => {
        // eslint-disable-next-line no-console
        console.log('HTTP server closed');
        process.exit(0);
      });
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', err);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

