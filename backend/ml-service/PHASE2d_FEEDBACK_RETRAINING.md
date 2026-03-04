# Phase 2d: Feedback-Based Parser Retraining

## Overview

Phase 2d adds the **Feedback-Driven Retraining Pipeline** that enables continuous improvement of the Item Parser model using user corrections.

## What's New

- **Feedback → Training Data Pipeline**: Converts accumulated `feedback.jsonl` corrections into weakly labeled NER training records
- **Parser Retraining Mode**: New CLI command `python -m app.training retrain-parser-feedback`
- **API Endpoint for Retraining**: `POST /api/ml/train/retrain` triggers incremental retraining and auto-reloads the model
- **Automatic Weak Label Generation**: Extracts item names and prices from user-corrected parses

## Architecture

```
User Correction (via /api/ml/train/feedback)
         ↓
    feedback.jsonl (accumulates)
         ↓
_feedback_entry_to_parser_record() → Weak Labels
         ↓
load_feedback_parser_records() → NER Training Records
         ↓
ItemParserTrainingPipeline.prepare_feedback_data() → DataLoaders
         ↓
train() → Updated Model Checkpoint
         ↓
ModelRegistry.reload_models() → Inference uses new weights
```

## Usage

### CLI: Retrain from Feedback

```bash
cd backend/ml-service

# Default: use data/feedback.jsonl, train 256 samples for 2 epochs
python -m app.training retrain-parser-feedback

# Custom parameters
python -m app.training retrain-parser-feedback --samples 512 --epochs 3
```

### API: Trigger Retraining

```bash
curl -X POST http://localhost:8001/api/ml/train/retrain \
  -H "Content-Type: application/json" \
  -d '{"samples": 256, "epochs": 2}'
```

Response:
```json
{
  "status": "success",
  "message": "Parser retraining from feedback complete",
  "result": {
    "status": "success",
    "mode": "parser_feedback",
    "feedback_path": "data/feedback.jsonl",
    "records_used": 42,
    "epochs": 2
  }
}
```

### API: Store Feedback (unchanged)

Users call this to submit corrections:

```bash
curl -X POST http://localhost:8001/api/ml/train/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "receipt_id": "receipt_001",
    "original_parse": {
      "items": [{"name": "Coffee", "amount": 5.00}],
      "total": 5.00
    },
    "corrected_parse": {
      "items": [{"name": "Cappuccino", "amount": 5.50}],
      "total": 5.50
    }
  }'
```

## Weak Label Conversion

The system converts user corrections to NER labels:

**User Correction:**
```json
{
  "corrected_parse": {
    "items": [
      {"name": "Cappuccino", "amount": 5.50},
      {"name": "Biscotti", "amount": 2.00}
    ],
    "total": 7.50
  }
}
```

**Generated Training Text:** `Cappuccino 5.50 Biscotti 2.00 7.50`

**NER Labels:**
- `Cappuccino` → B-ITEM, I-ITEM
- `5.50` → B-PRICE, I-PRICE
- `Biscotti` → B-ITEM, I-ITEM
- `2.00` → B-PRICE, I-PRICE
- `7.50` → B-PRICE, I-PRICE

## Requirements

**Minimum feedback records:** 2 (for train/val split)
**Recommended workflow:** Collect ≥50 corrections, then retrain

## Files Modified

1. **training.py**
   - Added `_feedback_entry_to_parser_record()` – Converts feedback to weak labels
   - Added `load_feedback_parser_records()` – Loads feedback.jsonl as training records
   - Added `ItemParserTrainingPipeline.prepare_feedback_data()` – Prepares retraining dataloaders
   - Added `retrain_parser_from_feedback()` – Orchestrates retraining
   - Extended CLI: new `retrain-parser-feedback` mode

2. **main.py**
   - Added `RetrainRequest` model
   - Added `POST /api/ml/train/retrain` endpoint
   - Integrated feedback retraining trigger with model reloading

3. **PHASE2_GUIDE.md, PHASE2_README.md**
   - Documented feedback retraining command and API endpoint

## Example Workflow

1. **Users make corrections** via the web/mobile UI
2. **Corrections stored** in `data/feedback.jsonl`
3. **Periodically trigger retraining** (weekly/monthly):
   ```bash
   python -m app.training retrain-parser-feedback --samples 512 --epochs 3
   ```
4. **API checks model status** and users see improvements

Or **trigger via API** (e.g., scheduled job):
```bash
curl -X POST http://localhost:8001/api/ml/train/retrain -d '{"samples": 512, "epochs": 3}'
```

## Troubleshooting

**Error: "Not enough valid feedback records"**
- Ensure `feedback.jsonl` exists and contains valid entries
- Check that corrected_parse includes `items` with `name` and/or `amount`

**Retraining is slow**
- Reduce `--samples` (default 256)
- Reduce `--epochs` (default 2)
- Use GPU: ensure CUDA is available

**Model not updated after retraining**
- Check that retraining endpoint returned `"status": "success"`
- Verify new checkpoint files in `models/parser_model/`
- Call `/api/ml/status` to confirm model reload

## Next Steps (Phase 2e+)

- [ ] **Metrics Tracking**: Log CER/F1 scores during retrain
- [ ] **Scheduled Retraining**: Cron job for automatic weekly retrains
- [ ] **Feedback Deduplication**: Remove redundant corrections before training
- [ ] **Multi-Model Ensembles**: Combine OCR + Parser improvements
- [ ] **Model Versioning**: Track performance per checkpoint

## Phase Summary

**Phase 2d** closes the feedback loop: user corrections now drive model improvements. Combined with Phase 2a-2c (baseline training, inference, evaluation), the ANI system now **learns from corrections** and continuously improves.

---

For next phases and overall architecture, see [PHASE2_GUIDE.md](PHASE2_GUIDE.md).
