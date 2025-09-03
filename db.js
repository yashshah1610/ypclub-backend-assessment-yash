// db.js
// Extremely small in-memory "database" with a per-auction mutex to simulate concurrency control.

class AsyncLock {
  constructor() { this._p = Promise.resolve(); }
  async run(fn) {
    // Chain on the previous promise to ensure mutual exclusion.
    let resolveNext;
    const next = new Promise(res => (resolveNext = res));
    const prev = this._p;
    this._p = next;
    await prev;
    try {
      return await fn();
    } finally {
      resolveNext();
    }
  }
}

class InMemoryDB {
  constructor() {
    // Auctions index by ID for O(1) lookups (Part 3 optimization)
    this.auctions = new Map();
    // Individual locks per auction id
    this.locks = new Map();

    // Seed a couple of auctions
    this.insertAuction({
      id: '1',
      title: 'Vintage Guitar',
      ownerId: 'alice',
      status: 'active',
      currentBid: 100,
      currentBidderId: null,
      bids: []
    });
    this.insertAuction({
      id: '2',
      title: 'Rare Book',
      ownerId: 'bob',
      status: 'active',
      currentBid: 50,
      currentBidderId: null,
      bids: []
    });
  }

  insertAuction(auction) {
    this.auctions.set(String(auction.id), { ...auction });
    if (!this.locks.has(String(auction.id))) this.locks.set(String(auction.id), new AsyncLock());
  }

  findAuctionById(id) {
    return this.auctions.get(String(id)) || null;
  }

  async withAuctionLock(id, fn) {
    const lock = this.locks.get(String(id));
    if (!lock) {
      // create lock lazily if auction existed/was added dynamically
      const newLock = new AsyncLock();
      this.locks.set(String(id), newLock);
      return newLock.run(async () => fn(this.findAuctionById(id)));
    }
    return lock.run(async () => fn(this.findAuctionById(id)));
  }
}

const db = new InMemoryDB();

module.exports = { db };
