# 🏕️ Trip Expense Manager

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.0.0-brightgreen.svg)
![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-blue)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20FastAPI-green)
![ML](https://img.shields.io/badge/ML-TrOCR%20%2B%20BERT%20NER-orange)

> A full-stack application to track group trip expenses, split bills, scan receipts with AI, and calculate optimized settlements — no more messy spreadsheets.

## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Usage](#-usage)
- [Contributing](#-contributing)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🚀 About the Project

**Trip Expense Manager** helps groups of travelers track who paid for what, split bills fairly, and settle up efficiently at the end of a trip. It supports both regular shared expenses and individual food orders.

The app features an AI-powered receipt scanner that uses OCR and Named Entity Recognition to automatically extract line items and totals from receipt photos — reducing manual data entry significantly.

Users can sign up with email (OTP-verified) or Google, create trips, invite fellow travelers, and even send settlement reminders via email with UPI payment details.

---

## ✨ Key Features

- **Authentication** — Email + OTP verification, Google OAuth, JWT sessions
- **Guest Mode** — Use the app without an account; state persists in localStorage
- **Trip Management** — Create, rename, and switch between multiple trips
- **Trip Sharing** — Share trips with other verified users (read-only access for shared users)
- **Expense Tracking** — Regular (equal split) and food (per-person orders) expense types
- **Receipt Scanner** — Upload a receipt photo → AI extracts text (TrOCR) → parses items & total (BERT NER)
- **Settlement Calculator** — Optimized who-owes-whom calculation
- **Settlement Reminders** — Send email reminders to debtors with creditor's UPI ID
- **Spending Stats** — Per-user spending analytics (monthly, yearly, custom date range)
- **ML Feedback Loop** — Correct parsed items to continuously improve the AI models
- **Currency Selector** — USD, EUR, GBP, INR, AUD, CAD, JPY, CNY
- **Profile Management** — Update UPI ID for payment collection

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript | 5.5.3 | Type safety |
| Vite | 5.4.2 | Build tool & dev server |
| Tailwind CSS | 3.4.1 | Utility-first styling |
| lucide-react | 0.344.0 | Icon library |
| Tesseract.js | 5.0.5 | Client-side OCR fallback |

### API Gateway
| Technology | Version | Purpose |
|---|---|---|
| Node.js (ESM) | 18+ | Runtime |
| Express | 4.21.1 | HTTP server |
| http-proxy-middleware | 3.0.3 | Request proxying |
| morgan | 1.10.0 | Request logging |

### App Service
| Technology | Version | Purpose |
|---|---|---|
| Node.js (ESM) | 18+ | Runtime |
| Express | 4.21.1 | HTTP server |
| PostgreSQL (pg) | 8.13.0 | Database driver |
| jsonwebtoken | 9.0.2 | JWT auth (7-day tokens) |
| bcryptjs | 2.4.3 | Password hashing |
| google-auth-library | 9.15.1 | Google OAuth verification |
| nodemailer | — | OTP + settlement reminder emails |

### Database
| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16 (Alpine) | Primary database |
| Docker | — | Container runtime |
| pgcrypto | — | UUID generation |

### ML Service
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.x | Runtime |
| FastAPI | 0.104+ | HTTP framework |
| Uvicorn | 0.30+ | ASGI server |
| PyTorch | 2.10.0 | OCR model (TrOCR) |
| TensorFlow | 2.16.0 | Parser model (BERT NER) |
| Transformers | 4.45.0 | HuggingFace model loading |
| datasets | 2.20.0 | Training dataset management |
| Pillow / OpenCV | 10.0 / 4.8 | Image preprocessing |

---

## 🏗️ Architecture

```
Browser (port 5173)
  ├── authService.ts    ──────────────────────► App Service (8002)
  ├── tripService.ts    ──────────────────────► App Service (8002)
  ├── appService.ts     ──► API Gateway (8000) ► App Service (8002)
  └── mlService.ts      ──────────────────────► ML Service  (8001)

API Gateway (8000)
  ├── /api/ml/*  ──► ML Service  (8001)
  └── /api/*     ──► App Service (8002)

App Service (8002) ──► PostgreSQL (5432)
ML Service  (8001) ──► Model checkpoints + feedback.jsonl
```

### Receipt Scan Pipeline

```
1. User uploads receipt image
2. Frontend → ML Service: POST /api/ml/ocr/analyze  (TrOCR extracts text)
3. Frontend → ML Service: POST /api/ml/parse/items  (BERT NER extracts items + total)
4. User reviews and corrects items
5. Frontend → App Service: POST /api/trips/:id/receipts  (save receipt metadata)
6. Frontend → ML Service: POST /api/ml/train/feedback   (store correction)
7. Frontend → App Service: POST /api/ml-feedback         (save correction to DB)
8. Corrections accumulate → POST /api/ml/train/retrain  (incremental retraining)
```

---

## 💻 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- Docker Desktop
- npm

### 1. Clone the repository

```bash
git clone https://github.com/Souhridya-Patra/Travel-Expense-Manager.git
cd Travel-Expense-Manager
```

### 2. Start PostgreSQL

```bash
cd backend
docker compose up -d
```

### 3. Start App Service

```bash
cd backend/app-service
cp .env.example .env   # edit JWT_SECRET, GOOGLE_CLIENT_ID, mail settings
npm install
npm run dev
# Runs on http://localhost:8002
```

### 4. Start ML Service

```bash
cd backend/ml-service
pip install -r requirements.txt
python setup_phase2.py   # downloads SROIE + CORD datasets
cp .env.example .env
uvicorn app.main:app --reload --port 8001
# Runs on http://localhost:8001
```

### 5. Start API Gateway

```bash
cd backend/api-gateway
cp .env.example .env
npm install
npm run dev
# Runs on http://localhost:8000
```

### 6. Start Frontend

```bash
# from project root
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## 🔧 Environment Variables

### `backend/app-service/.env`

```env
PORT=8002
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/travel_expense_manager
JWT_SECRET=your-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
CORS_ORIGIN=http://localhost:5173

# Email (OTP + settlement reminders)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your@email.com
MAIL_PASS=yourpassword
MAIL_FROM=no-reply@trip-expense.local
MAIL_SECURE=false
OTP_EXPIRY_MINUTES=10
```

### `backend/api-gateway/.env`

```env
PORT=8000
APP_SERVICE_URL=http://localhost:8002
ML_SERVICE_URL=http://localhost:8001
CORS_ORIGIN=http://localhost:5173
```

### `backend/ml-service/.env`

```env
ML_CORS_ORIGINS=http://localhost:5173
```

### Frontend `.env` (root)

```env
VITE_API_BASE_URL=http://localhost:8002
VITE_API_GATEWAY_URL=http://localhost:8000
VITE_ML_SERVICE_URL=http://localhost:8001
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## 📡 API Reference

### Auth (`/api/auth`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with name, email, password, upiId → sends OTP |
| POST | `/api/auth/verify-otp` | Verify 6-digit OTP to activate account |
| POST | `/api/auth/resend-otp` | Resend OTP to email |
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/google` | Login/register with Google ID token |
| PATCH | `/api/user/profile` | Update UPI ID (JWT required) |

### Trips (`/api/trips`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trips` | List owned + shared trips |
| POST | `/api/trips` | Create a new trip |
| PATCH | `/api/trips/:id` | Update trip name/members (owner only) |
| GET | `/api/trips/:id/share-candidates` | List travelers eligible for sharing |
| PUT | `/api/trips/:id/shares` | Update shared users (owner only) |
| POST | `/api/trips/:id/settlement-reminders` | Email settlement reminders (owner only) |

### Expenses

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trips/:id/expenses` | List trip expenses |
| POST | `/api/trips/:id/expenses` | Add expense (owner only) |

### Receipts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trips/:id/receipts` | List receipt history |
| POST | `/api/trips/:id/receipts` | Save receipt scan result (owner only) |
| PATCH | `/api/trips/:id/receipts/:rid` | Update parsed items/status (owner only) |

### Stats

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/user/spending-stats` | Spending total (monthly/yearly/custom) |
| GET | `/api/user/spending-breakdown` | Monthly breakdown (last 12 months) |

### ML Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ml/ocr/analyze` | Extract text from receipt image (TrOCR) |
| POST | `/api/ml/parse/items` | Parse items + total from text (BERT NER) |
| POST | `/api/ml/train/feedback` | Store user correction to feedback.jsonl |
| POST | `/api/ml/train/retrain` | Incrementally retrain parser from feedback |
| GET | `/api/ml/status` | Model load status |
| GET | `/health` | Service health check |

---

## 🧭 Usage

1. **Sign up** with email (OTP verified) or continue as guest
2. **Create a trip** — it's auto-named with date/time, rename anytime
3. **Add travelers** with names and emails
4. **Add expenses:**
   - Regular — split equally among all travelers
   - Food — enter each person's individual order amount
5. **Scan a receipt** — upload a photo, AI extracts items automatically
6. **Correct any mistakes** — corrections feed back into the AI
7. **Calculate settlements** — see the optimized who-owes-whom summary
8. **Send reminders** — email debtors with UPI payment details
9. **Share the trip** — give fellow travelers read-only access

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to your fork: `git push origin feature/my-feature`
5. Open a Pull Request

Please keep PRs focused and include a short description of the change.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for guidelines.

---

## 🗺️ Roadmap

- [x] Email + OTP authentication
- [x] Google OAuth
- [x] Trip sharing with read-only access
- [x] Receipt OCR with TrOCR
- [x] Item parsing with BERT NER
- [x] ML feedback loop + incremental retraining
- [x] Settlement email reminders with UPI ID
- [x] Spending analytics (monthly/yearly/custom)
- [x] Currency selector
- [ ] React Native mobile apps (iOS + Android)
- [ ] Offline OCR support on mobile
- [ ] Export settlements as CSV
- [ ] Push notifications for settlement reminders
- [ ] Multi-currency expense conversion

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

## 📬 Contact

If you have suggestions or questions, feel free to open an issue on GitHub.
