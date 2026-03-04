import torch
from transformers import AutoTokenizer, AutoModelForTokenClassification
from typing import Optional, List, Tuple
from pathlib import Path

from app.config import PARSER_MODEL_CONFIG


class ItemParserModel:
    """BERT-based Item NER Model (PyTorch backend fallback)."""

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
        if device == "cuda" and not torch.cuda.is_available():
            print("⚠ CUDA not available, falling back to CPU for parser model")
            self.device = "cpu"
        else:
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
        self.model = AutoModelForTokenClassification.from_pretrained(
            PARSER_MODEL_CONFIG["model_name"],
            num_labels=PARSER_MODEL_CONFIG["num_labels"],
        ).to(self.device)
        print("✓ BERT model loaded")

    def load_checkpoint(self, checkpoint_path: Path):
        """Load fine-tuned model from checkpoint."""
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        print(f"Loading checkpoint from {checkpoint_path}...")
        self.tokenizer = AutoTokenizer.from_pretrained(checkpoint_path)
        self.model = AutoModelForTokenClassification.from_pretrained(
            checkpoint_path
        ).to(self.device)
        print("✓ Model loaded from checkpoint")

    def predict(self, text: str) -> List[Tuple[str, str]]:
        """Predict item entities from receipt text."""
        if self.model is None:
            self.load_pretrained()

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=self.max_seq_length,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
        predictions = torch.argmax(outputs.logits, dim=-1)

        tokens = self.tokenizer.convert_ids_to_tokens(inputs["input_ids"][0].cpu())
        predicted_labels = [self.LABEL_MAP[int(p.item())] for p in predictions[0].cpu()]

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
