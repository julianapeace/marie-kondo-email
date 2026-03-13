import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as dotenv from 'dotenv';
import createMemoryStore from 'memorystore';

// Load .env from project root first (so configs see it regardless of cwd)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
if (!process.env.GMAIL_CLIENT_ID && !process.env.PORT) {
  dotenv.config();
}

// Import database and services
import getDatabase from './config/database';
import { AuthService } from './services/auth.service';

// Import routes
import { createAuthRouter } from './routes/auth.routes';
import { createEmailsRouter } from './routes/emails.routes';
import { createTriageRouter } from './routes/triage.routes';
import { createUnsubscribeRouter } from './routes/unsubscribe.routes';
import { createStatsRouter } from './routes/stats.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database
    console.log('🗄️  Initializing database...');
    const db = await getDatabase();
    console.log('✅ Database initialized');

    // Initialize services
    const authService = new AuthService(db);

    // Create Express app
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Session configuration
    const MemoryStore = createMemoryStore(session);
    app.use(session({
      store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      }),
      secret: process.env.SESSION_SECRET || 'marie-kondo-email-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to false for local development
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        sameSite: 'lax'
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: {
        success: false,
        error: 'Too many requests, please try again later.'
      }
    });

    app.use('/api/', limiter);

    // Serve static files from client directory
    app.use(express.static(path.join(__dirname, '../client')));
    app.use('/js', express.static(path.join(__dirname, '../client/js')));
    app.use('/styles', express.static(path.join(__dirname, '../client/styles')));

    // API Routes
    app.use('/api/auth', createAuthRouter(authService, db));
    app.use('/api/emails', createEmailsRouter(db, authService));
    app.use('/api/triage', createTriageRouter(db, authService));
    app.use('/api/unsubscribe', createUnsubscribeRouter(db, authService));
    app.use('/api/stats', createStatsRouter(db));

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        message: 'Marie Kondo Email Triage API is running',
        timestamp: new Date().toISOString()
      });
    });

    // Serve index.html for all other routes (SPA)
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/index.html'));
    });

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start server
    app.listen(PORT, () => {
      console.log(`\n🧹 Marie Kondo Email Triage Server`);
      console.log(`================================`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log(`\nMake sure to:`);
      console.log(`1. Set up your .env file with Gmail OAuth credentials`);
      console.log(`2. Create OAuth credentials at https://console.cloud.google.com`);
      console.log(`3. Visit http://localhost:${PORT} to get started\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing database connection...');
      db.close();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, closing database connection...');
      db.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
