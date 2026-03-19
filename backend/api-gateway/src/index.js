import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const port = Number(process.env.PORT || 8000);
const appServiceUrl = process.env.APP_SERVICE_URL || 'http://localhost:8002';
const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
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

app.use(
  '/api/app',
  createProxyMiddleware({
    target: appServiceUrl,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`
  })
);

app.use(
  '/api/ml',
  createProxyMiddleware({
    target: mlServiceUrl,
    changeOrigin: true,
    pathRewrite: (path) => `/api/ml${path}`
  })
);

app.listen(port, () => {
  console.log(`API gateway listening on http://localhost:${port}`);
});
