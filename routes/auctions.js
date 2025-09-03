// routes/auctions.js
// Part 2: Implementation of auction endpoints with basic validation and concurrency control.

const express = require('express');
const router = express.Router();

const { db } = require('../db');
const { authMiddleware } = require('../auth');

// GET /auctions/:id -> current auction details
router.get('/:id', async (req, res) => {
  const auction = db.findAuctionById(req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  return res.status(200).json(sanitizeAuction(auction));
});

// POST /auctions/:id/bid -> place a bid (requires auth)
router.post('/:id/bid', authMiddleware, async (req, res) => {
  const { amount } = req.body || {};
  const bidderId = req.user?.sub; // from JWT "sub"

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const id = String(req.params.id);

  // Use lock to prevent concurrent overwrites (simulates DB transaction)
  await db.withAuctionLock(id, async (auction) => {
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    if (auction.status !== 'active') {
      return res.status(409).json({ error: 'Auction is not active' });
    }
    if (auction.ownerId === bidderId) {
      return res.status(403).json({ error: 'Owners cannot bid on their own auction' });
    }
    if (amount <= auction.currentBid) {
      return res.status(409).json({ error: 'Bid must be higher than current bid' });
    }

    // Apply update atomically under lock
    auction.currentBid = amount;
    auction.currentBidderId = bidderId;
    auction.bids.push({
      amount,
      bidderId,
      ts: Date.now()
    });

    // Respond success
    res.status(201).json({
      message: 'Bid accepted',
      auction: sanitizeAuction(auction)
    });
  }).catch((err) => {
    console.error('[bid] lock error', err);
    // If we somehow got here, ensure a response
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
  });
});

function sanitizeAuction(a) {
  // In real systems, filter fields as needed
  return {
    id: a.id,
    title: a.title,
    ownerId: a.ownerId,
    status: a.status,
    currentBid: a.currentBid,
    currentBidderId: a.currentBidderId,
    bids: a.bids
  };
}

module.exports = router;
