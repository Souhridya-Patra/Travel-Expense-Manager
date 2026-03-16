"""
Updated FastAPI service with trained model integration.
"""

import os
import logging
from pathlib import Path
from io import BytesIO
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from app.config import DATA_STORAGE_PATH
from app.model_registry import ModelRegistry
from app.datasets import DatasetManager
from app.training import retrain_parser_from_feedback

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Trip Expense ANI Service",
    version="0.2.0",
    description="Artificial Narrow Intelligence for receipt parsing"
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ML_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize models on startup
models = None


@app.on_event("startup")
async def startup_event():
    """Initialize models on startup."""
    global models
    logger.info("Initializing ANI models...")

    try:
        models = ModelRegistry()
        # Pre-load models
        _ = models.get_ocr_model()
        logger.info("✓ OCR model loaded")
        _ = models.get_parser_model()
        logger.info("✓ Item Parser model loaded")
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        logger.warning("Falling back to minimal mode (models will load on first request)")


class ParseRequest(BaseModel):
    text: str


class FeedbackRequest(BaseModel):
    receipt_id: str | None = None
    original_parse: dict[str, Any]
    corrected_parse: dict[str, Any]


class OCRResponse(BaseModel):
    status: str
    text: str
    confidence: float = 0.0


class ItemsResponse(BaseModel):
    status: str
    items: list[dict[str, Any]]
    confidence: float = 0.0


class RetrainRequest(BaseModel):
    samples: int = 128
    epochs: int = 2
    feedback_file: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "ml-service", "version": "0.2.0"}


@app.post("/api/ml/setup")
def setup_datasets() -> dict[str, Any]:
    """Setup and prepare all datasets for training."""
    try:
        datasets = DatasetManager.prepare_all_datasets()
        return {
            "status": "ready",
            "datasets": {k: str(v) if v else "not available" for k, v in datasets.items()}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/ocr/analyze")
async def ocr_analyze(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Analyze receipt image using OCR.
    Returns extracted text and confidence score.
    """
    if not file.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
        raise HTTPException(status_code=400, detail="Invalid image format")

    try:
        image_data = await file.read()
        image = Image.open(BytesIO(image_data))

        # Get OCR model and predict
        ocr_model = models.get_ocr_model() if models else ModelRegistry().get_ocr_model()

        # Save temporarily for inference
        temp_path = DATA_STORAGE_PATH / f"temp_{file.filename}"
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(temp_path)

        text = ocr_model.predict(str(temp_path))

        # Cleanup
        temp_path.unlink()

        return {
            "status": "success",
            "text": text,
            "confidence": 0.85,  # Placeholder - actual confidence from model
            "filename": file.filename,
        }

    except Exception as e:
        logger.error(f"OCR analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"OCR analysis failed: {str(e)}")


@app.post("/api/ml/parse/items")
def parse_items(payload: ParseRequest) -> dict[str, Any]:
    """
    Parse receipt items from OCR text using fine-tuned BERT model.
    Returns structured items with prices.
    """
    if not payload.text or len(payload.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        parser_model = models.get_parser_model() if models else ModelRegistry().get_parser_model()
        entities = parser_model.predict(payload.text)

        # Convert entities to items (simplified)
        items = []
        current_item = {}

        for label, text in entities:
            if label == "ITEM":
                if current_item and "name" in current_item:
                    items.append(current_item)
                current_item = {"name": text.strip(), "amount": 0.0}
            elif label == "PRICE" and current_item:
                try:
                    current_item["amount"] = float(text.replace("$", "").strip())
                except ValueError:
                    pass

        if current_item and "name" in current_item:
            items.append(current_item)

        return {
            "status": "success",
            "items": items,
            "confidence": 0.80,  # Placeholder
            "model": "bert-nerd-parser",
        }

    except Exception as e:
        logger.error(f"Item parsing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Item parsing failed: {str(e)}")


@app.post("/api/ml/train/feedback")
def train_feedback(payload: FeedbackRequest) -> dict[str, Any]:
    """
    Store user feedback for future model retraining.
    Used for continuous improvement of the ANI.
    """
    try:
        feedback_file = DATA_STORAGE_PATH / "feedback.jsonl"
        feedback_file.parent.mkdir(parents=True, exist_ok=True)

        with open(feedback_file, "a", encoding="utf-8") as f:
            f.write(f"{payload.model_dump_json()}\n")

        logger.info(f"Feedback stored for receipt {payload.receipt_id}")

        return {
            "status": "stored",
            "message": "Feedback captured for future training runs",
            "receipt_id": payload.receipt_id,
        }

    except Exception as e:
        logger.error(f"Feedback storage failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/train/retrain")
def retrain_from_feedback(payload: RetrainRequest) -> dict[str, Any]:
    """
    Trigger parser retraining from accumulated feedback corrections.
    This performs a lightweight incremental retraining pass.
    """
    try:
        feedback_file = DATA_STORAGE_PATH / "feedback.jsonl"
        if payload.feedback_file:
            feedback_file = Path(payload.feedback_file)

        result = retrain_parser_from_feedback(
            feedback_path=feedback_file,
            max_samples=payload.samples,
            num_epochs=payload.epochs,
        )

        ModelRegistry.reload_models()
        if models:
            _ = models.get_parser_model()

        return {
            "status": "success",
            "message": "Parser retraining from feedback complete",
            "result": result,
        }
    except Exception as e:
        logger.error(f"Retraining from feedback failed: {e}")
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")


@app.get("/api/ml/status")
def model_status() -> dict[str, Any]:
    """Get status of loaded models."""
    try:
        return {
            "status": "ok",
            "ocr_model": "loaded" if models and models._ocr_model else "not loaded",
            "parser_model": "loaded" if models and models._parser_model else "not loaded",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
