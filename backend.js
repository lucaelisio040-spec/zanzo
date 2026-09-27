/* ZANZO — adattatore tra l'app e il server.
   - Le partite contro i bot girano interamente nel browser (nessun server necessario).
   - Tutto il resto (account, amici, online) va alla funzione Supabase indicata in config.js. */
(function () {
  "use strict";
  const E = window.ZanzoEngine;
  const base = String(window.ZANZO_API_BASE || "").replace(/\/+$/, "");
  const rooms = new Map();
  const STORE_PREFIX = "zanzo-local-room-";
  const now = () => Date.now() / 1000;

  function respond(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json" } });
  }
  function isLocalRoom(id) { return /^0[A-Z0-9]{5}$/.test(String(id || "")); }
  function save(state) {
    rooms.set(state.roomId, state);
    try { sessionStorage.setItem(STORE_PREFIX + state.roomId, JSON.stringify(state)); } catch (_e) { /* spazio pieno o privato */ }
  }
  function load(id) {
    if (rooms.has(id)) return rooms.get(id);
    try {
      const raw = sessionStorage.getItem(STORE_PREFIX + id);
      if (raw) { const st = JSON.parse(raw); rooms.set(id, st); return st; }
    } catch (_e) { /* ignora */ }
    return null;
  }
  function authToken() { try { return localStorage.getItem("zanzo-auth-token"); } catch (_e) { return null; } }

  function recordBotGame(state) {
    const tokenValue = authToken();
    if (!tokenValue || state.recorded) return;
    state.recorded = true;
    const me = state.players.find(p => !p.isBot);
    const winners = new Set(state.winners.map(w => w.id));
    const body = { matchId: state.matchId, players: state.players.map(p => ({ name: p.name, won: winners.has(p.id), lives: p.lives, isMe: p === me })) };
    fetch(base + "/api/history/bot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenValue }, body: JSON.stringify(body) }).catch(function () {});
  }

  function localRoom(path, method, body, url) {
    const parts = path.split("/").filter(Boolean); // api rooms ID action
    const id = parts[2];
    const action = parts[3];
    const state = load(id);
    if (!state) return respond({ ok: false, error: "Stanza non trovata." }, 404);
    const t = now();
    try {
      let changed = E.tick(state, t);
      let result = { ok: true };
      if (action === "bid") E.bid(state, body.seatId, body.token, body.bid, t);
      else if (action === "play") E.play(state, body.seatId, body.token, body.cardId, body.assoMode, t);
      else if (action === "premove") E.premove(state, body.seatId, body.token, body, t);
      else if (action === "leave") E.leave(state, body.seatId, body.token, t);
      else if (action === "restart") E.requestRestart(state, body.seatId, body.token, t);
      else if (action === "chat") return respond({ ok: false, error: "Chat non disponibile contro i bot." }, 400);
      else if (action !== "snapshot") return respond({ ok: false, error: "Risorsa non trovata." }, 404);
      if (action !== "snapshot") changed = true;
      if (changed) { state.revision += 1; state.updatedAt = t; }
      if (state.phase === "gameover") recordBotGame(state);
      save(state);
      if (action === "snapshot") result = E.snapshot(state, { role: url.searchParams.get("role") === "player" ? "player" : "table", seatId: url.searchParams.get("seatId"), token: url.searchParams.get("token") }, t);
      if (action === "restart") result = E.snapshot(state, { role: "player", seatId: body.seatId, token: body.token }, t);
      return respond(result);
    } catch (err) {
      save(state);
      return respond({ ok: false, error: err.message || "Errore." }, err.status || 400);
    }
  }

  function createLocalBotRoom(body) {
    let roomId;
    do { roomId = "0" + E.randomId(5); } while (load(roomId));
    const state = E.createBotMatch({ roomId, playerCount: body.playerCount, humanName: body.humanName, now: now() });
    save(state);
    const me = state.players[0];
    return respond({
      ok: true, roomId, seatId: me.id, seatToken: me.token,
      seats: state.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })),
      snapshot: E.snapshot(state, { role: "player", seatId: me.id, token: me.token }, now()),
    });
  }

  async function backendFetch(path, options) {
    const opts = options || {};
    const method = (opts.method || "GET").toUpperCase();
    const url = new URL(path, location.href);
    const clean = url.pathname.replace(/^.*?(\/api\/)/, "/api/");
    let body = {};
    if (opts.body) { try { body = JSON.parse(opts.body); } catch (_e) { body = {}; } }
    if (clean === "/api/rooms/bots" && method === "POST") return createLocalBotRoom(body);
    const m = clean.match(/^\/api\/rooms\/([^/]+)\//);
    if (m && isLocalRoom(m[1])) return localRoom(clean, method, body, url);
    if (clean === "/api/info" && !base && location.protocol === "file:") return respond({ ok: true, realtime: false });
    const key = String(window.ZANZO_API_KEY || "").trim();
    if (key) {
      // Chiave pubblica di Supabase: il token del giocatore viaggia in un header dedicato.
      const headers = Object.assign({}, opts.headers || {});
      const auth = headers.Authorization || headers.authorization;
      delete headers.authorization;
      if (auth) headers["X-Zanzo-Auth"] = auth;
      headers.Authorization = "Bearer " + key;
      headers.apikey = key;
      return fetch(base + path, Object.assign({}, opts, { headers }));
    }
    return fetch(base + path, options);
  }

  window.ZanzoBackend = { fetch: backendFetch, apiBase: base };
})();
