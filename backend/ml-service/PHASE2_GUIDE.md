# Phase 2: ML Training Pipeline

## Overview

Phase 2 implements the complete ML training infrastructure for your ANI system:

- **OCR Model** (PyTorch): Fine-tuned TrOCR for receipt text extraction
- **Item Parser** (TensorFlow): BERT-based NER for structured item extraction
- **Dataset Management**: Automatic download and preparation of SROIE, CORD, RVL-CDIP, user data
- **Training Pipeline**: Full training loops with validation and early stopping
- **Model Registry**: Unified interface for inference

## Directory Structure

```
backend/ml-service/
├── app/
│   ├── config.py              # Configurations & hyperparameters
│   ├── datasets.py            # Dataset manager (SROIE, CORD, RVL-CDIP)
│   ├── model_registry.py      # Model loading & management
│   ├── training.py            # Training pipelines
│   ├── models/
│   │   ├── ocr_pytorch.py     # TrOCR model (PyTorch)
│   │   └── parser_tensorflow.py # BERT NER (TensorFlow)
│   └── main.py                # Updated FastAPI with inference
├── models/                    # Trained model checkpoints
│   ├── ocr_model/
│   └── parser_model/
├── data/
│   ├── datasets/
│   │   ├── sroie/             # SROIE receipts
│   │   ├── cord/              # CORD receipts  
│   │   ├── rvl_cdip/          # Document classification
│   │   └── user_collected/    # Your labeled receipts
│   └── feedback.jsonl         # User corrections for retraining
├── requirements.txt           # ML dependencies
└── setup_phase2.py           # Setup script
```

## Installation

### 1) Install ML Dependencies

```bash
cd backend/ml-service
pip install -r requirements.txt
```

### 2) Verify GPU (Optional)

```bash
python -c "import torch; print(f'GPU Available: {torch.cuda.is_available()}')"
python -c "import tensorflow as tf; print(f'GPU Available: {tf.config.list_physical_devices(\"GPU\")}')"
```

### 3) Prepare Datasets

```bash
python setup_phase2.py
```

This will:
- Download SROIE (500MB) ✓
- Download CORD (300MB) - from Hugging Face ✓
- Create user_collected directory for your receipts ⚠
- Guide you to manually download RVL-CDIP if needed

## Training

### Option 1: Train All Models

```bash
python -m app.training
```

### Option 2: Train Specific Model

```bash
# OCR only
python -m app.training ocr

# Item Parser only
python -m app.training parser
```

### Option 3: Fine-tune with Your Data

```bash
# Custom training script
python train_with_custom_data.py --dataset user_collected --epochs 20
```

## Model Inference

Once trained, models are automatically loaded in FastAPI:

```bash
# Start service
uvicorn app.main:app --reload --port 8001
```

### OCR Endpoint

```bash
curl -X POST http://localhost:8001/api/ml/ocr/analyze \
  -F "file=@receipt.jpg"
```

Response:
```json
{
  "status": "success",
  "text": "Starbucks\n2 Cappuccino $5.50 each\nSubtotal: $11.00\nTax: $0.88\nTotal: $11.88",
  "confidence": 0.92,
  "filename": "receipt.jpg"
}
```

### Item Parser Endpoint

```bash
curl -X POST http://localhost:8001/api/ml/parse/items \
  -H "Content-Type: application/json" \
  -d '{"text": "Cappuccino $5.50\nEspresso $3.00\nTotal $8.50"}'
```

Response:
```json
{
  "status": "success",
  "items": [
    {"name": "Cappuccino", "amount": 5.50},
    {"name": "Espresso", "amount": 3.00}
  ],
  "confidence": 0.85,
  "model": "bert-nerd-parser"
}
```

### Submit Feedback (for Retraining)

```bash
curl -X POST http://localhost:8001/api/ml/train/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "receipt_id": "receipt_123",
    "original_parse": {"items": [{"name": "Item", "amount": 10}]},
    "corrected_parse": {"items": [{"name": "Item", "amount": 10.50}]}
  }'
```

## Hyperparameters

Configure in `app/config.py`:

### OCR (TrOCR)
- **Learning Rate**: 2e-4
- **Batch Size**: 4
- **Epochs**: 10
- **Device**: cuda (GPU)

### Item Parser (BERT NER)
- **Learning Rate**: 2e-5
- **Batch Size**: 8
- **Epochs**: 15
- **Device**: cuda (GPU)

## Performance Metrics

Models will log:
- Training loss
- Validation loss
- Character Error Rate (CER) for OCR
- F1 score for NER

## Next Steps

1. **Run setup**: `python setup_phase2.py`
2. **Prepare your receipt data**: Add labeled receipts to `data/datasets/user_collected/`
3. **Train models**: `python -m app.training`
4. **Test inference**: `curl` examples above
5. **Collect feedback**: Users submit corrections via `/train/feedback`
6. **Iterate**: Retrain models monthly with accumulated feedback

## Troubleshooting

### Out of Memory (OOM)?
- Reduce batch size in `app/config.py`
- Use gradient accumulation
- Train on CPU temporarily

### Models won't load?
- Check GPU availability: `nvidia-smi`
- Verify CUDA installation
- Check model checkpoints exist

### Slow training?
- Verify GPU is being used: `nvidia-smi` during training
- Reduce dataset size for testing
- Use mixed precision (FP16)

## Phase 3

- React Native mobile app integration
- Model quantization for mobile inference
- Federated learning with user data
