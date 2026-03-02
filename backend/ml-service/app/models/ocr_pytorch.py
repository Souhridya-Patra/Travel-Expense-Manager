import torch
import torch.nn as nn
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
from typing import Optional
from pathlib import Path

from app.config import OCR_MODEL_CONFIG


class OCRModel:
    """TrOCR-based Receipt OCR Model (PyTorch)."""

    def __init__(self, model_dir: Optional[Path] = None, device: str = "cuda"):
        self.device = device
        self.model_dir = model_dir or OCR_MODEL_CONFIG["checkpoint_dir"]
        self.model = None
        self.processor = None

    def load_pretrained(self):
        """Load pre-trained TrOCR model from Hugging Face."""
        print(f"Loading TrOCR from {OCR_MODEL_CONFIG['model_name']}...")
        self.processor = TrOCRProcessor.from_pretrained(
            OCR_MODEL_CONFIG["processor_name"]
        )
        self.model = VisionEncoderDecoderModel.from_pretrained(
            OCR_MODEL_CONFIG["model_name"]
        ).to(self.device)
        print("✓ TrOCR model loaded")

    def load_checkpoint(self, checkpoint_path: Path):
        """Load fine-tuned model from checkpoint."""
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        print(f"Loading checkpoint from {checkpoint_path}...")
        self.processor = TrOCRProcessor.from_pretrained(
            OCR_MODEL_CONFIG["processor_name"]
        )
        self.model = VisionEncoderDecoderModel.from_pretrained(checkpoint_path).to(
            self.device
        )
        print("✓ Model loaded from checkpoint")

    def predict(self, image_path: str) -> str:
        """Predict OCR text from image."""
        if self.model is None:
            self.load_pretrained()

        image = Image.open(image_path).convert("RGB")
        pixel_values = self.processor(images=image, return_tensors="pt")[
            "pixel_values"
        ].to(self.device)

        with torch.no_grad():
            generated_ids = self.model.generate(pixel_values)

        text = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return text

    def save_checkpoint(self, checkpoint_path: Path):
        """Save fine-tuned model."""
        checkpoint_path.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(checkpoint_path)
        self.processor.save_pretrained(checkpoint_path)
        print(f"✓ Model saved to {checkpoint_path}")
