"""
Setup script for Phase 2 ML Training.
Run this to prepare datasets and train models.
"""

import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.datasets import DatasetManager


def main():
    print("\n" + "="*70)
    print("TRIP EXPENSE MANAGER - PHASE 2: ML TRAINING SETUP")
    print("="*70)

    print("\n[STEP 1] Preparing datasets...")
    print("-" * 70)
    datasets = DatasetManager.prepare_all_datasets()

    print("\n[STEP 2] Ready to train models")
    print("-" * 70)
    print(
        """
To start training, run:

  Option A: Train all models at once
  $ python -m app.training

  Option B: Train individual models
  $ python -m app.training ocr
  $ python -m app.training parser

  Option C: Interactive training
  (Coming in Phase 2.1 with progress UI)
"""
    )

    print("\n📊 Dataset Summary:")
    print("-" * 70)
    for name, path in datasets.items():
        if path:
            size = sum(f.stat().st_size for f in Path(path).rglob('*') if f.is_file()) / (1024**2)
            print(f"  ✓ {name:20s} → {path}")
            print(f"    Size: {size:.2f} MB")
        else:
            print(f"  ⚠ {name:20s} → Not available (manual download required)")

    print("\n" + "="*70)
    print("✓ Setup complete! Ready for Phase 2 training")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
