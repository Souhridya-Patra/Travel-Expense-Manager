import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { pool, initDb } from './db.js';
import { authMiddleware, signToken } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 8002);
const googleClientId = process.env.GOOGLE_CLIENT_ID || '428178433259-totcan3sf49k76b5kt42q8so76imbtfu.apps.googleusercontent.com';
const googleClient = new OAuth2Client(googleClientId);
const otpExpiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const mailFrom = process.env.MAIL_FROM || 'no-reply@travel-expense-manager.local';
const mailHost = process.env.MAIL_HOST;
const mailPort = Number(process.env.MAIL_PORT || 587);
const mailUser = process.env.MAIL_USER;
const mailPass = process.env.MAIL_PASS;
const mailSecure = process.env.MAIL_SECURE === 'true';

const otpTransport = mailHost
  ? nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailSecure,
      auth: mailUser && mailPass ? { user: mailUser, pass: mailPass } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const allowedOrigins = (process.env.CORS_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

const generateOtpCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const getOtpExpiryAt = () => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + otpExpiryMinutes);
  return expiry;
};

const sendOtpEmail = async (email, otp) => {
  const info = await otpTransport.sendMail({
    from: mailFrom,
    to: email,
    subject: 'Travel Expense Manager verification code',
    text: `Welcome to Travel Expense Manager! Your verification code is: ${otp}`,
  });

  if (!mailHost) {
    console.log('OTP email preview (jsonTransport):', info.message);
  }
};

const assertTripAccess = async (tripId, userId) => {
  const trip = await pool.query(
    `SELECT t.id
     FROM trips t
     LEFT JOIN trip_shares ts ON ts.trip_id = t.id
     WHERE t.id = $1 AND (t.user_id = $2 OR ts.user_id = $2)
     LIMIT 1`,
    [tripId, userId]
  );
  return trip.rowCount > 0;
};

const assertTripOwner = async (tripId, userId) => {
  const trip = await pool.query(`SELECT id FROM trips WHERE id = $1 AND user_id = $2`, [tripId, userId]);
  return trip.rowCount > 0;
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'app-service' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const otp = generateOtpCode();
  const otpExpiresAt = getOtpExpiryAt();

  try {
    await pool.query(
      `INSERT INTO users(name, email, password_hash, is_verified, otp_code, otp_expires_at)
       VALUES($1, $2, $3, FALSE, $4, $5)`,
      [name, normalizedEmail, passwordHash, otp, otpExpiresAt]
    );

    await sendOtpEmail(normalizedEmail, otp);
    return res.status(201).json({
      status: 'pending_otp',
      email: normalizedEmail,
      message: 'Verification code sent to your email.',
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    return res.status(500).json({ message: 'Failed to register user' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'email and otp are required' });
  }

  if (!/^\d{6}$/.test(String(otp).trim())) {
    return res.status(400).json({ message: 'OTP must be a 6-digit code' });
  }

  const normalizedEmail = email.toLowerCase();
  const userResult = await pool.query(
    `SELECT id, name, email, is_verified, otp_code, otp_expires_at
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  if (userResult.rowCount === 0) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const user = userResult.rows[0];
  if (user.is_verified) {
    const token = signToken({ sub: user.id, email: user.email });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  }

  if (!user.otp_code || !user.otp_expires_at) {
    return res.status(400).json({ message: 'Verification code missing. Please request a new code.' });
  }

  if (String(otp).trim() !== String(user.otp_code)) {
    return res.status(400).json({ message: 'Invalid verification code' });
  }

  if (new Date() > new Date(user.otp_expires_at)) {
    return res.status(400).json({ message: 'Verification code expired. Please request a new code.' });
  }

  await pool.query(
    `UPDATE users
     SET is_verified = TRUE,
         otp_code = NULL,
         otp_expires_at = NULL
     WHERE id = $1`,
    [user.id]
  );

  const token = signToken({ sub: user.id, email: user.email });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'email is required' });
  }

  const normalizedEmail = email.toLowerCase();
  const userResult = await pool.query(
    `SELECT id, is_verified FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  if (userResult.rowCount === 0) {
    return res.status(404).json({ message: 'Account not found' });
  }

  if (userResult.rows[0].is_verified) {
    return res.status(400).json({ message: 'This account is already verified. Please log in.' });
  }

  const otp = generateOtpCode();
  const otpExpiresAt = getOtpExpiryAt();

  await pool.query(
    `UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3`,
    [otp, otpExpiresAt, userResult.rows[0].id]
  );

  await sendOtpEmail(normalizedEmail, otp);

  return res.json({
    status: 'pending_otp',
    email: normalizedEmail,
    message: 'A new verification code was sent to your email.',
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const result = await pool.query(`SELECT id, name, email, password_hash, is_verified FROM users WHERE email = $1`, [
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

  if (!user.is_verified) {
    return res.status(403).json({
      status: 'pending_otp',
      email: user.email,
      message: 'Email not verified. Please enter your verification code or resend one.',
    });
  }

  const token = signToken({ sub: user.id, email: user.email });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'idToken is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const name = payload?.name || payload?.given_name || 'Google User';

    if (!email) {
      return res.status(400).json({ message: 'Google account email is missing' });
    }

    let userResult = await pool.query(
      `SELECT id, name, email, is_verified FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      userResult = await pool.query(
        `INSERT INTO users(name, email, password_hash, is_verified)
         VALUES($1, $2, $3, TRUE)
         RETURNING id, name, email, is_verified`,
        [name, email, passwordHash]
      );
    } else if (!userResult.rows[0].is_verified) {
      await pool.query(
        `UPDATE users
         SET is_verified = TRUE,
             otp_code = NULL,
             otp_expires_at = NULL
         WHERE id = $1`,
        [userResult.rows[0].id]
      );
      userResult = await pool.query(
        `SELECT id, name, email, is_verified FROM users WHERE id = $1`,
        [userResult.rows[0].id]
      );
    }

    const user = userResult.rows[0];
    const token = signToken({ sub: user.id, email: user.email });
    return res.json({ token, user });
  } catch {
    return res.status(401).json({ message: 'Invalid Google token' });
  }
});

app.get('/api/trips', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT t.id, t.name, t.members, t.created_at, 'owner'::text AS access_type, u.name AS owner_name
       FROM trips t
       JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1

       UNION

       SELECT t.id, t.name, t.members, t.created_at, 'shared'::text AS access_type, u.name AS owner_name
       FROM trips t
       JOIN users u ON u.id = t.user_id
       JOIN trip_shares ts ON ts.trip_id = t.id
       WHERE ts.user_id = $1
     ) trip_list
     ORDER BY created_at DESC`,
    [req.user.sub]
  );
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

app.patch('/api/trips/:tripId', authMiddleware, async (req, res) => {
  const { tripId } = req.params;
  const { name, members } = req.body;

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Only the trip owner can update trip setup' });
  }

  const result = await pool.query(
    `UPDATE trips
     SET name = COALESCE($1, name),
         members = COALESCE($2::jsonb, members)
     WHERE id = $3 AND user_id = $4
     RETURNING id, name, members, created_at`,
    [
      name ?? null,
      members !== undefined ? JSON.stringify(members) : null,
      tripId,
      req.user.sub,
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  return res.json({ trip: result.rows[0] });
});

app.get('/api/trips/:tripId/share-candidates', authMiddleware, async (req, res) => {
  const { tripId } = req.params;

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Only the trip owner can manage sharing' });
  }

  const tripResult = await pool.query(`SELECT members FROM trips WHERE id = $1`, [tripId]);
  if (tripResult.rowCount === 0) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  const members = tripResult.rows[0].members && typeof tripResult.rows[0].members === 'object'
    ? tripResult.rows[0].members
    : {};

  const travelers = Array.isArray(members.travelers)
    ? members.travelers
      .map((traveler) => {
        if (!traveler || typeof traveler !== 'object') {
          return null;
        }
        const name = String(traveler.name || '').trim();
        const email = String(traveler.email || '').trim().toLowerCase();
        if (!name || !email) {
          return null;
        }
        return { name, email };
      })
      .filter(Boolean)
    : [];

  const travelerEmails = [...new Set(travelers.map((traveler) => traveler.email))];
  const userRows = travelerEmails.length > 0
    ? await pool.query(
      `SELECT id, name, email, is_verified FROM users WHERE email = ANY($1::text[])`,
      [travelerEmails]
    )
    : { rows: [] };

  const accountByEmail = new Map(userRows.rows.map((row) => [String(row.email).toLowerCase(), row]));

  const selectedRows = await pool.query(
    `SELECT u.email
     FROM trip_shares ts
     JOIN users u ON u.id = ts.user_id
     WHERE ts.trip_id = $1`,
    [tripId]
  );
  const selectedSet = new Set(selectedRows.rows.map((row) => String(row.email).toLowerCase()));

  const candidates = travelers.map((traveler) => {
    const account = accountByEmail.get(traveler.email);
    return {
      name: traveler.name,
      email: traveler.email,
      hasAccount: Boolean(account && account.is_verified),
      selected: selectedSet.has(traveler.email),
    };
  });

  return res.json({ candidates });
});

app.put('/api/trips/:tripId/shares', authMiddleware, async (req, res) => {
  const { tripId } = req.params;
  const { emails } = req.body;

  if (!Array.isArray(emails)) {
    return res.status(400).json({ message: 'emails must be an array' });
  }

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Only the trip owner can update sharing' });
  }

  const ownerResult = await pool.query(`SELECT user_id FROM trips WHERE id = $1`, [tripId]);
  if (ownerResult.rowCount === 0) {
    return res.status(404).json({ message: 'Trip not found' });
  }
  const ownerUserId = ownerResult.rows[0].user_id;

  const normalizedEmails = [...new Set(
    emails
      .map((email) => String(email || '').trim().toLowerCase())
      .filter((email) => email.length > 0)
  )];

  const usersResult = normalizedEmails.length > 0
    ? await pool.query(
      `SELECT id, email, is_verified
       FROM users
       WHERE email = ANY($1::text[])`,
      [normalizedEmails]
    )
    : { rows: [] };

  const verifiedUserIds = usersResult.rows
    .filter((user) => Boolean(user.is_verified))
    .map((user) => user.id)
    .filter((userId) => userId !== ownerUserId);

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM trip_shares WHERE trip_id = $1`, [tripId]);

    for (const userId of verifiedUserIds) {
      await pool.query(
        `INSERT INTO trip_shares(trip_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
        [tripId, userId]
      );
    }

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    return res.status(500).json({ message: 'Failed to update shared users' });
  }

  return res.json({
    sharedCount: verifiedUserIds.length,
    sharedEmails: usersResult.rows.filter((row) => Boolean(row.is_verified)).map((row) => row.email),
  });
});

app.get('/api/trips/:tripId/expenses', authMiddleware, async (req, res) => {
  const { tripId } = req.params;

  const hasAccess = await assertTripAccess(tripId, req.user.sub);
  if (!hasAccess) {
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

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Shared users can view this trip but cannot add expenses' });
  }

  const inserted = await pool.query(
    `INSERT INTO expenses(trip_id, description, amount, paid_by, type, food_orders)
     VALUES($1, $2, $3, $4, $5, $6)
     RETURNING id, description, amount, paid_by, type, food_orders, created_at`,
    [tripId, description, amount, paidBy, type, foodOrders ? JSON.stringify(foodOrders) : null]
  );

  res.status(201).json({ expense: inserted.rows[0] });
});

app.get('/api/trips/:tripId/receipts', authMiddleware, async (req, res) => {
  const { tripId } = req.params;
  const hasAccess = await assertTripAccess(tripId, req.user.sub);
  if (!hasAccess) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  const result = await pool.query(
    `SELECT id, trip_id, image_url, ocr_status, ocr_text, ocr_confidence, parser_confidence, model_version, parsed_items, created_at
     FROM receipts WHERE trip_id = $1 ORDER BY created_at DESC`,
    [tripId]
  );

  return res.json({ receipts: result.rows });
});

app.post('/api/trips/:tripId/receipts', authMiddleware, async (req, res) => {
  const { tripId } = req.params;
  const {
    imageUrl = null,
    ocrStatus = 'pending',
    ocrText = null,
    ocrConfidence = null,
    parserConfidence = null,
    modelVersion = null,
    parsedItems = []
  } = req.body;

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Shared users can view this trip but cannot add receipts' });
  }

  if (!Array.isArray(parsedItems)) {
    return res.status(400).json({ message: 'parsedItems must be an array' });
  }

  const inserted = await pool.query(
    `INSERT INTO receipts(trip_id, image_url, ocr_status, ocr_text, ocr_confidence, parser_confidence, model_version, parsed_items)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, trip_id, image_url, ocr_status, ocr_text, ocr_confidence, parser_confidence, model_version, parsed_items, created_at`,
    [
      tripId,
      imageUrl,
      ocrStatus,
      ocrText,
      ocrConfidence,
      parserConfidence,
      modelVersion,
      JSON.stringify(parsedItems)
    ]
  );

  return res.status(201).json({ receipt: inserted.rows[0] });
});

app.patch('/api/trips/:tripId/receipts/:receiptId', authMiddleware, async (req, res) => {
  const { tripId, receiptId } = req.params;
  const {
    imageUrl,
    ocrStatus,
    ocrText,
    ocrConfidence,
    parserConfidence,
    modelVersion,
    parsedItems
  } = req.body;

  const isOwner = await assertTripOwner(tripId, req.user.sub);
  if (!isOwner) {
    return res.status(403).json({ message: 'Shared users can view this trip but cannot edit receipts' });
  }

  if (parsedItems !== undefined && !Array.isArray(parsedItems)) {
    return res.status(400).json({ message: 'parsedItems must be an array when provided' });
  }

  const updated = await pool.query(
    `UPDATE receipts
     SET image_url = COALESCE($1, image_url),
         ocr_status = COALESCE($2, ocr_status),
         ocr_text = COALESCE($3, ocr_text),
         ocr_confidence = COALESCE($4, ocr_confidence),
         parser_confidence = COALESCE($5, parser_confidence),
         model_version = COALESCE($6, model_version),
         parsed_items = COALESCE($7::jsonb, parsed_items)
     WHERE id = $8 AND trip_id = $9
     RETURNING id, trip_id, image_url, ocr_status, ocr_text, ocr_confidence, parser_confidence, model_version, parsed_items, created_at`,
    [
      imageUrl ?? null,
      ocrStatus ?? null,
      ocrText ?? null,
      ocrConfidence ?? null,
      parserConfidence ?? null,
      modelVersion ?? null,
      parsedItems !== undefined ? JSON.stringify(parsedItems) : null,
      receiptId,
      tripId
    ]
  );

  if (updated.rowCount === 0) {
    return res.status(404).json({ message: 'Receipt not found' });
  }

  return res.json({ receipt: updated.rows[0] });
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
