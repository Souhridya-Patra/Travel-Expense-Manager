import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';
import { authMiddleware, signToken } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 8002);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'app-service' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users(name, email, password_hash) VALUES($1, $2, $3) RETURNING id, name, email`,
      [name, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken({ sub: user.id, email: user.email });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    return res.status(500).json({ message: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const result = await pool.query(`SELECT id, name, email, password_hash FROM users WHERE email = $1`, [
    email.toLowerCase()
  ]);

  if (result.rowCount === 0) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = signToken({ sub: user.id, email: user.email });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/trips', authMiddleware, async (req, res) => {
  const result = await pool.query(`SELECT id, name, members, created_at FROM trips WHERE user_id = $1 ORDER BY created_at DESC`, [
    req.user.sub
  ]);
  res.json({ trips: result.rows });
});

app.post('/api/trips', authMiddleware, async (req, res) => {
  const { name, members = [] } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Trip name is required' });
  }

  const result = await pool.query(
    `INSERT INTO trips(user_id, name, members) VALUES($1, $2, $3) RETURNING id, name, members, created_at`,
    [req.user.sub, name, JSON.stringify(members)]
  );
  res.status(201).json({ trip: result.rows[0] });
});

app.get('/api/trips/:tripId/expenses', authMiddleware, async (req, res) => {
  const { tripId } = req.params;

  const trip = await pool.query(`SELECT id FROM trips WHERE id = $1 AND user_id = $2`, [tripId, req.user.sub]);
  if (trip.rowCount === 0) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  const expenses = await pool.query(
    `SELECT id, description, amount, paid_by, type, food_orders, created_at
     FROM expenses WHERE trip_id = $1 ORDER BY created_at DESC`,
    [tripId]
  );

  return res.json({ expenses: expenses.rows });
});

app.post('/api/trips/:tripId/expenses', authMiddleware, async (req, res) => {
  const { tripId } = req.params;
  const { description, amount, paidBy, type = 'regular', foodOrders = null } = req.body;

  if (!description || !amount || !paidBy) {
    return res.status(400).json({ message: 'description, amount and paidBy are required' });
  }

  const trip = await pool.query(`SELECT id FROM trips WHERE id = $1 AND user_id = $2`, [tripId, req.user.sub]);
  if (trip.rowCount === 0) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  const inserted = await pool.query(
    `INSERT INTO expenses(trip_id, description, amount, paid_by, type, food_orders)
     VALUES($1, $2, $3, $4, $5, $6)
     RETURNING id, description, amount, paid_by, type, food_orders, created_at`,
    [tripId, description, amount, paidBy, type, foodOrders ? JSON.stringify(foodOrders) : null]
  );

  res.status(201).json({ expense: inserted.rows[0] });
});

app.post('/api/ml-feedback', authMiddleware, async (req, res) => {
  const { receiptId = null, originalParse, correctedParse } = req.body;
  if (!originalParse || !correctedParse) {
    return res.status(400).json({ message: 'originalParse and correctedParse are required' });
  }

  const result = await pool.query(
    `INSERT INTO ml_feedback(receipt_id, user_id, original_parse, corrected_parse)
     VALUES($1, $2, $3, $4)
     RETURNING id, created_at`,
    [receiptId, req.user.sub, JSON.stringify(originalParse), JSON.stringify(correctedParse)]
  );

  return res.status(201).json({ feedback: result.rows[0] });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`App service listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
