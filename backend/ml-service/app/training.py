"""
Training scripts for OCR and Item Parser models.
Run individually or use orchestrator.
"""

import argparse
import json
import random
import re
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any

import torch
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
from datasets import load_dataset
from PIL import Image
from transformers import AutoTokenizer

from app.config import (
    OCR_MODEL_CONFIG,
    PARSER_MODEL_CONFIG,
    OCR_TRAINING_CONFIG,
    PARSER_TRAINING_CONFIG,
    DATA_DIR,
)
from app.models.ocr_pytorch import OCRModel


class OCRHFTextDataset(Dataset):
    def __init__(self, records: List[Dict]):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        return self.records[idx]


class ParserTokenDataset(Dataset):
    def __init__(self, records: List[Dict]):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        item = self.records[idx]
        return {
            "input_ids": torch.tensor(item["input_ids"], dtype=torch.long),
            "attention_mask": torch.tensor(item["attention_mask"], dtype=torch.long),
            "labels": torch.tensor(item["labels"], dtype=torch.long),
        }


def _feedback_entry_to_parser_record(entry: Dict[str, Any]) -> Optional[Tuple[str, List[Tuple[str, str]]]]:
    corrected = entry.get("corrected_parse") or {}
    if not isinstance(corrected, dict):
        return None

    entities: List[Tuple[str, str]] = []
    tokens: List[str] = []

    items = corrected.get("items")
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue

            name = str(item.get("name", "")).strip()
            if name:
                entities.append(("ITEM", name))
                tokens.append(name)

            amount = item.get("amount")
            if amount is not None:
                price = str(amount).replace("$", "").strip()
                if price:
                    entities.append(("PRICE", price))
                    tokens.append(price)

    total = corrected.get("total")
    if total is not None:
        total_str = str(total).replace("$", "").strip()
        if total_str:
            entities.append(("PRICE", total_str))
            tokens.append(total_str)

    if not entities:
        return None

    training_text = " ".join(tokens)
    if len(training_text) < 3:
        return None

    return training_text, entities


def load_feedback_parser_records(feedback_path: Path, max_samples: int = 256) -> List[Tuple[str, List[Tuple[str, str]]]]:
    records: List[Tuple[str, List[Tuple[str, str]]]] = []
    if not feedback_path.exists():
        return records

    with feedback_path.open("r", encoding="utf-8") as feedback_file:
        for raw_line in feedback_file:
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except Exception:
                continue

            parsed = _feedback_entry_to_parser_record(payload)
            if parsed is not None:
                records.append(parsed)

            if len(records) >= max_samples:
                break

    return records


def _normalize_label_name(label: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(label).lower())


def _clean_number_text(value: str) -> str:
    text = str(value).strip()
    text = text.replace(",", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    return text


def _label_studio_task_to_parser_record(task: Dict[str, Any]) -> Optional[Tuple[str, List[Tuple[str, str]]]]:
    annotations = task.get("annotations")
    if not isinstance(annotations, list) or not annotations:
        return None

    first_annotation = annotations[0]
    results = first_annotation.get("result")
    if not isinstance(results, list) or not results:
        return None

    id_to_text: Dict[str, str] = {}
    id_to_label: Dict[str, str] = {}
    relations: List[Tuple[str, str]] = []

    for entry in results:
        if not isinstance(entry, dict):
            continue
        entry_type = entry.get("type")
        entry_id = str(entry.get("id", ""))
        value = entry.get("value") or {}

        if entry_type == "textarea" and entry_id:
            text_values = value.get("text")
            if isinstance(text_values, list) and text_values:
                text = str(text_values[0]).strip()
                if text:
                    id_to_text[entry_id] = text

        if entry_type == "labels" and entry_id:
            labels = value.get("labels")
            if isinstance(labels, list) and labels:
                id_to_label[entry_id] = _normalize_label_name(labels[0])

        if entry_type == "relation":
            from_id = str(entry.get("from_id", ""))
            to_id = str(entry.get("to_id", ""))
            if from_id and to_id:
                relations.append((from_id, to_id))

    item_ids = [k for k, v in id_to_label.items() if v in {"itemname", "item", "description"}]
    price_ids = [k for k, v in id_to_label.items() if v in {"price", "priceofitems", "itemprice", "amount"}]
    total_ids = [k for k, v in id_to_label.items() if v in {"total", "totalamount", "grandtotal"}]

    linked_item_to_price: Dict[str, str] = {}
    for src, dst in relations:
        if src in item_ids and dst in price_ids:
            linked_item_to_price[src] = dst
        elif dst in item_ids and src in price_ids:
            linked_item_to_price[dst] = src

    entities: List[Tuple[str, str]] = []
    tokens: List[str] = []

    used_price_ids = set()
    for item_id in item_ids:
        item_text = id_to_text.get(item_id, "").strip()
        if not item_text:
            continue

        entities.append(("ITEM", item_text))
        tokens.append(item_text)

        price_id = linked_item_to_price.get(item_id)
        if price_id:
            price_text = _clean_number_text(id_to_text.get(price_id, ""))
            if price_text:
                entities.append(("PRICE", price_text))
                tokens.append(price_text)
                used_price_ids.add(price_id)

    for price_id in price_ids:
        if price_id in used_price_ids:
            continue
        price_text = _clean_number_text(id_to_text.get(price_id, ""))
        if price_text:
            entities.append(("PRICE", price_text))
            tokens.append(price_text)

    for total_id in total_ids:
        total_text = _clean_number_text(id_to_text.get(total_id, ""))
        if total_text:
            entities.append(("PRICE", total_text))
            tokens.append(total_text)

    if not entities:
        return None

    sentence = " ".join(tokens).strip()
    if len(sentence) < 3:
        return None

    return sentence, entities


def load_user_collected_parser_records(
    labels_dir: Path,
    max_samples: int = 256,
) -> List[Tuple[str, List[Tuple[str, str]]]]:
    records: List[Tuple[str, List[Tuple[str, str]]]] = []
    if not labels_dir.exists():
        return records

    json_files = sorted(labels_dir.glob("*.json"))
    for label_file in json_files:
        try:
            payload = json.loads(label_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        # Support both raw Label Studio task JSON and already-converted compact JSON.
        parsed: Optional[Tuple[str, List[Tuple[str, str]]]] = None
        if isinstance(payload, dict) and isinstance(payload.get("annotations"), list):
            parsed = _label_studio_task_to_parser_record(payload)
        elif isinstance(payload, dict):
            items = payload.get("items")
            total = payload.get("total")
            entities: List[Tuple[str, str]] = []
            tokens: List[str] = []

            if isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name", "")).strip()
                    if name:
                        entities.append(("ITEM", name))
                        tokens.append(name)
                    amount = item.get("amount")
                    if amount is not None:
                        amount_text = _clean_number_text(str(amount))
                        if amount_text:
                            entities.append(("PRICE", amount_text))
                            tokens.append(amount_text)

            if total is not None:
                total_text = _clean_number_text(str(total))
                if total_text:
                    entities.append(("PRICE", total_text))
                    tokens.append(total_text)

            sentence = " ".join(tokens).strip()
            if entities and len(sentence) >= 3:
                parsed = (sentence, entities)

        if parsed is not None:
            records.append(parsed)
        if len(records) >= max_samples:
            break

    return records


class OCRTrainingPipeline:
    """Training pipeline for TrOCR receipt OCR model."""

    def __init__(self, config: dict, device: Optional[str] = None):
        resolved_device = device or config.get("device", "cuda")
        if resolved_device == "cuda" and not torch.cuda.is_available():
            resolved_device = "cpu"
        self.config = config
        self.device = resolved_device
        self.model = OCRModel(device=resolved_device)

    def prepare_data(self, dataset_paths: dict, max_samples: int = 128) -> tuple:
        """Prepare training and validation data from datasets."""
        print("Preparing OCR training data...")

        sroie_path = Path(dataset_paths.get("sroie")) if dataset_paths.get("sroie") else None
        records: List[Dict] = []

        if sroie_path and (sroie_path / "hf_source.json").exists():
            metadata = json.loads((sroie_path / "hf_source.json").read_text(encoding="utf-8"))
            dataset_id = metadata.get("dataset_id")
            if dataset_id:
                ds = load_dataset(dataset_id, split=f"train[:{max_samples}]")
                for sample in ds:
                    image = sample.get("image")
                    text = (sample.get("text") or "").strip()
                    if image is None or not text:
                        continue
                    if isinstance(image, Image.Image):
                        pil_image = image.convert("RGB")
                    else:
                        pil_image = Image.open(image).convert("RGB")
                    records.append({"image": pil_image, "text": text})

        if len(records) < 8:
            raise RuntimeError(
                "Not enough OCR training data. Run setup_phase2.py and verify SROIE is available."
            )

        random.shuffle(records)
        split_idx = max(1, int(0.8 * len(records)))
        train_records = records[:split_idx]
        val_records = records[split_idx:]
        if not val_records:
            val_records = train_records[:1]

        print(f"  OCR records loaded: train={len(train_records)}, val={len(val_records)}")

        train_dataset = OCRHFTextDataset(train_records)
        val_dataset = OCRHFTextDataset(val_records)

        def collate_fn(batch: List[Dict]):
            images = [item["image"] for item in batch]
            texts = [item["text"] for item in batch]
            pixel_values = self.model.processor(images=images, return_tensors="pt").pixel_values
            labels = self.model.processor.tokenizer(
                texts,
                padding="max_length",
                truncation=True,
                max_length=128,
                return_tensors="pt",
            ).input_ids
            labels[labels == self.model.processor.tokenizer.pad_token_id] = -100
            return {
                "pixel_values": pixel_values,
                "labels": labels,
            }

        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config["batch_size"],
            shuffle=True,
            collate_fn=collate_fn,
        )
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config["batch_size"],
            shuffle=False,
            collate_fn=collate_fn,
        )

        return train_loader, val_loader

    def train(self, train_loader, val_loader, num_epochs: int = 10):
        """Train OCR model on receipt dataset."""
        self.model.load_pretrained()
        self.model.model.train()

        optimizer = AdamW(
            self.model.model.parameters(), lr=self.config["learning_rate"]
        )
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, num_epochs)

        best_val_loss = float("inf")
        patience_counter = 0

        for epoch in range(num_epochs):
            print(f"\nEpoch {epoch+1}/{num_epochs}")

            # Training loop
            self.model.model.train()
            train_loss = 0
            for batch_idx, batch in enumerate(train_loader):
                pixel_values = batch["pixel_values"].to(self.device)
                labels = batch["labels"].to(self.device)

                optimizer.zero_grad()
                outputs = self.model.model(pixel_values=pixel_values, labels=labels)
                loss = outputs.loss
                loss.backward()
                optimizer.step()
                train_loss += loss.item()

                if batch_idx % 10 == 0:
                    print(f"  Batch {batch_idx}: Loss = {train_loss / (batch_idx+1):.4f}")

            # Validation loop
            self.model.model.eval()
            val_loss = 0
            with torch.no_grad():
                for batch in val_loader:
                    pixel_values = batch["pixel_values"].to(self.device)
                    labels = batch["labels"].to(self.device)
                    outputs = self.model.model(pixel_values=pixel_values, labels=labels)
                    val_loss += outputs.loss.item()

            scheduler.step()
            avg_val_loss = val_loss / max(1, len(val_loader))

            print(f"  Validation Loss: {avg_val_loss:.4f}")

            # Early stopping
            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                patience_counter = 0
                try:
                    self.model.save_checkpoint(OCR_MODEL_CONFIG["checkpoint_dir"])
                except Exception as checkpoint_error:
                    print(f"⚠ Could not save OCR checkpoint: {checkpoint_error}")
                    print("  Training completed, but checkpoint write was skipped.")
            else:
                patience_counter += 1
                if patience_counter >= self.config["patience"]:
                    print(f"Early stopping at epoch {epoch+1}")
                    break

        print("✓ OCR training complete")


class ItemParserTrainingPipeline:
    """Training pipeline for BERT-based item NER model."""

    def __init__(self, config: dict, device: Optional[str] = None):
        from app.models.parser_tensorflow import ItemParserModel

        resolved_device = device or config.get("device", "cuda")
        if resolved_device == "cuda" and not torch.cuda.is_available():
            resolved_device = "cpu"
        self.config = config
        self.device = resolved_device
        self.model = ItemParserModel(device=resolved_device)
        self.item_parser_model_class = ItemParserModel

    @staticmethod
    def _extract_entities(annotation_str: str) -> List[Tuple[str, str]]:
        entities: List[Tuple[str, str]] = []
        try:
            payload = json.loads(annotation_str)
        except Exception:
            return entities

        text_blob = json.dumps(payload)
        for match in re.findall(r'"description"\s*:\s*"([^"]+)"', text_blob, flags=re.IGNORECASE):
            value = match.strip()
            if value:
                entities.append(("ITEM", value))
        for match in re.findall(r'"(amount|price|unitprice|total)"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?', text_blob, flags=re.IGNORECASE):
            value = match[1].strip()
            if value:
                entities.append(("PRICE", value))
        return entities

    def _weakly_label(self, text: str, entities: List[Tuple[str, str]]) -> Tuple[List[int], List[int], List[int]]:
        tokenizer = self.model.tokenizer
        encoding = tokenizer(
            text,
            truncation=True,
            max_length=self.model.max_seq_length,
            return_offsets_mapping=True,
            add_special_tokens=True,
        )
        input_ids = encoding["input_ids"]
        offsets = encoding["offset_mapping"]

        labels = [self.item_parser_model_class.LABEL_TO_ID["O"]] * len(input_ids)

        spans: List[Tuple[str, int, int]] = []
        lower_text = text.lower()
        for tag, value in entities:
            start = lower_text.find(value.lower())
            if start >= 0:
                spans.append((tag, start, start + len(value)))

        for idx, (start_off, end_off) in enumerate(offsets):
            if start_off == end_off:
                continue
            for tag, span_start, span_end in spans:
                overlap = not (end_off <= span_start or start_off >= span_end)
                if not overlap:
                    continue
                if tag == "ITEM":
                    labels[idx] = (
                        self.item_parser_model_class.LABEL_TO_ID["B-ITEM"]
                        if start_off == span_start
                        else self.item_parser_model_class.LABEL_TO_ID["I-ITEM"]
                    )
                elif tag == "PRICE":
                    labels[idx] = (
                        self.item_parser_model_class.LABEL_TO_ID["B-PRICE"]
                        if start_off == span_start
                        else self.item_parser_model_class.LABEL_TO_ID["I-PRICE"]
                    )

        labels = labels[: self.model.max_seq_length]
        input_ids = input_ids[: self.model.max_seq_length]
        attention_mask = [1] * len(input_ids)

        pad_id = tokenizer.pad_token_id
        while len(input_ids) < self.model.max_seq_length:
            input_ids.append(pad_id)
            attention_mask.append(0)
            labels.append(self.item_parser_model_class.LABEL_TO_ID["O"])

        return input_ids, attention_mask, labels

    def _build_dataloaders(self, records: List[Tuple[str, List[Tuple[str, str]]]]) -> tuple:
        random.shuffle(records)
        split_idx = max(1, int(0.8 * len(records)))
        train_records = records[:split_idx]
        val_records = records[split_idx:]
        if not val_records:
            val_records = train_records[:1]

        def build_rows(rows):
            built = []
            for text, entities in rows:
                ids, mask, token_labels = self._weakly_label(text, entities)
                built.append(
                    {
                        "input_ids": ids,
                        "attention_mask": mask,
                        "labels": token_labels,
                    }
                )
            return built

        train_dataset = ParserTokenDataset(build_rows(train_records))
        val_dataset = ParserTokenDataset(build_rows(val_records))

        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config["batch_size"],
            shuffle=True,
        )
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config["batch_size"],
            shuffle=False,
        )
        print(f"  Parser records loaded: train={len(train_records)}, val={len(val_records)}")
        return train_loader, val_loader

    def prepare_data(self, dataset_paths: dict, max_samples: int = 128) -> tuple:
        """Prepare training and validation data for NER."""
        print("Preparing Item Parser training data...")

        if self.model.tokenizer is None:
            self.model.tokenizer = AutoTokenizer.from_pretrained(
                PARSER_MODEL_CONFIG["model_name"]
            )

        cord_path = Path(dataset_paths.get("cord")) if dataset_paths.get("cord") else None
        user_collected_path = (
            Path(dataset_paths.get("user_collected")) if dataset_paths.get("user_collected") else None
        )
        records: List[Tuple[str, List[Tuple[str, str]]]] = []

        user_record_count = 0
        if user_collected_path:
            user_labels_dir = user_collected_path / "labels"
            user_records = load_user_collected_parser_records(user_labels_dir, max_samples=max_samples)
            if user_records:
                records.extend(user_records)
                user_record_count = len(user_records)
                print(f"  Loaded user_collected parser records: {user_record_count}")

        remaining_samples = max(0, max_samples - len(records))

        cord_record_count = 0
        if remaining_samples > 0 and cord_path and (cord_path / "hf_source.json").exists():
            metadata = json.loads((cord_path / "hf_source.json").read_text(encoding="utf-8"))
            dataset_id = metadata.get("dataset_id")
            if dataset_id:
                ds = load_dataset(dataset_id, split=f"train[:{remaining_samples}]")
                for sample in ds:
                    annotation = sample.get("annotation")
                    if not annotation:
                        continue
                    entities = self._extract_entities(annotation)
                    if not entities:
                        continue
                    sentence = " ".join(value for _, value in entities[:8])
                    if len(sentence) < 4:
                        continue
                    records.append((sentence, entities))
                    cord_record_count += 1

        if cord_record_count:
            print(f"  Loaded CORD parser records: {cord_record_count}")
        if not user_record_count:
            print("  No valid user_collected labels found; using available public dataset samples.")

        if len(records) < 8:
            records.extend(
                [
                    ("Coffee 4.50 Bread 3.20 Total 7.70", [("ITEM", "Coffee"), ("PRICE", "4.50"), ("ITEM", "Bread"), ("PRICE", "3.20"), ("PRICE", "7.70")]),
                    ("Milk 2.99 Eggs 5.50 Total 8.49", [("ITEM", "Milk"), ("PRICE", "2.99"), ("ITEM", "Eggs"), ("PRICE", "5.50"), ("PRICE", "8.49")]),
                    ("Burger 12.00 Fries 4.00 Tax 1.60 Total 17.60", [("ITEM", "Burger"), ("PRICE", "12.00"), ("ITEM", "Fries"), ("PRICE", "4.00"), ("PRICE", "17.60")]),
                ]
            )

        return self._build_dataloaders(records)

    def prepare_feedback_data(self, feedback_path: Path, max_samples: int = 256) -> tuple:
        """Prepare parser retraining data from user feedback.jsonl."""
        print(f"Preparing feedback retraining data from {feedback_path}...")

        if self.model.tokenizer is None:
            self.model.tokenizer = AutoTokenizer.from_pretrained(
                PARSER_MODEL_CONFIG["model_name"]
            )

        records = load_feedback_parser_records(feedback_path, max_samples=max_samples)
        if len(records) < 2:
            raise RuntimeError(
                "Not enough valid feedback records for retraining. Need at least 2 corrected entries."
            )

        return self._build_dataloaders(records)

    def train(self, train_loader, val_loader, num_epochs: int = 15):
        """Train item parser model."""
        self.model.load_pretrained()
        self.model.model.train()
        optimizer = AdamW(self.model.model.parameters(), lr=self.config["learning_rate"])

        best_val_loss = float("inf")
        patience_counter = 0

        for epoch in range(num_epochs):
            print(f"\nEpoch {epoch+1}/{num_epochs}")

            train_loss_sum = 0.0
            for batch in train_loader:
                input_ids = batch["input_ids"].to(self.device)
                attention_mask = batch["attention_mask"].to(self.device)
                labels = batch["labels"].to(self.device)

                optimizer.zero_grad()
                outputs = self.model.model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels,
                )
                loss = outputs.loss
                loss.backward()
                optimizer.step()
                train_loss_sum += loss.item()

            train_loss = train_loss_sum / max(1, len(train_loader))

            self.model.model.eval()
            val_loss_sum = 0.0
            with torch.no_grad():
                for batch in val_loader:
                    input_ids = batch["input_ids"].to(self.device)
                    attention_mask = batch["attention_mask"].to(self.device)
                    labels = batch["labels"].to(self.device)
                    outputs = self.model.model(
                        input_ids=input_ids,
                        attention_mask=attention_mask,
                        labels=labels,
                    )
                    val_loss_sum += outputs.loss.item()
            val_loss = val_loss_sum / max(1, len(val_loader))
            self.model.model.train()

            print(f"  Training Loss: {train_loss:.4f}")
            print(f"  Validation Loss: {val_loss:.4f}")

            # Early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                try:
                    self.model.save_checkpoint(PARSER_MODEL_CONFIG["checkpoint_dir"])
                except Exception as checkpoint_error:
                    print(f"⚠ Could not save parser checkpoint: {checkpoint_error}")
                    print("  Training completed, but checkpoint write was skipped.")
            else:
                patience_counter += 1
                if patience_counter >= self.config["patience"]:
                    print(f"Early stopping at epoch {epoch+1}")
                    break

        print("✓ Item Parser training complete")


def train_all_models(dataset_paths: dict):
    """Train all models sequentially."""
    print("\n" + "="*60)
    print("Starting ML Model Training Pipeline")
    print("="*60)

    # Train OCR model
    print("\n[1/2] Training OCR Model...")
    ocr_pipeline = OCRTrainingPipeline(config=OCR_TRAINING_CONFIG)
    train_loader, val_loader = ocr_pipeline.prepare_data(dataset_paths, max_samples=128)
    ocr_pipeline.train(train_loader, val_loader, num_epochs=2)

    # Train Item Parser model
    print("\n[2/2] Training Item Parser Model...")
    parser_pipeline = ItemParserTrainingPipeline(config=PARSER_TRAINING_CONFIG)
    train_loader, val_loader = parser_pipeline.prepare_data(dataset_paths, max_samples=128)
    parser_pipeline.train(train_loader, val_loader, num_epochs=2)

    print("\n" + "="*60)
    print("✓ All models trained successfully!")
    print("="*60)


def retrain_parser_from_feedback(
    feedback_path: Optional[Path] = None,
    max_samples: int = 256,
    num_epochs: int = 2,
) -> Dict[str, Any]:
    """Incrementally retrain parser model using corrected feedback entries."""
    resolved_feedback_path = feedback_path or (DATA_DIR / "feedback.jsonl")
    records = load_feedback_parser_records(resolved_feedback_path, max_samples=max_samples)

    if len(records) < 2:
        raise RuntimeError(
            f"Not enough valid feedback records in {resolved_feedback_path}. "
            "Need at least 2 corrected entries with items."
        )

    pipeline = ItemParserTrainingPipeline(config=PARSER_TRAINING_CONFIG)
    train_loader, val_loader = pipeline.prepare_feedback_data(
        resolved_feedback_path,
        max_samples=max_samples,
    )
    pipeline.train(train_loader, val_loader, num_epochs=num_epochs)

    return {
        "status": "success",
        "mode": "parser_feedback",
        "feedback_path": str(resolved_feedback_path),
        "records_used": len(records),
        "epochs": num_epochs,
    }


if __name__ == "__main__":
    from app.datasets import DatasetManager

    parser = argparse.ArgumentParser(description="Train OCR and parser baseline models")
    parser.add_argument(
        "mode",
        nargs="?",
        default="all",
        choices=["all", "ocr", "parser", "retrain-parser-feedback"],
        help="Training mode",
    )
    parser.add_argument("--samples", type=int, default=128, help="Max training samples")
    parser.add_argument("--epochs", type=int, default=2, help="Epochs for quick baseline")
    parser.add_argument(
        "--feedback-file",
        type=str,
        default=str(DATA_DIR / "feedback.jsonl"),
        help="Path to feedback JSONL file used for parser feedback retraining",
    )
    args = parser.parse_args()

    if args.mode == "retrain-parser-feedback":
        result = retrain_parser_from_feedback(
            feedback_path=Path(args.feedback_file),
            max_samples=args.samples,
            num_epochs=args.epochs,
        )
        print(json.dumps(result, indent=2))
    else:
        datasets = DatasetManager.prepare_all_datasets()

        if args.mode == "all":
            train_all_models(datasets)
        elif args.mode == "ocr":
            pipeline = OCRTrainingPipeline(config=OCR_TRAINING_CONFIG)
            train_loader, val_loader = pipeline.prepare_data(datasets, max_samples=args.samples)
            pipeline.train(train_loader, val_loader, num_epochs=args.epochs)
        elif args.mode == "parser":
            pipeline = ItemParserTrainingPipeline(config=PARSER_TRAINING_CONFIG)
            train_loader, val_loader = pipeline.prepare_data(datasets, max_samples=args.samples)
            pipeline.train(train_loader, val_loader, num_epochs=args.epochs)
