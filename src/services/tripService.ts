const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002';

export interface TripSummary {
  id: string;
  name: string;
  members: unknown;
  created_at: string;
  access_type?: 'owner' | 'shared';
  owner_name?: string;
}

export interface TripShareCandidate {
  name: string;
  email: string;
  hasAccount: boolean;
  selected: boolean;
}

export interface ApiExpense {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  type: 'regular' | 'food';
  food_orders: Record<string, number> | null;
  created_at: string;
}

interface TripApiResult {
  status: 'success' | 'error';
  message?: string;
}

interface TripListResult extends TripApiResult {
  trips: TripSummary[];
}

interface CreateTripResult extends TripApiResult {
  trip?: TripSummary;
}

interface ExpenseListResult extends TripApiResult {
  expenses: ApiExpense[];
}

interface CreateExpenseResult extends TripApiResult {
  expense?: ApiExpense;
}

interface TripShareCandidatesResult extends TripApiResult {
  candidates: TripShareCandidate[];
}

export interface SpendingStats {
  rangeType: 'monthly' | 'yearly' | 'custom';
  startDate: string | null;
  endDate: string | null;
  totalAmount: number;
  expenseCount: number;
  earliestDate: string | null;
  latestDate: string | null;
}

interface SpendingStatsResult extends TripApiResult {
  data?: SpendingStats;
}

export interface MonthlyBreakdown {
  month: string;
  totalAmount: number;
  expenseCount: number;
}

interface SpendingBreakdownResult extends TripApiResult {
  data?: MonthlyBreakdown[];
}

const getAuthToken = () => localStorage.getItem('authToken') || localStorage.getItem('token') || '';

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function listTripsApi(): Promise<TripListResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', trips: [], message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', trips: [], message: data.message || `HTTP ${response.status}` };
    }
    return { status: 'success', trips: Array.isArray(data.trips) ? data.trips : [] };
  } catch (error) {
    return {
      status: 'error',
      trips: [],
      message: error instanceof Error ? error.message : 'Failed to load trips',
    };
  }
}

export async function createTripApi(name: string, members: unknown): Promise<CreateTripResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, members }),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }
    return { status: 'success', trip: data.trip };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create trip',
    };
  }
}

export async function updateTripApi(tripId: string, payload: { name?: string; members?: unknown }): Promise<TripApiResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }
    return { status: 'success' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update trip',
    };
  }
}

export async function listTripExpensesApi(tripId: string): Promise<ExpenseListResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', expenses: [], message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/expenses`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', expenses: [], message: data.message || `HTTP ${response.status}` };
    }
    return {
      status: 'success',
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
    };
  } catch (error) {
    return {
      status: 'error',
      expenses: [],
      message: error instanceof Error ? error.message : 'Failed to load expenses',
    };
  }
}

export async function createTripExpenseApi(
  tripId: string,
  payload: {
    description: string;
    amount: number;
    paidBy: string;
    type: 'regular' | 'food';
    foodOrders?: Record<string, number>;
  }
): Promise<CreateExpenseResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return { status: 'success', expense: data.expense };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to save expense',
    };
  }
}

export async function listTripShareCandidatesApi(tripId: string): Promise<TripShareCandidatesResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', candidates: [], message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/share-candidates`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', candidates: [], message: data.message || `HTTP ${response.status}` };
    }

    return {
      status: 'success',
      candidates: Array.isArray(data.candidates) ? data.candidates : [],
    };
  } catch (error) {
    return {
      status: 'error',
      candidates: [],
      message: error instanceof Error ? error.message : 'Failed to load share candidates',
    };
  }
}

export async function updateTripSharesApi(tripId: string, emails: string[]): Promise<TripApiResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/shares`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ emails }),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return { status: 'success' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update trip sharing',
    };
  }
}

export async function getUserSpendingStatsApi(
  rangeType: 'monthly' | 'yearly' | 'custom' = 'monthly',
  startDate?: string,
  endDate?: string
): Promise<SpendingStatsResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const params = new URLSearchParams({ rangeType });
    if (rangeType === 'custom' && startDate && endDate) {
      params.append('startDate', startDate);
      params.append('endDate', endDate);
    }

    const response = await fetch(`${API_BASE_URL}/api/user/spending-stats?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return { status: 'success', data: data.data };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch spending statistics',
    };
  }
}

export async function getUserSpendingBreakdownApi(): Promise<SpendingBreakdownResult> {
  const token = getAuthToken();
  if (!token) {
    return { status: 'error', message: 'Missing token' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/user/spending-breakdown`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return { status: 'success', data: data.data };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch spending breakdown',
    };
  }
}
