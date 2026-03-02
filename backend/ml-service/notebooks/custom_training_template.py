"""
Quick reference for implementing your own training loops.
Use this as a starting point for custom training workflows.
"""

from pathlib import Path
from typing import Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from transformers import TrOCRProcessor, VisionEncoderDecoderModel, AdamW

from app.config import OCR_MODEL_CONFIG, OCR_TRAINING_CONFIG


class CustomOCRDataset(Dataset):
    """Template for creating custom OCR dataset from your receipts."""

    def __init__(self, image_paths: list, texts: list, processor: TrOCRProcessor):
        self.image_paths = image_paths
        self.texts = texts
        self.processor = processor

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        from PIL import Image

        image = Image.open(self.image_paths[idx]).convert("RGB")
        text = self.texts[idx]

        # Process image
        pixel_values = self.processor(image, return_tensors="pt")["pixel_values"]

        # Encode text
        with self.processor.as_target_processor():
            labels = self.processor(text, return_tensors="pt")["input_ids"]

        return {
            "pixel_values": pixel_values.squeeze(),
            "labels": labels.squeeze(),
        }


def train_ocr_custom(
    train_dataset: CustomOCRDataset,
    val_dataset: CustomOCRDataset,
    num_epochs: int = 10,
    batch_size: int = 4,
) -> None:
    """
    Example training loop for OCR model.
    Copy and modify for your specific workflow.
    """

    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Initialize model and processor
    processor = TrOCRProcessor.from_pretrained(
        OCR_MODEL_CONFIG["processor_name"]
    )
    model = VisionEncoderDecoderModel.from_pretrained(
        OCR_MODEL_CONFIG["model_name"]
    ).to(device)

    # Setup optimizer
    optimizer = AdamW(
        model.parameters(), lr=OCR_TRAINING_CONFIG["learning_rate"]
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, num_epochs)

    # Create dataloaders
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size)

    best_val_loss = float("inf")
    patience = OCR_TRAINING_CONFIG["patience"]
    patience_counter = 0

    for epoch in range(num_epochs):
        print(f"\n{'='*60}")
        print(f"Epoch {epoch+1}/{num_epochs}")
        print(f"{'='*60}")

        # Training
        model.train()
        train_loss = 0

        for batch_idx, batch in enumerate(train_loader):
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].to(device)

            # Forward pass
            outputs = model(pixel_values=pixel_values, labels=labels)
            loss = outputs.loss

            # Backward pass
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss += loss.item()

            if (batch_idx + 1) % 10 == 0:
                print(
                    f"  Batch {batch_idx+1}/{len(train_loader)} "
                    f"Loss: {loss.item():.4f}"
                )

        avg_train_loss = train_loss / len(train_loader)
        print(f"\nTraining Loss: {avg_train_loss:.4f}")

        # Validation
        model.eval()
        val_loss = 0

        with torch.no_grad():
            for batch in val_loader:
                pixel_values = batch["pixel_values"].to(device)
                labels = batch["labels"].to(device)

                outputs = model(pixel_values=pixel_values, labels=labels)
                val_loss += outputs.loss.item()

        avg_val_loss = val_loss / len(val_loader)
        print(f"Validation Loss: {avg_val_loss:.4f}")

        # Learning rate schedule
        scheduler.step()

        # Early stopping
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            patience_counter = 0

            # Save checkpoint
            checkpoint_dir = OCR_MODEL_CONFIG["checkpoint_dir"]
            checkpoint_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(checkpoint_dir)
            processor.save_pretrained(checkpoint_dir)
            print(f"✓ Model saved to {checkpoint_dir}")
        else:
            patience_counter += 1
            print(f"⚠ No improvement ({patience_counter}/{patience})")

            if patience_counter >= patience:
                print(f"\n✓ Early stopping at epoch {epoch+1}")
                break

    print(f"\n{'='*60}")
    print("✓ Training complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    print("""
This is a template for custom training loops.

To use:
1. Collect your receipt images and labels
2. Create CustomOCRDataset instances for train/val
3. Call train_ocr_custom()

Example:
    train_dataset = CustomOCRDataset(image_paths, texts, processor)
    val_dataset = CustomOCRDataset(val_paths, val_texts, processor)
    train_ocr_custom(train_dataset, val_dataset, num_epochs=15)
""")
