/**
 * ML Service Client
 * Communicates with backend ANI service for receipt parsing
 * Endpoints: OCR analysis, item parsing, feedback storage
 */

const ML_SERVICE_URL = import.meta.env.VITE_ML_SERVICE_URL || 'http://localhost:8001';

export interface OcrResult {
  status: 'success' | 'error';
  text: string;
  confidence: number;
  filename: string;
  error?: string;
}

export interface ParsedItem {
  name: string;
  amount: number;
}

export interface ParseResult {
  status: 'success' | 'error';
  items: ParsedItem[];
  total?: number | null;
  confidence: number;
  model: string;
  error?: string;
}

export interface FeedbackPayload {
  receipt_id?: string;
  original_parse: {
    items: ParsedItem[];
    total?: number;
  };
  corrected_parse: {
    items: ParsedItem[];
    total?: number;
  };
}

export interface FeedbackResult {
  status: 'stored' | 'error';
  message: string;
  receipt_id?: string;
  error?: string;
}

export interface ModelStatus {
  status: 'ok' | 'error';
  ocr_model: 'loaded' | 'not loaded';
  parser_model: 'loaded' | 'not loaded';
  message?: string;
}

/**
 * Analyze receipt image using TrOCR model
 * @param file Receipt image file
 * @returns OCR text and metadata
 */
export async function analyzeReceiptOcr(file: File): Promise<OcrResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${ML_SERVICE_URL}/api/ml/ocr/analyze`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        status: 'error',
        text: '',
        confidence: 0,
        filename: file.name,
        error: error.detail || `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      status: 'error',
      text: '',
      confidence: 0,
      filename: file.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse receipt items from text using BERT NER model
 * @param text OCR text from receipt
 * @returns Parsed items with prices
 */
export async function parseReceiptItems(text: string): Promise<ParseResult> {
  try {
    if (!text || text.trim().length === 0) {
      return {
        status: 'error',
        items: [],
        confidence: 0,
        model: 'bert-nerd-parser',
        error: 'Text cannot be empty',
      };
    }

    const response = await fetch(`${ML_SERVICE_URL}/api/ml/parse/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        status: 'error',
        items: [],
        confidence: 0,
        model: 'bert-nerd-parser',
        error: error.detail || `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      status: 'error',
      items: [],
      confidence: 0,
      model: 'bert-nerd-parser',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Submit feedback for user corrections
 * Used for continuous improvement and retraining
 * @param feedback User's corrected parse data
 * @returns Feedback storage status
 */
export async function submitFeedback(feedback: FeedbackPayload): Promise<FeedbackResult> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/ml/train/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        status: 'error',
        message: error.detail || `HTTP ${response.status}`,
        error: error.detail || `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check model status and readiness
 * @returns Current status of OCR and Parser models
 */
export async function checkModelStatus(): Promise<ModelStatus> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/ml/status`);

    if (!response.ok) {
      return {
        status: 'error',
        ocr_model: 'not loaded',
        parser_model: 'not loaded',
        message: `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      status: 'error',
      ocr_model: 'not loaded',
      parser_model: 'not loaded',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Health check for ML service
 * @returns Service availability
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
