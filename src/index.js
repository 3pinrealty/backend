require('dotenv').config();

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const connectDB = require('./config/db');
const routes = require('./routes');
const propertyRoutes = require('./routes/propertyRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

// dotenv.config();
// dotenv.config({ path: __dirname + '/../.env' });

const app = express();
const PORT = 4000;

// Connect to MongoDB
connectDB();

// Global middleware
app.use(cors());
app.use(express.json());

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
    // eslint-disable-next-line no-console
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

