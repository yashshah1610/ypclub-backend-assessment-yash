// server.js
// Entry point for the assessment app.
// Minimal dependencies (Express provided by skeleton; jsonwebtoken justified for JWT).

const express = require('express');
const jwt = require('jsonwebtoken');

const { db } = require('./db');
const { authMiddleware, generateToken } = require('./auth');
const auctionRoutes = require('./routes/auctions');

const app = express();
app.use(express.json());

// Simple health endpoint
app.get('/health', (req, res) => res.status(200).json({ ok: true, time: new Date().toISOString() }));

// ---- Part 2: Auth ----
app.post('/auth/login', (req, res) => {
  // Dummy authentication: accept any username/password that are non-empty.
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  // In a real system, validate against a user DB + hashed password.
  const token = generateToken({ sub: username });
  return res.status(200).json({ token });
});

// ---- Part 2: Auction routes ----
app.use('/auctions', auctionRoutes);

// ---- Part 3: Notify route (debugged & hardened) ----
/**
 * Simulated SSL certificate store/config.
 * In production: do not do this in app memory; use the OS trust store / cert manager (e.g., Let's Encrypt via certbot)
 * Here we simulate a validity timestamp and an enable flag.
 */
const sslConfig = {
  certValidUntil: Date.now() + 1000 * 60 * 60 * 24, // valid for next 24h
  enabled: true
};

// Hardened notify endpoint
app.post('/auctions/:id/notify', authMiddleware, async (req, res) => {
  try {
    // 1) Simulated SSL validation
    if (!sslConfig.enabled || Date.now() > sslConfig.certValidUntil) {
      return res.status(503).json({ error: 'SSL certificate invalid or expired (simulated)' });
    }

    const id = req.params.id;

    // 2) Optimized lookup using an index (Map) rather than linear scan
    const auction = db.findAuctionById(id);
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    // 3) Update state safely under lock to avoid race conditions with bids
    await db.withAuctionLock(id, async (a) => {
      a.status = 'notified';
      // Simulated notification send; in production this would enqueue or publish an event
      console.log(`[notify] Notified bidders for auction "${a.title}" (id=${a.id}) at ${new Date().toISOString()}`);
    });

    return res.status(200).json({ message: 'Notification sent', id });
  } catch (err) {
    console.error('[notify] error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
