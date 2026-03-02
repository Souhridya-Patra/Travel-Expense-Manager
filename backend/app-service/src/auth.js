import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'change-me-in-prod';

export const signToken = (payload) => jwt.sign(payload, secret, { expiresIn: '7d' });

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Bearer token' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    req.user = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
