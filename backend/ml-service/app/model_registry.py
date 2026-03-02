"""
Model initialization and inference wrapper.
Loads both OCR and Item Parser models.
"""

from pathlib import Path
from typing import Optional
import logging

from app.config import OCR_MODEL_CONFIG, PARSER_MODEL_CONFIG
from app.models.ocr_pytorch import OCRModel
from app.models.parser_tensorflow import ItemParserModel

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Singleton registry for all trained models."""

    _instance = None
    _ocr_model: Optional[OCRModel] = None
    _parser_model: Optional[ItemParserModel] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelRegistry, cls).__new__(cls)
        return cls._instance

    @classmethod
    def get_ocr_model(cls, device: str = "cuda") -> OCRModel:
        """Get or initialize OCR model."""
        if cls._ocr_model is None:
            cls._ocr_model = OCRModel(device=device)

            # Try to load fine-tuned checkpoint, fallback to pretrained
            checkpoint = OCR_MODEL_CONFIG["checkpoint_dir"]
            if checkpoint.exists() and (checkpoint / "pytorch_model.bin").exists():
                try:
                    cls._ocr_model.load_checkpoint(checkpoint)
                except Exception as e:
                    logger.warning(f"Could not load OCR checkpoint: {e}")
                    cls._ocr_model.load_pretrained()
            else:
                cls._ocr_model.load_pretrained()

        return cls._ocr_model

    @classmethod
    def get_parser_model(cls, device: str = "cuda") -> ItemParserModel:
        """Get or initialize Item Parser model."""
        if cls._parser_model is None:
            cls._parser_model = ItemParserModel(device=device)

            # Try to load fine-tuned checkpoint, fallback to pretrained
            checkpoint = PARSER_MODEL_CONFIG["checkpoint_dir"]
            if checkpoint.exists():
                try:
                    cls._parser_model.load_checkpoint(checkpoint)
                except Exception as e:
                    logger.warning(f"Could not load parser checkpoint: {e}")
                    cls._parser_model.load_pretrained()
            else:
                cls._parser_model.load_pretrained()

        return cls._parser_model

    @classmethod
    def reload_models(cls):
        """Reload models (useful after fine-tuning)."""
        cls._ocr_model = None
        cls._parser_model = None
