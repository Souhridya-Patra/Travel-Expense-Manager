# User Collected Receipts

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
