# Phase 2: ML Training - Updated Backend README

Phase 2 introduces complete ML training infrastructure for your ANI system.

## What's New

- **OCR Model** (TrOCR + PyTorch): Fine-tune pre-trained model on receipt data
- **Item Parser** (BERT NER + TensorFlow): Extract structured items from text
- **Dataset Managers**: SROIE, CORD, RVL-CDIP, user-collected data support
- **Training Pipelines**: Full training loops with validation, checkpointing, early stopping
- **Model Registry**: Unified model loading and inference
- **FastAPI Integration**: Ready for inference endpoints

## Quick Start

### 1) Install ML Dependencies

```bash
cd backend/ml-service
pip install -r requirements.txt
```

### 2) Check GPU Support (Optional)

```bash
python -c "import torch; print(f'GPU: {torch.cuda.is_available()}')"
python -c "import tensorflow as tf; print(f'GPU: {len(tf.config.list_physical_devices(\"GPU\")) > 0}')"
```

### 3) Prepare Datasets

```bash
python setup_phase2.py
```

This downloads:
- ✓ SROIE (500MB)
- ✓ CORD (300MB) from Hugging Face
- ⚠ RVL-CDIP (1.6GB) - manual download required
- ✓ User collected directory for your own receipts

### 4) Train Models

```bash
# Train all models
python -m app.training

# Or train individual models (coming in Phase 2.1)
python -m app.training ocr
python -m app.training parser
```

### 5) Verify FastAPI Service

Models are automatically loaded on service startup:

```bash
# Update already running service or restart
uvicorn app.main:app --reload --port 8001

# Check model status
curl http://localhost:8001/api/ml/status
```

## Key Files

- **config.py** - Model configs, hyperparameters, dataset paths
- **datasets.py** - Dataset downloading and management
- **models/** - Model implementations (PyTorch OCR, TensorFlow NER)
- **model_registry.py** - Unified model loading
- **training.py** - Training pipelines
- **main.py** - FastAPI service with inference endpoints
- **setup_phase2.py** - Automated setup script
- **PHASE2_GUIDE.md** - Detailed documentation

## Training Hyperparameters

Edit in `app/config.py`:

```python
OCR_TRAINING_CONFIG = {
    "learning_rate": 2e-4,
    "batch_size": 4,      # Reduce if OOM
    "num_epochs": 10,
    "patience": 3,        # Early stopping
    "device": "cuda",     # Or "cpu"
}

PARSER_TRAINING_CONFIG = {
    "learning_rate": 2e-5,
    "batch_size": 8,      # Reduce if OOM
    "num_epochs": 15,
    "patience": 5,
    "device": "cuda",
}
```

## Inference APIs

### OCR Endpoint

```bash
curl -X POST http://localhost:8001/api/ml/ocr/analyze \
  -F "file=@receipt.jpg"

# Response: {"status": "success", "text": "...", "confidence": 0.92}
```

### Item Parser Endpoint

```bash
curl -X POST http://localhost:8001/api/ml/parse/items \
  -H "Content-Type: application/json" \
  -d '{"text": "Item Name $10.50\nItem2 $5.00"}'

# Response: {"status": "success", "items": [...], "confidence": 0.85}
```

### Feedback Collection (for Retraining)

```bash
curl -X POST http://localhost:8001/api/ml/train/feedback \
  -H "Content-Type: application/json" \
  -d '{"receipt_id": "123", "original_parse": {...}, "corrected_parse": {...}}'
```

## Custom Training

Use templates in `notebooks/` to implement custom workflows:

1. **phase2_training.py** - Jupyter notebook format
2. **custom_training_template.py** - Training loop template

## Adding Your Own Receipt Data

```bash
# Structure for user_collected dataset
data/datasets/user_collected/
├── images/
│   ├── receipt_001.jpg
│   ├── receipt_002.jpg
│   └── ...
└── labels/
    ├── receipt_001.json  # {"text": "OCR output"}
    ├── receipt_002.json  # {"items": [...], "total": 30.50}
    └── ...
```

## Next Steps (Phase 2.1)

- [ ] Complete dataset loaders for SROIE, CORD, RVL-CDIP
- [ ] Implement full training loops
- [ ] Add model evaluation metrics (CER, F1)
- [ ] Create UI for monitoring training progress
- [ ] Support for distributed training

## Troubleshooting

**GPU not detected?**
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

**Out of memory?**
- Reduce batch_size in config.py
- Use gradient accumulation
- Train on CPU temporarily

**Model checkpoint not found?**
- Run `python setup_phase2.py` first
- Check `backend/ml-service/models/` directory

## Support

For detailed guidance, see `PHASE2_GUIDE.md`
