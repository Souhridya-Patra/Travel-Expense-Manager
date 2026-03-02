import numpy as np
import tensorflow as tf
from transformers import AutoTokenizer, TFAutoModelForTokenClassification
from typing import Optional, List, Tuple
from pathlib import Path

from app.config import PARSER_MODEL_CONFIG


class ItemParserModel:
    """BERT-based Item NER Model (TensorFlow)."""

    # NER label mapping
    LABEL_MAP = {
        0: "O",  # Outside
        1: "B-ITEM",  # Begin Item
        2: "I-ITEM",  # Inside Item
        3: "B-PRICE",  # Begin Price
        4: "I-PRICE",  # Inside Price
        5: "B-QTY",  # Begin Quantity
        6: "I-QTY",  # Inside Quantity
    }

    LABEL_TO_ID = {v: k for k, v in LABEL_MAP.items()}

    def __init__(self, model_dir: Optional[Path] = None, device: str = "cuda"):
        self.device = device
        self.model_dir = model_dir or PARSER_MODEL_CONFIG["checkpoint_dir"]
        self.model = None
        self.tokenizer = None
        self.max_seq_length = PARSER_MODEL_CONFIG["max_seq_length"]

    def load_pretrained(self):
        """Load pre-trained BERT model for token classification."""
        print(f"Loading BERT from {PARSER_MODEL_CONFIG['model_name']}...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            PARSER_MODEL_CONFIG["model_name"]
        )
        self.model = TFAutoModelForTokenClassification.from_pretrained(
            PARSER_MODEL_CONFIG["model_name"],
            num_labels=PARSER_MODEL_CONFIG["num_labels"],
        )
        print("✓ BERT model loaded")

    def load_checkpoint(self, checkpoint_path: Path):
        """Load fine-tuned model from checkpoint."""
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        print(f"Loading checkpoint from {checkpoint_path}...")
        self.tokenizer = AutoTokenizer.from_pretrained(checkpoint_path)
        self.model = TFAutoModelForTokenClassification.from_pretrained(checkpoint_path)
        print("✓ Model loaded from checkpoint")

    def predict(self, text: str) -> List[Tuple[str, str]]:
        """Predict item entities from receipt text."""
        if self.model is None:
            self.load_pretrained()

        inputs = self.tokenizer(
            text,
            return_tensors="tf",
            truncation=True,
            max_length=self.max_seq_length,
        )

        outputs = self.model(**inputs)
        predictions = tf.argmax(outputs.logits, axis=-1)

        tokens = self.tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])
        predicted_labels = [self.LABEL_MAP[p.numpy()] for p in predictions[0]]

        entities = []
        current_entity = {"label": None, "tokens": []}

        for token, label in zip(tokens, predicted_labels):
            if token in ["[CLS]", "[SEP]", "[PAD]"]:
                continue

            if label == "O":
                if current_entity["tokens"]:
                    text = self.tokenizer.convert_tokens_to_string(
                        current_entity["tokens"]
                    )
                    entities.append((current_entity["label"], text))
                    current_entity = {"label": None, "tokens": []}
            else:
                if label != current_entity["label"]:
                    if current_entity["tokens"]:
                        text = self.tokenizer.convert_tokens_to_string(
                            current_entity["tokens"]
                        )
                        entities.append((current_entity["label"], text))
                    current_entity = {"label": label.split("-")[1], "tokens": [token]}
                else:
                    current_entity["tokens"].append(token)

        if current_entity["tokens"]:
            text = self.tokenizer.convert_tokens_to_string(current_entity["tokens"])
            entities.append((current_entity["label"], text))

        return entities

    def save_checkpoint(self, checkpoint_path: Path):
        """Save fine-tuned model."""
        checkpoint_path.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(checkpoint_path)
        self.tokenizer.save_pretrained(checkpoint_path)
        print(f"✓ Model saved to {checkpoint_path}")
