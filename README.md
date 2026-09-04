# AgentReady — AI Commerce Infrastructure

> **Razorpay AI Growth & Agentic Commerce Hackathon**

AgentReady is a full-stack AI commerce infrastructure layer demonstrating how AI agents can discover, filter, and purchase products — with deterministic constraint enforcement and Razorpay payment integration.

---

## Architecture

```
User Query (NL)
      ↓
  Intent Parser (GPT-4o-mini)
      ↓
  Product Search (Deterministic SQL)
      ↓
  Constraint Engine (Pure Code — Price, Inventory, Delivery, Attributes)
      ↓ [ONLY ELIGIBLE PRODUCTS PROCEED]
  AI Ranker (GPT-4o-mini, schema-validated)
      ↓
  User Approval (Explicit required)
      ↓
  Policy Engine (Server-side — Spending limits, Category controls)
      ↓
  Razorpay Order (Server-side, Amount from DB)
      ↓
  Razorpay Checkout (Client-side)
      ↓
  Signature Verification (HMAC-SHA256, timing-safe)
      ↓
  Webhook Handler (Idempotent, authoritative capture confirmation)
```

### Security Invariants

- **LLM never controls money** — amounts always calculated server-side from DB data
- **Fail closed** — missing product attributes = constraint fails (not passes)
- **Explicit approval required** — no purchase without user confirmation
- **Spending limit** — ₹5,000 max enforced in code (not LLM-configurable)
- **AI output schema-validated** — Zod validates intent and ranking before use
- **selectedProductId verified** — AI cannot select an ineligible product
- **Timing-safe signature comparison** — prevents timing attacks

---

## Demo Scenarios

| Query | Expected Result |
|-------|----------------|
| "Waterproof backpack under ₹4,000 by Friday in Bangalore" | ✅ Recommends UrbanTrail Pro 35L |
| "Waterproof backpack under ₹2,000 by tomorrow in Bangalore" | ❌ No eligible product — all fail price/delivery |
| "₹75,000 laptop" | ❌ Blocked by ₹5,000 purchase policy |

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Razorpay Test Mode account
- OpenAI API key (optional — demo fallback included)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Run database migrations
npm run db:migrate

# Seed demo data (3 merchants, 60+ products)
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `OPENAI_API_KEY` | Optional | GPT-4o-mini for intent parsing. Demo fallback if missing. |
| `RAZORPAY_KEY_ID` | Optional | Test mode key ID |
| `RAZORPAY_KEY_SECRET` | Optional | Test mode key secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional | Same as KEY_ID (exposed to client) |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | Set in Razorpay dashboard |
| `NEXT_PUBLIC_APP_URL` | Optional | App base URL for SSR API calls |

---

## API Reference

### Buyer Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/buyer/sessions` | Create session |
| `POST` | `/api/buyer/sessions/{id}/message` | Send message, run agent pipeline |
| `GET` | `/api/buyer/sessions/{id}/message` | Get session state + audit trail |

### Orders & Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/orders` | Create Razorpay order (server-side amount) |
| `POST` | `/api/payments/verify` | Verify payment signature |
| `POST` | `/api/webhooks/razorpay` | Webhook endpoint (idempotent) |

### Merchant

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/merchant/{id}` | Dashboard data + score |
| `GET/POST` | `/api/merchant/{id}/audit` | Get issues / Run AI audit |
| `POST` | `/api/merchant/{id}/simulate` | Run AI buyer simulation |
| `POST` | `/api/merchant/{id}/issues/{issueId}/apply` | Apply fix (requires confirmation) |

---

## Testing

```bash
# Run all tests
npm test

# Tests cover:
# - Constraint engine (price, waterproof, inventory, delivery)
# - Purchase policy (spending limits, approval requirements)
# - Razorpay signature verification (HMAC, timing-safe)
# - Webhook idempotency logic
# - Demo scenario correctness
```

---

## Stack

- **Framework**: Next.js 16, React 19, TypeScript
- **Database**: PostgreSQL + Prisma 7
- **AI**: OpenAI GPT-4o-mini
- **Payments**: Razorpay (Test Mode)
- **Validation**: Zod
- **Styling**: Tailwind CSS 4

---

## Design Decisions

### Why deterministic constraints before AI ranking?

AI ranking is only performed on products that have already passed all hard constraints in code. This means:
1. The LLM never sees ineligible products
2. Even if the LLM hallucinates, it cannot select a non-eligible product
3. `selectedProductId` is verified against the eligible list before use

### Why server-side order amount?

The browser sends only `{ sessionId, productId }`. The server:
1. Looks up the product price fresh from the database
2. Re-verifies inventory and delivery eligibility
3. Runs the purchase policy check
4. Creates the Razorpay order with the DB-authoritative amount

The browser never sends an amount.

### Why timing-safe signature comparison?

`Buffer.compare()` is not timing-safe and leaks information about how many bytes match. `crypto.timingSafeEqual()` takes constant time regardless of input, preventing timing-based signature forgery attacks.
