import os
import json
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
DATASETS_DIR = DATA_DIR / "datasets"
LOGS_DIR = BASE_DIR / "logs"

# Create directories if they don't exist
for directory in [DATA_DIR, MODELS_DIR, DATASETS_DIR, LOGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Model configurations
OCR_MODEL_CONFIG = {
    "model_name": "microsoft/trocr-base-printed",  # Public TrOCR baseline
    "processor_name": "microsoft/trocr-base-printed",
    "framework": "pytorch",
    "input_size": (384, 384),
    "max_position_embeddings": 1024,
    "checkpoint_dir": MODELS_DIR / "ocr_model",
}

PARSER_MODEL_CONFIG = {
    "model_name": "bert-base-multilingual-cased",  # For item NER
    "framework": "tensorflow",
    "max_seq_length": 512,
    "num_labels": 7,  # [O, ITEM_NAME, ITEM_PRICE, QUANTITY, SUBTOTAL, TAX, TOTAL]
    "checkpoint_dir": MODELS_DIR / "parser_model",
}

# Training hyperparameters
OCR_TRAINING_CONFIG = {
    "learning_rate": 2e-4,
    "batch_size": 4,
    "num_epochs": 10,
    "warmup_steps": 500,
    "weight_decay": 0.0,
    "patience": 3,
    "device": "cuda",  # Set to "cpu" if no GPU available
}

PARSER_TRAINING_CONFIG = {
    "learning_rate": 2e-5,
    "batch_size": 8,
    "num_epochs": 15,
    "warmup_steps": 1000,
    "weight_decay": 0.01,
    "patience": 5,
    "device": "cuda",  # Set to "cpu" if no GPU available
}

# Dataset configurations
DATASETS_CONFIG = {
    "sroie": {
        "name": "SROIE (Scanned Receipts OCR & Info Extraction)",
        "url": "https://huggingface.co/datasets/priyank-m/SROIE_2019_text_recognition",
        "download_urls": [
            "https://github.com/zhouyuangan/crnn_ctc_ocr/releases/download/SROIE/SROIE_Dataset.zip"
        ],
        "hf_datasets": [
            "priyank-m/SROIE_2019_text_recognition",
            "darentang/sroie",
            "rajistics/sroie",
        ],
        "path": DATASETS_DIR / "sroie",
        "size": "~500MB",
    },
    "cord": {
        "name": "CORD (Consolidated Receipt Dataset)",
        "url": "https://huggingface.co/datasets/mychen76/receipt_cord_ocr_v2",
        "hf_datasets": [
            "mychen76/receipt_cord_ocr_v2",
            "SvetaLana25/dek-receipt-cord",
            "SvetaLana25/dek-receipt-cord-parquet",
        ],
        "path": DATASETS_DIR / "cord",
        "size": "~300MB",
    },
    "rvl_cdip": {
        "name": "RVL-CDIP (Document Classification)",
        "url": "https://www.cs.cmu.edu/~aharley/RVL-CDIP.html",
        "path": DATASETS_DIR / "rvl_cdip",
        "size": "~1.6GB",
    },
    "user_collected": {
        "name": "User Collected Receipts",
        "path": DATASETS_DIR / "user_collected",
        "requires_manual_upload": True,
    },
}
