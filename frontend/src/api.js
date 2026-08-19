const TOKEN_KEY = "cfo_token";

const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

if (!API_BASE) {
  throw new Error(
    "Missing VITE_API_URL. Set it to your backend URL in frontend/.env (local) or Vercel env (production)."
  );
}

console.log("[API] client configured", {
  apiBase: API_BASE,
  pageOrigin: typeof window !== "undefined" ? window.location.origin : "ssr",
});

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function debugApi(label, details) {
  console.log(`[API] ${label}`, details);
}

function parseBodyForLog(body) {
  if (!body) return undefined;
  if (body instanceof FormData) return "[FormData]";
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function probeApiHealth() {
  const url = `${API_BASE}/api/health`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    debugApi("health probe", { url, status: res.status, ok: res.ok, data });
    return { reachable: res.ok, status: res.status, data };
  } catch (err) {
    debugApi("health probe failed — backend is not reachable", {
      url,
      name: err.name,
      message: err.message,
      cause: err.cause,
    });
    return { reachable: false, error: err.message };
  }
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

  const method = options.method || "GET";
  const url = `${API_BASE}${path}`;
  debugApi("request", {
    method,
    url,
    path,
    apiBase: API_BASE,
    hasToken: Boolean(token),
    body: parseBodyForLog(options.body),
  });

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const health = await probeApiHealth();
    const details = {
      method,
      url,
      apiBase: API_BASE,
      name: err.name,
      message: err.message,
      cause: err.cause,
      health,
    };
    console.error("[API] network failure (connection refused / failed to fetch)", details);
    throw new Error(
      health.reachable
        ? `Network error calling ${url}: ${err.message}`
        : `Cannot reach the API at ${API_BASE}. Start the backend with npm run dev in the backend folder, then retry. (${err.message})`
    );
  }

  debugApi("response", {
    method,
    url,
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
  });

  if (options.blob) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Download failed" }));
      console.error("[API] download failed", { url, status: res.status, err });
      throw new Error(err.message || "Download failed");
    }
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[API] request failed", {
      method,
      url,
      status: res.status,
      body: data,
    });
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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
  downloadAnalysisMarkdown: async (params = {}) => {
    const blob = await request(`/api/analysis/markdown${query(params)}`, {
      blob: true,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo-analysis-${new Date().toISOString().slice(0, 10)}.md`;
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
