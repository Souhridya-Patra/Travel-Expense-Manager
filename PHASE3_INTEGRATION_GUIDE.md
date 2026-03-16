# Phase 3.1: Frontend-Backend ML Integration

## Overview

**Objective**: Connect the React frontend to the backend ANI service (TrOCR OCR + BERT NER models) while preparing labeled data for future retraining.

**Strategy**: Use pretrained models immediately → Collect real user data → Retrain when labeled data is ready.

---

## What's New

1. **ML Service Client** (`src/services/mlService.ts`)
   - Calls `/api/ml/ocr/analyze` for receipt OCR
   - Calls `/api/ml/parse/items` for item extraction
   - Calls `/api/ml/train/feedback` for user corrections
   - Health checks and model status monitoring

2. **Environment Variables** (`.env.example`)
   - `VITE_ML_SERVICE_URL`: Backend ML service endpoint
   - `VITE_API_GATEWAY_URL`: API Gateway for auth/trips

---

## Implementation Steps

### Step 1: Setup Environment

```bash
cd h:\FOSS\Travel-Expense-Manager

# Create local .env file
copy .env.example .env

# Edit .env to point to your local services:
# VITE_ML_SERVICE_URL=http://localhost:8001
# VITE_API_GATEWAY_URL=http://localhost:8000
```

### Step 2: Update App.tsx to Use Backend OCR

Replace Tesseract.js with backend TrOCR:

```tsx
// In App.tsx runOcr() function

import { analyzeReceiptOcr, parseReceiptItems } from './services/mlService';

const runOcr = async () => {
  if (!receiptImage) return;
  setOcrStatus('running');
  setOcrError(null);
  
  try {
    // Call backend OCR instead of Tesseract.js
    const result = await analyzeReceiptOcr(receiptImage);
    
    if (result.status === 'error') {
      setOcrStatus('error');
      setOcrError(result.error || 'OCR failed');
      return;
    }
    
    setOcrText(result.text);
    setOcrStatus('done');
    
    // Auto-parse items using backend BERT model
    const parseResult = await parseReceiptItems(result.text);
    if (parseResult.status === 'success') {
      // Convert to ReceiptItem format
      const items = parseResult.items.map((item, idx) => ({
        id: `${Date.now()}-${idx}`,
        name: item.name,
        amount: item.amount,
        assignedTo: undefined
      }));
      setReceiptItems(items);
    }
  } catch (error) {
    setOcrStatus('error');
    setOcrError('Failed to process receipt');
  }
};
```

### Step 3: Add Feedback Collection

After user reviews and corrects items:

```tsx
const submitCorrectionFeedback = async () => {
  if (receiptItems.length === 0) return;
  
  const correctedItems = receiptItems.map(item => ({
    name: item.name,
    amount: item.amount
  }));
  
  const feedback = {
    receipt_id: `receipt_${Date.now()}`,
    original_parse: {
      items: receiptItems.map(i => ({ name: i.name, amount: i.amount }))
    },
    corrected_parse: {
      items: correctedItems,
      total: receiptItems.reduce((sum, i) => sum + i.amount, 0)
    }
  };
  
  await submitFeedback(feedback);
  // Show confirmation message
};
```

### Step 4: Add Model Status Check

Show users if models are healthy:

```tsx
import { checkModelStatus } from './services/mlService';

useEffect(() => {
  const checkStatus = async () => {
    const status = await checkModelStatus();
    console.log('Model status:', status);
    // Show warning if models are not loaded
  };
  
  checkStatus();
}, []);
```

---

## Parallel Data Preparation (Track B)

While implementing frontend integration, **prepare your labeled data**:

### Directory Structure
```
backend/ml-service/data/datasets/user_collected/
├── images/
│   ├── receipt_001.jpg
│   ├── receipt_002.jpg
│   └── ...
└── labels/
    ├── receipt_001.json
    ├── receipt_002.json
    └── ...
```

### Label Format Example
```json
{
  "image": "receipt_001.jpg",
  "items": [
    {"name": "Cappuccino", "amount": 5.50},
    {"name": "Croissant", "amount": 3.50}
  ],
  "total": 9.00
}
```

### Data Collection Workflow

1. **During Phase 3.1**: Users submit corrections via feedback button
2. **Every 50 corrections**: Export from database
3. **Quality check**: Manually verify labels are accurate
4. **Add to user_collected/**: Copy reviewed data here
5. **When ready** (100+ labeled receipts):
   ```bash
   cd backend/ml-service
   python -m app.training parser --samples 256 --epochs 5
   ```

---

## Testing the Integration

### 1. Start All Services

```bash
# Terminal 1: ML Service
cd backend/ml-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Terminal 2: App Service
cd backend/app-service
npm install
npm run dev

# Terminal 3: API Gateway
cd backend/api-gateway
npm install
npm run dev

# Terminal 4: Frontend
npm run dev
```

### 2. Test OCR Integration

1. Upload a receipt image in the frontend
2. Click "Run OCR"
3. Verify text appears (from TrOCR, not Tesseract.js)
4. Check browser console for any errors

### 3. Test Item Parsing

1. Verify items appear automatically
2. Try editing an item
3. Click "Submit Feedback" to send correction

### 4. Monitor Feedback Collection

```bash
# Check feedback.jsonl growing
tail -f backend/ml-service/data/feedback.jsonl
```

---

## Performance Notes

**Why switch from Tesseract.js to TrOCR?**

| Metric | Tesseract.js (Local) | TrOCR (Backend) |
|--------|----------------------|-----------------|
| Accuracy (Receipts) | 75-80% | 85-92% |
| Speed | 5-10s per image | 1-3s per image |
| Dependencies | Browser (WASM) | GPU (optional) |
| Updatable | No | Yes (retrain) |
| Data Collection | No | Yes (feedback) |

**Hybrid Approach** (optional):
- If ML service is down: Fall back to Tesseract.js
- Implement with try-catch and localStorage cache

---

## Next: Phase 3.2-3.3

Once Phase 3.1 is working:

- **Phase 3.2**: Receipt storage (save OCR results & images to database)
- **Phase 3.3**: Analytics dashboard (show parsing accuracy, item frequency)
- **Phase 3.4**: Mobile app (React Native for iOS/Android)

---

## Troubleshooting

### "Cannot reach ML Service (localhost:8001)"
- Is backend ML service running? Check: `curl http://localhost:8001/health`
- Port 8001 busy? Change in `.env` and `ml-service/.env`

### "Models not loaded"
- Run setup: `python setup_phase2.py`
- Check logs: `backend/ml-service/logs/`

### Low OCR accuracy on your receipts
- **This is expected** with pretrained models
- Collect corrections via feedback button
- When you have 50+ labeled examples, retrain:
  ```bash
  python -m app.training parser --samples 256 --epochs 5
  ```

---

## Commit Strategy

Once Phase 3.1 is done:

```bash
git add -A
git commit -m "Phase 3.1: Frontend-backend ML integration

- Add ML service client with OCR and parser calls
- Replace Tesseract.js with backend TrOCR
- Implement feedback collection for user corrections
- Add environment configuration
- Switch to pretrained models for immediate use
- Prepare data collection for future retraining"
```

Then: `git push origin main`
