# Backend Services - Phase 1 & Phase 2

## Phase 1: Foundation (Complete ✓)

- API Gateway (Node.js) ✓
- App Service (Node.js + PostgreSQL) ✓
- ML Service Skeleton (Python + FastAPI) ✓
- Docker Compose (PostgreSQL) ✓

## Phase 2: ML Training Pipeline (In Progress 🚀)

TensorFlow + PyTorch dual-framework training with datasets support:

- OCR Model (TrOCR + PyTorch) - Fine-tune on receipt data
- Item Parser (BERT NER + TensorFlow) - Extract structured items
- Dataset Management (SROIE, CORD, RVL-CDIP, user-collected)
- Training Pipelines - Full loops with validation & checkpointing
- Model Registry - Unified loading & inference
- FastAPI ML Inference - Ready endpoints

See [ml-service/PHASE2_README.md](ml-service/PHASE2_README.md) for Phase 2 setup.

## Services

- `api-gateway` (Node.js + Express): single entry point for Web and Mobile apps.
- `app-service` (Node.js + Express + PostgreSQL): auth, trips, expenses, and ML feedback.
- `ml-service` (Python + FastAPI): ANI endpoint with TrOCR OCR and BERT item parser.

## Quick Start

### 1) Start PostgreSQL

```bash
cd backend
docker compose up -d
```

### 2) Start App Service

```bash
cd backend/app-service
copy .env.example .env
npm install
npm run dev
```

### 3) Start ML Service

```bash
cd backend/ml-service

# Install ML dependencies (Phase 2)
pip install -r requirements.txt

# Setup datasets and models
python setup_phase2.py

# Start service
copy .env.example .env
uvicorn app.main:app --reload --port 8001
```

### 4) Start API Gateway

```bash
cd backend/api-gateway
copy .env.example .env
npm install
npm run dev
```

Gateway URL: `http://localhost:8000`

## Endpoints

### Gateway
- `GET /health` - Aggregate service status

### App Service
- `POST /api/app/auth/register` - Register user
- `POST /api/app/auth/login` - Login user
- `GET /api/app/trips` - List user's trips
- `POST /api/app/trips` - Create trip
- `GET /api/app/trips/:tripId/expenses` - List trip expenses
- `POST /api/app/trips/:tripId/expenses` - Add expense
- `GET /api/app/trips/:tripId/receipts` - List trip receipts and OCR metadata
- `POST /api/app/trips/:tripId/receipts` - Save a receipt scan result
- `PATCH /api/app/trips/:tripId/receipts/:receiptId` - Update parsed items/status for a receipt
- `POST /api/app/ml-feedback` - Submit feedback for model improvement

### ML Service
- `POST /api/ml/ocr/analyze` - Scan receipt and extract text (TrOCR)
- `POST /api/ml/parse/items` - Parse items from text (BERT NER)
- `POST /api/ml/train/feedback` - Store corrections for retraining
- `POST /api/ml/train/retrain` - Retrain parser incrementally from feedback.jsonl
- `GET /api/ml/status` - Model availability status

## Directory Structure

```
backend/
├── api-gateway/           # Express proxy gateway
├── app-service/           # Express + PostgreSQL app
├── ml-service/            # FastAPI + ML models (Phase 2)
│   ├── app/
│   │   ├── config.py      # Model & training configs
│   │   ├── datasets.py    # Dataset manager
│   │   ├── model_registry.py
│   │   ├── training.py    # Training pipelines
│   │   ├── models/        # Model implementations
│   │   │   ├── ocr_pytorch.py    # TrOCR
│   │   │   └── parser_tensorflow.py  # BERT NER
│   │   └── main.py        # FastAPI inference
│   ├── models/            # Trained checkpoints
│   ├── data/
│   │   ├── datasets/      # SROIE, CORD, RVL-CDIP, user data
│   │   └── feedback.jsonl # User corrections
│   ├── notebooks/         # Training examples
│   ├── setup_phase2.py    # Phase 2 setup script
│   ├── PHASE2_README.md   # Phase 2 documentation
│   └── requirements.txt   # ML dependencies
├── docker-compose.yml     # PostgreSQL
└── README.md (this file)
```

## Development

### Install Dependencies

```bash
# App Service
cd backend/app-service && npm install

# ML Service (Phase 2)
cd backend/ml-service && pip install -r requirements.txt

# API Gateway
cd backend/api-gateway && npm install
```

### Environment Variables

Copy `.env.example` to `.env` in each service:

- `api-gateway/.env` - Port & service URLs
- `app-service/.env` - Database, JWT secret
- `ml-service/.env` - Model & data paths

## Next: Phase 3 - Mobile Apps

After Phase 2 training completes:
- React Native mobile apps (iOS + Android)
- Shared API client and utilities
- Model quantization for mobile
- Offline OCR support

---

For Phase 2 ML training details, see [ml-service/PHASE2_GUIDE.md](ml-service/PHASE2_GUIDE.md)
