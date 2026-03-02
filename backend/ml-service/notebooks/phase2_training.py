"""
Example notebook showing how to train models with custom data.
Demonstrates workflow for both OCR and Item Parser.
"""

# For this to work in Jupyter:
# jupyter notebook backend/ml-service/notebooks/phase2_training.ipynb

# Then run these cells in sequence:

# ===== CELL 1: Setup & Imports =====

import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd().parent))

import torch
import tensorflow as tf
from app.datasets import DatasetManager
from app.training import OCRTrainingPipeline, ItemParserTrainingPipeline
from app.config import OCR_TRAINING_CONFIG, PARSER_TRAINING_CONFIG

print("✓ Imports successful")
print(f"🔧 PyTorch GPU available: {torch.cuda.is_available()}")
print(f"🔧 TensorFlow GPU available: {len(tf.config.list_physical_devices('GPU')) > 0}")

# ===== CELL 2: Prepare Datasets =====

datasets = DatasetManager.prepare_all_datasets()
print(f"\n✓ Datasets ready:")
for name, path in datasets.items():
    print(f"  - {name}: {path}")

# ===== CELL 3: Train OCR Model =====

print("\n🚀 Starting OCR Model Training...\n")
ocr_pipeline = OCRTrainingPipeline(config=OCR_TRAINING_CONFIG)

# In real implementation:
# train_loader, val_loader = ocr_pipeline.prepare_data(datasets)
# ocr_pipeline.train(train_loader, val_loader, num_epochs=10)

print("(Training loop will run here once datasets are fully integrated)")

# ===== CELL 4: Train Item Parser Model =====

print("\n🚀 Starting Item Parser Training...\n")
parser_pipeline = ItemParserTrainingPipeline(config=PARSER_TRAINING_CONFIG)

# In real implementation:
# train_dataset, val_dataset = parser_pipeline.prepare_data(datasets)
# parser_pipeline.train(train_dataset, val_dataset, num_epochs=15)

print("(Training loop will run here once datasets are fully integrated)")

# ===== CELL 5: Test Inference =====

from app.model_registry import ModelRegistry

models = ModelRegistry()
ocr_model = models.get_ocr_model()
parser_model = models.get_parser_model()

# Test OCR
# text = ocr_model.predict("path/to/receipt.jpg")
# print(f"OCR Output: {text}")

# Test Parser
# entities = parser_model.predict(text)
# print(f"Parsed entities: {entities}")

print("✓ Models ready for inference")
