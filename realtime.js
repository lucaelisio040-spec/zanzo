(function () {
  "use strict";
  let enabled = false;
  let socket = null;
  let connecting = null;
  let retryAt = 0;
  let failures = 0;
  let sequence = 0;
  const pending = new Map();
  const readPath = /^\/api\/(?:rooms\/[A-Z0-9]{6}\/snapshot|matchmaking\/status|friends|history|leaderboard|auth\/me)(?:\?|$)/;

  function rejectPending() {
    pending.forEach(function (item) {
      clearTimeout(item.timer);
      item.reject(new Error("Connessione interrotta"));
    });
    pending.clear();
  }

  function connect() {
    if (!enabled || document.hidden || Date.now() < retryAt) return Promise.resolve(null);
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;
    connecting = new Promise(function (resolve) {
      const ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/realtime");
      socket = ws;
      let resolved = false;
      function finish(value) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        connecting = null;
        resolve(value);
      }
      const timer = setTimeout(function () { finish(null); ws.close(); }, 2500);
      ws.onopen = function () { failures = 0; finish(ws); };
      ws.onmessage = function (event) {
        let frame;
        try { frame = JSON.parse(event.data); } catch (_error) { return; }
        const item = pending.get(frame.id);
        if (!item) return;
        pending.delete(frame.id);
        clearTimeout(item.timer);
        item.resolve(new Response(JSON.stringify(frame.data), {
          status: frame.status,
          headers: { "Content-Type": "application/json" },
        }));
      };
      ws.onerror = function () { finish(null); };
      ws.onclose = function () {
        if (socket !== ws) { finish(null); return; }
        socket = null;
        failures += 1;
        retryAt = Date.now() + Math.min(60000, 1500 * Math.pow(2, failures));
        rejectPending();
        finish(null);
      };
    });
    return connecting;
  }

  async function request(path, options) {
    // Never retry mutations on a second transport: the first may have committed.
    if (enabled && (options.method || "GET") === "GET" && readPath.test(path)) {
      try {
        const ws = await connect();
        if (ws && ws.readyState === WebSocket.OPEN) {
          return await new Promise(function (resolve, reject) {
            const id = ++sequence;
            const timer = setTimeout(function () {
              pending.delete(id);
              reject(new Error("Tempo di risposta scaduto"));
              ws.close();
            }, 5000);
            pending.set(id, { resolve: resolve, reject: reject, timer: timer });
            try {
              ws.send(JSON.stringify({ id: id, path: path, headers: options.headers }));
            } catch (error) {
              clearTimeout(timer);
              pending.delete(id);
              reject(error);
            }
          });
        }
      } catch (_error) {
        // Safe reads fall back to HTTP after a dropped connection.
      }
    }
    return (window.ZanzoBackend ? window.ZanzoBackend.fetch : fetch)(path, options);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && socket) socket.close(1000, "Pagina in background");
    if (!document.hidden) retryAt = 0;
  });
  window.addEventListener("pagehide", function () { if (socket) socket.close(); });
  window.ZanzoRealtime = {
    enable: function (value) { enabled = !!value; },
    request: request,
    isEnabled: function () { return enabled; },
    isConnected: function () { return !!socket && socket.readyState === WebSocket.OPEN; },
  };
}());
