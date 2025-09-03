# ypclub-backend-assessment-your-name

This repository contains my solution to the **2‑hour backend assessment**. I used **Node.js (Express)** with a small **in‑memory database** and **JWT** for auth. I kept dependencies minimal (only `express` from the skeleton and `jsonwebtoken` for standard JWT). Screenshots are replaced with reproducible **curl logs** below.

---

## Part 1 — Scenario‑Based Design (RESTful APIs for a Real‑Time Auction)

**Endpoints (sketch / OpenAPI‑ish):**

- `POST /auth/login` — Authenticates a user with username and password and returns a JWT web token.
    (Body: `{ username, password }` → `200 { token }`, `400` invalid input).

- `GET /auctions` — get list of auctions. api has optional query parameters like pagination and status base filtration. (supports `?status=active`, pagination): `200 [{...}]`.

- `GET /auctions/{id}` — Get auction by id: `200 {...}`, `404` not found.

- `POST /auctions/{id}/bid` — Place a bid on a specific auction.
    Body `{ amount:number }` → `201` Bid successfully placed.;
                                `400` Input is missing or invalid; 
                                `401` Token is missing or invalid; 
                                `403` Auction owner cannot bid on their own auction; 
                                `404` Auction with the given ID does not exist; 
                                `409` Bid amount is lower than the current highest bid.

- `GET /auctions/{id}/bids` — Stream or page bid history.

- `WS /ws` — WebSocket endpoint for real-time bid updates. Clients join rooms by auction ID to receive live updates

- **Gateway (Kong)**: All API routes are fronted by Kong, with the following plugins configured:
    -   **JWT** Validates tokens for protected endpoints.
    -   **Rate Limiting** Controls request rates, e.g.:30 requests per minute per consumer. 5 bids per 10 seconds per auction per IP.
    -   **Request Validation** Validates request size, body, and schema.
    -   **CORS** Cross-Origin Resource Sharing is properly configured.
    
- **Responses** All API errors follow a consistent format : `{ error: string, details?: object, requestId }` and Each error is returned with an appropriate HTTP status code..

- `Security`: Only logged-in users can bid. Bids are verified server-side with locks/transactions, ensuring the auction is active, the bid is higher, and the user isn’t the owner. Kong adds WAF, rate limiting, and request validation. Tokens expire quickly and rotate often.

- `Scalability`: The API is stateless and horizontally scalable behind Kong. Redis or DB locks serialize bids per auction, while WebSockets with Redis/NATS handle real-time updates. Caching and read replicas manage heavy reads; the database uses optimistic concurrency to prevent race issues.

- `Consistency`: Server time decides bid order. Idempotency keys handle retries safely. Bids send instant ACKs, broadcast via WebSockets, and sync periodically. Short grace periods ensure fairness at auction close.

- `Rate Limiting`: Kong limits requests per route and consumer using Redis and can throttle bids per auction.

- `Risks`: Hot auctions may cause lock contention; solved with short critical sections and background workers. WebSocket spikes handled via per-auction rooms. Token leaks, replay attacks, and misconfigurations are mitigated with rotation, idempotency, and testing.


---

## Part 2 — Implementation (Express + In‑Memory DB)

What I built:

* `POST /auth/login` — Dummy authentication that returns a JWT token.
* `POST /auctions/:id/bid` — Validates input, checks authentication and business rules, and updates bids atomically using an auction-specific lock to simulate DB transactions.
* `GET /auctions/:id` — Retrieves auction details by ID.


`How this fixes the connectivity issue`: Real databases handle transactions and locking, but the earlier in-memory approach risked losing updates with concurrent requests. I added a lightweight mutex per auction (`AsyncLock`) to ensure updates happen inside a critical section, preventing overlapping writes. This mimics real systems like `SELECT … FOR UPDATE` or Redis locks. Inputs are validated early to reduce the time locks are held.

`Trade-offs`:
* Memory isn’t shared across instances; in production, we’d use DB transactions or distributed locks like Redis.
* JWT secrets come from environment variables, with defaults only for local development.
* There’s no data persistence, so data is lost on restart, which is acceptable for this assessment.


### Local testing (curl)

Start the server:

```bash
npm install
npm start
```

Authenticate:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"charlie","password":"x"}' | jq -r .token)
echo "$TOKEN"
```

Check an auction:

```bash
curl -s http://localhost:3000/auctions/1 | jq
```

Place a bid:

```bash
curl -s -X POST http://localhost:3000/auctions/1/bid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 120}' | jq
```

Competing lower bid (conflict):

```bash
curl -s -X POST http://localhost:3000/auctions/1/bid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 110}'
# -> 409
```

---

## Part 3 — Debugging & Hardening the Notification Endpoint

Original issues:
* No SSL validity check, causing security alerts and failures.
* Missing error handling; auctions could be null and cause crashes.
* Inefficient queries replaced with a Map-based index for faster lookups.
* No concurrency control, leading to race conditions between status updates and bids.
* Always returned 200 even on failure.

Fixes implemented:
* Added simulated SSL validation using `sslConfig` for testing.
* Used O(1) auction lookups with a Map index.
* Added proper error handling and correct HTTP status codes.
* Wrapped state updates in `withAuctionLock` to avoid race conditions.
* Added structured console logs for better monitoring.

SSL management in production:
* Use Let’s Encrypt with certbot or ACME clients for automatic renewal.
* Store certificates securely with AWS ACM, GCP Certificate Manager, or Vault.
* Set up expiry alerts, synthetic checks, HSTS, and enforce TLS 1.2+.
* Rotate keys regularly and restrict access to private keys.

---

## Repo Structure

```
.
├── server.js
├── db.js
├── auth.js
├── routes
│   └── auctions.js
├── package.json
└── README.md
```

---

## Notes

-   Environment: `JWT_SECRET` can be set; defaults to `dev-secret-change-me` for local use only.
-   Future work: Redis-backed locks; persistence; idempotency keys; WS broadcasting; OpenAPI spec file.
