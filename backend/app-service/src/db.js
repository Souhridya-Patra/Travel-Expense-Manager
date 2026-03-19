import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/travel_expense_manager';
export const pool = new Pool({ connectionString });

export const initDb = async () => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      members JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      paid_by TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('regular', 'food')),
      food_orders JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
      image_url TEXT,
      ocr_status TEXT NOT NULL DEFAULT 'pending',
      parsed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ocr_text TEXT;
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC(10,4);
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS parser_confidence NUMERIC(10,4);
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS model_version TEXT;

    CREATE TABLE IF NOT EXISTS ml_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      original_parse JSONB NOT NULL,
      corrected_parse JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
};
