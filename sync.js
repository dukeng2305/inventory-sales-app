(() => {
  const { url, publishableKey } = window.inventorySyncConfig || {};
  if (!url || !publishableKey) return;

  let session;
  let revision;
  let busy = false;
  let online = false;
  let timer;
  let changes;
  const endpoint = url.replace(/\/$/, "");
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
    if (!response.ok) throw new Error("Không kết nối được với dữ liệu chung.");
    return response.json();
  }

  async function token() {
    if (session.expiresAt > Date.now() + 60000) return session.access_token;
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    }, "");
    session = { ...refreshed, expiresAt: Date.now() + refreshed.expires_in * 1000 };
    if (changes?.readyState === WebSocket.OPEN) changes.send(JSON.stringify({ topic: "realtime:inventory", event: "access_token",
      payload: { access_token: session.access_token }, ref: "auth" }));
    return session.access_token;
  }

  async function read() {
    const rows = await request("/rest/v1/inventory_store?select=revision,snapshot", undefined, await token());
    if (rows.length !== 1) throw new Error("Tài khoản chưa được cấp dữ liệu cửa hàng.");
    const row = rows[0];
    if (!Number.isSafeInteger(row.revision)) throw new Error("Phiên bản dữ liệu không hợp lệ.");
    if (row.snapshot && row.revision !== revision) window.inventoryApplyShared(row.snapshot);
    revision = row.revision;
    online = true;
    initialize.hidden = row.snapshot !== null;
    status.textContent = row.snapshot ? "Đã đồng bộ dữ liệu chung." : "Kho chung chưa có dữ liệu.";
  }

  async function refresh() {
    if (!session || busy) return;
    busy = true;
    try {
      await read();
    } catch {
      online = false;
      status.textContent = "Mất kết nối. Đang xem dữ liệu đã tải.";
    } finally {
      busy = false;
    }
  }

  function connectRealtime() {
    if (changes && changes.readyState < WebSocket.CLOSING) return;
    const socketUrl = new URL(endpoint.replace(/^https:/, "wss:") + "/realtime/v1/websocket");
    socketUrl.searchParams.set("apikey", publishableKey);
    socketUrl.searchParams.set("vsn", "1.0.0");
    try { changes = new WebSocket(socketUrl); } catch { return; }
    changes.addEventListener("open", () => changes.send(JSON.stringify({
      topic: "realtime:inventory", event: "phx_join", ref: "join",
      payload: { access_token: session.access_token, config: {
        postgres_changes: [{ event: "UPDATE", schema: "public", table: "inventory_store" }],
      } },
    })));
    changes.addEventListener("message", (event) => {
      if (JSON.parse(event.data).event === "postgres_changes") refresh();
    });
  }

  async function commit(snapshot, initializing = false) {
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

  window.inventoryCloud = { commit };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const login = await request("/auth/v1/token?grant_type=password", {
        email: form.elements.email.value.trim(), password: form.elements.password.value,
      }, "");
      session = { ...login, expiresAt: Date.now() + login.expires_in * 1000 };
      revision = undefined;
      await read();
      form.reset();
      form.hidden = true;
      signOut.hidden = false;
      connectRealtime();
      timer = setInterval(() => {
        if (changes?.readyState === WebSocket.OPEN) changes.send(JSON.stringify({
          topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()),
        }));
        else connectRealtime();
        refresh();
      }, 5000);
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
    clearInterval(timer);
    changes?.close();
    session = undefined;
    online = false;
    form.hidden = false;
    initialize.hidden = true;
    signOut.hidden = true;
    window.inventoryRestoreLocal();
    status.textContent = "Đã đăng xuất.";
  });
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
