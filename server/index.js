/**
 * Dozo Genshin API · Neon PostgreSQL
 * ใช้ได้ทั้ง local (npm run dev) และ Vercel Serverless
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

function requireDb(_req, res, next) {
  if (!sql) {
    return res.status(503).json({
      error: "Database not configured",
      hint: "Set DATABASE_URL in Vercel Environment Variables"
    });
  }
  next();
}

app.get("/", (_req, res) => {
  res.json({
    name: "Dozo Genshin API",
    ok: true,
    db: Boolean(sql),
    endpoints: [
      "GET /api/health",
      "GET /api/orders",
      "POST /api/orders",
      "PATCH /api/orders/:id/status",
      "GET /api/team",
      "POST /api/users/ensure"
    ]
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: Boolean(sql),
    time: new Date().toISOString()
  });
});

// ---------- Orders ----------
app.get("/api/orders", requireDb, async (_req, res) => {
  try {
    const rows = await sql`
      SELECT id, order_code, service, status, summary, detail,
             customer_email, customer_uid, game_user, total_price,
             created_at, updated_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 500
    `;
    res.json({ orders: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", requireDb, async (req, res) => {
  try {
    const body = req.body || {};
    const orderCode = body.order_code || ("ORD-" + Date.now().toString(36).toUpperCase());
    const service = body.service;
    if (!service) return res.status(400).json({ error: "service is required" });

    const rows = await sql`
      INSERT INTO orders (
        order_code, service, status, summary, detail,
        customer_email, customer_uid, game_user, total_price
      ) VALUES (
        ${orderCode},
        ${service},
        ${body.status || "pending"},
        ${body.summary || null},
        ${JSON.stringify(body.detail || body)}::jsonb,
        ${body.customer_email || body.customerEmail || null},
        ${body.customer_uid || body.uid || null},
        ${body.game_user || body.user || null},
        ${body.total_price ?? body.totalPrice ?? null}
      )
      RETURNING *
    `;
    res.status(201).json({ order: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/orders/:id/status", requireDb, async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ["pending", "doing", "done", "cancel"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    const rows = await sql`
      UPDATE orders SET status = ${status}
      WHERE id::text = ${req.params.id} OR order_code = ${req.params.id}
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: "order not found" });
    res.json({ order: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Team ----------
app.get("/api/team", requireDb, async (_req, res) => {
  try {
    const rows = await sql`
      SELECT id, name, role, meta, active, sort_order
      FROM team_members
      WHERE active = TRUE
      ORDER BY sort_order ASC, name ASC
    `;
    res.json({ team: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Users ----------
app.get("/api/users/by-email/:email", requireDb, async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, email, display_name, role, created_at
      FROM users WHERE email = ${req.params.email.toLowerCase()}
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users/ensure", requireDb, async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });
    const displayName = req.body?.display_name || email.split("@")[0];
    const role = req.body?.role === "admin" ? "admin" : "customer";

    const rows = await sql`
      INSERT INTO users (email, display_name, role)
      VALUES (${email}, ${displayName}, ${role})
      ON CONFLICT (email) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, users.display_name),
        updated_at = NOW()
      RETURNING id, email, display_name, role, created_at
    `;
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// local only — บน Vercel ใช้ serverless entry
const isVercel = Boolean(process.env.VERCEL);
if (!isVercel) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Dozo API http://localhost:${PORT}`);
    console.log(`DB: ${sql ? "configured" : "NOT configured"}`);
  });
}

export default app;
