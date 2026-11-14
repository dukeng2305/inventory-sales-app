(() => {
  const { url, publishableKey } = window.inventorySyncConfig || {};
  if (!url || !publishableKey) return;

  let session;
  let revision;
  let staff = false;
  let checkoutPending;
  let busy = false;
  let online = false;
  let timer;
  let changes;
  const endpoint = url.replace(/\/$/, "");
  const sessionKey = `inventory-sales-session:${endpoint}`;
  const section = document.querySelector("#syncSection");
  const form = document.querySelector("#syncLogin");
  const status = document.querySelector("#syncStatus");
  const initialize = document.querySelector("#syncInitialize");
  const signOut = document.querySelector("#syncSignOut");
  section.classList.remove("hidden");

  async function request(path, body, token = session?.access_token) {
    const headers = { apikey: publishableKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(endpoint + path, {
      method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
      headers, cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const error = new Error("Không kết nối được với dữ liệu chung.");
      if (path.startsWith("/auth/v1/token?grant_type=refresh_token")) {
        const details = await response.json().catch(() => ({}));
        error.sessionExpired = ["refresh_token_not_found", "refresh_token_already_used",
          "session_not_found", "session_expired", "user_not_found", "user_banned"].includes(details.error_code);
      }
      if (path === "/rest/v1/rpc/inventory_staff_checkout") {
        const details = await response.json().catch(() => ({}));
        if (details?.code === "P0001") error.message = details.message;
        error.rejected = response.status >= 400 && response.status < 500;
      }
      throw error;
    }
    return response.json();
  }

  function saveSession(result) {
    session = {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expiresAt: Date.now() + result.expires_in * 1000,
      staff,
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }

  async function token() {
    if (session.expiresAt > Date.now() + 60000) return session.access_token;
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    }, "");
    saveSession(refreshed);
    if (changes?.readyState === WebSocket.OPEN) changes.send(JSON.stringify({ topic: "realtime:inventory", event: "access_token",
      payload: { access_token: session.access_token }, ref: "auth" }));
    return session.access_token;
  }

  async function read() {
    const accessToken = await token();
    const rows = staff ? [] : await request("/rest/v1/inventory_store?select=revision,snapshot", undefined, accessToken);
    const row = rows[0] ?? await request("/rest/v1/rpc/inventory_staff_read", {}, accessToken);
    if (!row) {
      if (staff) window.inventoryApplyShared({ products: [], sales: [], purchases: [] });
      throw new Error("Tài khoản chưa được cấp dữ liệu cửa hàng.");
    }
    if (!Number.isSafeInteger(row.revision)) throw new Error("Phiên bản dữ liệu không hợp lệ.");
    const wasStaff = staff;
    staff = rows.length === 0;
    window.inventorySetStaffMode(staff);
    if (row.snapshot && (row.revision !== revision || wasStaff !== staff)) {
      window.inventoryApplyShared(row.snapshot, staff && wasStaff && revision !== undefined);
    }
    revision = row.revision;
    online = true;
    initialize.hidden = staff || row.snapshot !== null;
    status.textContent = row.snapshot ? "Đã đồng bộ dữ liệu chung." : "Kho chung chưa có dữ liệu.";
  }

  async function refresh() {
    if (!session || busy) return;
    busy = true;
    try {
      await read();
    } catch (error) {
      online = false;
      if (error.sessionExpired) {
        endSession("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else {
        status.textContent = "Chưa kết nối được với kho chung. App sẽ tự thử lại.";
      }
    } finally {
      busy = false;
    }
  }

  function connectRealtime() {
    if (staff) return;
    if (changes && changes.readyState < WebSocket.CLOSING) return;
    const socketUrl = new URL(endpoint.replace(/^https:/, "wss:") + "/realtime/v1/websocket");
    socketUrl.searchParams.set("apikey", publishableKey);
    socketUrl.searchParams.set("vsn", "1.0.0");
    try { changes = new WebSocket(socketUrl); } catch { return; }
    const socket = changes;
    socket.addEventListener("open", () => {
      if (socket !== changes || !session) return;
      socket.send(JSON.stringify({
      topic: "realtime:inventory", event: "phx_join", ref: "join",
      payload: { access_token: session.access_token, config: {
        postgres_changes: [{ event: "UPDATE", schema: "public", table: "inventory_store" }],
      } },
      }));
    });
    socket.addEventListener("message", (event) => {
      if (JSON.parse(event.data).event === "postgres_changes") refresh();
    });
  }

  function startSession() {
    form.reset();
    form.hidden = true;
    signOut.hidden = false;
    if (online) connectRealtime();
    timer = setInterval(() => {
      if (changes?.readyState === WebSocket.OPEN) changes.send(JSON.stringify({
        topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()),
      }));
      else if (online) connectRealtime();
      refresh();
    }, 5000);
  }

  function endSession(message) {
    clearInterval(timer);
    changes?.close();
    changes = undefined;
    session = undefined;
    localStorage.removeItem(sessionKey);
    online = false;
    revision = undefined;
    form.hidden = false;
    initialize.hidden = true;
    signOut.hidden = true;
    checkoutPending = undefined;
    if (staff) {
      window.inventoryApplyShared({ products: [], sales: [], purchases: [] });
      document.querySelector('[data-tab="more"]').click();
    } else {
      window.inventoryRestoreLocal();
    }
    status.textContent = message;
  }

  async function commit(snapshot, initializing = false) {
    if (staff) throw new Error("Tài khoản nhân viên chỉ được tạo đơn.");
    if (!session || !online || busy || (!initialize.hidden && !initializing)) {
      throw new Error("Cần đăng nhập và kết nối với dữ liệu chung trước khi lưu.");
    }
    busy = true;
    try {
      const nextRevision = await request("/rest/v1/rpc/inventory_commit", {
        expected_revision: revision, next_snapshot: snapshot,
      }, await token());
      if (nextRevision === null) {
        await read();
        throw new Error("Máy khác vừa cập nhật. Hãy kiểm tra dữ liệu mới trước khi lưu lại.");
      }
      revision = nextRevision;
      initialize.hidden = true;
      status.textContent = "Đã đồng bộ dữ liệu chung.";
    } finally {
      busy = false;
    }
  }

  async function checkout(sale) {
    if (!staff || !session || !online || busy) throw new Error("Cần kết nối với kho chung để lưu đơn.");
    const { id, createdAt, ...details } = sale;
    const fingerprint = JSON.stringify(details);
    if (checkoutPending && checkoutPending.fingerprint !== fingerprint) {
      throw new Error("Đơn trước chưa rõ kết quả. Hãy khôi phục nội dung đơn trước rồi bấm lưu lại.");
    }
    checkoutPending ??= { id, fingerprint };
    busy = true;
    try {
      await request("/rest/v1/rpc/inventory_staff_checkout", { order_data: { ...details, id: checkoutPending.id } }, await token());
      checkoutPending = undefined;
      await read().catch(() => {});
    } catch (error) {
      if (error.rejected) checkoutPending = undefined;
      throw error;
    } finally {
      busy = false;
    }
  }

  window.inventoryCloud = { commit, checkout, isStaff: () => staff };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const login = await request("/auth/v1/token?grant_type=password", {
        email: form.elements.email.value.trim(), password: form.elements.password.value,
      }, "");
      staff = false;
      session = { ...login, expiresAt: Date.now() + login.expires_in * 1000 };
      revision = undefined;
      await read();
      saveSession(login);
      startSession();
    } catch {
      session = undefined;
      online = false;
      form.elements.password.value = "";
      status.textContent = "Đăng nhập thất bại hoặc tài khoản chưa được cấp dữ liệu cửa hàng.";
    } finally {
      busy = false;
    }
  });
  initialize.addEventListener("click", async () => {
    if (!confirm("Dùng dữ liệu hiện có trên máy này để khởi tạo kho chung?")) return;
    try { await commit(window.inventorySharedSnapshot(), true); }
    catch (error) { status.textContent = error.message; }
  });
  signOut.addEventListener("click", () => {
    if (busy) return;
    endSession("Đã đăng xuất.");
  });
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  let savedSession;
  try {
    savedSession = JSON.parse(localStorage.getItem(sessionKey));
  } catch {
    localStorage.removeItem(sessionKey);
  }
  if (typeof savedSession?.access_token === "string" &&
      typeof savedSession.refresh_token === "string" && Number.isFinite(savedSession.expiresAt)) {
    session = savedSession;
    staff = savedSession.staff === true;
    if (staff) {
      window.inventorySetStaffMode(true);
      window.inventoryApplyShared({ products: [], sales: [], purchases: [] });
    }
    status.textContent = "Đang kết nối lại với kho chung…";
    startSession();
    refresh();
  }
})();
