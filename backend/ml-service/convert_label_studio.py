"""
Convert Label Studio JSON export to training format.

Usage:
    python convert_label_studio.py --input label-studio-export.json --output-dir data/datasets/user_collected
"""

import json
import argparse
from pathlib import Path
from typing import Any, Dict, List


def extract_entities_from_label_studio(label_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract Item Name, Item Price, and Total Amount from Label Studio annotation.
    
    Expects Label Studio result format with regions containing:
    - value.text (the recognized text)
    - value.labels (the label tags like "item_name", "price", "total")
    """
    result = {
        "text": "",
        "items": [],
        "total": None
    }
    
    # Build full text from all regions
    regions = label_config.get("value", {}).get("text", [])
    if isinstance(regions, list):
        full_text_parts = []
        for region in regions:
            if isinstance(region, dict) and "text" in region:
                full_text_parts.append(region["text"])
        result["text"] = "\n".join(full_text_parts)
    
    # Extract entities by label
    label_results = label_config.get("value", {}).get("labels", [])
    if not isinstance(label_results, list):
        label_results = []
    
    items_map = {}  # Map item_name to item data
    
    for label in label_results:
        if not isinstance(label, dict):
            continue
        
        text = label.get("text", "").strip()
        labels = label.get("labels", [])
        
        if not text or not labels:
            continue
        
        if "item_name" in labels:
            # Start or update item entry
            if text not in items_map:
                items_map[text] = {"name": text, "amount": None, "quantity": 1}
        elif "price" in labels or "item_price" in labels:
            # Price of an item - associate with most recent item
            try:
                price = float(text.replace("$", "").replace(",", "").strip())
                # Find the last unnamed item and set its price
                for item in reversed(result["items"]):
                    if "amount" in item and item["amount"] is None:
                        item["amount"] = price
                        break
            except ValueError:
                pass
        elif "total" in labels or "total_amount" in labels:
            # Total amount
            try:
                result["total"] = float(text.replace("$", "").replace(",", "").strip())
            except ValueError:
                pass
    
    # Finalize items list
    result["items"] = list(items_map.values())
    
    return result


def convert_label_studio_export(input_file: str, output_dir: str) -> None:
    """
    Convert Label Studio JSON export to training dataset format.
    
    Assumes input JSON has structure:
    [
      {
        "id": 1,
        "data": {
          "image": "/path/to/image.jpg",
          "text": "... receipt content ..."
        },
        "annotations": [
          {
            "id": "...",
            "completed_by": ...,
            "result": [
              {
                "value": {
                  "text": [...],
                  "labels": [...]
                },
                "type": "textarea"
              }
            ]
          }
        ]
      }
    ]
    """
    input_path = Path(input_file)
    output_path = Path(output_dir)
    
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Create output directories
    images_dir = output_path / "images"
    labels_dir = output_path / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    
    # Load Label Studio export
    with input_path.open("r", encoding="utf-8") as f:
        label_studio_data = json.load(f)
    
    if not isinstance(label_studio_data, list):
        raise ValueError("Expected Label Studio export to be a JSON array")
    
    converted_count = 0
    
    for idx, record in enumerate(label_studio_data, 1):
        if not isinstance(record, dict):
            continue
        
        # Get image filename/path
        data = record.get("data", {})
        image_path = data.get("image", f"receipt_{idx:03d}.jpg")
        if image_path.startswith("/"):
            image_name = Path(image_path).name
        else:
            image_name = image_path
        
        # Base name without extension
        base_name = Path(image_name).stem
        
        # Extract annotations
        annotations = record.get("annotations", [])
        if not annotations:
            print(f"  ⚠ Record {idx} has no annotations, skipping")
            continue
        
        # Use first annotation
        annotation = annotations[0]
        result_list = annotation.get("result", [])
        
        if not result_list:
            print(f"  ⚠ Record {idx} has no results, skipping")
            continue
        
        # Extract entities from all results
        extracted_data = {
            "text": "",
            "items": [],
            "total": None
        }
        
        for result in result_list:
            if result.get("type") == "textarea" or result.get("type") == "labels":
                parsed = extract_entities_from_label_studio(result)
                extracted_data["text"] = parsed.get("text", extracted_data["text"])
                extracted_data["items"].extend(parsed.get("items", []))
                if parsed.get("total") is not None:
                    extracted_data["total"] = parsed["total"]
        
        # Write label JSON
        label_json_path = labels_dir / f"{base_name}.json"
        with label_json_path.open("w", encoding="utf-8") as f:
            json.dump(extracted_data, f, indent=2)
        
        print(f"  ✓ {base_name}: {len(extracted_data.get('items', []))} items, total=${extracted_data.get('total', '?')}")
        converted_count += 1
    
    print(f"\n✓ Converted {converted_count} records to {output_dir}")
    print(f"  Images dir: {images_dir}")
    print(f"  Labels dir: {labels_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Label Studio export to training format")
    parser.add_argument("--input", required=True, help="Path to Label Studio JSON export file")
    parser.add_argument("--output-dir", default="data/datasets/user_collected", help="Output directory for labels")
    
    args = parser.parse_args()
    convert_label_studio_export(args.input, args.output_dir)
