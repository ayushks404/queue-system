const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function normalizeAppointment(appt: any): any {
  if (!appt || typeof appt !== 'object') return appt;
  const dateVal = appt.appointment_date || appt.slot_date;
  const dateStr = typeof dateVal === 'string'
    ? (dateVal.includes('T') ? dateVal.split('T')[0] : dateVal)
    : dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : dateVal;

  const timeStr = appt.start_time || appt.slot_time;

  if (dateStr) {
    appt.slot_date = dateStr;
    appt.appointment_date = dateStr;
  }
  if (timeStr) {
    appt.slot_time = timeStr;
    appt.start_time = timeStr;
  }
  return appt;
}

function normalizeResponse(resData: any): any {
  if (!resData || typeof resData !== 'object') {
    return resData;
  }

  if ('data' in resData) {
    const payload = resData.data;

    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        if (item && (item.appointment_number || item.appointment_date || item.start_time)) {
          normalizeAppointment(item);
        }
      });
      if (!resData.branches) resData.branches = payload;
      if (!resData.services) resData.services = payload;
      if (!resData.resources) resData.resources = payload;
      if (!resData.queue) resData.queue = payload;
      if (!resData.appointments) resData.appointments = payload;
      if (!resData.waitlist) resData.waitlist = payload;
      if (!resData.items) resData.items = payload;
    } else if (payload && typeof payload === 'object') {
      if (payload.appointment_number || payload.appointment_date || payload.start_time) {
        normalizeAppointment(payload);
      }
      for (const [key, val] of Object.entries(payload)) {
        if (!(key in resData)) {
          resData[key] = val;
        }
      }
      if (payload.user && !resData.user) {
        resData.user = payload.user;
      } else if (payload.id && (payload.role || payload.email) && !resData.user) {
        resData.user = payload;
      }
      if (payload.accessToken && !resData.access_token) resData.access_token = payload.accessToken;
      if (payload.refreshToken && !resData.refresh_token) resData.refresh_token = payload.refreshToken;
      if (payload.available_slots && !resData.available_slots) resData.available_slots = payload.available_slots;
      if (payload.slots && !resData.slots) resData.slots = payload.slots;
      if (payload.summary && !resData.summary) resData.summary = payload.summary;
      if (!resData.reservation) resData.reservation = payload;
      if (!resData.appointment) resData.appointment = normalizeAppointment(payload.appointment || payload);
      if (!resData.queueEntry) resData.queueEntry = payload;
    }
  }

  return resData;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const storedRefresh = localStorage.getItem('refreshToken');
  if (!storedRefresh) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefresh, refresh_token: storedRefresh }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const newToken = body?.data?.accessToken || body?.data?.access_token;
        if (newToken) {
          localStorage.setItem('accessToken', newToken);
          return newToken;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }

  return refreshPromise;
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    } else {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (data.error && typeof data.error.message === 'string') {
        errorMsg = data.error.message;
      } else if (typeof data.message === 'string') {
        errorMsg = data.message;
      }
    }
    throw new ApiError(errorMsg, response.status, data);
  }

  return normalizeResponse(data) as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
