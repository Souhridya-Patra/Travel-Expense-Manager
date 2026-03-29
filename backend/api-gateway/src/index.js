import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const port = Number(process.env.PORT || 8000);
const appServiceUrl = process.env.APP_SERVICE_URL || 'http://localhost:8002';
const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';

const allowedOrigins = (process.env.CORS_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', async (_req, res) => {
  const [appHealth, mlHealth] = await Promise.allSettled([
    fetch(`${appServiceUrl}/health`).then((r) => r.json()),
    fetch(`${mlServiceUrl}/health`).then((r) => r.json())
  ]);

  const services = {
    appService: appHealth.status === 'fulfilled' ? appHealth.value : { status: 'down' },
    mlService: mlHealth.status === 'fulfilled' ? mlHealth.value : { status: 'down' }
  };

  const allUp = Object.values(services).every((s) => s.status === 'ok');
  res.status(allUp ? 200 : 503).json({ status: allUp ? 'ok' : 'degraded', services });
});

const appProxy = createProxyMiddleware({
  target: appServiceUrl,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
    res.status(503).json({ error: 'Service unavailable' });
  }
});

const mlProxy = createProxyMiddleware({
  target: mlServiceUrl,
  changeOrigin: true
});

app.use('/api/ml', mlProxy);
app.use('/api', appProxy);

app.listen(port, () => {
  console.log(`API gateway listening on http://localhost:${port}`);
});
