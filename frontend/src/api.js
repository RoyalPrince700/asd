const TOKEN_KEY = "cfo_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

  const res = await fetch(path, { ...options, headers });

  if (options.blob) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Download failed" }));
      throw new Error(err.message || "Download failed");
    }
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Request failed");
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
  categories: () => request("/api/categories"),
  createCategory: (name) =>
    request("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (name) =>
    request(`/api/categories/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  stockLevel: (productName, category, excludeRecordId) =>
    request(
      `/api/products/stock-level${query({
        productName,
        category,
        excludeRecordId,
      })}`
    ),
  stockSnapshot: () => request("/api/products/stock"),
  uploadProducts: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/api/products/upload", { method: "POST", body });
  },
  downloadProductTemplate: async () => {
    const blob = await request("/api/products/template", { blob: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-catalog-template.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  summary: (params = {}) =>
    request(`/api/records/summary${query(params)}`),
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
};

function query(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}
