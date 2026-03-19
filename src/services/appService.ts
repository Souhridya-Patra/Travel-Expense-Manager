const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface TripReceiptItem {
  name: string;
  amount: number;
  assignedTo?: string;
}

export interface SaveTripReceiptPayload {
  imageUrl?: string | null;
  ocrStatus?: string;
  ocrText?: string | null;
  ocrConfidence?: number | null;
  parserConfidence?: number | null;
  modelVersion?: string | null;
  parsedItems: TripReceiptItem[];
}

export interface StoredTripReceipt {
  id: string;
  trip_id: string;
  image_url: string | null;
  ocr_status: string;
  ocr_text: string | null;
  ocr_confidence: number | null;
  parser_confidence: number | null;
  model_version: string | null;
  parsed_items: TripReceiptItem[];
  created_at: string;
}

interface ReceiptApiResult {
  status: 'success' | 'error';
  receiptId?: string;
  message?: string;
}

interface ReceiptListApiResult {
  status: 'success' | 'error';
  receipts: StoredTripReceipt[];
  message?: string;
}

const getAuthContext = () => {
  const token =
    localStorage.getItem('authToken') ||
    localStorage.getItem('token') ||
    import.meta.env.VITE_APP_AUTH_TOKEN ||
    '';

  const tripId =
    localStorage.getItem('activeTripId') ||
    localStorage.getItem('tripId') ||
    import.meta.env.VITE_ACTIVE_TRIP_ID ||
    '';

  return { token, tripId };
};

export async function createTripReceipt(payload: SaveTripReceiptPayload): Promise<ReceiptApiResult> {
  try {
    const { token, tripId } = getAuthContext();
    if (!token || !tripId) {
      return {
        status: 'error',
        message: 'Receipt storage skipped: missing auth token or active trip id.',
      };
    }

    const response = await fetch(`${API_GATEWAY_URL}/api/app/trips/${tripId}/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
      };
    }

    return {
      status: 'success',
      receiptId: data?.receipt?.id,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown receipt storage error',
    };
  }
}

export async function updateTripReceipt(receiptId: string, payload: Partial<SaveTripReceiptPayload>): Promise<ReceiptApiResult> {
  try {
    const { token, tripId } = getAuthContext();
    if (!token || !tripId) {
      return {
        status: 'error',
        message: 'Receipt update skipped: missing auth token or active trip id.',
      };
    }

    const response = await fetch(`${API_GATEWAY_URL}/api/app/trips/${tripId}/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
      };
    }

    return {
      status: 'success',
      receiptId: data?.receipt?.id,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown receipt update error',
    };
  }
}

export async function listTripReceipts(): Promise<ReceiptListApiResult> {
  try {
    const { token, tripId } = getAuthContext();
    if (!token || !tripId) {
      return {
        status: 'error',
        receipts: [],
        message: 'Receipt history unavailable: missing auth token or active trip id.',
      };
    }

    const response = await fetch(`${API_GATEWAY_URL}/api/app/trips/${tripId}/receipts`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: 'error',
        receipts: [],
        message: data.message || `HTTP ${response.status}`,
      };
    }

    return {
      status: 'success',
      receipts: Array.isArray(data?.receipts) ? data.receipts : [],
    };
  } catch (error) {
    return {
      status: 'error',
      receipts: [],
      message: error instanceof Error ? error.message : 'Unknown receipt list error',
    };
  }
}
