# Contributing to Trip Expense Manager

Thanks for your interest in contributing! This project is a full-stack app with a React frontend, three Node.js/Python backend services, a PostgreSQL database, and an ML pipeline. Please read this guide before submitting changes.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Code Style](#code-style)
- [Service-Specific Guidelines](#service-specific-guidelines)
- [Reporting Issues](#reporting-issues)

---

## Ways to Contribute

- Report bugs or request features via GitHub Issues
- Improve documentation
- Fix bugs or implement features from the issue tracker
- Improve ML model accuracy or training pipelines
- Add tests (unit, integration, or property-based)
- Suggest UX or accessibility improvements

---

## Project Structure

```
/
├── src/                        # React frontend (TypeScript)
│   └── services/               # API client layer
├── backend/
│   ├── api-gateway/            # Express proxy (port 8000)
│   ├── app-service/            # Express + PostgreSQL (port 8002)
│   └── ml-service/             # FastAPI + ML models (port 8001)
├── assets/                     # Static assets
└── docker-compose.yml          # PostgreSQL container
```

---

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Docker Desktop
- npm

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/Travel-Expense-Manager.git
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
cp .env.example .env   # fill in JWT_SECRET, GOOGLE_CLIENT_ID, mail settings
npm install
npm run dev
```

### 4. Start ML Service

```bash
cd backend/ml-service
pip install -r requirements.txt
python setup_phase2.py
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```

### 5. Start API Gateway

```bash
cd backend/api-gateway
cp .env.example .env
npm install
npm run dev
```

### 6. Start Frontend

```bash
# from project root
npm install
npm run dev
```

All services must be running for the full feature set to work. The frontend runs on `http://localhost:5173`.

---

## Branching Strategy

Branch from `main` using a descriptive prefix:

| Prefix | Use for |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `ml/` | ML model or training changes |
| `refactor/` | Code cleanup without behavior change |
| `chore/` | Dependency updates, config changes |

```bash
git checkout -b feature/settlement-export
git checkout -b fix/otp-expiry-edge-case
git checkout -b ml/improve-bert-ner-labels
```

---

## Commit Messages

Use clear, imperative present-tense messages:

```
Add settlement CSV export
Fix OTP expiry not resetting on resend
Update BERT NER label set to include QUANTITY
Refactor tripService to use shared fetch helper
```

- Keep commits small and focused on one change
- Reference issue numbers where relevant: `Fix login redirect (#42)`

---

## Pull Requests

Before opening a PR:

- [ ] All services start without errors
- [ ] `npm run lint` passes (frontend)
- [ ] No TypeScript errors (`npm run build` in root)
- [ ] New backend routes have basic input validation
- [ ] `.env.example` is updated if new env vars are added
- [ ] README or docs updated if behavior changes

In your PR description include:
- What changed and why
- Which service(s) are affected
- Screenshots for any UI changes
- Any migration steps needed (e.g. new DB columns)

Keep PRs scoped to a single topic. Large PRs are harder to review and slower to merge.

---

## Code Style

### Frontend (TypeScript + React)

- Follow existing patterns in `src/App.tsx` and `src/services/`
- Use TypeScript interfaces for all API payloads and responses
- Prefer `async/await` over `.then()` chains
- Keep service functions in the appropriate `src/services/*.ts` file
- Run `npm run lint` before committing

### App Service (Node.js)

- Use ESM (`import`/`export`) — no CommonJS `require()`
- Validate all request body fields before DB queries
- Use `assertTripOwner` / `assertTripAccess` helpers for authorization checks
- Never expose raw DB errors to the client — return a clean message
- New routes that modify data should be owner-only unless explicitly shared

### ML Service (Python)

- Follow PEP 8 style
- Add docstrings to new functions and classes
- New endpoints go in `app/main.py`; model logic goes in `app/models/`
- Training pipeline changes go in `app/training.py`
- Test new inference logic with at least one sample input before submitting

### Database

- New columns use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `db.js` so existing installs migrate automatically
- Use `JSONB` for flexible/nested data, typed columns for everything else
- Always use parameterized queries — never string-interpolate user input into SQL

---

## Service-Specific Guidelines

### Adding a new API endpoint

1. Add the route handler in `backend/app-service/src/index.js`
2. Add the corresponding client function in the appropriate `src/services/*.ts`
3. Add JWT middleware (`authMiddleware`) for any authenticated route
4. Add owner/access check (`assertTripOwner` or `assertTripAccess`) for trip-scoped routes
5. Update the API Reference section in `README.md`

### Adding a new ML endpoint

1. Add the FastAPI route in `backend/ml-service/app/main.py`
2. Add the Pydantic request/response model
3. Add the client function in `src/services/mlService.ts`
4. Update `README.md` API Reference

### Modifying the database schema

1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `backend/app-service/src/db.js`
2. Update the relevant TypeScript interfaces in `src/services/`
3. Document the new column in the README schema table

---

## Reporting Issues

Please include:

- **Steps to reproduce** — be specific
- **Expected vs actual behavior**
- **Which service is affected** (frontend / app-service / ml-service / gateway)
- **Logs or error messages** — check browser console, terminal output
- **Environment** — OS, Node version, Python version, Docker version

For ML issues (wrong OCR output, bad item parsing), include:
- A sample receipt image if possible (anonymize any personal data)
- The raw OCR text returned
- The parsed items returned vs what was expected

---

Thanks for contributing — every improvement helps make trip expense tracking less painful for everyone!
