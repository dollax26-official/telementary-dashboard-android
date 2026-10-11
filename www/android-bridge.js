"use strict";

/* Browser/Capacitor adapter for the same API contract used by the Windows app. */
(() => {
  const DEFAULT_API = "https://telementary-production.up.railway.app";
  const TOKEN_KEY = "fern.masterToken";
  const BASE_KEY = "fern.apiBase";

  const base = () => (localStorage.getItem(BASE_KEY) || DEFAULT_API).replace(/\/+$/, "");
  const token = () => localStorage.getItem(TOKEN_KEY) || "";

  async function api(path) {
    const t = token();
    if (!t) throw new Error("Master token is not set.");
    let response;
    try {
      response = await fetch(base() + path, {
        method: "GET",
        headers: { Authorization: "Bearer " + t, Accept: "application/json" }
      });
    } catch (e) {
      throw new Error("Cannot reach the telemetry server. Check your connection.");
    }
    const body = await response.text();
    let data;
    try { data = JSON.parse(body); } catch { data = { raw: body }; }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized — check your master token.");
      throw new Error((data && data.error) || ("HTTP " + response.status));
    }
    return data;
  }

  window.fern = {
    async setToken(payload) {
      const t = typeof payload === "string" ? payload : payload && payload.token;
      const requestedBase = typeof payload === "string" ? DEFAULT_API : payload && payload.baseUrl;
      if (!t || !String(t).trim()) throw new Error("Token is empty.");
      const b = String(requestedBase || DEFAULT_API).trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(b)) throw new Error("Server URL must start with http:// or https://");
      const oldToken = localStorage.getItem(TOKEN_KEY);
      const oldBase = localStorage.getItem(BASE_KEY);
      localStorage.setItem(TOKEN_KEY, String(t).trim());
      localStorage.setItem(BASE_KEY, b);
      try {
        await api("/api/devices");
        return { ok: true, baseUrl: b };
      } catch (e) {
        if (oldToken === null) localStorage.removeItem(TOKEN_KEY); else localStorage.setItem(TOKEN_KEY, oldToken);
        if (oldBase === null) localStorage.removeItem(BASE_KEY); else localStorage.setItem(BASE_KEY, oldBase);
        throw e;
      }
    },
    async clearToken() {
      localStorage.removeItem(TOKEN_KEY);
      return { ok: true };
    },
    async getDevices() {
      return api("/api/devices");
    },
    async getTelemetry() {
      const PAGE_LIMIT = 1000;
      const MAX_PAGES = 8;
      const pages = [];
      let fetched = 0;
      let total = null;
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await api("/api/telemetry?limit=" + PAGE_LIMIT + "&offset=" + (i * PAGE_LIMIT));
        const records = Array.isArray(page && page.records) ? page.records : [];
        if (page && typeof page.total === "number") total = page.total;
        pages.push(records);
        fetched += records.length;
        if (records.length < PAGE_LIMIT || (total !== null && fetched >= total)) break;
      }
      return { ok: true, total: total === null ? fetched : total, fetched, records: pages.reverse().flat() };
    },
    async saveFile(payload) {
      const blob = new Blob([String((payload && payload.content) || "")], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String((payload && payload.filename) || "fern-export.json");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { ok: true };
    }
  };
})();
