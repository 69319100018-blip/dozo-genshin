-- Dozo Genshin · Neon PostgreSQL schema
-- รันไฟล์นี้ใน Neon SQL Editor ครั้งแรก

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ผู้ใช้ (ลูกค้า / แอดมิน)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                    -- ใช้ตอน auth เอง (ถ้ายังใช้ Firebase อาจว่างได้)
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ลูกทีมร้าน
CREATE TABLE IF NOT EXISTS team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  meta       TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- คำสั่งซื้อบริการ
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code      TEXT NOT NULL UNIQUE,          -- เช่น ORD-XXXX
  service         TEXT NOT NULL CHECK (service IN ('farm-gem', 'material', 'abyss', 'explore')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'doing', 'done', 'cancel')),
  summary         TEXT,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- เก็บฟิลด์ฟอร์มทั้งหมด
  customer_email  TEXT,
  customer_uid    TEXT,                          -- UID ในเกม
  game_user       TEXT,
  total_price     INT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders (service);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- อัปเดต updated_at อัตโนมัติ
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ข้อมูลลูกทีมเริ่มต้น
INSERT INTO team_members (name, role, meta, sort_order) VALUES
  ('Dozo', 'เจ้าของร้าน', 'จัดการออเดอร์ทั้งหมด', 1),
  ('Aoi',  'ทีมฟาร์มเจม', 'รับงาน Primogem / Mora', 2),
  ('Rin',  'ทีมวัสดุ', 'หาวัสดุเลื่อนขั้น', 3),
  ('Kai',  'ทีม Abyss', 'เคลียร์ Spiral Abyss', 4),
  ('Mika', 'ทีมสำรวจ', 'เปิดแผนที่ / เก็บของ', 5)
ON CONFLICT DO NOTHING;

-- แอดมินตัวอย่าง (รหัสผ่านต้อง hash ตอนสมัครจริง — ตรงนี้เป็น placeholder)
INSERT INTO users (email, display_name, role)
VALUES ('admin@dozo.com', 'Admin Dozo', 'admin')
ON CONFLICT (email) DO NOTHING;
