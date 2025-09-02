'use strict';

/**
 * AvisBoost API — Stripe subscription check
 *
 * Routes:
 *   GET /health
 *   GET /v1/verify?email=...
 *
 * ENV requis:
 *   - STRIPE_SECRET_KEY = sk_test_... (ou sk_live_...)
 *   - NODE_ENV = production
 *   - CORS_ORIGINS = https://api-avisboost.visibizz.com,https://www.visibizz.com  (ou '*' pour tout autoriser)
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ----- CORS (restreint via CORS_ORIGINS) -----
const rawOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowAll = rawOrigins.includes('*');
const corsOptions = {
  origin: (origin, cb) => {
    // Autorise les apps natives (origin null) + domaines autorisés
    if (!origin || allowAll || rawOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
};
app.use(cors(corsOptions));

// ----- Anti-spam simple -----
app.use(rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60,          // 60 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
}));

// ----- Stripe -----
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// Statuts considérés comme "accès autorisé"
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
// Si tu veux tolérer un retard de paiement, décommente :
// const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

async function hasActiveSubscriptionForEmail(email) {
  if (!stripe) return false;

  // 1) Trouver les customers liés à cet email
  const customers = await stripe.customers.list({ email, limit: 100 });
  if (!customers.data.length) return false;

  // 2) Vérifier leurs subscriptions
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: c.id,
      status: 'all',
      limit: 100,
    });
    if (subs.data.some(s => ACTIVE_STATUSES.has(s.status))) {
      return true;
    }
  }
  return false;
}

// ----- Routes -----
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'dev',
    stripe: !!stripe,
    cors: allowAll ? '*' : rawOrigins,
    time: new Date().toISOString(),
  });
});

app.get('/v1/verify', async (req, res) => {
  try {
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ ok: false, reason: 'missing_email' });
    }
    if (!stripe) {
      return res.status(500).json({ ok: false, reason: 'stripe_not_configured' });
    }

    const paid = await hasActiveSubscriptionForEmail(email);
    if (paid) {
      return res.json({ paid: true, email, source: 'stripe' });
    }
    return res.json({ paid: false, reason: 'no-active-subscription', email });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// 404 propre
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

// ----- Start -----
const port = process.env.PORT || 4242;
app.listen(port, '0.0.0.0', () => {
  console.log(`API running on :${port}`);
});
