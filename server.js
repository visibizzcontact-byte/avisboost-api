'use strict';
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// CORS (ouvert au début, tu pourras restreindre plus tard)
app.use(cors({ origin: true, credentials: false }));

// Anti-spam simple
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

// ----- Stripe -----
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
// Choisis ta politique : active/trialing suffisent souvent
const ACTIVE_STATUSES = new Set(['active', 'trialing']); // ajoute 'past_due' si tu veux

async function hasActiveSubscriptionForEmail(email) {
  if (!stripe) return false;
  const customers = await stripe.customers.list({ email, limit: 100 });
  if (!customers.data.length) return false;
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 100 });
    if (subs.data.some(s => ACTIVE_STATUSES.has(s.status))) return true;
  }
  return false;
}

// ----- Routes -----
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'dev',
    stripe: !!stripe,
    time: new Date().toISOString(),
  });
});

app.get('/v1/verify', async (req, res) => {
  try {
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, reason: 'missing_email' });
    if (!stripe) return res.status(500).json({ ok: false, reason: 'stripe_not_configured' });

    const paid = await hasActiveSubscriptionForEmail(email);
    return paid
      ? res.json({ paid: true, email, source: 'stripe' })
      : res.json({ paid: false, reason: 'no-active-subscription', email });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// 404 propre
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

// Start
const port = process.env.PORT || 4242;
app.listen(port, '0.0.0.0', () => console.log(`API running on :${port}`));
