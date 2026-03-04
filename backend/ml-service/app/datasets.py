import os
import json
from pathlib import Path
from typing import Optional
import requests
import zipfile
import shutil
from tqdm import tqdm

from app.config import DATASETS_DIR, DATASETS_CONFIG


class DatasetManager:
    """Manages dataset downloads, organization, and validation."""

    @staticmethod
    def save_hf_source_metadata(dataset_path: Path, dataset_id: str) -> None:
        """Store local metadata that points to the Hugging Face dataset source."""
        dataset_path.mkdir(parents=True, exist_ok=True)
        metadata_path = dataset_path / "hf_source.json"
        metadata = {"source": "huggingface", "dataset_id": dataset_id}
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    @staticmethod
    def download_file(url: str, dest_path: Path, chunk_size: int = 8192) -> None:
        """Download file with progress bar."""
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        total_size = int(response.headers.get("content-length", 0))

        with open(dest_path, "wb") as f:
            with tqdm(
                total=total_size, unit="B", unit_scale=True, desc=dest_path.name
            ) as pbar:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    f.write(chunk)
                    pbar.update(len(chunk))

    @staticmethod
    def is_valid_zip(zip_path: Path) -> bool:
        """Check whether file is a valid zip archive."""
        return zip_path.exists() and zip_path.stat().st_size > 0 and zipfile.is_zipfile(
            zip_path
        )

    @staticmethod
    def extract_zip(zip_path: Path, extract_to: Path) -> None:
        """Extract zip file with progress."""
        extract_to.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            for member in tqdm(
                zip_ref.namelist(), desc=f"Extracting {zip_path.name}"
            ):
                zip_ref.extract(member, extract_to)

    @staticmethod
    def setup_sroie() -> Path:
        """Download and setup SROIE dataset."""
        config = DATASETS_CONFIG["sroie"]
        dataset_path = config["path"]

        if dataset_path.exists() and (
            (dataset_path / "box").exists()
            or (dataset_path / "dataset_info.json").exists()
            or (dataset_path / "hf_source.json").exists()
        ):
            print(f"[OK] SROIE dataset already exists at {dataset_path}")
            return dataset_path

        print("Downloading SROIE dataset...")
        zip_path = DATASETS_DIR / "sroie.zip"

        # Try primary URL and then optional env override URL.
        candidate_urls = list(config.get("download_urls", []))
        env_url = os.environ.get("SROIE_DATASET_URL")
        if env_url:
            candidate_urls.append(env_url)

        downloaded = False
        for candidate_url in candidate_urls:
            try:
                print(f"  → Trying: {candidate_url}")
                DatasetManager.download_file(candidate_url, zip_path)
                if DatasetManager.is_valid_zip(zip_path):
                    downloaded = True
                    break
                print("  [WARN] Downloaded file is not a valid ZIP. Retrying with next URL...")
            except Exception as exc:
                print(f"  [WARN] Failed to download from URL: {exc}")

        if downloaded:
            # Clean up partial extraction from previous failed runs
            if dataset_path.exists() and not (dataset_path / "box").exists():
                shutil.rmtree(dataset_path, ignore_errors=True)

            DatasetManager.extract_zip(zip_path, dataset_path)
            print("✓ SROIE dataset ready")
            return dataset_path

        if zip_path.exists():
            zip_path.unlink(missing_ok=True)

        print("[WARN] ZIP download failed, trying Hugging Face mirrors for SROIE...")
        hf_datasets = config.get("hf_datasets", [])
        if hf_datasets:
            try:
                from datasets import load_dataset

                for dataset_id in hf_datasets:
                    try:
                        print(f"  → Trying HF dataset: {dataset_id}")
                        load_dataset(
                            dataset_id,
                            split="train",
                            cache_dir=str(DATASETS_DIR / ".hf_cache"),
                        )
                        if dataset_path.exists() and not (dataset_path / "box").exists():
                            shutil.rmtree(dataset_path, ignore_errors=True)
                        DatasetManager.save_hf_source_metadata(dataset_path, dataset_id)
                        print(f"[OK] SROIE dataset ready from Hugging Face ({dataset_id})")
                        return dataset_path
                    except Exception as hf_exc:
                        print(f"  [WARN] HF dataset unavailable: {hf_exc}")
            except Exception as import_exc:
                print(f"  [WARN] Could not use Hugging Face datasets loader: {import_exc}")

        print("[WARN] Could not automatically download SROIE dataset.")
        print("  You can manually download and extract into:")
        print(f"  {dataset_path}")
        print("  Then rerun setup_phase2.py")
        return None

    @staticmethod
    def setup_cord() -> Path:
        """Download and setup CORD dataset from Hugging Face."""
        config = DATASETS_CONFIG["cord"]
        dataset_path = config["path"]

        if dataset_path.exists() and (
            len(list(dataset_path.glob("*.parquet"))) > 0
            or (dataset_path / "dataset_info.json").exists()
            or (dataset_path / "hf_source.json").exists()
        ):
            print(f"[OK] CORD dataset already exists at {dataset_path}")
            return dataset_path

        print("Setting up CORD dataset from Hugging Face...")
        try:
            from datasets import load_dataset

            for dataset_id in config.get("hf_datasets", []):
                try:
                    print(f"  → Trying HF dataset: {dataset_id}")
                    load_dataset(
                        dataset_id,
                        split="train",
                        cache_dir=str(DATASETS_DIR / ".hf_cache"),
                    )
                    if dataset_path.exists():
                        shutil.rmtree(dataset_path, ignore_errors=True)
                    DatasetManager.save_hf_source_metadata(dataset_path, dataset_id)
                    print(f"[OK] CORD dataset ready ({dataset_id})")
                    return dataset_path
                except Exception as e:
                    print(f"  [WARN] Could not load {dataset_id}: {e}")

            print("[WARN] Could not load any configured CORD dataset mirrors")
            print(f"  Try manual source: {config.get('url')}")
            return None
        except Exception as e:
            print(f"[WARN] Could not download CORD: {e}")
            print(f"  Download manually from: {config.get('url')}")
            return None

    @staticmethod
    def setup_rvl_cdip() -> Optional[Path]:
        """Setup RVL-CDIP dataset (requires manual download from CMU)."""
        config = DATASETS_CONFIG["rvl_cdip"]
        dataset_path = config["path"]

        if dataset_path.exists() and len(list(dataset_path.glob("*"))) > 0:
            print(f"✓ RVL-CDIP dataset already exists at {dataset_path}")
            return dataset_path

        print("[WARN] RVL-CDIP requires manual download")
        print("  1. Visit: https://www.cs.cmu.edu/~aharley/RVL-CDIP.html")
        print("  2. Download and extract to:", dataset_path)
        return None

    @staticmethod
    def setup_user_collected() -> Path:
        """Setup user collected dataset directory."""
        config = DATASETS_CONFIG["user_collected"]
        dataset_path = config["path"]
        dataset_path.mkdir(parents=True, exist_ok=True)

        # Create structure for user to add labeled data
        (dataset_path / "images").mkdir(exist_ok=True)
        (dataset_path / "labels").mkdir(exist_ok=True)

        readme = dataset_path / "README.md"
        if not readme.exists():
            readme.write_text(
                """# User Collected Receipts

## Structure
- `images/`: Original receipt images
- `labels/`: Corresponding JSON labels

## Label Format (for OCR)
```json
{
  "image": "receipt_001.jpg",
  "text": "Complete OCR text from receipt"
}
```

## Label Format (for Item Parser)
```json
{
  "image": "receipt_001.jpg",
  "items": [
    {"name": "Item Name", "amount": 10.50, "quantity": 1},
    {"name": "Item Name 2", "amount": 20.00, "quantity": 1}
  ],
  "total": 30.50
}
```
"""
            )

        print(f"[OK] User collected dataset directory ready at {dataset_path}")
        return dataset_path

    @staticmethod
    def prepare_all_datasets() -> dict:
        """Prepare all available datasets."""
        print("\n[INFO] Preparing datasets...\n")

        datasets = {}
        datasets["sroie"] = DatasetManager.setup_sroie()
        datasets["cord"] = DatasetManager.setup_cord()
        datasets["rvl_cdip"] = DatasetManager.setup_rvl_cdip()
        datasets["user_collected"] = DatasetManager.setup_user_collected()

        print("\n[OK] Dataset preparation complete\n")
        return datasets


if __name__ == "__main__":
    DatasetManager.prepare_all_datasets()
