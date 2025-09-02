// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// --- CORS pour l'appli (dev) ---
app.use(cors({ origin: "*"}));
app.use(express.json());

// --- ENV ---
const PORT = process.env.PORT || 4242;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ""; // (on ne s'en sert pas pour l'allowlist)
const ADMIN_EMAILS_RAW = (process.env.ADMIN_EMAILS || "").trim();

// Parse de l'allowlist admin (insensible à la casse, espaces ignorés)
const adminEmails = ADMIN_EMAILS_RAW
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

console.log(`🚀 avisboost-backend prêt sur http://localhost:${PORT}`);
console.log(`   Allowlist admin: ${adminEmails.length ? adminEmails.join(", ") : "(vide)"}`);

// Petit helper de log
const logReq = (req, info = "") => {
  const when = new Date().toISOString();
  console.log(`[${when}] ${req.method} ${req.originalUrl} ${info}`);
};

// --- Healthcheck ---
app.get("/health", (req, res) => {
  logReq(req, "health");
  res.json({ ok: true, uptime: process.uptime() });
});

// --- Endpoint principal appelé par l'app ---
app.get("/v1/verify", async (req, res) => {
  const emailRaw = (req.query.email || "").toString();
  const email = emailRaw.trim().toLowerCase();
  logReq(req, `verify email="${emailRaw}" -> normalized="${email}"`);

  if (!email) {
    return res.status(400).json({ paid: false, reason: "missing-email" });
  }

  // 1) Chemin admin: si l'email est dans l'allowlist -> accès immédiat
  if (adminEmails.includes(email)) {
    return res.json({ paid: true, reason: "admin-allowlist", email });
  }

  // 2) (à brancher plus tard) Vérif Stripe "vraie" si tu veux, sinon refuse par défaut
  //    Ici on renvoie "pas payé" pour être strict pendant tes tests.
  return res.json({ paid: false, reason: "no-active-subscription", email });
});

// --- Endpoint debug pour comprendre ce que voit le serveur ---
app.get("/v1/debug/verify", (req, res) => {
  const emailRaw = (req.query.email || "").toString();
  const email = emailRaw.trim().toLowerCase();
  logReq(req, `debug/verify email="${emailRaw}"`);
  res.json({
    emailRaw,
    normalized: email,
    inAdminAllowlist: adminEmails.includes(email),
    adminEmails
  });
});

// 404 propre
app.use((req, res) => {
  logReq(req, "404");
  res.status(404).json({ error: "not_found", path: req.originalUrl });
});

// Start
app.listen(PORT, () => {});
