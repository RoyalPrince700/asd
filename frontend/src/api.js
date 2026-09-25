const TOKEN_KEY = "cfo_token";
const GET_CACHE_TTL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 25_000;
const getCache = new Map();
const inFlightGets = new Map();

const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

if (!API_BASE) {
  throw new Error(
    "Missing VITE_API_URL. Set it to your backend URL in frontend/.env (local) or Vercel env (production)."
  );
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  getCache.clear();
  inFlightGets.clear();
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = String(options.method || "GET").toUpperCase();
  const url = `${API_BASE}${path}`;
  const cacheKey = `${token || "anonymous"}:${url}`;

  if (method === "GET" && !options.blob) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) getCache.delete(cacheKey);

    const pending = inFlightGets.get(cacheKey);
    if (pending) return pending;
  }

  const pending = performRequest(url, { ...options, headers }, method).then(
    (data) => {
      if (method === "GET" && !options.blob) {
        getCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + GET_CACHE_TTL_MS,
        });
      } else {
        getCache.clear();
      }
      return data;
    }
  );

  if (method === "GET" && !options.blob) {
    inFlightGets.set(cacheKey, pending);
    pending.finally(() => inFlightGets.delete(cacheKey)).catch(() => {});
  }

  return pending;
}

async function performRequest(url, options, method) {
  const retries = Number.isFinite(options.retries)
    ? Math.max(0, options.retries)
    : method === "GET"
      ? 2
      : 0;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;

    try {
      res = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
    } catch (err) {
      lastError = err;
      if (attempt >= retries || options.signal?.aborted) break;
      await delay(600 * 2 ** attempt);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if ([408, 429, 502, 503, 504].includes(res.status) && attempt < retries) {
      await res.body?.cancel().catch(() => {});
      await delay(600 * 2 ** attempt);
      continue;
    }

    if (options.blob) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        throw new Error(err.message || "Download failed");
      }
      return res.blob();
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Request failed (${res.status})`);
    }
    return data;
  }

  const reason =
    lastError?.name === "AbortError"
      ? "The server took too long to respond."
      : "The server is temporarily unreachable.";
  throw new Error(`${reason} Please try again.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api = {
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      retries: 3,
    }),
  register: (name, email, password) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => request("/api/auth/me"),
  staff: () => request("/api/staff"),
  updateStaff: (id, payload) =>
    request(`/api/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  users: () => request("/api/users"),
  updateUser: (id, payload) =>
    request(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),
  records: (params = {}) =>
    request(`/api/records${query(params)}`),
  products: (params = {}) => request(`/api/products${query(params)}`),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: "DELETE" }),
  deleteProductColumn: (company, column) =>
    request(`/api/products/column/${encodeURIComponent(column)}${query({ company })}`, {
      method: "DELETE",
    }),
  myInventory: (params = {}) => request(`/api/products/my-inventory${query(params)}`),
  stockLevel: (productName, company, excludeRecordId, location) =>
    request(
      `/api/products/stock-level${query({
        productName,
        company,
        excludeRecordId,
        location,
      })}`
    ),
  stockSnapshot: () => request("/api/products/stock"),
  uploadProducts: (file, company = "accessible", mode = "update") => {
    const body = new FormData();
    body.append("file", file);
    body.append("company", company);
    body.append("mode", mode);
    return request("/api/products/upload", { method: "POST", body });
  },
  resetCompanyStock: (company) =>
    request("/api/products/reset", {
      method: "POST",
      body: JSON.stringify({ company }),
    }),
  downloadProductTemplate: async (company = "accessible") => {
    const blob = await request(`/api/products/template${query({ company })}`, {
      blob: true,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company}-catalog-template.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  summary: (params = {}) =>
    request(`/api/records/summary${query(params)}`),
  mySummary: (params = {}) =>
    request(`/api/records/my-summary${query(params)}`),
  createRecord: (payload) =>
    request("/api/records", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadRecords: (file, { company, location, date } = {}) => {
    const body = new FormData();
    body.append("file", file);
    body.append("company", company);
    if (location) body.append("location", location);
    if (date) body.append("date", date);
    return request("/api/records/upload", { method: "POST", body });
  },
  updateRecord: (id, payload) =>
    request(`/api/records/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  recordChanges: (params = {}) =>
    request(`/api/record-changes${query(params)}`),
  approveRecordChange: (id) =>
    request(`/api/record-changes/${id}/approve`, { method: "POST" }),
  rejectRecordChange: (id, reason = "") =>
    request(`/api/record-changes/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  deleteRecord: (id) =>
    request(`/api/records/${id}`, { method: "DELETE" }),
  downloadReport: async (type, params = {}) => {
    const blob = await request(`/api/reports/${type}${query(params)}`, {
      blob: true,
    });
    const ext = type === "excel" ? "xlsx" : "docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo-stock-report.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadLedgerReport: async (type, params = {}) => {
    const blob = await request(`/api/reports/ledger/${type}${query(params)}`, {
      blob: true,
    });
    const ext = type === "excel" ? "xlsx" : "docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo-ledger-lines.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  analysis: (params = {}) => request(`/api/analysis${query(params)}`),
  downloadAnalysisReport: async (type, params = {}) => {
    const blob = await request(`/api/analysis/${type}${query(params)}`, {
      blob: true,
    });
    const ext = type === "excel" ? "xlsx" : "docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo-analysis-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  requests: (params = {}) => request(`/api/requests${query(params)}`),
  createRequest: (payload) =>
    request("/api/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRequest: (id, payload) =>
    request(`/api/requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteRequest: (id) => request(`/api/requests/${id}`, { method: "DELETE" }),
  downloadRequestsReport: async (type) => {
    const blob = await request(`/api/reports/requests/${type}`, { blob: true });
    const ext = type === "excel" ? "xlsx" : "docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo-requests.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

function query(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}
