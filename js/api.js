/**
 * Dozo Genshin · API client
 * - ถ้าตั้ง API_BASE ชี้ไปที่ server (Neon) จะใช้ API จริง
 * - ถ้าไม่ตั้ง หรือ API ล้มเหลว → fallback localStorage เหมือนเดิม
 */
(function (global) {
  const STORAGE_ORDERS = "dozo_orders_v1";

  // เปลี่ยนเป็น URL เครื่อง server จริงตอน deploy เช่น https://api.yourdomain.com
  // ตอน dev: "http://localhost:3001"
  const API_BASE = (global.DOZO_API_BASE || "").replace(/\/$/, "");

  function loadLocalOrders() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_ORDERS) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalOrders(list) {
    localStorage.setItem(STORAGE_ORDERS, JSON.stringify(list));
  }

  async function apiFetch(path, options = {}) {
    if (!API_BASE) throw new Error("NO_API");
    const res = await fetch(API_BASE + path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  const DozoAPI = {
    mode() {
      return API_BASE ? "neon-api" : "local";
    },

    async health() {
      if (!API_BASE) return { ok: false, mode: "local" };
      try {
        const data = await apiFetch("/api/health");
        return { ...data, mode: "neon-api" };
      } catch (e) {
        return { ok: false, mode: "local", error: e.message };
      }
    },

    async listOrders() {
      try {
        const data = await apiFetch("/api/orders");
        // map ให้รูปแบบใกล้ local
        return (data.orders || []).map(mapOrderFromDb);
      } catch {
        return loadLocalOrders();
      }
    },

    async createOrder(payload) {
      const localShape = {
        id: "ORD-" + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        status: "pending",
        ...payload
      };

      try {
        const data = await apiFetch("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            order_code: localShape.id,
            service: payload.service,
            status: "pending",
            summary: payload.summary,
            detail: payload,
            customer_email: payload.customerEmail || payload.customer_email,
            customer_uid: payload.uid,
            game_user: payload.user,
            total_price: payload.totalPrice ?? payload.total_price ?? null
          })
        });
        return mapOrderFromDb(data.order) || localShape;
      } catch {
        const list = loadLocalOrders();
        list.unshift(localShape);
        saveLocalOrders(list);
        return localShape;
      }
    },

    async updateOrderStatus(id, status) {
      try {
        await apiFetch(`/api/orders/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        return true;
      } catch {
        const list = loadLocalOrders();
        const i = list.findIndex(o => o.id === id);
        if (i >= 0) {
          list[i].status = status;
          saveLocalOrders(list);
        }
        return true;
      }
    },

    async listTeam() {
      try {
        const data = await apiFetch("/api/team");
        return data.team || [];
      } catch {
        return null; // ให้ app ใช้ TEAM_MEMBERS ในโค้ด
      }
    },

    async ensureUser(email, displayName, role) {
      try {
        const data = await apiFetch("/api/users/ensure", {
          method: "POST",
          body: JSON.stringify({
            email,
            display_name: displayName,
            role: role || "customer"
          })
        });
        return data.user;
      } catch {
        return null;
      }
    }
  };

  function mapOrderFromDb(row) {
    if (!row) return null;
    const detail = typeof row.detail === "object" && row.detail ? row.detail : {};
    return {
      id: row.order_code || row.id,
      dbId: row.id,
      service: row.service,
      status: row.status,
      summary: row.summary,
      customerEmail: row.customer_email,
      uid: row.customer_uid,
      user: row.game_user,
      totalPrice: row.total_price,
      createdAt: row.created_at,
      ...detail
    };
  }

  global.DozoAPI = DozoAPI;
})(typeof window !== "undefined" ? window : globalThis);
