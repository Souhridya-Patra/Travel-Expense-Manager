const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthApiResult {
  status: 'success' | 'error';
  token?: string;
  user?: AuthUser;
  message?: string;
}

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function registerWithEmail(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthApiResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return {
      status: 'success',
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Register failed',
    };
  }
}

export async function loginWithEmail(payload: {
  email: string;
  password: string;
}): Promise<AuthApiResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return {
      status: 'success',
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

export async function loginWithGoogleIdToken(idToken: string): Promise<AuthApiResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const data = await parseJson(response);
    if (!response.ok) {
      return { status: 'error', message: data.message || `HTTP ${response.status}` };
    }

    return {
      status: 'success',
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Google login failed',
    };
  }
}
