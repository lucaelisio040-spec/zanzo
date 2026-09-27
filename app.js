(function () {
  // ═══════════════════════════════════════════════════════════════
  // SFX — effetti sonori via Web Audio API (nessun file esterno)
  // ═══════════════════════════════════════════════════════════════
  var SFX = (function () {
    var _ctx = null;
    function ac() {
      if (!_ctx) {
        try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      }
      return _ctx;
    }
    function tone(freq, type, dur, vol, when) {
      if (window.ZanzoEffects && !window.ZanzoEffects.soundEnabled) return;
      var ctx = ac(); if (!ctx) return;
      try {
        var t = when || ctx.currentTime;
        var osc = ctx.createOscillator();
        var g   = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t); osc.stop(t + dur + 0.02);
      } catch (e) {}
    }
    function resume() { var ctx = ac(); if (ctx && ctx.state === "suspended") ctx.resume(); }
    return {
      tick:  function () { resume(); tone(900, "triangle", 0.04, 0.07); },
      swipe: function () { resume(); tone(520, "triangle", 0.06, 0.06); },
      pick:  function () { resume(); tone(700, "sine", 0.07, 0.09); tone(880, "sine", 0.05, 0.05); },
      start: function () {
        resume();
        [440, 554, 659].forEach(function (f, i) {
          var ctx = ac(); if (!ctx) return;
          tone(f, "sine", 0.25, 0.10, ctx.currentTime + i * 0.12);
        });
      },
      win: function () {
        resume();
        [523, 659, 784, 1047].forEach(function (f, i) {
          var ctx = ac(); if (!ctx) return;
          tone(f, "sine", 0.30, 0.12, ctx.currentTime + i * 0.14);
        });
      },
      lose: function () {
        resume();
        var ctx = ac(); if (!ctx) return;
        tone(350, "sawtooth", 0.25, 0.08, ctx.currentTime);
        tone(280, "sawtooth", 0.30, 0.07, ctx.currentTime + 0.22);
      },
      deal: function () {
        resume();
        var ctx = ac(); if (!ctx) return;
        for (var i = 0; i < 4; i++) {
          tone(700 + i * 60, "triangle", 0.04, 0.06, ctx.currentTime + i * 0.07);
        }
      },
    };
  })();

  // ═══════════════════════════════════════════════════════════════
  // HAPTIC — vibrazione tattica su dispositivi che la supportano
  // ═══════════════════════════════════════════════════════════════
  function haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB NOTIFICATION — blink titolo quando tocca a te e tab nascosta
  // ═══════════════════════════════════════════════════════════════
  var _turnBlinkId = null;
  var _baseTitle   = "Zanzo";
  function startTurnBlink() {
    if (_turnBlinkId) return;
    var on = true;
    _turnBlinkId = setInterval(function () {
      document.title = on ? "🃏 Tocca a te! — Zanzo" : "◆ Il tuo turno!";
      on = !on;
    }, 750);
    haptic([25, 80, 25]);
  }
  function stopTurnBlink() {
    if (_turnBlinkId) { clearInterval(_turnBlinkId); _turnBlinkId = null; }
    document.title = _baseTitle;
  }
  var _prevCanAct = false;
  function syncTurnNotify() {
    var nowCanAct = (typeof canPlay === "function" && canPlay()) || (typeof canBid === "function" && canBid());
    if (nowCanAct && !_prevCanAct && document.hidden) { startTurnBlink(); }
    else if (!nowCanAct) { stopTurnBlink(); }
    _prevCanAct = nowCanAct;
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) stopTurnBlink();
  });

  // ═══════════════════════════════════════════════════════════════
  // CONFETTI — canvas particles sulla schermata di vittoria
  // ═══════════════════════════════════════════════════════════════
  var _confettiRaf = null;
  function launchConfetti() {
    var old = document.getElementById("zanzo-confetti");
    if (old) return; // già attivo
    var canvas = document.createElement("canvas");
    canvas.id = "zanzo-confetti";
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000;";
    document.body.appendChild(canvas);
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#e9c349","#fb7185"];
    var pieces = Array.from({ length: 70 }, function () {
      return {
        x:  Math.random() * canvas.width,
        y:  -Math.random() * canvas.height * 0.5,
        r:  3 + Math.random() * 6,
        dx: (Math.random() - 0.5) * 2.5,
        dy: 2.5 + Math.random() * 3.5,
        tilt: Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        spin:  (Math.random() - 0.5) * 0.18,
      };
    });
    var start = performance.now();
    var duration = 4500;
    var ctx2 = canvas.getContext("2d");
    function frame(now) {
      var elapsed = now - start;
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.y += p.dy; p.x += p.dx; p.angle += p.spin;
        ctx2.save();
        ctx2.translate(p.x, p.y);
        ctx2.rotate(p.angle);
        ctx2.fillStyle = p.color;
        ctx2.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - duration * 0.6) / (duration * 0.4));
        ctx2.beginPath();
        ctx2.rect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx2.fill();
        ctx2.restore();
      });
      if (elapsed < duration) {
        _confettiRaf = requestAnimationFrame(frame);
      } else {
        canvas.remove();
        _confettiRaf = null;
      }
    }
    _confettiRaf = requestAnimationFrame(frame);
    SFX.win();
  }

  // ═══════════════════════════════════════════════════════════════
  // COUNTDOWN — splash "Zanzo!" all'inizio partita
  // ═══════════════════════════════════════════════════════════════
  function showZanzoSplash() {
    if (document.getElementById("zanzo-splash")) return;
    var el = document.createElement("div");
    el.id = "zanzo-splash";
    el.className = "zanzo-splash";
    el.innerHTML = '<div class="zanzo-splash-text">Zanzo!</div>';
    document.body.appendChild(el);
    SFX.start();
    setTimeout(function () { el.remove(); }, 1600);
  }

  // ═══════════════════════════════════════════════════════════════
  // STAT BUMP — animazione numerica quando cambiano vite/prese
  // ═══════════════════════════════════════════════════════════════
  var _statCache = {};

  // ID inviti già mostrati come popup (persiste tra re-render)
  var _shownInvitePopupIds = new Set();
  function animateChangedStats() {
    document.querySelectorAll("[data-stat-key]").forEach(function (el) {
      var key = el.getAttribute("data-stat-key");
      var val = el.textContent;
      if (_statCache[key] !== undefined && _statCache[key] !== val) {
        el.classList.remove("stat-bump");
        void el.offsetWidth;
        el.classList.add("stat-bump");
      }
      _statCache[key] = val;
    });
  }

  const query = new URLSearchParams(window.location.search);
  const startAction = query.get("action") || "";
  const ACTIVE_SESSION_KEY = "zanzo-active-session";
  const STALE_ROOMS_KEY = "zanzo-stale-rooms";
  const hasExplicitJoinParams = Boolean(query.get("seat") && query.get("token"));
  const navigationEntry = window.performance && typeof window.performance.getEntriesByType === "function"
    ? window.performance.getEntriesByType("navigation")[0]
    : null;
  const navigationType = navigationEntry && navigationEntry.type ? navigationEntry.type : "";
  const canRestoreStoredSession = hasExplicitJoinParams || navigationType === "reload" || navigationType === "back_forward";
  const staleRoomIds = (function () {
    try {
      const raw = window.sessionStorage.getItem(STALE_ROOMS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch (_error) {
      return new Set();
    }
  })();
  const initialSession = canRestoreStoredSession ? (function () {
    try {
      const raw = window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.roomId && staleRoomIds.has(parsed.roomId)) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  })() : null;
  const initialRoomId = query.get("room") || ((initialSession && initialSession.roomId) || "");
  const initialSeatId = query.get("seat") || ((initialSession && initialSession.seatId) || "");
  const initialToken = query.get("token") || ((initialSession && initialSession.token) || "");
  const ONBOARDING_HINT_KEYS = {
    friends: "zanzo-hint-friends",
    blind: "zanzo-hint-blind-round",
    asso: "zanzo-hint-asso-choice",
  };
  const TOTAL_ROUNDS = 5;

  const SEAT_LAYOUTS = {
    1: ["bottom"],
    2: ["bottom", "top"],
    3: ["bottom", "top-left", "top-right"],
    4: ["bottom", "left", "top", "right"],
    5: ["bottom", "bottom-left", "top-left", "top-right", "bottom-right"],
    6: ["bottom", "bottom-left", "top-left", "top", "top-right", "bottom-right"],
    7: ["bottom", "bottom-left", "left", "top-left", "top-right", "right", "bottom-right"],
    8: ["bottom", "bottom-left", "left", "top-left", "top", "top-right", "right", "bottom-right"],
  };

  const state = {
    view: initialSeatId ? "player" : "hub",
    roomId: initialSeatId ? initialRoomId : "",
    seatId: initialSeatId,
    token: initialToken,
    snapshot: null,
    snapshotKey: "",
    roomMeta: null,
    joinForm: {
      roomId: initialRoomId,
      seatId: initialSeatId,
      token: initialToken,
    },
    busy: false,
    syncStatus: "idle",
    notice: null,
    bidInput: "0",
    selectedCardId: null,
    selectedForPremove: false,
    selectedAssoMode: null,
    bidOverlayIntroKey: "",
    handAnimationKey: "",
    trickAnimationKey: "",
    playerMobilePane: "hand",
    activeTrickSweep: null,
    activeDealAnimation: null,
    activeRoundSummary: null,
    activeBidAnnouncement: null,
    lastSeenTrickEventId: null,
    lastSeenDealEventId: null,
    lastSeenBidEventId: null,
    currentUser: null,
    authToken: localStorage.getItem("zanzo-auth-token") || null,
    hubMode: (startAction === "nuova" || startAction === "unisciti") ? "play-mode" : null,
    botCount: 1,
    botCarouselIndex: 0,
    playModeCarouselIndex: startAction === "unisciti" ? 2 : 0,
    historyData: null,
    friendsData: [],
    friendRequests: { incoming: [], outgoing: [] },
    invitesData: [],
    activeLobbies: [],
    invitePopup: null,
    friendSearchUsername: "",
    selectedInviteeIds: [],
    socialBusy: false,
    socialError: null,
    authMode: "login",
    authUsername: "",
    authPassword: "",
    authBusy: false,
    authModalOpen: false,
    authError: null,
    profileOpen: false,
    profileTab: "info",
    profileNewUsername: "",
    profileOldPassword: "",
    profileNewPassword: "",
    profileError: null,
    profileSuccess: null,
    profileBusy: false,
    matchmakingCount: 2,
    matchmakingQueueId: null,
    matchmakingStatus: null,
    matchmakingWaiting: 0,
    matchmakingNeeded: 2,
    matchmakingCountdownRemaining: 50,
    matchmakingCountdownTotal: 50,
    deckStyle: localStorage.getItem("zanzo-deck-style") || "napoletane",
    deckPickerOpen: false,
    waitingLobbyId: "",
    guestName: "Ospite" + String(Math.floor(Math.random() * 90) + 10),
    rulesOpen: false,
  };

  const root = document.getElementById("app");
  let pollId = null;
  let noticeTimer = null;
  let snapshotRequestRunning = false;
  let roomSessionStartedAt = 0;
  let snapshot404RetryCount = 0;
  let snapshot404RetryTimer = null;
  let socialPollId = null;
  let presencePollId = null;
  let lobbyPollId = null;
  let visibilityHandler = null;
  let viewportHandler = null;
  let animationTimers = [];
  let animationQueue = [];
  let animationRunning = false;
  let playedAnimationKeys = new Set();
  const IS_ANDROID = /Android/i.test((window.navigator && window.navigator.userAgent) || "");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function hasSeenHint(key) {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch (_error) {
      return false;
    }
  }

  function markHintSeen(key) {
    try {
      window.localStorage.setItem(key, "1");
    } catch (_error) {}
  }

  function oneTimeHint(key, message, className) {
    if (hasSeenHint(key)) return "";
    markHintSeen(key);
    return `<div class="one-time-hint${className ? ` ${className}` : ""}">${escapeHtml(message)}</div>`;
  }

  function initialsForName(name) {
    const parts = String(name || "Zanzo")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "Z";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  function avatarPalette(name) {
    const palettes = [
      ["#f3b36b", "#7b341e"],
      ["#7fd6ff", "#19456b"],
      ["#ff8ea1", "#7a1634"],
      ["#99e27d", "#245b26"],
      ["#ffd86b", "#8b5a10"],
      ["#c39bff", "#4a1f73"],
      ["#7be0d6", "#145463"],
      ["#ffad84", "#7d2818"],
    ];
    const source = String(name || "zanzo");
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return palettes[hash % palettes.length];
  }

  function avatarStyle(name) {
    const palette = avatarPalette(name);
    return `--avatar-a:${palette[0]}; --avatar-b:${palette[1]};`;
  }

  function playerAvatarUrl(player) {
    const safePlayer = player || {};
    const style = "adventurer";
    const seed = encodeURIComponent(`${safePlayer.id || "seat"}-${safePlayer.name || "zanzo"}`);
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&radius=50&backgroundType=gradientLinear`;
  }

  function playerAvatarTemplate(player) {
    const safePlayer = player || {};
    const initials = initialsForName(safePlayer.name || safePlayer.id || "Z");
    return `<img class="seat-avatar-photo" src="${escapeHtml(playerAvatarUrl(safePlayer))}" alt="Avatar di ${escapeHtml(safePlayer.name || "Giocatore")}" loading="eager" decoding="async" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="seat-avatar-fallback" style="display:none">${escapeHtml(initials)}</span>`;
  }

  function heartsTemplate(lives, playerId) {
    const total = 3;
    return Array.from({ length: total }, function (_item, index) {
      return `<span class="seat-heart ${index < Number(lives || 0) ? "alive" : ""}" ${index === 0 && playerId ? `data-stat-key="lives-${playerId}"` : ""}>♥</span>`;
    }).join("");
  }

  function playerStatusLine(player) {
    if (player.hasLeft) return "USCITO DALLA PARTITA";
    const bid = player.bid == null ? "-" : player.bid;
    return `DICHIARATE ${bid} • PRESE ${player.tricksWon}`;
  }

  function scorePillTemplate(player, options) {
    const opts = options || {};
    const bidValue = player.bid == null ? "-" : escapeHtml(player.bid);
    const tricksValue = escapeHtml(player.tricksWon);
    const classes = ["score-pill"];
    if (opts.mobileSeat) classes.push("mobile-seat-score");
    if (opts.emphasis) classes.push("emphasis");
    if (player.hasLeft || player.lives <= 0) classes.push("muted");
    if (opts.mobileSeat) {
      return `<div class="${classes.join(" ")}"><span class="mobile-seat-score-item" data-stat-key="bid-${player.id}">B:${bidValue}</span><span class="mobile-seat-score-item" data-stat-key="tricks-${player.id}">T:${tricksValue}</span></div>`;
    }
    return `<div class="${classes.join(" ")}"><div class="score-pill-metric"><span class="score-pill-label">Dichiarate</span><strong class="score-pill-value" data-stat-key="bid-${player.id}">${bidValue}</strong></div><div class="score-pill-divider"></div><div class="score-pill-metric"><span class="score-pill-label">Prese</span><strong class="score-pill-value" data-stat-key="tricks-${player.id}">${tricksValue}</strong></div></div>`;
  }

  function isLocalHostname(hostname) {
    return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("127.");
  }

  function normalizeBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
      const url = new URL(candidate);
      return `${url.protocol}//${url.host}`;
    } catch (_error) {
      return "";
    }
  }

  function serializeKey(value) {
    try {
      return JSON.stringify(value == null ? null : value);
    } catch (_error) {
      return "";
    }
  }

  function snapshotVersionKey(snapshot) {
    if (!snapshot) return "";
    const playersKey = snapshot.players
      ? snapshot.players.map(function (p) {
        return [
          p.id,
          p.lives,
          p.bid == null ? "_" : p.bid,
          p.tricksWon == null ? "_" : p.tricksWon,
          p.handCount == null ? "_" : p.handCount,
          p.isCurrentBidder ? "b1" : "b0",
          p.isCurrentTurn ? "t1" : "t0",
        ].join(":");
      }).join(",")
      : "";
    const tableKey = snapshot.tableCards
      ? snapshot.tableCards.map(function (c) {
        return [c.playerId || "", c.card && c.card.id ? c.card.id : "", c.assoMode || ""].join(":");
      }).join(",")
      : "";
    return [
      snapshot.roomId || "",
      snapshot.matchId || "",
      snapshot.revision || 0,
      snapshot.cycle || 1,
      snapshot.chat ? snapshot.chat.seq : 0,
      snapshot.phase || "",
      snapshot.roundIndex == null ? "" : snapshot.roundIndex,
      snapshot.updatedAt == null ? "" : snapshot.updatedAt,
      snapshot.currentBidderIndex == null ? "" : snapshot.currentBidderIndex,
      snapshot.currentTurnIndex == null ? "" : snapshot.currentTurnIndex,
      snapshot.viewer && snapshot.viewer.role ? snapshot.viewer.role : "",
      snapshot.viewer && snapshot.viewer.seatId ? snapshot.viewer.seatId : "",
      snapshot.allowedActions && snapshot.allowedActions.canBid ? "bid1" : "bid0",
      snapshot.allowedActions && snapshot.allowedActions.canPlay ? "play1" : "play0",
      playersKey,
      tableKey,
    ].join("|");
  }

  function currentPlayer() {
    return ((state.snapshot && state.snapshot.players) || []).find(function (player) {
      return player.id === state.seatId;
    }) || null;
  }

  function myHand() {
    const player = currentPlayer();
    return (player && player.hand) || [];
  }

  function selectedCard() {
    return myHand().find(function (card) {
      return card.id === state.selectedCardId;
    }) || null;
  }

  function isAssoDiDenara(card) {
    return card && card.rank === "asso" && card.suit === "oro";
  }

  function blindRound() {
    return state.snapshot && state.snapshot.handSize === 1 && ["bidding", "playing"].includes(state.snapshot.phase);
  }

  function currentHandSize() {
    return (state.snapshot && state.snapshot.handSize) || 0;
  }

  function currentScenePlayerCount() {
    return (((state.snapshot && state.snapshot.players) || []).length) || 0;
  }

  function availableDecks() {
    return [
      { id: "napoletane", label: "Napoletane", available: true, desc: "Mazzo del Sud Italia" },
      { id: "piacentine", label: "Piacentine", available: true, desc: "Mazzo del Nord Italia" },
      { id: "siciliane", label: "Siciliane", available: true, desc: "Mazzo della Sicilia" },
      { id: "bergamasche", label: "Bergamasche", available: true, desc: "Mazzo della Lombardia" },
    ];
  }

  function deckOptionsTemplate(context) {
    return `<div class="deck-grid ${context === "live" ? "deck-grid-live" : ""}">${availableDecks().map(function (deck) {
      const active = state.deckStyle === deck.id;
      return `<button class="deck-option${active ? " active" : ""}${!deck.available ? " unavailable" : ""}" type="button" data-action="${deck.available ? "set-deck" : ""}" data-deck="${deck.id}" ${!deck.available ? "disabled" : ""}>
        <div class="deck-preview"><img src="assets/cards/${deck.id}/re-oro.jpg" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="${escapeHtml(deck.label)}"><div class="deck-preview-fallback" style="display:none">🃏</div></div>
        <div class="deck-option-label">${escapeHtml(deck.label)}</div>
        <div class="deck-option-desc">${escapeHtml(deck.desc)}</div>
        ${!deck.available ? '<div class="deck-coming-soon">Prossimamente</div>' : ""}
        ${active ? '<div class="deck-active-badge">✅ Attivo</div>' : ""}
      </button>`;
    }).join("")}</div>`;
  }

  function bidChoiceValues() {
    const handSize = currentHandSize();
    return Array.from({ length: handSize + 1 }, function (_item, index) {
      return index;
    });
  }

  function lastBidForbiddenValue() {
    if (!canBid() || !state.snapshot || state.snapshot.phase !== "bidding") return null;
    const players = state.snapshot.players || [];
    const me = currentPlayer();
    if (!me) return null;
    const alive = players.filter(function (player) { return player.lives > 0; });
    const undecided = alive.filter(function (player) { return player.bid == null; });
    if (undecided.length !== 1 || undecided[0].id !== me.id) return null;
    const declaredSum = alive.reduce(function (sum, player) {
      return sum + (player.id === me.id ? 0 : (player.bid == null ? 0 : Number(player.bid)));
    }, 0);
    const forbidden = currentHandSize() - declaredSum;
    if (forbidden < 0 || forbidden > currentHandSize()) return null;
    return forbidden;
  }

  function handStateKey(cards) {
    return `${blindRound() ? "blind" : "open"}|${cards.map(function (card) { return card.id; }).join("|")}`;
  }

  function trickStateKey(entries) {
    return entries.map(function (entry) {
      return `${entry.playerId}:${entry.card && entry.card.id ? entry.card.id : ""}:${entry.assoMode || ""}`;
    }).join("|");
  }

  function canBid() {
    return Boolean(!hasActiveTableAnimation() && state.snapshot && state.snapshot.allowedActions && state.snapshot.allowedActions.canBid);
  }

  function canPlay() {
    return Boolean(!hasActiveTableAnimation() && state.snapshot && state.snapshot.allowedActions && state.snapshot.allowedActions.canPlay);
  }

  function showAssoChoice() {
    if (!state.selectedCardId) return false;
    if (!canPlay() && !canPremove()) return false;
    if (blindRound()) return false;
    return isAssoDiDenara(selectedCard());
  }

  function connectionLabel() {
    if (state.syncStatus === "online") return "Connesso";
    if (state.syncStatus === "syncing") return "Sincronizzo";
    if (state.syncStatus === "offline") return "Offline";
    return "Pronto";
  }

  function connectionClass() {
    if (state.syncStatus === "online") return "online";
    if (state.syncStatus === "syncing") return "syncing";
    if (state.syncStatus === "offline") return "offline";
    return "";
  }

  function restartStatus() {
    return (state.snapshot && state.snapshot.restartStatus) || { required: 0, approved: 0, approvedIds: [], pendingNames: [] };
  }

  function hasApprovedRestart() {
    const status = restartStatus();
    return status.approvedIds.indexOf(state.seatId) >= 0;
  }

  function hasActiveTableAnimation() {
    return Boolean(state.activeTrickSweep || state.activeDealAnimation || animationRunning || animationQueue.length);
  }

  function hasQueuedAnimation(type) {
    return animationQueue.some(function (entry) {
      return entry && entry.type === type;
    });
  }

  function dealPresentationActive() {
    return Boolean(state.activeDealAnimation || hasQueuedAnimation("deal"));
  }

  function showGameoverUi() {
    return Boolean(state.snapshot && state.snapshot.phase === "gameover" && !hasActiveTableAnimation());
  }

  function compactMobileScene() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  }

  function mobileShowcasePlayerView() {
    return Boolean(
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches &&
      state.view === "player" &&
      state.snapshot &&
      state.snapshot.phase !== "setup"
    );
  }

  function immersivePlayerView() {
    return Boolean(state.view === "player" && state.snapshot && state.snapshot.phase === "playing");
  }

  function phaseLabel() {
    return state.snapshot && state.snapshot.phase ? String(state.snapshot.phase).toUpperCase() : "SETUP";
  }

  function heroMessage() {
    return (state.snapshot && state.snapshot.message) || "Tavolo multiplayer standalone: scegli l URL della rete attiva e distribuisci i link privati ai giocatori.";
  }

  function currentRoundLabel() {
    if (!state.snapshot) return "Nuova";
    return `${state.snapshot.handSize} carte`;
  }

  function currentViewLabel() {
    if (state.view === "hub") return "Lobby";
    if (state.view === "table") return "Tavolo";
    return state.seatId || "Giocatore";
  }

  function winnersLabel(winners) {
    if (!winners || !winners.length) return "Partita terminata";
    if (winners.length === 1) return `Vince ${winners[0].name}.`;
    return `Pareggio tra ${winners.map(function (winner) { return winner.name; }).join(", ")}.`;
  }

  function persistRoomMeta(roomId, data) {
    if (!roomId || !data) return;
    try {
      window.localStorage.setItem(`zanzo-room-meta-${roomId}`, JSON.stringify(data));
    } catch (_error) {}
  }

  function loadRoomMeta(roomId) {
    if (!roomId) return null;
    try {
      const raw = window.localStorage.getItem(`zanzo-room-meta-${roomId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function persistActiveSession() {
    try {
      if (!state.roomId || state.view === "hub") {
        window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
        return;
      }
      window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
        roomId: state.roomId || "",
        seatId: state.view === "player" ? (state.seatId || "") : "",
        token: state.view === "player" ? (state.token || "") : "",
        view: state.view || "hub",
      }));
    } catch (_error) {}
  }

  function persistStaleRooms() {
    try {
      const list = Array.from(staleRoomIds).slice(-12);
      if (!list.length) {
        window.sessionStorage.removeItem(STALE_ROOMS_KEY);
        return;
      }
      window.sessionStorage.setItem(STALE_ROOMS_KEY, JSON.stringify(list));
    } catch (_error) {}
  }

  function markRoomAsStale(roomId) {
    if (!roomId) return;
    staleRoomIds.add(roomId);
    persistStaleRooms();
  }

  function setNotice(message, kind, transient) {
    state.notice = message ? { message, kind: kind || "info" } : null;
    render();
    if (noticeTimer) {
      window.clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    if (transient && message) {
      noticeTimer = window.setTimeout(function () {
        state.notice = null;
        render();
      }, 2000);
    }
  }

  function eventIdOf(event) {
    return event && event.id != null ? String(event.id) : "";
  }

  function markRoomSessionStarted() {
    roomSessionStartedAt = Date.now();
    snapshot404RetryCount = 0;
    if (snapshot404RetryTimer) {
      window.clearTimeout(snapshot404RetryTimer);
      snapshot404RetryTimer = null;
    }
  }

  function clearRoomSessionTracking() {
    roomSessionStartedAt = 0;
    snapshot404RetryCount = 0;
    if (snapshot404RetryTimer) {
      window.clearTimeout(snapshot404RetryTimer);
      snapshot404RetryTimer = null;
    }
  }

  function markSnapshotEventsSeen(snapshot) {
    state.lastSeenTrickEventId = eventIdOf(snapshot && snapshot.lastTrickEvent);
    state.lastSeenDealEventId = eventIdOf(snapshot && snapshot.lastDealEvent);
    state.lastSeenBidEventId = eventIdOf(snapshot && snapshot.lastBidEvent);
  }

  function queueAnimationTimeout(callback, delay) {
    const timerId = window.setTimeout(function () {
      animationTimers = animationTimers.filter(function (id) {
        return id !== timerId;
      });
      callback();
    }, delay);
    animationTimers.push(timerId);
    return timerId;
  }

  function clearAnimationTimers() {
    animationTimers.forEach(function (timerId) {
      window.clearTimeout(timerId);
    });
    animationTimers = [];
    animationQueue = [];
    animationRunning = false;
  }

  function resetTransientAnimations(options) {
    clearAnimationTimers();
    state.activeTrickSweep = null;
    state.activeDealAnimation = null;
    state.activeRoundSummary = null;
    state.activeBidAnnouncement = null;
    if (options && options.dropSeen) {
      state.lastSeenTrickEventId = null;
      state.lastSeenDealEventId = null;
      state.lastSeenBidEventId = null;
      playedAnimationKeys = new Set();
      state.lastSeenEventId = 0;
    }
  }

  function animationEventKey(type, payload) {
    if (!payload || payload.id == null) return "";
    return `${type}:${String(payload.id)}`;
  }

  function cardAnnouncementLabel(card, assoMode) {
    if (!card) return "";
    let label = `${card.rankLabel} di ${card.suitLabel}`;
    if (isAssoDiDenara(card) && assoMode) {
      label += assoMode === "high" ? " alto" : " basso";
    }
    return label;
  }

  function runAnimationQueue() {
    if (animationRunning || !animationQueue.length) return;
    const nextAnimation = animationQueue.shift();
    if (!nextAnimation) return;
    animationRunning = true;

    if (nextAnimation.type === "play") {
      window.ZanzoEffects.play(nextAnimation.payload);
      animationRunning = false;
      runAnimationQueue();
      return;
    }

    if (nextAnimation.type === "round") {
      state.activeRoundSummary = nextAnimation.payload;
      state.activeTrickSweep = null;
      state.activeBidAnnouncement = null;
      render();
      queueAnimationTimeout(function () {
        state.activeRoundSummary = null;
        animationRunning = false;
        runAnimationQueue();
        render();
      }, 2200);
      return;
    }

    if (nextAnimation.type === "trick") {
      state.activeTrickSweep = nextAnimation.payload;
      state.activeDealAnimation = null;
      render();
      queueAnimationTimeout(function () {
        state.activeTrickSweep = null;
        animationRunning = false;
        runAnimationQueue();
        render();
      }, nextAnimation.payload.handSize === 1 ? 5500 : 4200);
      return;
    }

    if (nextAnimation.type === "deal") {
      state.activeDealAnimation = nextAnimation.payload;
      state.activeTrickSweep = null;
      state.activeBidAnnouncement = null;
      render();
      queueAnimationTimeout(function () {
        state.activeDealAnimation = null;
        animationRunning = false;
        runAnimationQueue();
        render();
      }, 2800);
      return;
    }

    if (nextAnimation.type === "bid") {
      state.activeBidAnnouncement = nextAnimation.payload;
      render();
      queueAnimationTimeout(function () {
        state.activeBidAnnouncement = null;
        animationRunning = false;
        runAnimationQueue();
        render();
      }, 1700);
      return;
    }

    animationRunning = false;
    runAnimationQueue();
  }

  function enqueueTableAnimation(type, payload) {
    if (!payload || payload.id == null) return;
    const key = animationEventKey(type, payload);
    if (!key || playedAnimationKeys.has(key)) return;
    if (animationQueue.some(function (entry) {
      return animationEventKey(entry.type, entry.payload) === key;
    })) {
      return;
    }
    if (
      (type === "trick" && state.activeTrickSweep && animationEventKey(type, state.activeTrickSweep) === key) ||
      (type === "deal" && state.activeDealAnimation && animationEventKey(type, state.activeDealAnimation) === key) ||
      (type === "bid" && state.activeBidAnnouncement && animationEventKey(type, state.activeBidAnnouncement) === key)
    ) {
      return;
    }
    playedAnimationKeys.add(key);
    animationQueue.push({ type, payload });
    runAnimationQueue();
  }

  function syncSnapshotAnimations(snapshot, options) {
    if (snapshot && snapshot.events) {
      const events = snapshot.events.slice().sort((a, b) => a.id - b.id);
      if (options && options.firstLoad && !options.allowCurrent) {
        const deal = snapshot.lastDealEvent;
        const enteringFreshDeal = snapshot.phase === "bidding" && deal &&
          Date.now() / 1000 - deal.createdAt < 10 && snapshot.players.every(p => p.bid == null);
        if (enteringFreshDeal) {
          state.lastSeenEventId = deal.id - 1;
        } else {
          state.lastSeenEventId = Math.max(0, ...events.map(event => event.id));
          markSnapshotEventsSeen(snapshot);
          return;
        }
      }
      events.forEach(function (event) {
        if (event.id > (state.lastSeenEventId || 0)) {
          state.lastSeenEventId = event.id;
          const key = animationEventKey(event.type, event);
          if (!playedAnimationKeys.has(key)) {
            playedAnimationKeys.add(key);
            animationQueue.push({type:event.type, payload:event});
          }
        }
      });
      if (playedAnimationKeys.size > 256) playedAnimationKeys = new Set(Array.from(playedAnimationKeys).slice(-128));
      runAnimationQueue();
      return;
    }
    const bidEvent = snapshot && snapshot.lastBidEvent;
    const trickEvent = snapshot && snapshot.lastTrickEvent;
    const dealEvent = snapshot && snapshot.lastDealEvent;
    const firstLoad = Boolean(options && options.firstLoad);
    const allowCurrent = Boolean(options && options.allowCurrent);
    const previousSnapshot = options && options.previousSnapshot;

    if (firstLoad && !allowCurrent) {
      markSnapshotEventsSeen(snapshot);
      return;
    }

    if (bidEvent && eventIdOf(bidEvent) !== state.lastSeenBidEventId) {
      state.lastSeenBidEventId = eventIdOf(bidEvent);
      enqueueTableAnimation("bid", bidEvent);
    }

    if (trickEvent && eventIdOf(trickEvent) !== state.lastSeenTrickEventId) {
      state.lastSeenTrickEventId = eventIdOf(trickEvent);
      enqueueTableAnimation("trick", Object.assign({}, trickEvent, {
        cards: ((trickEvent && trickEvent.cards) || (previousSnapshot && previousSnapshot.tableCards) || []).map(function (entry) {
          return {
            playerId: entry.playerId,
            playerName: entry.playerName,
            card: entry.card,
            assoMode: entry.assoMode,
          };
        }),
      }));
    }

    if (dealEvent && eventIdOf(dealEvent) !== state.lastSeenDealEventId) {
      state.lastSeenDealEventId = eventIdOf(dealEvent);
      enqueueTableAnimation("deal", dealEvent);
    }
  }

  function updateUrl() {
    persistActiveSession();
    const nextUrl = window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }



  function serverUnavailableMessage(path) {
    if (path === "/api/info") {
      return "Server Zanzo non raggiungibile. Ricarica la pagina.";
    }
    return "Connessione al server Zanzo interrotta. Ricarica la pagina.";
  }

  function isD1RateLimited(message) {
    const text = String(message || "");
    return text.includes("D1 HTTP 429")
      || text.includes("throttling your request speed")
      || text.includes('"code":971');
  }

  async function api(path, options) {
    let response;
    const headers = { "Content-Type": "application/json" };
    if (state.authToken) headers["Authorization"] = "Bearer " + state.authToken;
    if (path.startsWith("/api/matchmaking/") && state.matchmakingQueueToken) headers["X-Queue-Token"] = state.matchmakingQueueToken;
    try {
      response = await (window.ZanzoRealtime ? window.ZanzoRealtime.request : fetch)(path, {
        method: (options && options.method) || "GET",
        headers: headers,
        body: (options && options.body) || null,
      });
    } catch (_error) {
      throw new Error(serverUnavailableMessage(path));
    }
    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok || data.ok === false) {
      const rawMessage = data.error || "Errore di rete.";
      const message = (response.status === 429 || isD1RateLimited(rawMessage))
        ? "Server momentaneamente occupato. Riprova tra qualche secondo."
        : rawMessage;
      const err = new Error(message);
      err.httpStatus = response.status;
      err.rawMessage = rawMessage;
      throw err;
    }
    return data;
  }

  async function loadCurrentUser() {
    if (!state.authToken) return;
    try {
      const data = await api("/api/auth/me");
      state.currentUser = data.user;
      ensureSocialPolling();
    } catch (e) {
      if (e && (e.httpStatus === 401 || e.httpStatus === 403)) {
        state.authToken = null;
        state.currentUser = null;
        localStorage.removeItem("zanzo-auth-token");
      }
    }
  }

  async function submitAuth() {
    const username = state.authUsername.trim();
    const password = state.authPassword;
    if (!username || !password) {
      state.authError = "Inserisci username e password.";
      render();
      return;
    }
    state.authBusy = true;
    state.authError = null;
    render();
    try {
      const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const data = await api(path, { method: "POST", body: JSON.stringify({ username, password }) });
      state.authToken = data.token;
      state.currentUser = data.user;
      state.authPassword = "";
      state.authModalOpen = false;
      state.authError = null;
      localStorage.setItem("zanzo-auth-token", data.token);
      ensureSocialPolling();
    } catch (err) {
      state.authError = err.message;
    } finally {
      state.authBusy = false;
      render();
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_e) {}
    if (socialPollId) {
      window.clearInterval(socialPollId);
      socialPollId = null;
    }
    if (presencePollId) {
      window.clearInterval(presencePollId);
      presencePollId = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    state.authToken = null;
    state.currentUser = null;
    state.historyData = null;
    state.friendsData = [];
    state.friendRequests = { incoming: [], outgoing: [] };
    state.invitesData = [];
    state.activeLobbies = [];
    localStorage.removeItem("zanzo-auth-token");
    render();
  }

  async function profileSaveUsername() {
    const newUsername = state.profileNewUsername.trim();
    const oldPassword = state.profileOldPassword;
    if (!newUsername) { state.profileError = "Inserisci il nuovo username."; render(); return; }
    if (!oldPassword) { state.profileError = "Inserisci la password attuale per confermare."; render(); return; }
    state.profileBusy = true; state.profileError = null; state.profileSuccess = null; render();
    try {
      const data = await api("/api/auth/update", { method: "POST", body: JSON.stringify({ newUsername, currentPassword: oldPassword }) });
      state.currentUser = { ...state.currentUser, username: data.username };
      state.profileNewUsername = ""; state.profileOldPassword = "";
      state.profileSuccess = "Username aggiornato."; state.profileTab = "info";
    } catch (err) { state.profileError = err.message; }
    finally { state.profileBusy = false; render(); }
  }

  async function profileSavePassword() {
    const oldPassword = state.profileOldPassword;
    const newPassword = state.profileNewPassword;
    if (!oldPassword) { state.profileError = "Inserisci la password attuale."; render(); return; }
    if (!newPassword || newPassword.length < 10) { state.profileError = "La nuova password deve avere almeno 10 caratteri."; render(); return; }
    state.profileBusy = true; state.profileError = null; state.profileSuccess = null; render();
    try {
      await api("/api/auth/update", { method: "POST", body: JSON.stringify({ currentPassword: oldPassword, newPassword }) });
      state.profileOldPassword = ""; state.profileNewPassword = "";
      state.profileSuccess = "Password aggiornata."; state.profileTab = "info";
    } catch (err) { state.profileError = err.message; }
    finally { state.profileBusy = false; render(); }
  }

  async function loadHistory() {
    if (!state.currentUser) return;
    try {
      const data = await api("/api/history");
      state.historyData = data.games;
      render();
    } catch (err) {
      setNotice(err.message, "error");
    }
  }

  function lobbyReadyForMe(lobby) {
    return Boolean(
      lobby &&
      lobby.status === "started" &&
      lobby.roomId &&
      lobby.me &&
      lobby.me.seatId &&
      lobby.me.seatToken
    );
  }

  function enterStartedLobby(lobby) {
    if (!lobbyReadyForMe(lobby)) return;
    if (staleRoomIds.has(lobby.roomId)) return;
    const alreadyThere =
      state.view === "player" &&
      state.roomId === lobby.roomId &&
      state.seatId === lobby.me.seatId &&
      state.token === lobby.me.seatToken;
    if (alreadyThere) return;
    state.view = "player";
    state.roomId = lobby.roomId;
    state.seatId = lobby.me.seatId;
    state.token = lobby.me.seatToken;
    state.snapshot = null;
    state.snapshotKey = "";
    state.selectedCardId = null;
    state.selectedAssoMode = null;
    state.handAnimationKey = "";
    state.trickAnimationKey = "";
    state.playerMobilePane = "hand";
    state.roomMeta = null;
    resetTransientAnimations({ dropSeen: true });
    markRoomSessionStarted();
    updateUrl();
    stopLobbyPolling();
    state.waitingLobbyId = "";
    ensurePolling();
    setNotice("Tutti pronti — buona partita!", "success", true);
  }

  async function pingPresence() {
    if (!state.currentUser) return;
    try {
      await api("/api/presence/ping", { method: "POST", body: "{}" });
    } catch (_error) {}
  }

  async function loadSocialData(options) {
    if (!state.currentUser) return;
    const silent = Boolean(options && options.silent);
    if (!silent) {
      state.socialBusy = true;
      state.socialError = null;
      render();
    }
    try {
      const data = await api("/api/friends");
      state.friendsData = data.friends || [];
      state.friendRequests = data.requests || { incoming: [], outgoing: [] };
      state.invitesData = data.invites || [];
      state.activeLobbies = data.lobbies || [];
      // Mostra popup per i nuovi inviti non ancora notificati
      if (!state.invitePopup) {
        const firstNew = (state.invitesData).find(function (invite) {
          return invite.status === "pending" &&
            invite.lobbyStatus !== "expired" &&
            invite.lobbyStatus !== "cancelled" &&
            !_shownInvitePopupIds.has(invite.id);
        });
        if (firstNew) {
          _shownInvitePopupIds.add(firstNew.id);
          state.invitePopup = firstNew;
        }
      }
      const readyLobby = state.activeLobbies.find(lobbyReadyForMe);
      if (readyLobby) {
        enterStartedLobby(readyLobby);
      } else if (!silent) {
        render();
      }
    } catch (err) {
      state.socialError = err.message;
      if (!silent) render();
    } finally {
      state.socialBusy = false;
      if (!silent) render();
    }
  }

  function ensureSocialPolling() {
    if (socialPollId) {
      window.clearInterval(socialPollId);
      socialPollId = null;
    }
    if (presencePollId) {
      window.clearInterval(presencePollId);
      presencePollId = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    if (!state.currentUser) return;
    pingPresence();
    loadSocialData({ silent: true });
    presencePollId = window.setInterval(function () {
      pingPresence();
    }, 35000);
    socialPollId = window.setInterval(function () {
      loadSocialData({ silent: true });
    }, 20000);
    visibilityHandler = function () {
      if (document.visibilityState === "visible") {
        pingPresence();
        loadSocialData({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  function startLobbyPolling() {
    if (lobbyPollId) return;
    lobbyPollId = window.setInterval(function () {
      loadSocialData({ silent: true });
    }, 5000);
  }

  function stopLobbyPolling() {
    if (lobbyPollId) {
      window.clearInterval(lobbyPollId);
      lobbyPollId = null;
    }
  }

  function onlineFriends() {
    return (state.friendsData || []).filter(function (friend) {
      return friend.online;
    });
  }

  function selectedOnlineInvitees() {
    const onlineIds = new Set(onlineFriends().map(function (friend) { return String(friend.id); }));
    return (state.selectedInviteeIds || []).filter(function (id) {
      return onlineIds.has(String(id));
    });
  }

  async function sendFriendRequest() {
    const username = String(state.friendSearchUsername || "").trim();
    if (!username) return setNotice("Inserisci lo username dell'amico.", "error");
    state.socialBusy = true;
    state.socialError = null;
    render();
    try {
      await api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ username: username }),
      });
      state.friendSearchUsername = "";
      await loadSocialData({ silent: true });
      setNotice("Richiesta amicizia inviata.", "success", true);
    } catch (err) {
      state.socialError = err.message;
      setNotice(err.message, "error");
    } finally {
      state.socialBusy = false;
      render();
    }
  }

  async function respondFriendRequest(requestId, action) {
    state.socialBusy = true;
    state.socialError = null;
    render();
    try {
      await api(`/api/friends/request/${requestId}/${action}`, { method: "POST", body: "{}" });
      await loadSocialData({ silent: true });
      setNotice(action === "accept" ? "Amicizia confermata." : "Richiesta rifiutata.", "success", true);
    } catch (err) {
      state.socialError = err.message;
      setNotice(err.message, "error");
    } finally {
      state.socialBusy = false;
      render();
    }
  }

  function toggleInvitee(userId) {
    const key = String(userId);
    const selected = new Set((state.selectedInviteeIds || []).map(String));
    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
    state.selectedInviteeIds = Array.from(selected);
    render();
  }

  async function createFriendsLobby() {
    const existingLobby = currentWaitingLobby();
    if (existingLobby && (existingLobby.status === "pending" || existingLobby.status === "ready")) {
      state.waitingLobbyId = existingLobby.lobbyId;
      state.hubMode = "friends-waiting";
      startLobbyPolling();
      render();
      return setNotice("Hai gia una lobby in attesa: completa quella prima di inviare nuovi inviti.", "warn");
    }
    const inviteeIds = selectedOnlineInvitees().map(function (id) { return Number(id); });
    if (!inviteeIds.length) return setNotice("Seleziona almeno un amico online.", "error");
    state.socialBusy = true;
    state.socialError = null;
    render();
    try {
      const data = await api("/api/lobbies", {
        method: "POST",
        body: JSON.stringify({ inviteeIds: inviteeIds }),
      });
      if (data.lobby && data.lobby.lobbyId) {
        state.waitingLobbyId = data.lobby.lobbyId;
        state.hubMode = "friends-waiting";
        state.selectedInviteeIds = [];
        startLobbyPolling();
        render();
      }
      await loadSocialData({ silent: true });
      const waitingLobby = currentWaitingLobby();
      if (waitingLobby) {
        state.waitingLobbyId = waitingLobby.lobbyId;
        state.hubMode = "friends-waiting";
        state.selectedInviteeIds = [];
        startLobbyPolling();
      }
      setNotice("Inviti inviati — aspetta che i tuoi amici accettino.", "success", true);
    } catch (err) {
      state.socialError = err.message;
      setNotice(err.message, "error");
    } finally {
      state.socialBusy = false;
      render();
    }
  }

  async function cancelLobby(lobbyId) {
    state.socialBusy = true;
    render();
    try {
      await api(`/api/lobbies/${lobbyId}`, { method: "DELETE", body: "{}" });
      await loadSocialData({ silent: true });
      state.waitingLobbyId = "";
      state.hubMode = "play-mode";
      stopLobbyPolling();
    } catch (err) {
      setNotice(err.message, "error");
    } finally {
      state.socialBusy = false;
      render();
    }
  }

  async function respondInvite(inviteId, action) {
    state.socialBusy = true;
    state.socialError = null;
    render();
    try {
      const data = await api(`/api/invites/${inviteId}/${action}`, { method: "POST", body: "{}" });
      await loadSocialData({ silent: true });
      if (data.lobby && lobbyReadyForMe(data.lobby)) {
        enterStartedLobby(data.lobby);
      } else if (action === "accept" && data.lobby && data.lobby.lobbyId) {
        state.waitingLobbyId = data.lobby.lobbyId;
        state.hubMode = "friends-waiting";
      }
      setNotice(action === "accept" ? "Invito accettato." : "Invito rifiutato.", "success", true);
    } catch (err) {
      state.socialError = err.message;
      setNotice(err.message, "error");
    } finally {
      state.socialBusy = false;
      render();
    }
  }

  function openFriendsHub(focusSearch) {
    if (!state.currentUser) {
      state.authModalOpen = true;
      render();
      return;
    }
    state.waitingLobbyId = "";
    // Keep a single social layout regardless of entry point (search icon or play card).
    state.hubMode = "friends-manage";
    loadSocialData({ silent: true });
    render();
    if (focusSearch) {
      window.setTimeout(function () {
        const input = document.querySelector("[data-social-field='friendSearchUsername']");
        if (input) input.focus();
      }, 0);
    }
  }

  function socialNotificationCount() {
    const pendingInvites = (state.invitesData || []).filter(function (invite) {
      return invite.status === "pending";
    }).length;
    const pendingRequests = (((state.friendRequests || {}).incoming) || []).filter(function (request) {
      return request.status === "pending";
    }).length;
    return pendingInvites + pendingRequests;
  }

  let matchmakingPollId = null;

  async function joinMatchmaking() {
    try {
      const body = {};
      if (!state.currentUser) body.guestName = state.guestName;
      const data = await api("/api/matchmaking/join", { method: "POST", body: JSON.stringify(body) });
      state.matchmakingQueueId = data.queueId;
      state.matchmakingQueueToken = data.queueToken;
      state.matchmakingWaiting = 1;
      state.matchmakingNeeded = 2;
      state.matchmakingCountdownTotal = 50;
      state.matchmakingCountdownRemaining = 50;
      state.hubMode = "waiting";
      render();
      clearInterval(matchmakingPollId);
      pollMatchmaking();
      matchmakingPollId = setInterval(pollMatchmaking, 1000);
    } catch (err) { setNotice(err.message, "error"); }
  }

  async function pollMatchmaking() {
    if (!state.matchmakingQueueId) return;
    const queueId = state.matchmakingQueueId;
    try {
      const data = await api("/api/matchmaking/status?id=" + queueId);
      if (state.matchmakingQueueId !== queueId || state.hubMode !== "waiting") return;
      state.matchmakingWaiting = data.waitingCount;
      state.matchmakingNeeded = data.totalNeeded;
      state.matchmakingCountdownTotal = data.countdownTotal || 50;
      state.matchmakingCountdownRemaining = data.countdownRemaining == null ? state.matchmakingCountdownRemaining : data.countdownRemaining;
      if (data.status === "matched" && data.roomId) {
        clearInterval(matchmakingPollId);
        state.matchmakingQueueId = null;
        state.hubMode = null;
        state.roomId = data.roomId;
        state.seatId = data.seatId;
        state.token = data.seatToken;
        state.view = "player";
        markRoomSessionStarted();
        ensurePolling();
      } else if (data.countdownRemaining === 0 && (data.waitingCount || 0) < (data.minPlayers || 2)) {
        // Timer scaduto senza abbastanza giocatori — annulla e torna all'hub
        clearInterval(matchmakingPollId);
        const queueId = state.matchmakingQueueId;
        state.matchmakingQueueId = null;
        state.matchmakingCountdownRemaining = 50;
        state.hubMode = null;
        render();
        try { await api("/api/matchmaking/leave", { method: "DELETE", body: JSON.stringify({ queueId }) }); } catch (_e) {}
        return;
      }
      render();
    } catch (_e) {}
  }

  async function leaveMatchmaking() {
    clearInterval(matchmakingPollId);
    const queueId = state.matchmakingQueueId;
    state.matchmakingQueueId = null;
    state.matchmakingCountdownRemaining = 50;
    state.hubMode = "play-mode";
    render();
    try { await api("/api/matchmaking/leave", { method: "DELETE", body: JSON.stringify({ queueId }) }); } catch (_e) {}
  }

  async function leaveCurrentRoom() {
    const roomId = state.roomId;
    const seatId = state.seatId;
    const token = state.token;
    try {
      window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch (_error) {}
    if (roomId && seatId && token) {
      try {
        await api(`/api/rooms/${roomId}/leave`, {
          method: "DELETE",
          body: JSON.stringify({ seatId, token }),
        });
      } catch (error) {
        if (!(error && (error.httpStatus === 404 || error.message === "Stanza non trovata."))) {
          setNotice(error.message || "Non sono riuscito a chiudere la partita sul server.", "error");
        }
      }
    }
    markRoomAsStale(roomId);
    state.view = "hub";
    state.snapshot = null;
    state.snapshotKey = "";
    state.roomId = "";
    state.seatId = "";
    state.token = "";
    clearRoomSessionTracking();
    state.selectedCardId = null;
    state.selectedAssoMode = null;
    state.handAnimationKey = "";
    state.trickAnimationKey = "";
    resetTransientAnimations({ dropSeen: true });
    state.joinForm = { roomId: "", seatId: "", token: "" };
    render();
    ensurePolling();
    if (state.currentUser) {
      loadSocialData();
    }
  }

  async function loadServerInfo() {
    try {
      const info = await api("/api/info");
      if (window.ZanzoRealtime) window.ZanzoRealtime.enable(info.realtime);
    } catch (_error) {
      state.syncStatus = "offline";
    }
  }

  async function fetchSnapshot(force) {
    if (!state.roomId || state.view === "hub" || snapshotRequestRunning) return;
    if (document.hidden && !force) return;
    snapshotRequestRunning = true;
    const requestedRoom = state.roomId;
    const requestedSeat = state.seatId;
    const previousStatus = state.syncStatus;
    state.syncStatus = state.syncStatus === "online" && !force ? "online" : "syncing";
    if (force && previousStatus !== state.syncStatus) render();
    try {
      const params = new URLSearchParams({ role: state.view === "player" ? "player" : "table" });
      if (state.view === "player") {
        params.set("seatId", state.seatId);
        params.set("token", state.token);
      }
      const data = await api(`/api/rooms/${state.roomId}/snapshot?${params.toString()}`);
      if (state.roomId !== requestedRoom || state.seatId !== requestedSeat || state.view === "hub") return;
      const previousSnapshot = state.snapshot;
      // Scarta snapshot stale da D1 read-replica (eventual consistency):
      // se l'updatedAt è più vecchio di quello che abbiamo già, ignora questa risposta.
      if (previousSnapshot && data.revision != null && previousSnapshot.revision != null && data.revision < previousSnapshot.revision) {
        state.syncStatus = "online";
        return;
      }
      if (previousSnapshot && data.matchId === previousSnapshot.matchId && data.updatedAt != null && previousSnapshot.updatedAt != null) {
        if (
          data.updatedAt < previousSnapshot.updatedAt ||
          (data.updatedAt === previousSnapshot.updatedAt &&
            data.roundIndex != null && previousSnapshot.roundIndex != null &&
            ((data.cycle || 1) * 5 + data.roundIndex) < ((previousSnapshot.cycle || 1) * 5 + previousSnapshot.roundIndex))
        ) {
          state.syncStatus = "online";
          return;
        }
      }
      const previousMessage = previousSnapshot && previousSnapshot.message ? String(previousSnapshot.message) : "";
      const nextSnapshotKey = snapshotVersionKey(data);
      const previousSnapshotKey = state.snapshotKey;
      let shouldRender = Boolean(force || nextSnapshotKey !== previousSnapshotKey || previousStatus !== "online");
      const previousPhase = previousSnapshot && previousSnapshot.phase;
      state.snapshot = data;
      state.snapshotKey = nextSnapshotKey;
      state.syncStatus = "online";
      if (state.view === "player") {
        const previousCanPlay = Boolean(previousSnapshot && previousSnapshot.allowedActions && previousSnapshot.allowedActions.canPlay);
        const nextCanPlay = Boolean(data && data.allowedActions && data.allowedActions.canPlay);
        const nextCanBid = Boolean(data && data.allowedActions && data.allowedActions.canBid);
        if (compactMobileScene()) {
          let preferredPane = state.playerMobilePane;
          if (data.phase === "bidding") {
            preferredPane = "hand";
          } else if (data.phase === "playing") {
            if ((!previousCanPlay && nextCanPlay) || previousPhase !== data.phase) {
              preferredPane = nextCanPlay ? "hand" : "table";
            } else if (previousCanPlay && !nextCanPlay) {
              preferredPane = "table";
            }
          }
          if (preferredPane !== state.playerMobilePane) {
            state.playerMobilePane = preferredPane;
            shouldRender = true;
          }
          if (data.phase === "bidding" && nextCanBid && state.playerMobilePane !== "hand") {
            state.playerMobilePane = "hand";
            shouldRender = true;
          }
        } else {
          if (data.phase !== "bidding" && state.playerMobilePane !== "table") {
            state.playerMobilePane = "table";
            shouldRender = true;
          }
          if (data.phase === "bidding" && state.playerMobilePane !== "hand") {
            state.playerMobilePane = "hand";
            shouldRender = true;
          }
        }
      }
      if (state.view === "player" && previousPhase !== data.phase) {
        shouldRender = true;
      }
      if (!state.roomMeta || state.roomMeta.roomId !== state.roomId) {
        state.roomMeta = loadRoomMeta(state.roomId);
        shouldRender = true;
      }
      if (previousSnapshot && data.message && data.message !== previousMessage && /ha abbandonato|vince per ritiro/i.test(String(data.message))) {
        setNotice(String(data.message), "warn", true);
      }
      if (state.selectedCardId && !myHand().some(function (card) { return card.id === state.selectedCardId; })) {
        state.selectedCardId = null;
        state.selectedAssoMode = null;
        shouldRender = true;
      }
      syncSnapshotAnimations(data, { firstLoad: !previousSnapshot, previousSnapshot: previousSnapshot });
      if (shouldRender) render();
      snapshot404RetryCount = 0;
    } catch (error) {
      if (error.httpStatus === 404 || error.httpStatus === 410) {
        if (error.httpStatus === 404) {
          const withinJoinGrace = roomSessionStartedAt > 0 && (Date.now() - roomSessionStartedAt) < 20000;
          const canRetry = state.view === "player" && withinJoinGrace && snapshot404RetryCount < 4;
          if (canRetry) {
            snapshot404RetryCount += 1;
            const delay = 350 * snapshot404RetryCount;
            setNotice("Riconnessione stanza in corso...", "warn", true);
            if (snapshot404RetryTimer) {
              window.clearTimeout(snapshot404RetryTimer);
            }
            snapshot404RetryTimer = window.setTimeout(function () {
              snapshot404RetryTimer = null;
              fetchSnapshot(true);
            }, delay);
            return;
          }
        }
        // 404: stanza non esiste più (server riavviato)
        // 410: player ha già abbandonato — accesso permanentemente revocato
        markRoomAsStale(state.roomId);
        state.roomId = "";
        state.seatId = "";
        state.token = "";
        state.snapshot = null;
        state.roomMeta = null;
        state.view = "hub";
        state.syncStatus = "idle";
        clearRoomSessionTracking();
        persistActiveSession();
        render();
        if (error.httpStatus === 410) {
          setNotice("Hai abbandonato questa partita.", "warn", true);
        }
        return;
      }
      const wasOffline = state.syncStatus === "offline";
      state.syncStatus = "offline";
      if (!wasOffline) render();
      setNotice(error.message, "error");
    } finally {
      snapshotRequestRunning = false;
    }
  }

  function preloadDeckImages() {
    const deck = state.deckStyle || "napoletane";
    const suits = ["oro", "coppe", "spade", "bastoni"];
    const ranks = ["asso", "2", "3", "4", "5", "6", "7", "fante", "cavallo", "re"];
    suits.forEach(function (suit) {
      ranks.forEach(function (rank) {
        const img = new Image();
        img.src = "assets/cards/" + deck + "/" + rank + "-" + suit + ".jpg";
      });
    });
    const back = new Image();
    back.src = "assets/cards/" + deck + "/back.jpg";
  }

  function ensurePolling() {
    if (pollId) {
      window.clearInterval(pollId);
      pollId = null;
    }
    if (!state.roomId || state.view === "hub") return;
    preloadDeckImages();
    fetchSnapshot(true);
    const cloud = window.ZanzoRealtime && window.ZanzoRealtime.isEnabled();
    const pollInterval = cloud ? 900 : ((state.snapshot && state.snapshot.botMode) || (state.roomMeta && state.roomMeta.botMode) ? 420 : 900);
    pollId = window.setInterval(function () {
      fetchSnapshot(false);
    }, pollInterval);
  }



  async function createBotRoom() {
    state.busy = true;
    render();
    try {
      const humanName = state.currentUser ? state.currentUser.username : state.guestName;
      const data = await api("/api/rooms/bots", {
        method: "POST",
        body: JSON.stringify({
          humanName: humanName,
          playerCount: (state.botCount || 1) + 1,
        }),
      });
      state.view = "player";
      state.roomId = data.roomId;
      state.seatId = data.seatId;
      state.token = data.seatToken;
      state.snapshot = data.snapshot;
      state.snapshotKey = snapshotVersionKey(data.snapshot);
      state.roomMeta = { roomId: data.roomId, seats: data.seats || [], botMode: true };
      state.joinForm = { roomId: data.roomId, seatId: data.seatId, token: data.seatToken };
      state.selectedCardId = null;
      state.selectedAssoMode = null;
      state.handAnimationKey = "";
      state.trickAnimationKey = "";
      state.playerMobilePane = data.snapshot && data.snapshot.phase === "bidding" ? "hand" : "table";
      state.syncStatus = "online";
      markRoomSessionStarted();
      resetTransientAnimations({ dropSeen: true });
      syncSnapshotAnimations(state.snapshot, { firstLoad: true, allowCurrent: true });
      persistRoomMeta(data.roomId, state.roomMeta);
      showZanzoSplash();
      updateUrl();
      render();
      ensurePolling();
      setNotice("Partita locale contro i bot pronta.", "success", true);
    } catch (error) {
      setNotice(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function enterTableView() {
    const roomId = String(state.joinForm.roomId || "").trim().toUpperCase();
    if (!roomId) return setNotice("Inserisci almeno il codice stanza.", "error");
    state.view = "table";
    state.roomId = roomId;
    state.snapshot = null;
    state.snapshotKey = "";
    state.seatId = "";
    state.token = "";
    state.handAnimationKey = "";
    state.trickAnimationKey = "";
    state.playerMobilePane = "hand";
    resetTransientAnimations({ dropSeen: true });
    markRoomSessionStarted();
    state.roomMeta = loadRoomMeta(roomId);
    updateUrl();
    render();
    ensurePolling();
  }

  function enterPlayerView() {
    const roomId = String(state.joinForm.roomId || "").trim().toUpperCase();
    const seatId = String(state.joinForm.seatId || "").trim().toUpperCase();
    const token = String(state.joinForm.token || "").trim();
    if (!roomId || !seatId || !token) {
      return setNotice("Inserisci stanza, seat e token del giocatore.", "error");
    }
    state.view = "player";
    state.roomId = roomId;
    state.seatId = seatId;
    state.token = token;
    state.snapshot = null;
    state.snapshotKey = "";
    state.selectedCardId = null;
    state.selectedAssoMode = null;
    state.handAnimationKey = "";
    state.trickAnimationKey = "";
    state.playerMobilePane = "hand";
    resetTransientAnimations({ dropSeen: true });
    state.roomMeta = loadRoomMeta(roomId);
    updateUrl();
    render();
    ensurePolling();
  }

  async function submitBid() {
    if (state.busy || !canBid()) return;
    const parsedBid = parseInt(String(state.bidInput || "").trim(), 10);
    if (!Number.isInteger(parsedBid)) {
      return setNotice("Scegli prima quante prese vuoi dichiarare.", "error");
    }
    state.busy = true;
    render();
    try {
      await api(`/api/rooms/${state.roomId}/bid`, {
        method: "POST",
        body: JSON.stringify({
          seatId: state.seatId,
          token: state.token,
          bid: parsedBid,
        }),
      });
      state.bidInput = "0";
      await fetchSnapshot(true);
      if (state.snapshot && state.snapshot.phase !== "bidding") {
        state.playerMobilePane = "table";
      }
    } catch (error) {
      setNotice(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function canPremove() {
    return Boolean(!hasActiveTableAnimation() && state.snapshot?.allowedActions?.canPremove);
  }

  async function queuePremove(cardId, assoMode) {
    if (state.busy || (!canPremove() && cardId)) return;
    state.busy = true;
    render();
    try {
      await api(`/api/rooms/${state.roomId}/premove`, {
        method:"POST", body:JSON.stringify({seatId:state.seatId, token:state.token,
          matchId:state.snapshot.matchId, roundId:state.snapshot.lastDealEvent?.id,
          cardId:cardId || null, assoMode:assoMode || null})
      });
      state.selectedCardId = null;
      state.selectedAssoMode = null;
      state.selectedForPremove = false;
      await fetchSnapshot(true);
    } catch (error) { setNotice(error.message, "error"); }
    finally { state.busy = false; render(); }
  }

  async function playCard(cardIdOverride) {
    if (state.busy || !canPlay()) return;
    const cardId = cardIdOverride || state.selectedCardId;
    if (!cardId) return setNotice("Seleziona una carta.", "error");
    if (cardId !== state.selectedCardId) {
      state.selectedCardId = cardId;
    }
    if (blindRound()) {
      state.selectedAssoMode = null;
    }
    if (!blindRound() && isAssoDiDenara(selectedCard()) && !state.selectedAssoMode) {
      return setNotice("Scegli se l Asso di Denara vale massimo o minimo.", "error");
    }
    state.busy = true;
    render();
    try {
      await api(`/api/rooms/${state.roomId}/play`, {
        method: "POST",
        body: JSON.stringify({
          seatId: state.seatId,
          token: state.token,
          cardId: cardId,
          assoMode: state.selectedAssoMode,
        }),
      });
      state.selectedCardId = null;
      state.selectedAssoMode = null;
      await fetchSnapshot(true);
    } catch (error) {
      setNotice(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function shouldAutoPlayCard(card) {
    if (!card || !canPlay() || state.busy) return false;
    if (blindRound()) return false;
    if (isAssoDiDenara(card)) return false;
    return true;
  }

  async function restartRoom() {
    state.busy = true;
    render();
    try {
      state.snapshot = await api(`/api/rooms/${state.roomId}/restart`, {
        method: "POST",
        body: JSON.stringify({
          seatId: state.seatId,
          token: state.token,
        }),
      });
      state.snapshotKey = snapshotVersionKey(state.snapshot);
      state.handAnimationKey = "";
      state.trickAnimationKey = "";
      state.selectedCardId = null;
      state.selectedAssoMode = null;
      state.bidInput = "0";
      state.syncStatus = "online";
      resetTransientAnimations({ dropSeen: true });
      syncSnapshotAnimations(state.snapshot, { firstLoad: true, allowCurrent: true });
      render();
    } catch (error) {
      setNotice(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  async function copyToClipboard(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setNotice(`Copiato: ${label}`, "success", true);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (!copied) {
        throw new Error("copy-failed");
      }

      setNotice(`Copiato: ${label}`, "success", true);
    } catch (_error) {
      window.prompt("Copia manualmente questo link:", text);
      setNotice("Copia automatica non riuscita: ti ho aperto il link completo da copiare.", "warn");
    }
  }



  function cardImagePath(card, hidden) {
    const deck = state.deckStyle || "napoletane";
    if (hidden || (card && card.hidden)) return `assets/cards/${deck}/back.jpg`;
    if (!card) return "";
    return `assets/cards/${deck}/${card.rank}-${card.suit}.jpg`;
  }

  function cardSuitDisplayLabel(card) {
    return card?.suitLabel || card?.suit || "";
  }

  function cardIdentity(card) {
    if (!card) return "empty";
    if (card.id) return String(card.id);
    return `${card.rank || "x"}-${card.suit || "x"}`;
  }

  function cardMediaToken(card, options) {
    const opts = options || {};
    const hidden = opts.hidden || (card && card.hidden);
    const deck = state.deckStyle || "napoletane";
    const scope = opts.scope || "card";
    return `${scope}|${deck}|${hidden ? "back" : "face"}|${cardIdentity(card)}`;
  }

  function syncPreservedCardPhoto(existing, incoming) {
    if (!existing || !incoming) return;
    existing.className = incoming.className;
    existing.alt = incoming.alt;
    existing.draggable = incoming.draggable;
    existing.loading = incoming.loading;
    existing.decoding = incoming.decoding;
    const src = incoming.getAttribute("src");
    const key = incoming.getAttribute("data-card-media-key");
    if (src && existing.getAttribute("src") !== src) {
      existing.setAttribute("src", src);
    }
    if (key) {
      existing.setAttribute("data-card-media-key", key);
    } else {
      existing.removeAttribute("data-card-media-key");
    }
  }

  function captureCardMediaCache() {
    const cache = new Map();
    if (!root) return cache;
    root.querySelectorAll("[data-card-media-key]").forEach(function (node) {
      const key = node.getAttribute("data-card-media-key");
      if (key && !cache.has(key)) cache.set(key, node);
    });
    return cache;
  }

  function restoreCardMediaCache(cache) {
    if (!root || !cache || !cache.size) return;
    root.querySelectorAll("[data-card-media-key]").forEach(function (node) {
      const key = node.getAttribute("data-card-media-key");
      const preserved = key ? cache.get(key) : null;
      if (!preserved || preserved === node) return;
      syncPreservedCardPhoto(preserved, node);
      node.replaceWith(preserved);
    });
  }

  function cardTemplate(card, options) {
    const opts = options || {};
    const hidden = opts.hidden || (card && card.hidden);
    const selectable = Boolean(opts.selectable);
    const classes = ["game-card", hidden ? "back" : "face"];
    if (opts.compact) classes.push("compact");
    if (opts.table) classes.push("table");
    if (selectable) classes.push("selectable");
    if (opts.selected) classes.push("selected");
    const attr = selectable && card ? `data-action="pick-card" data-card-id="${escapeHtml(card.id)}"` : "disabled";
    const suitLabel = cardSuitDisplayLabel(card);
    const label = hidden ? "Carta coperta" : `${card.rankLabel} di ${suitLabel}`;
    const overlay = hidden
      ? `<div class="card-overlay back-mark">Zanzo</div>`
      : opts.table
        ? ""
        : `<div class="card-overlay"><div class="card-label">${escapeHtml(card.rankLabel)}</div><div class="card-label-sub">${escapeHtml(suitLabel)}</div></div>`;
    const asso = isAssoDiDenara(card) && opts.assoMode
      ? `<div class="asso-pill">${opts.assoMode === "high" ? "Asso alto" : "Asso basso"}</div>`
      : "";
    const mediaKey = opts.mediaKey ? ` data-card-media-key="${escapeHtml(opts.mediaKey)}"` : "";
    const styleAttr = opts.style ? ` style="${escapeHtml(opts.style)}"` : "";
    return `<button type="button" class="${classes.join(" ")}" ${attr}${styleAttr}><img class="card-photo" src="${cardImagePath(card, hidden)}" alt="${escapeHtml(label)}" draggable="false" loading="eager" decoding="async"${mediaKey}><div class="card-shadow-layer"></div><div class="card-gloss"></div>${overlay}${asso}</button>`;
  }

  function seatLayout(count) {
    return SEAT_LAYOUTS[count] || SEAT_LAYOUTS[8].slice(0, count);
  }

  function sceneDensityClass(count) {
    if (count >= 7) return "dense";
    if (count >= 5) return "crowded";
    return "regular";
  }

  function seatScaleForCount(count, immersive, withRail) {
    const mobile = compactMobileScene();
    if (mobile && withRail) {
      if (immersive) {
        if (count >= 8) return 0.38;
        if (count === 7) return 0.42;
        if (count === 6) return 0.5;
        if (count === 5) return 0.6;
        return 0.7;
      }
      if (count >= 8) return 0.42;
      if (count === 7) return 0.46;
      if (count === 6) return 0.54;
      if (count === 5) return 0.64;
      return 0.74;
    }
    if (mobile) {
      if (immersive) {
        if (count >= 8) return 0.42;
        if (count === 7) return 0.46;
        if (count === 6) return 0.54;
        if (count === 5) return 0.64;
        return 0.72;
      }
      if (count >= 8) return 0.5;
      if (count === 7) return 0.54;
      if (count === 6) return 0.62;
      if (count === 5) return 0.72;
      return 0.82;
    }
    if (withRail) {
      if (immersive) {
        if (count >= 8) return 0.64;
        if (count === 7) return 0.68;
        if (count === 6) return 0.76;
      } else {
        if (count >= 8) return 0.76;
        if (count === 7) return 0.8;
        if (count === 6) return 0.88;
      }
    }
    if (immersive) {
      if (count >= 8) return 0.68;
      if (count === 7) return 0.72;
      if (count === 6) return 0.8;
      if (count === 5) return 0.88;
      return 0.9;
    }
    if (count >= 8) return 0.84;
    if (count === 7) return 0.88;
    if (count === 6) return 0.93;
    if (count === 5) return 0.97;
    return 1;
  }

  function seatPresetForCount(count, immersive, withRail) {
    const mobile = compactMobileScene();
    if (mobileShowcasePlayerView()) {
      if (count >= 7) {
        return immersive
          ? { bottom: [50, 88], "bottom-left": [22, 78], left: [8, 54], "top-left": [24, 23], top: [50, 12], "top-right": [76, 23], right: [92, 54], "bottom-right": [78, 78] }
          : { bottom: [50, 87], "bottom-left": [23, 77], left: [9, 54], "top-left": [24, 24], top: [50, 13], "top-right": [76, 24], right: [91, 54], "bottom-right": [77, 77] };
      }
      if (count === 6) {
        return immersive
          ? { bottom: [50, 88], "bottom-left": [25, 74], left: [10, 53], "top-left": [26, 22], top: [50, 12], "top-right": [74, 22], right: [90, 53], "bottom-right": [75, 74] }
          : { bottom: [50, 87], "bottom-left": [26, 73], left: [11, 53], "top-left": [27, 23], top: [50, 13], "top-right": [73, 23], right: [89, 53], "bottom-right": [74, 73] };
      }
      return immersive
        ? { bottom: [50, 87], "bottom-left": [29, 74], left: [14, 53], "top-left": [29, 24], top: [50, 13], "top-right": [71, 24], right: [86, 53], "bottom-right": [71, 74] }
        : { bottom: [50, 86], "bottom-left": [30, 73], left: [15, 53], "top-left": [30, 25], top: [50, 14], "top-right": [70, 25], right: [85, 53], "bottom-right": [70, 73] };
    }
    // Pochi giocatori: avvicina i seat al centro per evitare il tavolo vuoto
    if (count <= 4) {
      if (mobile && withRail) {
        return immersive
          ? { bottom: [50, 84], "bottom-left": [30, 74], left: [14, 52], "top-left": [30, 30], top: [50, 20], "top-right": [70, 30], right: [86, 52], "bottom-right": [70, 74] }
          : { bottom: [50, 82], "bottom-left": [31, 73], left: [15, 52], "top-left": [31, 31], top: [50, 21], "top-right": [69, 31], right: [85, 52], "bottom-right": [69, 73] };
      }
      if (!mobile && withRail) {
        return immersive
          ? { bottom: [50, 84], "bottom-left": [26, 63], left: [12, 50], "top-left": [28, 26], top: [50, 18], "top-right": [72, 26], right: [88, 50], "bottom-right": [74, 63] }
          : { bottom: [50, 82], "bottom-left": [27, 61], left: [12, 50], "top-left": [28, 27], top: [50, 18], "top-right": [72, 27], right: [88, 50], "bottom-right": [73, 61] };
      }
      if (immersive && mobile) {
        return { bottom: [50, 84], "bottom-left": [30, 75], left: [14, 52], "top-left": [31, 28], top: [50, 15], "top-right": [69, 28], right: [86, 52], "bottom-right": [70, 75] };
      }
      if (immersive) {
        return { bottom: [50, 83], "bottom-left": [27, 70], left: [13, 52], "top-left": [30, 26], top: [50, 16], "top-right": [70, 26], right: [87, 52], "bottom-right": [73, 70] };
      }
      if (mobile) {
        return { bottom: [50, 80], "bottom-left": [31, 72], left: [15, 52], "top-left": [31, 30], top: [50, 19], "top-right": [69, 30], right: [85, 52], "bottom-right": [69, 72] };
      }
      return { bottom: [50, 81], "bottom-left": [30, 72], left: [16, 51], "top-left": [30, 28], top: [50, 19], "top-right": [70, 28], right: [84, 51], "bottom-right": [70, 72] };
    }
    if (mobile && withRail && count >= 7) {
      return immersive
        ? {
            bottom: [50, 92],
            "bottom-left": [21, 82],
            left: [6.5, 59],
            "top-left": [17, 31],
            top: [50, 16],
            "top-right": [83, 31],
            right: [93.5, 59],
            "bottom-right": [79, 82],
          }
        : {
            bottom: [50, 90],
            "bottom-left": [22, 81],
            left: [7.5, 59],
            "top-left": [18, 32],
            top: [50, 17],
            "top-right": [82, 32],
            right: [92.5, 59],
            "bottom-right": [78, 81],
          };
    }
    if (mobile && withRail) {
      return immersive
        ? {
            bottom: [50, 89],
            "bottom-left": [25, 79],
            left: [10, 58],
            "top-left": [23, 34],
            top: [50, 18],
            "top-right": [77, 34],
            right: [90, 58],
            "bottom-right": [75, 79],
          }
        : {
            bottom: [50, 87],
            "bottom-left": [26, 78],
            left: [11, 57],
            "top-left": [24, 35],
            top: [50, 19],
            "top-right": [76, 35],
            right: [89, 57],
            "bottom-right": [74, 78],
          };
    }
    if (!mobile && withRail && count >= 8) {
      return immersive
        ? {
            bottom: [50, 94],
            "bottom-left": [15, 72],
            left: [6.5, 52],
            "top-left": [18, 20],
            top: [50, 8],
            "top-right": [82, 20],
            right: [93.5, 52],
            "bottom-right": [85, 72],
          }
        : {
            bottom: [50, 94],
            "bottom-left": [15, 71],
            left: [6.5, 50],
            "top-left": [18, 21],
            top: [50, 9],
            "top-right": [82, 21],
            right: [93.5, 50],
            "bottom-right": [85, 71],
          };
    }
    if (!mobile && withRail && count >= 7) {
      return immersive
        ? {
            bottom: [50, 94],
            "bottom-left": [17, 73],
            left: [7, 53],
            "top-left": [20, 20],
            top: [50, 8],
            "top-right": [80, 20],
            right: [93, 53],
            "bottom-right": [83, 73],
          }
        : {
            bottom: [50, 94],
            "bottom-left": [17, 72],
            left: [7, 51],
            "top-left": [20, 21],
            top: [50, 9],
            "top-right": [80, 21],
            right: [93, 51],
            "bottom-right": [83, 72],
          };
    }
    if (!mobile && withRail) {
      return immersive
        ? {
            bottom: [50, 90],
            "bottom-left": [18, 66],
            left: [6, 50],
            "top-left": [22, 22],
            top: [50, 14],
            "top-right": [78, 22],
            right: [94, 50],
            "bottom-right": [82, 66],
          }
        : {
            bottom: [50, 88],
            "bottom-left": [19, 64],
            left: [6, 50],
            "top-left": [22, 22],
            top: [50, 14],
            "top-right": [78, 22],
            right: [94, 50],
            "bottom-right": [81, 64],
          };
    }
    if (immersive && mobile && count >= 7) {
      return {
        bottom: [50, 91],
        "bottom-left": [23, 79],
        left: [8, 53],
        "top-left": [22, 27],
        top: [50, 12],
        "top-right": [78, 27],
        right: [92, 53],
        "bottom-right": [77, 79],
      };
    }
    if (immersive && mobile) {
      return {
        bottom: [50, 90],
        "bottom-left": [24, 80],
        left: [8, 55],
        "top-left": [25, 24],
        top: [50, 11],
        "top-right": [75, 24],
        right: [92, 55],
        "bottom-right": [76, 80],
      };
    }
    if (immersive && count >= 7) {
      return {
        bottom: [50, 93],
        "bottom-left": [23, 82],
        left: [7, 55],
        "top-left": [22, 21],
        top: [50, 8],
        "top-right": [78, 21],
        right: [93, 55],
        "bottom-right": [77, 82],
      };
    }
    if (immersive) {
      return {
        bottom: [50, 90],
        "bottom-left": [20, 72],
        left: [7, 53],
        "top-left": [24, 22],
        top: [50, 12],
        "top-right": [76, 22],
        right: [93, 53],
        "bottom-right": [80, 72],
      };
    }
    if (mobile && count >= 7) {
      return {
        bottom: [50, 88],
        "bottom-left": [24, 77],
        left: [10, 52],
        "top-left": [24, 27],
        top: [50, 14],
        "top-right": [76, 27],
        right: [90, 52],
        "bottom-right": [76, 77],
      };
    }
    if (mobile) {
      return {
        bottom: [50, 86],
        "bottom-left": [27, 77],
        left: [11, 52],
        "top-left": [27, 26],
        top: [50, 15],
        "top-right": [73, 26],
        right: [89, 52],
        "bottom-right": [73, 77],
      };
    }
    if (count >= 7) {
      return {
        bottom: [50, 89],
        "bottom-left": [21, 78],
        left: [8, 51],
        "top-left": [21, 24],
        top: [50, 11],
        "top-right": [79, 24],
        right: [92, 51],
        "bottom-right": [79, 78],
      };
    }
    return {
      bottom: [50, 87],
      "bottom-left": [24, 77],
      left: [10, 51],
      "top-left": [24, 24],
      top: [50, 12],
      "top-right": [76, 24],
      right: [90, 51],
      "bottom-right": [76, 77],
    };
  }

  function seatCompactClass(count) {
    if (count >= 7) return "ultra";
    if (count >= 5) return "compact";
    return "";
  }

  function orderedPlayersForScene(viewerSeatId) {
    const players = (state.snapshot && state.snapshot.players) || [];
    if (!players.length) return [];
    if (!viewerSeatId) return players.slice();
    const startIndex = players.findIndex(function (player) { return player.id === viewerSeatId; });
    if (startIndex <= 0) return players.slice();
    return players.slice(startIndex).concat(players.slice(0, startIndex));
  }

  function positionedPlayers(viewerSeatId) {
    const ordered = orderedPlayersForScene(viewerSeatId);
    const layout = seatLayout(ordered.length);
    const immersive = Boolean(viewerSeatId && state.snapshot && state.snapshot.phase !== "bidding" && state.snapshot.phase !== "setup");
    const withRail = Boolean(viewerSeatId && state.snapshot && state.snapshot.phase !== "setup");
    const preset = seatPresetForCount(ordered.length, immersive, withRail);
    const scale = seatScaleForCount(ordered.length, immersive, withRail);
    const compactClass = seatCompactClass(ordered.length);
    return ordered.map(function (player, index) {
      const slot = layout[index] || "top";
      const coords = preset[slot] || preset.top;
      return {
        player,
        slot,
        x: coords[0],
        y: coords[1],
        scale,
        compactClass,
        isSelf: Boolean(viewerSeatId && player.id === viewerSeatId),
      };
    });
  }

  function tableCardWidth(playerCount, tableCount) {
    const mobile = compactMobileScene();
    const mobilePlayerView = mobile && playerRailTableScene();
    let width;
    if (mobileShowcasePlayerView()) {
      if (playerCount >= 7) width = tableCount >= 6 ? 54 : tableCount >= 4 ? 58 : 62;
      else if (playerCount === 6) width = tableCount >= 5 ? 58 : 62;
      else width = tableCount >= 5 ? 62 : 68;
    } else if (mobilePlayerView) {
      if (playerCount >= 8) width = tableCount >= 6 ? 34 : tableCount >= 4 ? 37 : 40;
      else if (playerCount === 7) width = tableCount >= 6 ? 36 : tableCount >= 4 ? 40 : 44;
      else if (playerCount === 6) width = tableCount >= 5 ? 40 : 44;
      else width = tableCount >= 5 ? 46 : 52;
    } else if (mobile) {
      if (playerCount >= 8) width = tableCount >= 6 ? 38 : tableCount >= 4 ? 41 : 44;
      else if (playerCount === 7) width = tableCount >= 6 ? 40 : tableCount >= 4 ? 43 : 46;
      else if (playerCount === 6) width = tableCount >= 5 ? 44 : 48;
      else width = tableCount >= 5 ? 52 : 60;
    } else {
      if (playerCount >= 8) width = tableCount >= 6 ? 52 : tableCount >= 4 ? 56 : 60;
      else if (playerCount === 7) width = tableCount >= 6 ? 54 : tableCount >= 4 ? 58 : 62;
      else if (playerCount === 6) width = tableCount >= 5 ? 62 : 68;
      else width = tableCount >= 7 ? 74 : tableCount >= 5 ? 82 : 92;
    }
    if (playerRailTableScene()) {
      const reduction = mobile ? (playerCount >= 7 ? 2 : 1) : (playerCount >= 7 ? 8 : playerCount >= 5 ? 4 : 0);
      const minWidth = mobilePlayerView ? 34 : mobile ? 34 : 46;
      width = Math.max(minWidth, width - reduction);
    }
    return width;
  }

  function trickSweepCardWidth(playerCount) {
    const mobile = compactMobileScene();
    const mobilePlayerView = mobile && playerRailTableScene();
    let width;
    if (mobileShowcasePlayerView()) {
      if (playerCount >= 7) width = 64;
      else if (playerCount === 6) width = 68;
      else width = 74;
    } else if (mobilePlayerView) {
      if (playerCount >= 8) width = 48;
      else if (playerCount === 7) width = 52;
      else width = 64;
    } else if (mobile) {
      if (playerCount >= 8) width = 58;
      else if (playerCount === 7) width = 62;
      else width = 84;
    } else {
      if (playerCount >= 8) width = 72;
      else if (playerCount === 7) width = 78;
      else if (playerCount === 6) width = 92;
      else width = 116;
    }
    if (playerRailTableScene()) {
      const reduction = mobile ? (playerCount >= 7 ? 4 : 2) : (playerCount >= 7 ? 12 : playerCount >= 5 ? 8 : 0);
      const minWidth = mobilePlayerView ? 46 : mobile ? 42 : 56;
      width = Math.max(minWidth, width - reduction);
    }
    return width;
  }

  function playerRailTableScene() {
    return state.view === "player" && Boolean(state.snapshot && state.snapshot.phase !== "setup");
  }

  function adjustTableCardTarget(slot, target, playerCount, options) {
    if (!playerRailTableScene()) return target;
    if (mobileShowcasePlayerView()) return target;
    const mobile = compactMobileScene();
    const mobilePlayerView = mobile && state.view === "player";
    const denseScene = playerCount >= 7;
    const sweep = Boolean(options && options.sweep);
    const topShift = sweep
      ? (mobilePlayerView ? (denseScene ? 18 : 14) : mobile ? (denseScene ? 40 : 28) : (denseScene ? 82 : 54))
      : (mobilePlayerView ? (denseScene ? 10 : 8) : mobile ? (denseScene ? 28 : 20) : (denseScene ? 56 : 36));
    const topCornerShift = sweep
      ? (mobilePlayerView ? (denseScene ? 14 : 12) : mobile ? (denseScene ? 30 : 22) : (denseScene ? 64 : 40))
      : (mobilePlayerView ? (denseScene ? 8 : 6) : mobile ? (denseScene ? 22 : 16) : (denseScene ? 44 : 28));
    const bottomShift = sweep
      ? (mobilePlayerView ? (denseScene ? -18 : -14) : mobile ? (denseScene ? -48 : -34) : (denseScene ? -94 : -62))
      : (mobilePlayerView ? (denseScene ? -8 : -6) : mobile ? (denseScene ? -34 : -24) : (denseScene ? -68 : -44));
    const bottomCornerShift = sweep
      ? (mobilePlayerView ? (denseScene ? -14 : -12) : mobile ? (denseScene ? -40 : -28) : (denseScene ? -78 : -52))
      : (mobilePlayerView ? (denseScene ? -6 : -5) : mobile ? (denseScene ? -28 : -20) : (denseScene ? -56 : -36));
    const adjusted = { x: target.x, y: target.y, r: target.r };
    if (slot === "top") adjusted.y += topShift;
    if (slot === "top-left" || slot === "top-right") adjusted.y += topCornerShift;
    if (slot === "bottom") adjusted.y += bottomShift;
    if (slot === "bottom-left" || slot === "bottom-right") adjusted.y += bottomCornerShift;
    if (mobilePlayerView) {
      if (slot === "left") {
        adjusted.x += denseScene ? 16 : 12;
        adjusted.y += denseScene ? -14 : -10;
      }
      if (slot === "right") {
        adjusted.x += denseScene ? -16 : -12;
        adjusted.y += denseScene ? -14 : -10;
      }
      if (slot === "bottom-left") {
        adjusted.x += denseScene ? 14 : 10;
        adjusted.y += denseScene ? -12 : -8;
      }
      if (slot === "bottom-right") {
        adjusted.x += denseScene ? -14 : -10;
        adjusted.y += denseScene ? -12 : -8;
      }
      if (slot === "top-left") {
        adjusted.x += denseScene ? 6 : 4;
      }
      if (slot === "top-right") {
        adjusted.x += denseScene ? -6 : -4;
      }
    } else if (slot === "left" || slot === "right") {
      if (denseScene) {
        adjusted.x += slot === "left" ? 10 : -10;
      }
    }
    return adjusted;
  }

  function trickMotion(slot, index, total, playerCount) {
    const sourceMap = {
      bottom: { x: 0, y: 290, r: 8 },
      "bottom-left": { x: -230, y: 210, r: -12 },
      left: { x: -300, y: 20, r: -16 },
      "top-left": { x: -220, y: -210, r: -10 },
      top: { x: 0, y: -300, r: 4 },
      "top-right": { x: 220, y: -210, r: 10 },
      right: { x: 300, y: 20, r: 16 },
      "bottom-right": { x: 230, y: 210, r: 12 },
    };
    const mobile = compactMobileScene();
    const mobilePlayerView = mobile && playerRailTableScene();
    const denseScene = playerCount >= 7;
    const showcase = mobileShowcasePlayerView();
    const targetMap = mobilePlayerView
      ? showcase
        ? {
            bottom: { x: 0, y: 188, r: 2 },
            "bottom-left": { x: -122, y: 124, r: -4 },
            left: { x: -156, y: 8, r: -7 },
            "top-left": { x: -118, y: -126, r: -4 },
            top: { x: 0, y: -162, r: 1 },
            "top-right": { x: 118, y: -126, r: 4 },
            right: { x: 156, y: 8, r: 7 },
            "bottom-right": { x: 122, y: 124, r: 4 },
          }
        : denseScene
        ? {
            bottom: { x: 0, y: 94, r: 2 },
            "bottom-left": { x: -78, y: 84, r: -5 },
            left: { x: -108, y: 4, r: -8 },
            "top-left": { x: -68, y: -72, r: -4 },
            top: { x: 0, y: -88, r: 1 },
            "top-right": { x: 68, y: -72, r: 4 },
            right: { x: 108, y: 4, r: 8 },
            "bottom-right": { x: 78, y: 84, r: 5 },
          }
        : {
            bottom: { x: 0, y: 86, r: 3 },
            "bottom-left": { x: -72, y: 76, r: -5 },
            left: { x: -96, y: 4, r: -8 },
            "top-left": { x: -60, y: -64, r: -5 },
            top: { x: 0, y: -82, r: 2 },
            "top-right": { x: 60, y: -64, r: 5 },
            right: { x: 96, y: 4, r: 8 },
            "bottom-right": { x: 72, y: 76, r: 5 },
          }
      : mobile
      ? denseScene
        ? {
            bottom: { x: 0, y: 114, r: 2 },
            "bottom-left": { x: -110, y: 84, r: -5 },
            left: { x: -144, y: 8, r: -8 },
            "top-left": { x: -102, y: -98, r: -5 },
            top: { x: 0, y: -132, r: 1 },
            "top-right": { x: 102, y: -98, r: 5 },
            right: { x: 144, y: 8, r: 8 },
            "bottom-right": { x: 110, y: 84, r: 5 },
          }
        : {
            bottom: { x: 0, y: 92, r: 3 },
            "bottom-left": { x: -74, y: 66, r: -7 },
            left: { x: -104, y: 0, r: -10 },
            "top-left": { x: -72, y: -68, r: -6 },
            top: { x: 0, y: -94, r: 2 },
            "top-right": { x: 72, y: -68, r: 6 },
            right: { x: 104, y: 0, r: 10 },
            "bottom-right": { x: 74, y: 66, r: 7 },
          }
      : denseScene
        ? {
            bottom: { x: 0, y: 176, r: 3 },
            "bottom-left": { x: -182, y: 134, r: -7 },
            left: { x: -244, y: 10, r: -10 },
            "top-left": { x: -172, y: -132, r: -7 },
            top: { x: 0, y: -184, r: 2 },
            "top-right": { x: 172, y: -132, r: 7 },
            right: { x: 244, y: 10, r: 10 },
            "bottom-right": { x: 182, y: 134, r: 7 },
          }
        : {
            bottom: { x: 0, y: 132, r: 4 },
            "bottom-left": { x: -108, y: 94, r: -8 },
            left: { x: -152, y: 0, r: -12 },
            "top-left": { x: -108, y: -96, r: -8 },
            top: { x: 0, y: -138, r: 3 },
            "top-right": { x: 108, y: -96, r: 8 },
            right: { x: 152, y: 0, r: 12 },
            "bottom-right": { x: 108, y: 94, r: 8 },
          };
    const source = sourceMap[slot] || sourceMap.top;
    if (total <= 1) {
      const target = adjustTableCardTarget(slot, targetMap[slot] || targetMap.top, playerCount);
      return {
        fromX: source.x,
        fromY: source.y,
        fromR: source.r,
        toX: target.x,
        toY: target.y,
        toR: target.r,
        delay: index * 70,
      };
    }
    const orderOffset = index - ((total - 1) / 2);
    const target = adjustTableCardTarget(slot, targetMap[slot] || targetMap.top, playerCount);
    const spacing = showcase ? 10 : mobilePlayerView ? (denseScene ? 2 : 4) : mobile ? (denseScene ? 8 : 16) : (denseScene ? 12 : 24);
    const driftX = Math.round(orderOffset * spacing);
    const driftY = Math.round(orderOffset * (showcase ? 0 : mobilePlayerView ? (denseScene ? 0 : 1) : mobile ? (denseScene ? 1 : 3) : (denseScene ? 2 : 4)));
    return {
      fromX: source.x,
      fromY: source.y,
      fromR: source.r,
      toX: target.x + driftX,
      toY: target.y + driftY,
      toR: target.r + Math.round(orderOffset * (showcase ? 1 : mobile ? (denseScene ? 1 : 2) : (denseScene ? 2 : 3))),
      delay: index * 70,
    };
  }

  function dealMotion(slot, passIndex) {
    const mobile = compactMobileScene();
    const targetMap = {
      bottom: { x: 0, y: mobile ? 128 : 188, r: 2 },
      "bottom-left": { x: mobile ? -110 : -162, y: mobile ? 96 : 138, r: -8 },
      left: { x: mobile ? -150 : -226, y: mobile ? 4 : 12, r: -14 },
      "top-left": { x: mobile ? -108 : -160, y: mobile ? -102 : -150, r: -9 },
      top: { x: 0, y: mobile ? -140 : -204, r: 1 },
      "top-right": { x: mobile ? 108 : 160, y: mobile ? -102 : -150, r: 9 },
      right: { x: mobile ? 150 : 226, y: mobile ? 4 : 12, r: 14 },
      "bottom-right": { x: mobile ? 110 : 162, y: mobile ? 96 : 138, r: 8 },
    };
    const base = targetMap[slot] || targetMap.top;
    const offset = mobile ? 10 : 14;
    const horizontal = slot.indexOf("left") >= 0 ? -offset : slot.indexOf("right") >= 0 ? offset : 0;
    const vertical = slot.indexOf("top") >= 0 ? -4 : 4;
    return {
      x: base.x + horizontal * passIndex,
      y: base.y + vertical * passIndex,
      r: base.r + (slot.indexOf("left") >= 0 ? -2 : 2) * passIndex,
    };
  }

  function trickSweepMotion(slot, index, total, playerCount) {
    const mobile = compactMobileScene();
    const denseScene = playerCount >= 7;
    const targetMap = denseScene
      ? {
          bottom: { x: 0, y: mobile ? 176 : 246, r: 5 },
          "bottom-left": { x: mobile ? -146 : -224, y: mobile ? 134 : 178, r: -8 },
          left: { x: mobile ? -198 : -286, y: mobile ? 18 : 18, r: -11 },
          "top-left": { x: mobile ? -138 : -214, y: mobile ? -138 : -186, r: -8 },
          top: { x: 0, y: mobile ? -194 : -258, r: 3 },
          "top-right": { x: mobile ? 138 : 214, y: mobile ? -138 : -186, r: 8 },
          right: { x: mobile ? 198 : 286, y: mobile ? 18 : 18, r: 11 },
          "bottom-right": { x: mobile ? 146 : 224, y: mobile ? 134 : 178, r: 8 },
        }
      : {
          bottom: { x: 0, y: mobile ? 162 : 226, r: 6 },
          "bottom-left": { x: mobile ? -132 : -192, y: mobile ? 126 : 168, r: -10 },
          left: { x: mobile ? -184 : -254, y: mobile ? 20 : 24, r: -14 },
          "top-left": { x: mobile ? -128 : -188, y: mobile ? -128 : -176, r: -10 },
          top: { x: 0, y: mobile ? -178 : -244, r: 4 },
          "top-right": { x: mobile ? 128 : 188, y: mobile ? -128 : -176, r: 10 },
          right: { x: mobile ? 184 : 254, y: mobile ? 20 : 24, r: 14 },
          "bottom-right": { x: mobile ? 132 : 192, y: mobile ? 126 : 168, r: 10 },
        };
    const offset = index - ((Math.max(total, 1) - 1) / 2);
    const fan = mobile ? (denseScene ? 8 : 12) : (denseScene ? 12 : 18);
    const target = adjustTableCardTarget(slot, targetMap[slot] || targetMap.top, playerCount, { sweep: true });
    return {
      holdX: Math.round(offset * (mobile ? (denseScene ? 24 : 36) : (denseScene ? 34 : 58))),
      holdY: mobile ? (denseScene ? -6 : -10) : (denseScene ? -10 : -16),
      holdR: Math.round(offset * (mobile ? (denseScene ? 2 : 3) : (denseScene ? 3 : 4))),
      winX: target.x + Math.round(offset * fan),
      winY: target.y,
      winR: target.r + Math.round(offset * 5),
      delay: index * 40,
    };
  }

  function seatPill(label, extraClass) {
    return `<span class="seat-node-pill ${extraClass || ""}">${escapeHtml(label)}</span>`;
  }

  function seatBlindPreview(player) {
    if (!(blindRound() && player.visibleCards && player.visibleCards.length)) {
      return "";
    }
    return `<div class="seat-blind-preview">${cardTemplate(player.visibleCards[0], {
      compact: true,
      mediaKey: cardMediaToken(player.visibleCards[0], { scope: `seat-blind:${player.id}` }),
    })}</div>`;
  }

  function seatBidAnnouncementTemplate(player) {
    return "";
  }

  function centerBidAnnouncementTemplate() {
    const event = state.activeBidAnnouncement;
    if (!event) return "";
    return `<div class="center-bid-announcement"><div class="center-bid-announcement-label">Dichiarazione</div><div class="center-bid-announcement-value">${escapeHtml(event.playerName || "Giocatore")} - ${escapeHtml(event.bid)} prese</div></div>`;
  }

  function opponentHandTemplate(player) {
    if (player.handCount <= 0) {
      return `<div class="seat-empty-mini">Nessuna carta</div>`;
    }
    if (blindRound() && player.visibleCards && player.visibleCards.length) {
      return `<div class="seat-visible-card">${cardTemplate(player.visibleCards[0], {
        compact: true,
        mediaKey: cardMediaToken(player.visibleCards[0], { scope: `seat-visible:${player.id}` }),
      })}</div>`;
    }
    const previewCount = Math.max(1, Math.min(player.handCount, 5));
    return `<div class="seat-back-stack">${Array.from({ length: previewCount }, function (_item, index) {
      return `<div class="seat-back-card" style="--i:${index};"></div>`;
    }).join("")}<div class="seat-hand-count">${escapeHtml(player.handCount)}</div></div>`;
  }

  function seatNodeTemplate(entry) {
    const player = entry.player;
    const classes = ["seat-slot"];
    const showcaseMobile = mobileShowcasePlayerView();
    if (entry.compactClass) classes.push(entry.compactClass);
    if (entry.isSelf) classes.push("self");
    if (player.isCurrentBidder || player.isCurrentTurn) classes.push("active");
    if (player.isCurrentBidder) classes.push("bid-live");
    if (player.isCurrentTurn) classes.push("turn-live");
    if (player.hasLeft) classes.push("left");
    if (player.lives <= 0) classes.push("dead");

    const contractValue = player.bid == null ? "-" : escapeHtml(player.bid);
    const turnBadge = player.isCurrentTurn
      ? `<div class="seat-turn-tag live">CURRENT TURN</div>`
      : player.isCurrentBidder
        ? `<div class="seat-turn-tag live">DICHIARA</div>`
        : player.isDealer
          ? `<div class="seat-turn-tag dealer">MAZZIERE</div>`
          : entry.isSelf
            ? `<div class="seat-turn-tag self">TU</div>`
            : "";
    const preview = seatBlindPreview(player);
    const bidCallout = seatBidAnnouncementTemplate(player);
    const avatarAttrs = entry.isSelf ? 'role="button" tabindex="0" data-action="open-deck-picker" title="Cambia mazzo"' : "";
    if (showcaseMobile) {
      return `<div class="${classes.join(" ")} mobile-showcase-seat" data-slot="${escapeHtml(entry.slot)}" style="--seat-x:${entry.x}%; --seat-y:${entry.y}%; --seat-scale:${entry.scale};"><div class="seat-node mobile-showcase-seat-node"><div class="seat-avatar-wrap ${player.isCurrentTurn || player.isCurrentBidder ? "live" : ""}${entry.isSelf ? " clickable" : ""}" style="${avatarStyle(player.name)}" ${avatarAttrs}><div class="seat-avatar-ring"></div><div class="seat-avatar">${playerAvatarTemplate(player)}</div><div class="seat-hearts">${heartsTemplate(player.lives, player.id)}</div></div>${turnBadge}<div class="seat-meta-pill mobile-showcase-seat-meta">${scorePillTemplate(player, { emphasis: player.isCurrentTurn || player.isCurrentBidder || entry.isSelf, mobileSeat: true })}</div>${preview}</div>${bidCallout}</div>`;
    }
    const nameInitials = initialsForName(player.name);
    return `<div class="${classes.join(" ")}" data-slot="${escapeHtml(entry.slot)}" style="--seat-x:${entry.x}%; --seat-y:${entry.y}%; --seat-scale:${entry.scale};"><div class="seat-node"><div class="seat-avatar-wrap ${player.isCurrentTurn || player.isCurrentBidder ? "live" : ""}${entry.isSelf ? " clickable" : ""}" style="${avatarStyle(player.name)}" ${avatarAttrs}><div class="seat-avatar-ring"></div><div class="seat-avatar"><span>${escapeHtml(nameInitials)}</span></div><div class="seat-hearts">${heartsTemplate(player.lives, player.id)}</div></div>${turnBadge}<div class="seat-meta-pill"><div class="seat-meta-line">${escapeHtml(playerStatusLine(player))}</div><div class="seat-meta-name">${escapeHtml(player.name)}</div>${scorePillTemplate(player, { emphasis: player.isCurrentTurn || player.isCurrentBidder || entry.isSelf })}${entry.isSelf ? `<div class="seat-meta-self">SEAT ${escapeHtml(player.id)} - Tocca il pallino per cambiare mazzo</div>` : ""}</div>${preview}</div>${bidCallout}</div>`;
  }

  function centerTrickTemplate(viewerSeatId) {
    const tableCards = (state.snapshot && state.snapshot.tableCards) || [];
    const slotByPlayerId = {};
    const playerNameById = {};
    const bidAnnouncement = centerBidAnnouncementTemplate();
    const silentMobile = compactMobileScene();
    const seats = positionedPlayers(viewerSeatId);
    const playerCount = seats.length;
    const denseScene = playerCount >= 7;
    seats.forEach(function (entry) {
      slotByPlayerId[entry.player.id] = entry.slot;
    });
    (((state.snapshot && state.snapshot.players) || [])).forEach(function (player) {
      playerNameById[player.id] = player.name;
    });

    if (state.activeDealAnimation) {
      return `<div class="center-empty center-empty-silent" aria-hidden="true"></div>`;
    }

    if (!tableCards.length) {
      state.trickAnimationKey = "";
      if (bidAnnouncement) {
        return `<div class="center-trick-cards center-trick-bid-only">${bidAnnouncement}</div>`;
      }
      if (silentMobile) {
        return `<div class="center-empty center-empty-silent" aria-hidden="true"></div>`;
      }
      return `<div class="center-empty"><div class="center-empty-title">${state.snapshot && state.snapshot.phase === "bidding" ? "Dichiarazioni in corso" : "Centro tavolo pronto"}</div><div>${state.snapshot && state.snapshot.phase === "playing" ? "La prossima carta volera qui dal suo posto al tavolo." : "Le prese si animano qui al centro del tavolo."}</div></div>`;
    }

    const nextTrickKey = trickStateKey(tableCards);
    const animateCards = false;
    state.trickAnimationKey = nextTrickKey;

    return `<div class="center-trick-cards">${tableCards.map(function (entry, index) {
      const slot = slotByPlayerId[entry.playerId] || "top";
      const motion = trickMotion(slot, index, tableCards.length, playerCount);
      const centerWidth = tableCardWidth(playerCount, tableCards.length);
      const label = denseScene ? "" : `<div class="center-card-label">${escapeHtml(playerNameById[entry.playerId] || entry.playerId || "Giocatore")}</div>`;
      return `<div class="center-card ordered ${animateCards ? "intro" : ""} from-${slot}" style="--from-x:${motion.fromX}px; --from-y:${motion.fromY}px; --from-r:${motion.fromR}deg; --to-x:${motion.toX}px; --to-y:${motion.toY}px; --to-r:${motion.toR}deg; --delay:${motion.delay}ms; --center-card-width:${centerWidth}px; --card-order:${30 + index}; z-index:${30 + index};">${cardTemplate(entry.card, {
        table: true,
        assoMode: entry.assoMode,
        style: `width:${centerWidth}px`,
        mediaKey: cardMediaToken(entry.card, { scope: `table:${entry.playerId}` }),
      })}${label}</div>`;
    }).join("")}${bidAnnouncement}</div>`;
  }

  function trickWinnerBannerTemplate(viewerSeatId) {
    const event = state.activeTrickSweep;
    if (!event || !event.cards || !event.cards.length) return "";
    const playerSlotById = {};
    const seats = positionedPlayers(viewerSeatId);
    const playerCount = seats.length;
    const denseScene = playerCount >= 7;
    seats.forEach(function (entry) {
      playerSlotById[entry.player.id] = entry.slot;
    });
    const winnerSlot = playerSlotById[event.winnerId] || "top";
    const total = event.cards.length;
    return `<div class="trick-sweep-overlay" aria-hidden="true">${event.cards.map(function (entry, index) {
      const sourceSlot = playerSlotById[entry.playerId] || "top";
      const from = trickMotion(sourceSlot, index, total, playerCount);
      const sweep = trickSweepMotion(winnerSlot, index, total, playerCount);
      const width = trickSweepCardWidth(playerCount);
      const winnerClass = entry.playerId === event.winnerId ? " winner" : "";
      const sweepLabel = denseScene ? "" : `<div class="trick-sweep-label">${escapeHtml(entry.playerName || entry.playerId || "")}</div>`;
      return `<div class="trick-sweep-card${winnerClass}" style="--from-x:${from.fromX}px; --from-y:${from.fromY}px; --from-r:${from.fromR}deg; --hold-x:${from.toX}px; --hold-y:${from.toY}px; --hold-r:${from.toR}deg; --win-x:${sweep.winX}px; --win-y:${sweep.winY}px; --win-r:${sweep.winR}deg; --delay:${sweep.delay}ms; --sweep-card-width:${width}px; z-index:${60 + index};">${cardTemplate(entry.card, {
        table: true,
        assoMode: entry.assoMode,
        style: `width:${width}px`,
        mediaKey: cardMediaToken(entry.card, { scope: `sweep:${entry.playerId}` }),
      })}${sweepLabel}</div>`;
    }).join("")}<div class="trick-sweep-copy"><div class="trick-sweep-title">${escapeHtml(event.winnerName)} prende</div><div class="trick-sweep-sub">${escapeHtml(cardAnnouncementLabel(event.card, event.assoMode))}</div></div></div>`;
  }

  function dealAnimationTemplate(viewerSeatId) {
    const event = state.activeDealAnimation;
    if (!event) return "";
    const activePlayerIds = (event.players || []).map(function (player) { return player.id; });
    const targets = positionedPlayers(viewerSeatId).filter(function (entry) {
      return !activePlayerIds.length || activePlayerIds.indexOf(entry.player.id) >= 0;
    });
    const passes = Math.max(1, Math.min(Number(event.handSize || 1), 2));
    const bursts = [];

    targets.forEach(function (entry, index) {
      for (let pass = 0; pass < passes; pass += 1) {
        const motion = dealMotion(entry.slot, pass);
        bursts.push(`<span class="deal-burst" style="--deal-x:${motion.x}px; --deal-y:${motion.y}px; --deal-r:${motion.r}deg; --deal-delay:${120 + (index * 110) + (pass * 90)}ms;"></span>`);
      }
    });

    return `<div class="deal-animation-overlay" aria-hidden="true"><div class="deal-animation-copy"><div class="deal-animation-kicker">Nuova manche</div><div class="deal-animation-title">${escapeHtml(event.handSize)} carte</div><div class="deal-animation-sub">Mischio e distribuisco al tavolo</div></div><div class="deal-animation-deck"><span class="deal-deck-card back-1"></span><span class="deal-deck-card back-2"></span><span class="deal-deck-card back-3"></span></div><div class="deal-burst-layer">${bursts.join("")}</div></div>`;
  }

  function tableBidRibbonTemplate(viewerRole) {
    const players = positionedPlayers(viewerRole === "player" ? state.seatId : "");
    return `<div class="table-bid-ribbon">${players.map(function (entry) {
      const player = entry.player;
      const classes = ["table-bid-chip"];
      if (entry.isSelf) classes.push("self");
      if (player.isCurrentBidder) classes.push("active");
      if (player.isCurrentTurn) classes.push("turn");
      if (player.lives <= 0) classes.push("dead");
      return `<div class="${classes.join(" ")}"><span class="table-bid-chip-name">${escapeHtml(player.name)}</span><div class="table-bid-chip-metrics"><div class="table-bid-chip-stat"><span class="table-bid-chip-stat-label">D</span><strong class="table-bid-chip-value">${player.bid == null ? "-" : escapeHtml(player.bid)}</strong></div><div class="table-bid-chip-stat"><span class="table-bid-chip-stat-label">P</span><strong class="table-bid-chip-value">${escapeHtml(player.tricksWon)}</strong></div></div></div>`;
    }).join("")}</div>`;
  }

  function bidAnnouncementTemplate() {
    const event = state.activeBidAnnouncement;
    if (!event) return "";
    return `<div class="table-status-pod bid-status-pod"><div class="table-status-label">Dichiarazione</div><div class="table-status-value">${escapeHtml(event.playerName || "Giocatore")} - ${escapeHtml(event.bid)} prese</div></div>`;
  }

  function tableStatusPodTemplate() {
    return "";
  }

  function biddingOverlayTemplate() {
    if (compactMobileScene() && state.view === "player") {
      state.bidOverlayIntroKey = "";
      return "";
    }
    if (!(state.view === "player" && state.snapshot && state.snapshot.phase === "bidding") || dealPresentationActive() || !canBid()) {
      state.bidOverlayIntroKey = "";
      return "";
    }
    const introKey = [
      state.snapshot && state.snapshot.roomId,
      state.snapshot && state.snapshot.roundIndex,
      state.snapshot && state.snapshot.currentBidderIndex,
      state.seatId,
    ].join(":");
    const showIntro = state.bidOverlayIntroKey !== introKey;
    if (showIntro) state.bidOverlayIntroKey = introKey;
    const forbidden = lastBidForbiddenValue();
    const selected = parseInt(String(state.bidInput || "").trim(), 10);
    const values = bidChoiceValues();
    return `<div class="bid-glass-panel player-bid-panel${showIntro ? " intro" : ""}"><div class="bid-glass-title">Quante prese?</div><div class="bid-glass-grid">${values.map(function (value) {
      const classes = ["bid-glass-chip"];
      if (selected === value) classes.push("active");
      if (forbidden === value) classes.push("forbidden");
      return `<button class="${classes.join(" ")}" type="button" data-action="select-bid" data-bid="${value}" ${forbidden === value ? "disabled" : ""}>${value}</button>`;
    }).join("")}</div><div class="bid-glass-footer">${canBid() ? "Scegli il numero di prese e conferma." : "Dichiarazione inviata. Attendi gli altri."}</div><div class="bid-glass-actions"><button class="button bid-confirm-button" type="button" data-action="submit-bid" ${state.busy || !canBid() ? "disabled" : ""}>${canBid() ? "Conferma" : "In attesa"}</button></div></div>`;
  }

  function gameoverOverlayTemplate() {
    if (!showGameoverUi()) {
      return "";
    }
    const winners = state.snapshot && state.snapshot.winners;
    const isWinner = winners && winners.length === 1 && winners[0].id === state.seatId;
    const status = restartStatus();
    const ready = `${status.approved}/${status.required || 0}`;
    const pending = (status.pendingNames || []).length ? `In attesa di: ${(status.pendingNames || []).join(", ")}` : "Tutti hanno confermato.";
    const canRequestRestart = state.view === "player" && Boolean(state.seatId && state.token);
    const isBotGame = Boolean(state.roomMeta && state.roomMeta.botMode);
    const resultEmoji = isWinner ? "🏆" : "💀";
    let actions = "";
    if (isBotGame) {
      actions = `<div class="bid-glass-actions gameover-actions">
        <button class="button bid-confirm-button gameover-rematch-btn" type="button" data-action="quick-rematch">⚡ Rivincita</button>
        <button class="button gameover-menu-btn" type="button" data-action="nav-hub">Menu</button>
      </div>`;
    } else if (canRequestRestart) {
      actions = `<div class="bid-glass-actions"><button class="button bid-confirm-button" type="button" data-action="restart-room" ${state.busy || hasApprovedRestart() ? "disabled" : ""}>${hasApprovedRestart() ? "Hai confermato ✓" : "Nuova partita"}</button></div>`;
    }
    return `<div class="bid-glass-panel gameover-glass-panel"><div class="gameover-result-emoji">${resultEmoji}</div><div class="bid-glass-title">Partita conclusa</div><div class="gameover-copy">${escapeHtml(winnersLabel(winners))}</div>${isBotGame ? "" : `<div class="gameover-restart-status"><div class="gameover-restart-count">${escapeHtml(ready)} pronti</div><div class="gameover-restart-copy">${escapeHtml(pending)}</div></div>`}${actions}</div>`;
  }

  function roundTableTemplate(viewerRole, options) {
    const opts = options || {};
    const viewerSeatId = viewerRole === "player" ? state.seatId : "";
    const tablePlayers = positionedPlayers(viewerSeatId);
    const playerCount = tablePlayers.length;
    const densityClass = sceneDensityClass(playerCount);
    const showHandRail = viewerRole === "player" && state.snapshot && state.snapshot.phase !== "setup" && !opts.hideHandRail;
    const showcaseMobile = viewerRole === "player" && mobileShowcasePlayerView();
    const stageClasses = ["round-table-stage", densityClass, `count-${playerCount}`];
    const sceneClasses = ["round-table-scene", densityClass, `count-${playerCount}`];
    const panelClasses = ["panel", "round-table-panel", `round-table-${viewerRole}`, densityClass, `count-${playerCount}`];
    if (opts.mobilePane) panelClasses.push(`mobile-pane-${opts.mobilePane}`);
    if (showcaseMobile) {
      stageClasses.push("mobile-showcase-layout");
      sceneClasses.push("mobile-showcase-layout");
      panelClasses.push("mobile-showcase-layout");
    }
    if (showHandRail) stageClasses.push("with-rail");
    const topRibbon = viewerRole === "table" ? tableBidRibbonTemplate(viewerRole) : "";
    const floatingOverlay = viewerRole === "player" ? `${biddingOverlayTemplate()}${gameoverOverlayTemplate()}` : `${showGameoverUi() ? gameoverOverlayTemplate() : ""}`;
    return `<section class="${panelClasses.join(" ")}">${topRibbon}<div class="round-table-shell"><div class="${stageClasses.join(" ")}"><div class="${sceneClasses.join(" ")}"><div class="round-table-wood"></div><div class="round-table-felt">${tablePlayers.map(seatNodeTemplate).join("")}<div class="center-trick">${centerTrickTemplate(viewerSeatId)}</div>${dealAnimationTemplate(viewerSeatId)}${trickWinnerBannerTemplate(viewerSeatId)}${tableStatusPodTemplate()}</div>${floatingOverlay}</div>${showHandRail ? playerTableRailTemplate() : ""}</div></div></section>`;
  }

  function playerMobileHandPaneTemplate() {
    return `${biddingOverlayTemplate()}${gameoverOverlayTemplate()}<div class="player-mobile-hand-pane">${playerTableRailTemplate()}</div>${blindOpponentsTemplate()}`;
  }

  function playerSummaryCard(player) {
    const classes = ["player-card"];
    if (player.isCurrentBidder || player.isCurrentTurn) classes.push("active");
    if (player.hasLeft) classes.push("left");
    if (player.lives <= 0) classes.push("dead");
    return `<div class="${classes.join(" ")}"><div class="player-head"><div><div class="player-name">${escapeHtml(player.name)}</div><div class="player-id">${escapeHtml(player.id)}</div></div><div class="badge-row">${player.isDealer ? '<div class="badge">Mazziere</div>' : ""}${player.isCurrentBidder || player.isCurrentTurn ? '<div class="badge turn">Turno</div>' : ""}${player.id === state.seatId ? '<div class="badge you">Tu</div>' : ""}</div></div><div class="stats-grid"><div class="stat-line"><span>Vite</span><strong>${escapeHtml(player.lives)}</strong></div><div class="stat-line stat-line-accent"><span>Dichiarate</span><strong>${player.bid == null ? "-" : escapeHtml(player.bid)}</strong></div><div class="stat-line stat-line-accent"><span>Prese</span><strong>${escapeHtml(player.tricksWon)}</strong></div></div></div>`;
  }

  function logsTemplate() {
    const logs = (state.snapshot && state.snapshot.winnerLog) || [];
    if (!logs.length) return `<div class="empty-state">Ancora nessuna presa registrata.</div>`;
    return `<div class="log-list">${logs.slice().reverse().map(function (line) {
      return `<div class="log-item">${escapeHtml(line)}</div>`;
    }).join("")}</div>`;
  }



  function handTemplate(options) {
    const opts = options || {};
    if (dealPresentationActive()) {
      state.handAnimationKey = "";
      return `<div class="empty-state hand-empty-wait">Mischio e distribuisco le carte...</div>`;
    }
    const cards = myHand();
    if (!cards.length) {
      state.handAnimationKey = "";
      const activeRound = state.snapshot && ["bidding", "playing"].includes(state.snapshot.phase);
      const me = currentPlayer();
      if (activeRound && me && me.lives > 0) {
        return `<div class="empty-state hand-empty-wait">Sto preparando la tua mano...</div>`;
      }
      return `<div class="empty-state">Nessuna carta disponibile.</div>`;
    }
    const nextHandKey = handStateKey(cards);
    const animateHand = state.handAnimationKey !== nextHandKey;
    state.handAnimationKey = nextHandKey;
    const wrapClass = opts.wrapClass || "hand-wrap";
    const fanClass = opts.fanClass || "hand-fan";
    const flat = Boolean(opts.flat);
    const showcase = Boolean(opts.showcase);
    const showcaseCenterId = state.selectedCardId || (cards[Math.floor(cards.length / 2)] && cards[Math.floor(cards.length / 2)].id) || "";
    return `<div class="${wrapClass} count-${cards.length}" style="--hand-count:${cards.length};"><div class="${fanClass} count-${cards.length}" style="--hand-count:${cards.length};">${cards.map(function (card, index) {
      const center = (cards.length - 1) / 2;
      const angle = flat ? 0 : (index - center) * (showcase ? 9 : 7);
      const classes = ["hand-card"];
      if (flat) classes.push("flat");
      if (animateHand) classes.push("intro");
      if (state.selectedCardId === card.id) classes.push("selected");
      if (showcase && card.id === showcaseCenterId) classes.push("showcase-center");
      return `<div class="${classes.join(" ")}" style="--angle:${angle}deg; --z:${index}; z-index:${20 + index};">${cardTemplate(card, {
        hidden: blindRound(),
        compact: opts.cardCompact,
        selectable: canPlay(),
        selected: state.selectedCardId === card.id,
        mediaKey: cardMediaToken(card, { hidden: blindRound(), scope: `hand:${opts.wrapClass || "default"}` }),
      })}</div>`;
    }).join("")}</div></div>`;
  }

  function playerTableRailTemplate() {
    const me = currentPlayer();
    const playerCount = currentScenePlayerCount();
    const showcaseMobile = mobileShowcasePlayerView();
    const objective = me && me.bid != null ? me.bid : "-";
    const tricks = me && me.tricksWon != null ? me.tricksWon : "-";
    const canAct = canPlay();
    const showGameoverButton = showGameoverUi();
    const status = restartStatus();
    const primaryAction = showGameoverButton
      ? `<button class="button player-rail-button" type="button" data-action="restart-room" ${state.busy || hasApprovedRestart() ? "disabled" : ""}>${hasApprovedRestart() ? "Hai confermato" : "Nuova partita"}</button>`
      : "";
    const assoChooser = showAssoChoice() ? `<div class="player-rail-choice"><button class="ghost-button ${state.selectedAssoMode === "high" ? "active" : ""}" type="button" data-action="asso-mode" data-mode="high">Asso alto</button><button class="ghost-button ${state.selectedAssoMode === "low" ? "active" : ""}" type="button" data-action="asso-mode" data-mode="low">Asso basso</button></div>` : "";
    const blindHint = blindRound() ? oneTimeHint(ONBOARDING_HINT_KEYS.blind, "Carta coperta: dichiara 0 o 1 senza vedere la tua mano.") : "";
    const assoHint = showAssoChoice() ? oneTimeHint(ONBOARDING_HINT_KEYS.asso, "Asso di Oro: scegli il suo passo, poi tocca la carta.") : "";
    const tapHint = state.snapshot && state.snapshot.phase === "playing"
      ? `<div class="player-rail-tap-hint">${showAssoChoice() ? "Asso pronto: alto o basso, poi gioca." : (canAct ? "Tocca una carta per scendere in presa." : "Aspetta il tuo turno.")}</div>`
      : showGameoverButton
        ? `<div class="player-rail-tap-hint">${escapeHtml(status.approved || 0)}/${escapeHtml(status.required || 0)} pronti${(status.pendingNames || []).length ? ` • manca ${escapeHtml(status.pendingNames.join(", "))}` : ""}</div>`
        : "";
    const lives = me && me.lives != null ? me.lives : 0;
    const railClasses = ["player-hand-rail", `count-${playerCount}`];
    if (playerCount >= 7) railClasses.push("crowded");
    if (showcaseMobile) railClasses.push("mobile-showcase-rail");
    const inlineBidControls = compactMobileScene() && state.view === "player" && state.snapshot && state.snapshot.phase === "bidding" && !dealPresentationActive() && canBid()
      ? `<div class="mobile-bid-inline${showcaseMobile ? " mobile-showcase-bid" : ""}">${showcaseMobile ? `<div class="mobile-bid-inline-head"><div class="mobile-bid-inline-title">Declare Bid</div><div class="mobile-bid-round">Round ${escapeHtml((state.snapshot.roundIndex || 0) + 1)}/${TOTAL_ROUNDS}</div></div>` : `<div class="mobile-bid-inline-title">Quante prese?</div>`}<div class="mobile-bid-inline-grid">${bidChoiceValues().map(function (value) {
          const classes = ["bid-glass-chip", "mobile-bid-chip"];
          const selectedBid = parseInt(String(state.bidInput || "").trim(), 10);
          const forbiddenBid = lastBidForbiddenValue();
          if (selectedBid === value) classes.push("active");
          if (forbiddenBid === value) classes.push("forbidden");
          return `<button class="${classes.join(" ")}" type="button" data-action="select-bid" data-bid="${value}" ${forbiddenBid === value ? "disabled" : ""}>${value}</button>`;
        }).join("")}</div><div class="mobile-bid-inline-actions"><button class="button bid-confirm-button mobile-bid-confirm" type="button" data-action="submit-bid" ${state.busy || !canBid() ? "disabled" : ""}>Conferma</button></div></div>`
      : "";
    const actions = primaryAction ? `<div class="player-rail-actions">${primaryAction}</div>` : "";
    const identityCard = showcaseMobile ? "" : `<div class="player-identity-card"><div class="player-life-block"><div class="player-life-label">Vite</div><div class="player-life-value">${escapeHtml(lives)}</div><div class="player-life-hearts">${heartsTemplate(lives)}</div></div><div class="player-identity-meta">${scorePillTemplate(me || { bid: objective, tricksWon: tricks }, { emphasis: true })}</div></div>`;
    const handStageClass = showcaseMobile ? "player-hand-stage mobile-showcase-hand-stage" : "player-hand-stage";
    const handMarkup = handTemplate({
      wrapClass: showcaseMobile ? "hand-wrap table-hand-wrap mobile-showcase-hand-wrap" : "hand-wrap table-hand-wrap",
      fanClass: showcaseMobile ? "hand-fan table-hand-fan mobile-showcase-hand-fan" : "hand-fan table-hand-fan",
      flat: !showcaseMobile,
      cardCompact: false,
      showcase: showcaseMobile,
    });
    return `<div class="${railClasses.join(" ")}">${identityCard}<div class="${handStageClass}">${inlineBidControls}${blindHint}${assoHint}${assoChooser}${tapHint}${handMarkup}</div>${actions}</div>`;
  }

  function mobilePlayerTabsTemplate() {
    return `<div class="player-mobile-tabs"><button class="nav-button ${state.playerMobilePane === "hand" ? "active" : ""}" type="button" data-action="player-pane" data-pane="hand">Mano</button><button class="nav-button ${state.playerMobilePane === "table" ? "active" : ""}" type="button" data-action="player-pane" data-pane="table">Tavolo</button></div>`;
  }

  function bidSelectorTemplate() {
    const values = bidChoiceValues();
    const selected = parseInt(String(state.bidInput || "").trim(), 10);
    const forbidden = lastBidForbiddenValue();
    if (!values.length) return "";
    return `<div class="bid-selector">${values.map(function (value) {
      const classes = ["ghost-button", "bid-chip"];
      if (selected === value) classes.push("active");
      const forbiddenChip = forbidden === value;
      if (forbiddenChip) classes.push("forbidden");
      return `<button class="${classes.join(" ")}" type="button" data-action="select-bid" data-bid="${value}" ${forbiddenChip ? "disabled" : ""}>${value}</button>`;
    }).join("")}</div>${forbidden != null ? `<div class="muted">Essendo l ultimo a dichiarare, non puoi scegliere ${forbidden}.</div>` : ""}`;
  }

  function blindOpponentsTemplate() {
    const opponents = (((state.snapshot && state.snapshot.players) || [])).filter(function (player) {
      return player.id !== state.seatId && player.visibleCards && player.visibleCards.length;
    });
    if (!blindRound()) return "";
    const infoLine = state.snapshot && state.snapshot.phase === "bidding"
      ? "Prima di dichiarare non vedi alcuna carta. Dopo le dichiarazioni comparira il riepilogo delle carte avversarie."
      : "Nel tavolo rotondo vedi le carte degli avversari ancora in mano. Qui trovi anche un riepilogo rapido.";
    return `<section class="panel"><div class="panel-header"><h2 class="panel-title">Manche cieca da 1 carta</h2></div><div class="panel-body"><div class="notice warn">${infoLine}</div>${opponents.length ? `<div class="blind-opponents">${opponents.map(function (player) {
      return `<div class="seat-card"><div class="seat-head"><div><div class="seat-name">${escapeHtml(player.name)}</div><div class="seat-id">${escapeHtml(player.id)}</div></div><div class="badge">${player.bid == null ? "-" : escapeHtml(player.bid)}</div></div><div class="blind-card">${player.visibleCards[0] ? cardTemplate(player.visibleCards[0], { compact: true, mediaKey: cardMediaToken(player.visibleCards[0], { scope: `blind-opponent:${player.id}` }) }) : '<div class="empty-state">Carta già giocata</div>'}</div></div>`;
    }).join("")}</div>` : '<div class="empty-state">Nessuna carta visibile al momento.</div>'}</div></section>`;
  }



  function authPanelTemplate() {
    if (state.currentUser) {
      return `<section class="panel auth-panel"><div class="panel-body auth-user-row"><div class="auth-avatar">${escapeHtml(initialsForName(state.currentUser.username))}</div><div class="auth-user-info"><div class="auth-username">${escapeHtml(state.currentUser.username)}</div><div class="auth-sub">Account attivo</div></div><button class="ghost-button" type="button" data-action="logout">Esci</button></div></section>`;
    }
    const isRegister = state.authMode === "register";
    return `<section class="panel auth-panel"><div class="panel-header"><h2 class="panel-title">${isRegister ? "Crea account" : "Accedi"}</h2></div><div class="panel-body stack"><div class="muted">Con un account il tuo storico partite viene salvato automaticamente.</div><div class="form-grid"><div class="field"><label>Username</label><input type="text" data-auth-field="username" value="${escapeHtml(state.authUsername)}" placeholder="es. mario" autocomplete="username"></div><div class="field"><label>Password</label><input type="password" data-auth-field="password" value="${escapeHtml(state.authPassword)}" placeholder="${isRegister ? "min. 10 caratteri" : ""}" autocomplete="${isRegister ? "new-password" : "current-password"}"></div></div><div class="button-row"><button class="button" type="button" data-action="submit-auth" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "..." : isRegister ? "Registrati" : "Accedi"}</button><button class="ghost-button" type="button" data-action="toggle-auth-mode">${isRegister ? "Ho già un account" : "Crea account"}</button></div></div></section>`;
  }

  function authModalTemplate() {
    if (!state.authModalOpen) return "";
    const isRegister = state.authMode === "register";
    const hasError = !!state.authError;
    const errorHtml = hasError ? `<div class="auth-modal-error">${escapeHtml(state.authError)}</div>` : "";
    const fieldErr = hasError ? " input-error" : "";
    // Se il modal era già nel DOM non riapplicare le animazioni (evita il glitch)
    const alreadyOpen = !!document.querySelector(".auth-modal-overlay");
    const noAnim = alreadyOpen ? ' style="animation:none"' : "";
    return `<div class="auth-modal-overlay" data-action="close-auth-modal"${noAnim}><div class="auth-modal" onclick="event.stopPropagation()"${noAnim}><button class="auth-modal-close" type="button" data-action="close-auth-modal">✕</button><div class="auth-modal-logo">Z</div><h2 class="auth-modal-title">${isRegister ? "Crea account" : "Accedi"}</h2><div class="auth-modal-form"><div class="field"><label>Username</label><input type="text" class="${fieldErr}" data-auth-field="username" value="${escapeHtml(state.authUsername)}" placeholder="es. mario" autocomplete="username"></div><div class="field"><label>Password</label><input type="password" class="${fieldErr}" data-auth-field="password" value="${escapeHtml(state.authPassword)}" placeholder="${isRegister ? "min. 10 caratteri" : ""}" autocomplete="${isRegister ? "new-password" : "current-password"}"></div>${errorHtml}</div><div class="auth-modal-actions"><button class="button" type="button" data-action="submit-auth" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "..." : isRegister ? "Registrati" : "Accedi"}</button><button class="ghost-button" type="button" data-action="toggle-auth-mode">${isRegister ? "Ho già un account" : "Crea account"}</button><button class="ghost-button auth-modal-guest" type="button" data-action="close-auth-modal">Gioca come ospite →</button></div></div></div>`;
  }

  function profileModalTemplate() {
    if (!state.profileOpen || !state.currentUser) return "";
    const alreadyOpen = !!document.querySelector(".profile-modal-overlay");
    const noAnim = alreadyOpen ? ' style="animation:none"' : "";
    const errHtml = state.profileError ? `<div class="auth-modal-error">${escapeHtml(state.profileError)}</div>` : "";
    const okHtml  = state.profileSuccess ? `<div class="profile-success">${escapeHtml(state.profileSuccess)}</div>` : "";
    const u = state.currentUser.username;

    let body = "";
    if (state.profileTab === "edit-username") {
      body = `<div class="profile-edit-form">
        <div class="field"><label>Nuovo username</label><input type="text" data-profile-field="profileNewUsername" value="${escapeHtml(state.profileNewUsername)}" placeholder="${escapeHtml(u)}" autocomplete="off"></div>
        <div class="field"><label>Password attuale (conferma)</label><input type="password" data-profile-field="profileOldPassword" value="${escapeHtml(state.profileOldPassword)}" autocomplete="current-password"></div>
        ${errHtml}${okHtml}
        <div class="button-row"><button class="button" type="button" data-action="profile-save-username" ${state.profileBusy ? "disabled" : ""}>${state.profileBusy ? "..." : "Salva"}</button><button class="ghost-button" type="button" data-action="profile-tab" data-tab="info">Annulla</button></div>
      </div>`;
    } else if (state.profileTab === "edit-password") {
      body = `<div class="profile-edit-form">
        <div class="field"><label>Password attuale</label><input type="password" data-profile-field="profileOldPassword" value="${escapeHtml(state.profileOldPassword)}" autocomplete="current-password"></div>
        <div class="field"><label>Nuova password</label><input type="password" data-profile-field="profileNewPassword" value="${escapeHtml(state.profileNewPassword)}" placeholder="min. 10 caratteri" autocomplete="new-password"></div>
        ${errHtml}${okHtml}
        <div class="button-row"><button class="button" type="button" data-action="profile-save-password" ${state.profileBusy ? "disabled" : ""}>${state.profileBusy ? "..." : "Salva"}</button><button class="ghost-button" type="button" data-action="profile-tab" data-tab="info">Annulla</button></div>
      </div>`;
    } else if (state.profileTab === "deck") {
      body = `${deckOptionsTemplate("profile")}<div class="button-row" style="margin-top:8px"><button class="ghost-button" type="button" data-action="profile-tab" data-tab="info">← Indietro</button></div>`;
    } else {
      body = `<div class="profile-info">
        <div class="profile-row"><span class="profile-label">Username</span><span class="profile-value">${escapeHtml(u)}</span><button class="profile-edit-btn" type="button" data-action="profile-tab" data-tab="edit-username">Modifica</button></div>
        <div class="profile-row"><span class="profile-label">Password</span><span class="profile-value">••••••••</span><button class="profile-edit-btn" type="button" data-action="profile-tab" data-tab="edit-password">Modifica</button></div>
        <div class="profile-row"><span class="profile-label">Mazzo</span><span class="profile-value" style="text-transform:capitalize">${escapeHtml(state.deckStyle || "napoletane")}</span><button class="profile-edit-btn" type="button" data-action="profile-tab" data-tab="deck">Cambia</button></div>
        ${okHtml}
      </div>
      <div class="profile-actions">
        <button class="ghost-button profile-action-btn" type="button" data-action="profile-storico">Storico partite</button>
        <button class="ghost-button profile-action-btn danger" type="button" data-action="logout">Esci</button>
      </div>`;
    }

    return `<div class="profile-modal-overlay" data-action="close-profile"${noAnim}><div class="profile-modal" onclick="event.stopPropagation()"${noAnim}><button class="auth-modal-close" type="button" data-action="close-profile">✕</button><div class="auth-modal-logo">${escapeHtml(u.slice(0, 1).toUpperCase())}</div><h2 class="auth-modal-title">${escapeHtml(u)}</h2>${body}</div></div>`;
  }

  function historyTemplate() {
    if (!state.currentUser) {
      return `<section class="panel"><div class="panel-body"><div class="muted">Accedi per vedere il tuo storico partite.</div></div></section>`;
    }
    if (!state.historyData) {
      return `<section class="panel"><div class="panel-body"><button class="button" type="button" data-action="load-history">Carica storico</button></div></section>`;
    }
    if (!state.historyData.length) {
      return `<section class="panel"><div class="panel-body"><div class="muted">Nessuna partita completata ancora. Gioca la prima!</div></div></section>`;
    }
    const rows = state.historyData.map(function (game) {
      const date = new Date(game.finishedAt * 1000).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
      const me = game.players.find(function (p) { return p.isMe; });
      const won = me && me.won;
      const others = game.players.filter(function (p) { return !p.isMe; }).map(function (p) { return escapeHtml(p.name); }).join(", ");
      return `<div class="history-row ${won ? "history-win" : "history-loss"}"><div class="history-result">${won ? "🏆" : "💔"}</div><div class="history-info"><div class="history-players">${escapeHtml(me ? me.name : "?")} vs ${others || "—"}</div><div class="history-meta">${escapeHtml(date)} · ${game.playerCount} giocatori · ${me ? me.lives : "?"} ❤️ rimasti</div></div></div>`;
    }).join("");
    return `<section class="panel"><div class="panel-header"><h2 class="panel-title">Le tue partite</h2></div><div class="panel-body"><div class="history-list">${rows}</div></div></section>`;
  }

  function deckPickerTemplate() {
    if (!state.deckPickerOpen || state.view === "hub") return "";
    return `<div class="deck-picker-layer"><button class="deck-picker-scrim" type="button" data-action="close-deck-picker" aria-label="Chiudi selettore mazzo"></button><div class="deck-picker-popover"><div class="deck-picker-kicker">Cambio mazzo live</div><div class="deck-picker-title">Scegli il mazzo</div><div class="deck-picker-copy">Le carte si aggiornano subito senza interrompere la partita.</div>${deckOptionsTemplate("live")}<div class="deck-picker-actions"><button class="ghost-button" type="button" data-action="close-deck-picker">Chiudi</button></div></div></div>`;
  }

  function pendingIncomingFriendRequests() {
    return (((state.friendRequests || {}).incoming) || []).filter(function (request) {
      return request.status === "pending";
    });
  }

  function pendingInvites() {
    return (state.invitesData || []).filter(function (invite) {
      return invite.status === "pending" &&
        invite.lobbyStatus !== "expired" &&
        invite.lobbyStatus !== "cancelled";
    });
  }

  function inviteStatusLabel(status) {
    if (status === "pending") return "In attesa";
    if (status === "accepted") return "Accettato";
    if (status === "declined") return "Rifiutato";
    if (status === "left") return "Uscito";
    if (status === "started") return "Partita avviata";
    if (status === "expired") return "Scaduto";
    return status || "-";
  }

  function socialNoticeTemplate() {
    const chunks = [];
    if (state.socialError) {
      chunks.push(`<div class="notice error">${escapeHtml(state.socialError)}</div>`);
    }
    return chunks.join("");
  }

  function currentWaitingLobby() {
    const lobbies = state.activeLobbies || [];
    if (state.waitingLobbyId) {
      const selected = lobbies.find(function (lobby) { return lobby.lobbyId === state.waitingLobbyId; });
      if (selected) return selected;
    }
    return lobbies.find(function (lobby) {
      return lobby.status !== "started" && lobby.status !== "cancelled" && lobby.status !== "expired";
    }) || null;
  }

  function socialSummaryTemplate() {
    const onlineCount = onlineFriends().length;
    const inviteCount = pendingInvites().length;
    const requestCount = pendingIncomingFriendRequests().length;
    return `<section class="panel social-hero-panel"><div class="panel-body social-hero-body"><div class="social-hero-copy"><div class="eyebrow">Centro amici</div><h2 class="social-hero-title">Invita chi e online e fai partire la partita solo quando tutti accettano.</h2><div class="social-hero-sub">Niente link e niente QR: scegli gli amici, aspetti la risposta e poi entrate direttamente al tavolo.</div></div><div class="social-stats-grid"><div class="social-stat-card"><div class="social-stat-value">${onlineCount}</div><div class="social-stat-label">Amici online</div></div><div class="social-stat-card"><div class="social-stat-value">${inviteCount}</div><div class="social-stat-label">Inviti da gestire</div></div><div class="social-stat-card"><div class="social-stat-value">${requestCount}</div><div class="social-stat-label">Richieste in arrivo</div></div></div></div></section>`;
  }

  function friendsQuickPlayTemplate() {
    // Se c'è già una lobby aperta, porta direttamente in sala d'attesa
    const activeLobby = currentWaitingLobby();
    if (activeLobby && activeLobby.status === "pending") {
      state.waitingLobbyId = activeLobby.lobbyId;
      state.hubMode = "friends-waiting";
      return waitingLobbyTemplate();
    }
    const selectedCount = selectedOnlineInvitees().length;
    const onlineCount = onlineFriends().length;
    const btnLabel = state.socialBusy
      ? "Avvio in corso..."
      : selectedCount
        ? (selectedCount === 1 ? "Gioca con 1 amico →" : `Gioca con ${selectedCount} amici →`)
        : "Seleziona chi vuoi invitare";
    return `<div class="main stack social-shell"><div class="hub-back-row"><button class="ghost-button" type="button" data-action="hub-back" data-back="play-mode">← Indietro</button></div>${socialNoticeTemplate()}<section class="panel social-main-panel"><div class="panel-header"><h2 class="panel-title">Con chi vuoi giocare?</h2><div class="panel-subtitle muted">Seleziona gli amici online — riceveranno subito un invito</div></div><div class="panel-body stack">${onlineCount ? friendsSelectionTemplate() : `<div class="sf-empty">Nessun amico online in questo momento.</div>`}<div class="button-row social-button-row"><button class="button hub-cta friends-play-btn" type="button" data-action="create-friends-lobby" ${state.socialBusy || !selectedCount ? "disabled" : ""}>${escapeHtml(btnLabel)}</button></div></div></section></div>`;
  }

  function sfAvatar(username) {
    return escapeHtml((username || "?").charAt(0).toUpperCase());
  }

  function incomingFriendRequestsTemplate() {
    const incoming = (state.friendRequests && state.friendRequests.incoming) || [];
    if (!incoming.length) return `<div class="sf-empty">Nessuna richiesta ricevuta.</div>`;
    return incoming.map(function (request) {
      return `<div class="sf-action-row social-inline-row">
        <div class="sf-avatar">${sfAvatar(request.user.username)}</div>
        <div class="sf-action-info">
          <div class="sf-action-name">${escapeHtml(request.user.username)}</div>
          <div class="sf-action-sub">Vuole entrare nella tua lista amici</div>
        </div>
        ${request.status === "pending" ? `<div class="sf-action-buttons"><button class="button" type="button" data-action="friend-request-accept" data-request-id="${request.id}" ${state.socialBusy ? "disabled" : ""}>Accetta</button><button class="ghost-button" type="button" data-action="friend-request-decline" data-request-id="${request.id}" ${state.socialBusy ? "disabled" : ""}>Rifiuta</button></div>` : `<span class="sf-outgoing-status">${escapeHtml(inviteStatusLabel(request.status))}</span>`}
      </div>`;
    }).join("");
  }

  function outgoingFriendRequestsTemplate() {
    const outgoing = (state.friendRequests && state.friendRequests.outgoing) || [];
    if (!outgoing.length) return `<div class="sf-empty">Nessuna richiesta inviata in sospeso.</div>`;
    return outgoing.map(function (request) {
      return `<div class="sf-outgoing-row social-inline-row">
        <span class="sf-outgoing-name">${escapeHtml(request.user.username)}</span>
        <span class="sf-outgoing-status">${escapeHtml(inviteStatusLabel(request.status))}</span>
      </div>`;
    }).join("");
  }

  function friendsSelectionTemplate() {
    const online = onlineFriends();
    const selected = new Set(selectedOnlineInvitees().map(String));
    if (!online.length) return `<div class="sf-empty">Nessun amico online in questo momento.</div>`;
    return `<div class="sf-friend-grid social-friend-grid social-list">${online.map(function (friend) {
      const active = selected.has(String(friend.id));
      return `<button class="sf-friend-chip social-card social-select-card${active ? " selected active" : ""}" type="button" data-action="toggle-invitee" data-user-id="${friend.id}">
        <div class="sf-avatar">${sfAvatar(friend.username)}</div>
        <div class="sf-chip-name">${escapeHtml(friend.username)}</div>
        <div class="sf-chip-status${active ? " selected-label" : ""}">${active ? "✓ Selezionato" : "Online"}</div>
      </button>`;
    }).join("")}</div>`;
  }

  function invitesTemplate() {
    const invites = pendingInvites();
    if (!invites.length) return `<div class="sf-empty">Nessun invito ricevuto.</div>`;
    return invites.map(function (invite) {
      return `<div class="sf-action-row social-inline-row">
        <div class="sf-avatar">${sfAvatar(invite.host.username)}</div>
        <div class="sf-action-info">
          <div class="sf-action-name">${escapeHtml(invite.host.username)}</div>
          <div class="sf-action-sub">Ti ha invitato in una nuova partita</div>
        </div>
        <div class="sf-action-buttons">
          <button class="button" type="button" data-action="invite-accept" data-invite-id="${invite.id}" ${state.socialBusy ? "disabled" : ""}>Accetta</button>
          <button class="ghost-button" type="button" data-action="invite-decline" data-invite-id="${invite.id}" ${state.socialBusy ? "disabled" : ""}>Rifiuta</button>
        </div>
      </div>`;
    }).join("");
  }

  function activeLobbiesTemplate() {
    const lobbies = state.activeLobbies || [];
    if (!lobbies.length) return `<div class="sf-empty">Nessuna lobby attiva.</div>`;
    return lobbies.map(function (lobby) {
      const members = (lobby.members || []).map(function (m) { return m.username; }).join(" · ");
      const isOwn = lobby.hostUserId === (state.currentUser && state.currentUser.id);
      const title = isOwn ? "La tua lobby" : "Lobby amici";
      const statusLabel = inviteStatusLabel(lobby.status);
      const canJoin = lobby.status === "started" && lobby.me && lobby.me.hasSeat;
      return `<div class="sf-lobby-row social-card">
        <div class="sf-lobby-header">
          <div class="sf-avatar">${isOwn ? "👑" : "🎮"}</div>
          <div class="sf-lobby-name">${escapeHtml(title)}</div>
          <span class="sf-member-status${lobby.status === "started" ? " ready" : ""}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="sf-lobby-members">${escapeHtml(members)}</div>
        ${canJoin ? `<button class="button" type="button" data-action="join-started-lobby" data-lobby-id="${escapeHtml(lobby.lobbyId)}" style="width:100%">Entra in partita →</button>` : ""}
      </div>`;
    }).join("");
  }

  function waitingLobbyTemplate() {
    const lobby = currentWaitingLobby();
    if (!lobby) {
      return `<div class="main sf-shell">
        <div class="sf-header">
          <button class="ghost-button" type="button" data-action="hub-back" data-back="play-mode">← Indietro</button>
          <h1 class="sf-title">Sala d'attesa</h1>
        </div>
        <div class="lobby-empty-state">
          <div class="lobby-empty-icon">🎮</div>
          <p class="lobby-empty-text">Nessuna lobby attiva. Torna indietro e seleziona gli amici.</p>
          <button class="button" type="button" data-action="hub-back" data-back="play-mode">← Torna indietro</button>
        </div>
      </div>`;
    }
    const members = lobby.members || [];
    const totalMembers = members.length;
    const acceptedMembers = members.filter(function (m) { return m.status === "accepted" || m.status === "started"; });
    const pendingMembers = members.filter(function (m) { return m.status === "pending" || m.status === "invited"; });
    const declinedMembers = members.filter(function (m) { return m.status === "declined"; });
    const allReady = pendingMembers.length === 0 && declinedMembers.length === 0 && acceptedMembers.length === totalMembers;
    const canJoinStarted = lobby.status === "started" && lobby.me && lobby.me.hasSeat;
    const isHost = lobby.hostUserId === (state.currentUser && state.currentUser.id);

    const memberRows = members.map(function (member) {
      const isAccepted = member.status === "accepted" || member.status === "started";
      const isDeclined = member.status === "declined";
      const isPending = !isAccepted && !isDeclined;
      const isMe = state.currentUser && member.userId === state.currentUser.id;
      const statusIcon = isAccepted ? "✓" : isDeclined ? "✗" : "";
      const statusClass = isAccepted ? "lobby-member-accepted" : isDeclined ? "lobby-member-declined" : "lobby-member-pending";
      return `<div class="lobby-member-row ${statusClass}">
        <div class="lobby-member-avatar" style="${avatarStyle(member.username)}">${escapeHtml(sfAvatar(member.username))}</div>
        <div class="lobby-member-info">
          <div class="lobby-member-name">${escapeHtml(member.username)}${isMe ? " <span class='lobby-member-you'>(tu)</span>" : ""}</div>
          <div class="lobby-member-role">${member.userId === lobby.hostUserId ? "Host" : "Invitato"}</div>
        </div>
        <div class="lobby-member-status-wrap">
          ${isPending ? `<span class="lobby-pulse-dot"></span><span class="lobby-member-status-text">In attesa...</span>` : ""}
          ${isAccepted ? `<span class="lobby-status-icon lobby-status-ok">${statusIcon}</span><span class="lobby-member-status-text">Pronto</span>` : ""}
          ${isDeclined ? `<span class="lobby-status-icon lobby-status-no">${statusIcon}</span><span class="lobby-member-status-text">Rifiutato</span>` : ""}
        </div>
      </div>`;
    }).join("");

    const progressPct = totalMembers > 0 ? Math.round((acceptedMembers.length / totalMembers) * 100) : 0;

    const mainAction = canJoinStarted
      ? `<button class="button hub-cta lobby-enter-btn" type="button" data-action="join-started-lobby" data-lobby-id="${escapeHtml(lobby.lobbyId)}">Entra in partita →</button>`
      : allReady
        ? `<button class="button hub-cta lobby-enter-btn" type="button" disabled>Avvio in corso...</button>`
        : `<button class="button hub-cta" type="button" disabled>Aspettando ${pendingMembers.length} giocator${pendingMembers.length === 1 ? "e" : "i"}...</button>`;

    const cancelAction = isHost && (lobby.status === "pending" || lobby.status === "ready")
      ? `<button class="ghost-button lobby-cancel-btn" type="button" data-action="cancel-lobby" data-lobby-id="${escapeHtml(lobby.lobbyId)}" ${state.socialBusy ? "disabled" : ""}>Annulla lobby</button>`
      : "";

    return `<div class="main sf-shell lobby-waiting-shell">
      <div class="lobby-waiting-header">
        <div class="lobby-waiting-title">${canJoinStarted ? "Pronti a giocare!" : "Sala d'attesa"}</div>
        <div class="lobby-waiting-sub">${canJoinStarted ? "Il tavolo è pronto — entra subito!" : "Gli inviti sono stati inviati. Aspetta che i tuoi amici accettino."}</div>
      </div>
      ${socialNoticeTemplate()}
      <div class="lobby-progress-wrap">
        <div class="lobby-progress-bar">
          <div class="lobby-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div class="lobby-progress-label">${acceptedMembers.length} di ${totalMembers} pronti</div>
      </div>
      <div class="lobby-members-list">${memberRows}</div>
      <div class="lobby-actions">
        ${mainAction}
        ${cancelAction}
      </div>
    </div>`;
  }

  function friendsHubTemplate() {
    if (!state.currentUser) {
      return `<div class="main stack social-shell">
        <div class="social-page-header">
          <button class="ghost-button" type="button" data-action="hub-back" data-back="play-mode">← Indietro</button>
          <h1 class="social-page-title">Amici</h1>
        </div>
        <section class="panel"><div class="panel-body"><div class="sf-login-prompt">Accedi per usare amici, inviti e presenza online.</div></div></section>
      </div>`;
    }
    if (state.hubMode === "friends-waiting") {
      return waitingLobbyTemplate();
    }
    const openLobby = currentWaitingLobby();
    if (openLobby && (openLobby.status === "pending" || openLobby.status === "ready")) {
      state.waitingLobbyId = openLobby.lobbyId;
      state.hubMode = "friends-waiting";
      startLobbyPolling();
      return waitingLobbyTemplate();
    }
    const selectedCount = selectedOnlineInvitees().length;
    const onlineCount = onlineFriends().length;
    const inviteCount = pendingInvites().length;
    const requestCount = pendingIncomingFriendRequests().length;
    const outgoingCount = (state.friendRequests && (state.friendRequests.outgoing || []).length) || 0;
    return `<div class="main stack social-shell">
      <div class="social-page-header">
        <button class="ghost-button" type="button" data-action="hub-back" data-back="play-mode">← Indietro</button>
        <h1 class="social-page-title">Amici</h1>
        <button class="ghost-button social-refresh-btn icon-only" type="button" data-action="social-refresh" ${state.socialBusy ? "disabled" : ""} title="Aggiorna">↻</button>
      </div>
      ${socialNoticeTemplate()}
      ${socialSummaryTemplate()}
      <section class="panel social-hero-panel social-hero-panel-compact social-search-hero">
        <div class="panel-header"><h2 class="panel-title">Aggiungi amico</h2></div>
        <div class="panel-body social-search-panel-body">
          <div class="social-search-row sf-search-inner">
            <div class="social-search-field sf-search-input-wrap field">
            <input class="sf-search-input" type="text" data-social-field="friendSearchUsername" value="${escapeHtml(state.friendSearchUsername || "")}" placeholder="Username...">
            </div>
            <div class="social-search-actions">
              <button class="button" type="button" data-action="send-friend-request" ${state.socialBusy ? "disabled" : ""}>${state.socialBusy ? "..." : "Aggiungi"}</button>
            </div>
          </div>
        </div>
      </section>
      <div class="social-layout">
        <div class="stack">
          <section class="panel social-main-panel">
            <div class="sf-section-header">
              <div class="sf-section-title">Amici online<span class="sf-online-dot"></span></div>
              ${selectedCount ? `<button class="button social-invite-btn" type="button" data-action="create-friends-lobby" ${state.socialBusy ? "disabled" : ""}>${state.socialBusy ? "Invio..." : `Invita ${selectedCount}`}</button>` : ""}
            </div>
            ${friendsSelectionTemplate()}
            ${!onlineCount ? `<div class="sf-empty">Nessun amico online in questo momento.</div>` : ""}
          </section>
          ${state.activeLobbies.length ? `<section class="panel">
            <div class="sf-section-title">Lobby attive<span class="sf-badge">${state.activeLobbies.length}</span></div>
            ${activeLobbiesTemplate()}
          </section>` : ""}
        </div>
        <div class="social-side-column social-list">
          ${inviteCount ? `<section class="panel social-urgent-panel sf-urgent-card">
            <div class="sf-section-title"><span class="sf-pulse-dot"></span>Inviti ricevuti<span class="sf-badge sf-badge-urgent">${inviteCount}</span></div>
            ${invitesTemplate()}
          </section>` : ""}
          ${requestCount ? `<section class="panel">
            <div class="sf-section-title">Richieste amicizia<span class="sf-badge">${requestCount}</span></div>
            ${incomingFriendRequestsTemplate()}
          </section>` : ""}
          ${outgoingCount ? `<section class="panel">
            <div class="sf-section-title">Richieste inviate</div>
            ${outgoingFriendRequestsTemplate()}
          </section>` : ""}
          ${(!inviteCount && !requestCount && !outgoingCount) ? `<section class="panel social-card social-empty"><div class="panel-body">Nessuna richiesta o invito in sospeso.</div></section>` : ""}
        </div>
      </div>
    </div>`;
  }

  function rulesModalTemplate() {
    const sections = [
      { icon: "🎯", title: "Obiettivo", open: true, body: `<p>Sopravvivi agli altri giocatori. Vince l'<strong>ultimo rimasto con almeno 1 vita</strong>. Si usa il <strong>mazzo napoletano da 40 carte</strong> (4 semi × 10 ranghi).</p>` },
      { icon: "❤️", title: "Vite", body: `<p>Ogni giocatore parte con <strong>3 vite</strong>. A <strong>0 vite</strong> sei eliminato. Le vite si perdono se la tua previsione era sbagliata.</p><p class="rules-example">Dichiari <strong>2</strong> ma ne fai <strong>4</strong> → perdi <strong>2 vite</strong>. Dichiari <strong>2</strong> e ne fai <strong>2</strong> → perdi <strong>0 vite</strong>.</p>` },
      { icon: "🃏", title: "Le manche", body: `<p>Le carte diminuiscono da <strong>5 a 1</strong>, poi si riparte da 5. Il ciclo si ripete fino a un solo vincitore, <strong>senza ripristinare le vite</strong>.</p><div class="rules-rounds-row"><span class="rules-round-pill">5 carte</span><span class="rules-round-pill">4 carte</span><span class="rules-round-pill">3 carte</span><span class="rules-round-pill">2 carte</span><span class="rules-round-pill rules-round-pill-last">1 carta 👁️</span><span class="rules-round-pill">Di nuovo 5</span></div>` },
      { icon: "👁️", title: "Manche cieca", body: `<p>L'ultima manche: <strong>non vedi la tua carta</strong>, ma vedi quelle degli avversari.</p><ul class="rules-list"><li>Dichiari <strong>0</strong> se pensi di perdere la presa</li><li>Dichiari <strong>1</strong> se pensi di vincerla</li></ul><p class="rules-example">Vedi carte basse negli avversari → dichiara 1. Vedi Re di Oro → dichiara 0.</p>` },
      { icon: "📢", title: "Dichiarazione", body: `<p>Prima di giocare dichiari <strong>quante prese farai</strong>. L'ultimo dichiarante <strong>non può</strong> scegliere il numero che eguaglia le carte in gioco.</p><p class="rules-example">Con 3 carte, se gli altri dichiarano 1+0=1, l'ultimo non può dichiarare 2.</p>` },
      { icon: "⚔️", title: "Vince la presa", body: `<p>Vince chi ha la carta con il <strong>valore assoluto più alto</strong>. Non sei obbligato a seguire il seme.</p><p class="rules-example">Re di Bastoni vs 2 di Coppe → vince il <strong>2 di Coppe</strong> perché Coppe &gt; Bastoni.</p>` },
      { icon: "🏆", title: "Gerarchia semi", body: `<div class="rules-hierarchy"><span class="rules-hier-item rules-hier-1">Oro</span><span class="rules-hier-arrow">›</span><span class="rules-hier-item rules-hier-2">Coppe</span><span class="rules-hier-arrow">›</span><span class="rules-hier-item rules-hier-3">Spade</span><span class="rules-hier-arrow">›</span><span class="rules-hier-item rules-hier-4">Bastoni</span></div>` },
      { icon: "🎖️", title: "Gerarchia ranghi", body: `<div class="rules-ranks-row"><span class="rules-rank-chip">Re</span><span class="rules-rank-chip">Cavallo</span><span class="rules-rank-chip">Fante</span><span class="rules-rank-chip">7</span><span class="rules-rank-chip">6</span><span class="rules-rank-chip">5</span><span class="rules-rank-chip">4</span><span class="rules-rank-chip">3</span><span class="rules-rank-chip">2</span><span class="rules-rank-chip rules-rank-weak">Asso</span></div><p class="rules-rank-hint">← più forte &nbsp; più debole →</p>` },
      { icon: "⭐", title: "Asso di Oro", body: `<p>Carta a potere variabile. Devi scegliere quando la giochi:</p><ul class="rules-list"><li><strong>Massimo</strong> — batte tutto</li><li><strong>Minimo</strong> — perde contro tutto</li></ul><p>Nella manche a una carta il valore e automatico: dichiari <strong>0 = BASSO</strong>, dichiari <strong>1 = ALTO</strong>. La presa ha sempre un solo vincitore.</p>` },
      { icon: "🏁", title: "Fine partita", body: `<p>La partita finisce non appena rimane <strong>un solo giocatore vivo</strong>. Chi vince una presa apre il turno successivo.</p><p>Se tutti gli ultimi giocatori perdono insieme la loro ultima vita, solo loro disputano uno <strong>spareggio a una vita</strong>, ripartendo da cinque carte.</p>` },
    ];
    const html = sections.map(function (s) {
      return `<details class="rules-details"${s.open ? " open" : ""}>
        <summary class="rules-summary"><span class="rules-summary-icon">${s.icon}</span>${s.title}<span class="rules-summary-chevron">›</span></summary>
        <div class="rules-details-body">${s.body}</div>
      </details>`;
    }).join("");
    return `<div class="rules-overlay" data-action="close-rules"><div class="rules-modal" onclick="event.stopPropagation()">
<button class="auth-modal-close" type="button" data-action="close-rules">✕</button>
<h2 class="rules-title">Come si gioca a Zanzo</h2>
<div class="rules-body">${html}</div></div></div>`;
  }

  function hubBgCards() {
    return "";
  }

  function hubSection() {
    if (state.hubMode === "history") {
      return `<div class="main stack"><div class="hub-back-row"><button class="ghost-button" type="button" data-action="hub-back" data-back="null">&larr; Indietro</button></div>${historyTemplate()}</div>`;
    }
    if (state.hubMode === "friends" || state.hubMode === "friends-manage") {
      return friendsHubTemplate();
    }
    if (state.hubMode === "waiting") {
      return window.ZanzoLobby.waiting(state.currentUser, state.guestName, state.matchmakingWaiting, state.matchmakingCountdownRemaining);
    }
    if (state.hubMode === "bot-setup") {
      return window.ZanzoLobby.bots(state.botCarouselIndex || 0, state.busy);
    }
    if (state.hubMode === "play-mode") {
      return window.ZanzoLobby.selection(state.currentUser);
    }
    return window.ZanzoLobby.home(state.currentUser);
  }

  function tableSection() {
    const players = (state.snapshot && state.snapshot.players) || [];
    const status = restartStatus();
    const gameover = showGameoverUi() ? `<section class="panel"><div class="panel-body stack"><div class="eyebrow">Esito</div><div class="hero-title" style="font-size:2.5rem;">${escapeHtml(winnersLabel(state.snapshot && state.snapshot.winners))}</div><div class="gameover-restart-status"><div class="gameover-restart-count">${escapeHtml(status.approved || 0)}/${escapeHtml(status.required || 0)} pronti</div><div class="gameover-restart-copy">${escapeHtml((status.pendingNames || []).length ? `In attesa di: ${status.pendingNames.join(", ")}` : "Tutti hanno confermato.")}</div></div></div></section>` : "";
    const statePanel = `<section class="panel"><div class="panel-header"><h2 class="panel-title">Stato giocatori</h2></div><div class="panel-body"><div class="player-grid">${players.map(playerSummaryCard).join("")}</div></div></section>`;
    const logsPanel = `<section class="panel"><div class="panel-header"><h2 class="panel-title">Ultime prese</h2></div><div class="panel-body">${logsTemplate()}</div></section>`;
    if (players.length >= 7) {
      return `<div class="stack table-main-dense">${roundTableTemplate("table")}${gameover}<div class="table-side-grid">${statePanel}${logsPanel}</div></div>`;
    }
    return `<div class="two-col main"><div class="stack">${roundTableTemplate("table")}${gameover}${statePanel}</div><div class="stack">${logsPanel}</div></div>`;
  }

  function playerSection() {
    return arenaSection();
  }

  function arenaSection() {
    return window.ZanzoArena.render({
      snapshot:state.snapshot, seatId:state.seatId, image:cardImagePath,
      hand:dealPresentationActive() ? [] : myHand(),
      dealing:state.activeDealAnimation, trick:state.activeTrickSweep, bid:state.activeBidAnnouncement, round:state.activeRoundSummary,
      winnerLabel:state.activeTrickSweep ? cardAnnouncementLabel(state.activeTrickSweep.card, state.activeTrickSweep.assoMode) : "",
      canBid:canBid(), canPlay:canPlay(), canPremove:canPremove(), busy:state.busy,
      bidValues:bidChoiceValues(), selectedBid:parseInt(state.bidInput,10), forbiddenBid:lastBidForbiddenValue(),
      selectedCardId:state.selectedCardId, assoMode:state.selectedAssoMode, assoChoice:showAssoChoice(),
      gameover:showGameoverUi(), winners:winnersLabel(state.snapshot && state.snapshot.winners), restartApproved:hasApprovedRestart(),
      hint:state.activeRoundSummary ? "Le vite perse dipendono dalla differenza tra dichiarate e prese." : dealPresentationActive() ? "Prima la distribuzione, poi le dichiarazioni." : state.activeTrickSweep ? "" : blindRound() ? "Guarda le carte degli altri. Dopo le dichiarazioni, la tua carta si scopre automaticamente." : canPlay() ? "Tocca una carta per giocarla." : canBid() ? "Controlla le dichiarazioni degli altri e scegli le tue prese." : "Attendi il tuo turno."
    });
  }

  function leaderboardTemplate() {
    const rows = state.leaderboardData || [];
    const champions = state.leaderboardChampions || [];
    const loaded = Boolean(state.leaderboardData);
    const hall = `<section class="za-hall" aria-labelledby="hall-title"><h2 id="hall-title">Albo vittorie</h2><p>Tutte le stagioni. Ogni vittoria online resta qui anche dopo il reset dei punti.</p>${loaded ? champions.length ? `<table><thead><tr><th>#</th><th>Giocatore</th><th>Vittorie</th><th>Partite</th></tr></thead><tbody>${champions.map((r,i) => `<tr><td>${i+1}</td><td>${escapeHtml(r.username)}</td><td><strong>${r.wins}</strong></td><td>${r.games}</td></tr>`).join("")}</tbody></table>` : '<p>Il primo nome nell\'albo potrebbe essere il tuo.</p>' : '<p role="status">Caricamento albo...</p>'}</section>`;
    return `<section class="za-leaderboard"><button class="ghost-button" type="button" data-action="hub-back" data-back="null">Indietro</button><h1>Classifica &middot; Stagione 2</h1><p>Solo partite online completate tra account registrati. Tutti i piazzamenti assegnano punti: 5 &times; (giocatori - posizione + 1)&sup2;. Bot, ospiti e abbandoni volontari non assegnano punti.</p><p>In 8: <strong>320 / 245 / 180 / 125 / 80 / 45 / 20 / 5</strong>. In 2: <strong>20 / 5</strong>. Conta l'ordine di eliminazione; a parita di manche, meno errori totali nelle dichiarazioni e poi la carta finale piu forte. I vecchi risultati restano nello storico, fuori dalla nuova classifica punti.</p>${loaded ? rows.length ? `<table><thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>Vinte / giocate</th></tr></thead><tbody>${rows.map((r,i) => `<tr><td>${i+1}</td><td>${escapeHtml(r.username)}</td><td>${r.points}</td><td>${r.wins} / ${r.games}</td></tr>`).join("")}</tbody></table>` : '<p>Nessuna partita classificata completata nella nuova stagione.</p>' : '<p role="status">Caricamento classifica...</p>'}${hall}</section>`;
  }

  function navigationTemplate() {
    if (!state.roomId || state.view === "player") return "";
    return `<div class="toolbar topbar-nav"><button class="nav-button" type="button" data-action="nav-hub">← Esci</button><button class="nav-button ${state.view === "table" ? "active" : ""}" type="button" data-action="nav-table">Tavolo</button></div>`;
  }

  function headerTemplate() {
    if (state.view === "hub") return window.ZanzoLobby.header(state.currentUser, socialNotificationCount());
    const me = currentPlayer();
    const identity = state.view === "player" && me ? me.name : "Tavolo";
    const socialCount = socialNotificationCount();
    let rightSection;
    if (state.view === "hub") {
      rightSection = state.currentUser
        ? `<div class="topbar-hub-actions"><button class="topbar-search-btn" type="button" data-action="open-friends-search" title="Cerca amici" aria-label="Cerca amici">⌕${socialCount ? `<span class="topbar-search-badge">${escapeHtml(Math.min(socialCount, 99))}</span>` : ""}</button><button class="topbar-avatar topbar-avatar-btn" style="${avatarStyle(state.currentUser.username)}" type="button" data-action="open-profile" title="${escapeHtml(state.currentUser.username)}"><span>${escapeHtml(state.currentUser.username.slice(0, 1).toUpperCase())}</span></button></div>`
        : `<button class="ghost-button topbar-auth-login" type="button" data-action="open-auth-modal">Accedi</button>`;
    } else {
      const leaveButton = state.view === "player"
        ? `<button class="ghost-button topbar-leave-btn" type="button" data-action="leave-room" ${state.busy ? "disabled" : ""}>Esci</button>`
        : "";
      rightSection = `${leaveButton}<div class="topbar-user"><div class="topbar-user-label">${state.view === "player" ? "Seat" : "Master"}</div><div class="topbar-user-name">${escapeHtml(identity)}</div></div><button class="topbar-avatar topbar-avatar-btn" style="${avatarStyle(identity)}" type="button" data-action="open-deck-picker" title="Cambia mazzo"><span>${escapeHtml(initialsForName(identity))}</span></button>`;
    }
    const chip = state.roomId ? `<div class="topbar-chip">${escapeHtml(state.roomId)}</div>` : "";
    return `<header class="topbar"><div class="topbar-left"><button class="topbar-brand" type="button" data-action="nav-hub">Zanzo</button>${navigationTemplate()}</div><div class="topbar-right">${chip}${rightSection}</div></header>`;
  }

  function navStripTemplate() {
    return "";
  }

  function invitePopupTemplate() {
    const invite = state.invitePopup;
    if (!invite) return "";
    const otherPending = (state.invitesData || []).filter(function (i) {
      return i.status === "pending" && i.lobbyStatus !== "expired" && i.lobbyStatus !== "cancelled" && i.id !== invite.id;
    }).length;
    return `<div class="invite-popup-wrap" role="dialog" aria-label="Invito partita">
      <div class="invite-popup-avatar" style="${avatarStyle(invite.host.username)}">${escapeHtml(sfAvatar(invite.host.username))}</div>
      <div class="invite-popup-body">
        <div class="invite-popup-name">${escapeHtml(invite.host.username)}</div>
        <div class="invite-popup-sub">ti ha invitato a giocare${otherPending ? ` (+${otherPending} altri)` : ""}</div>
      </div>
      <div class="invite-popup-actions">
        <button class="button invite-popup-btn" type="button" data-action="invite-popup-accept" data-invite-id="${invite.id}" ${state.socialBusy ? "disabled" : ""}>Accetta</button>
        <button class="ghost-button invite-popup-btn" type="button" data-action="invite-popup-decline" data-invite-id="${invite.id}" ${state.socialBusy ? "disabled" : ""}>Rifiuta</button>
      </div>
      <button class="invite-popup-close" type="button" data-action="invite-popup-dismiss" aria-label="Chiudi">✕</button>
    </div>`;
  }

  function noticeTemplate() {
    if (!state.notice) return "";
    const klass = state.notice.kind === "error" ? "notice error" : state.notice.kind === "warn" ? "notice warn" : "notice";
    return `<div class="${klass}">${escapeHtml(state.notice.message)}</div>`;
  }

  function render() {
    const chatRoom = state.roomId, chatMatch = state.snapshot && state.snapshot.matchId;
    const chatSeat = state.seatId, chatToken = state.token;
    window.ZanzoChat.configure({snapshot:state.view === "player" ? state.snapshot : null, seatId:chatSeat,
      onChange:render, send:(kind, value) => api(`/api/rooms/${chatRoom}/chat`, {method:"POST", body:JSON.stringify({seatId:chatSeat, token:chatToken, matchId:chatMatch, kind, value})})});
    // Leaving the search page cancels the reservation, including header navigation.
    if (state.matchmakingQueueId && (state.view !== "hub" || state.hubMode !== "waiting")) {
      const queueId = state.matchmakingQueueId;
      clearInterval(matchmakingPollId);
      state.matchmakingQueueId = null;
      api("/api/matchmaking/leave", {method:"DELETE", body:JSON.stringify({queueId})}).catch(function () {});
    }
    if (!state.roomMeta && state.roomId) {
      state.roomMeta = loadRoomMeta(state.roomId);
    }
    updateUrl();
    document.documentElement.classList.toggle("platform-android", IS_ANDROID);
    document.body.setAttribute("data-view", state.view);
    document.body.setAttribute("data-hub-mode", state.hubMode || "home");
    document.body.setAttribute("data-phase", state.snapshot && state.snapshot.phase ? state.snapshot.phase : "setup");
    document.body.setAttribute("data-player-pane", state.playerMobilePane);
    document.body.setAttribute("data-platform", IS_ANDROID ? "android" : "default");
    document.body.setAttribute("data-deck", state.deckStyle || "napoletane");
    if (!_turnBlinkId) document.title = _baseTitle + (state.roomId ? ` — ${state.roomId}` : " | Non \u00e8 solo fortuna");
    const content = state.view === "hub" ? (state.hubMode === "leaderboard" ? leaderboardTemplate() : hubSection()) : state.view === "table" ? arenaSection() : playerSection();
    const footer = state.view === "hub" ? window.ZanzoLobby.footer() : "";
    const rules = state.view === "hub" && state.rulesOpen ? rulesModalTemplate() : "";
    window.ZanzoArena.update(root, `<div class="app-shell stack" data-key="shell">${headerTemplate()}${navStripTemplate()}${noticeTemplate()}${content}${footer}</div>${rules}${authModalTemplate()}${profileModalTemplate()}${deckPickerTemplate()}${invitePopupTemplate()}`);
    bindEvents();
    window.ZanzoLobby.sync();
    window.ZanzoChat.bind();
    window.ZanzoEffects.sync(render);
    syncTurnNotify();
    animateChangedStats();
    const celebrationKey = state.roomId + ":" + state.lastSeenEventId;
    if (showGameoverUi() && state.snapshot && state.snapshot.winners && state.snapshot.winners.length && state.celebratedMatch !== celebrationKey) {
      state.celebratedMatch = celebrationKey;
      if (window.ZanzoEffects.motionEnabled) launchConfetti();
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-join-field]").forEach(function (input) {
      if (input._zanzoBound) return;
      input._zanzoBound = true;
      input.addEventListener("input", function (event) {
        state.joinForm[event.target.getAttribute("data-join-field")] = event.target.value;
      });
    });

    document.querySelectorAll("[data-social-field]").forEach(function (input) {
      if (input._zanzoBound) return;
      input._zanzoBound = true;
      input.addEventListener("input", function (event) {
        const field = event.target.getAttribute("data-social-field");
        if (field in state) state[field] = event.target.value;
      });
    });

    const bidInput = document.getElementById("bid-input");
    if (bidInput && !bidInput._zanzoBound) {
      bidInput._zanzoBound = true;
      bidInput.addEventListener("input", function (event) {
        const digits = String(event.target.value || "").replace(/[^\d]/g, "");
        state.bidInput = digits;
        if (event.target.value !== digits) {
          event.target.value = digits;
        }
      });
    }

    document.querySelectorAll("[data-action]").forEach(function (button) {
      button.onclick = async function (event) {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "open-leaderboard") {
          state.hubMode = "leaderboard";
          state.leaderboardData = null;
          state.leaderboardChampions = null;
          render();
          try {
            const board = await api("/api/leaderboard");
            state.leaderboardData = board.players;
            state.leaderboardChampions = board.champions || [];
          }
          catch (error) { setNotice(error.message, "error", true); state.leaderboardData = []; }
          return render();
        }
        if (action === "create-bot-room") return createBotRoom();
        if (action === "set-bot-count") {
          state.botCount = parseInt(event.currentTarget.getAttribute("data-count"), 10) || 1;
          return createBotRoom();
        }
        if (action === "bot-carousel-prev") {
          haptic(8); SFX.swipe();
          state.botCarouselIndex = Math.max(0, (state.botCarouselIndex || 0) - 1);
          state.botCount = (state.botCarouselIndex || 0) + 1;
          return render();
        }
        if (action === "bot-carousel-next") {
          haptic(8); SFX.swipe();
          state.botCarouselIndex = Math.min(6, (state.botCarouselIndex || 0) + 1);
          state.botCount = (state.botCarouselIndex || 0) + 1;
          return render();
        }
        if (action === "bot-carousel-select") {
          haptic(8); SFX.tick();
          const idx = parseInt(event.currentTarget.getAttribute("data-index"), 10) || 0;
          state.botCarouselIndex = idx;
          state.botCount = idx + 1;
          return render();
        }
        if (action === "start-bot-game") {
          haptic([10, 40, 10]); SFX.start();
          state.botCount = (state.botCarouselIndex || 0) + 1;
          return createBotRoom();
        }
        if (action === "hub-mode-bot") {
          haptic(6); SFX.tick();
          state.hubMode = "bot-setup";
          return render();
        }
        if (action === "play-carousel-prev") {
          haptic(8); SFX.swipe();
          state.playModeCarouselIndex = Math.max(0, (state.playModeCarouselIndex || 0) - 1);
          return render();
        }
        if (action === "play-carousel-next") {
          haptic(8); SFX.swipe();
          state.playModeCarouselIndex = Math.min(2, (state.playModeCarouselIndex || 0) + 1);
          return render();
        }
        if (action === "play-carousel-select") {
          haptic(8); SFX.tick();
          const idx = parseInt(event.currentTarget.getAttribute("data-index"), 10) || 0;
          state.playModeCarouselIndex = idx;
          return render();
        }
        if (action === "play-mode-online") {
          haptic([10, 40, 10]); SFX.start();
          return joinMatchmaking();
        }
        if (action === "open-table") return enterTableView();
        if (action === "open-player") return enterPlayerView();
        if (action === "submit-bid") return submitBid();
        if (action === "play-card") return playCard();
        if (action === "cancel-premove") return queuePremove(null);
        if (action === "select-bid") {
          state.bidInput = event.currentTarget.getAttribute("data-bid") || "0";
          return render();
        }
        if (action === "player-pane") {
          state.playerMobilePane = event.currentTarget.getAttribute("data-pane") === "table" ? "table" : "hand";
          return render();
        }
        if (action === "restart-room") { haptic([10, 40, 10]); return restartRoom(); }
        if (action === "quick-rematch") {
          haptic([10, 40, 10]); SFX.start();
          state.botCount = (state.botCarouselIndex || 0) + 1;
          return createBotRoom();
        }
        if (action === "pick-card") {
          if (state.busy || (!canPlay() && !canPremove())) return;
          haptic(12); SFX.pick();
          const cardId = event.currentTarget.getAttribute("data-card-id");
          if (state.snapshot.premove?.cardId === cardId) return queuePremove(null);
          const picked = myHand().find(entry => entry.id === cardId);
          if (!canPlay()) {
            if (!isAssoDiDenara(picked)) return queuePremove(cardId);
            if (state.snapshot.premove) await queuePremove(null);
            state.selectedForPremove = true;
            state.selectedCardId = cardId;
            state.selectedAssoMode = null;
            return render();
          }
          state.selectedForPremove = false;
          // Se l'asso è già selezionato con una modalità scelta, il secondo tap gioca la carta
          if (cardId === state.selectedCardId && state.selectedAssoMode) {
            return playCard(cardId);
          }
          state.selectedCardId = cardId;
          state.selectedAssoMode = null;
          const card = myHand().find(function (entry) { return entry.id === cardId; }) || null;
          if (shouldAutoPlayCard(card)) {
            render();
            return playCard(cardId);
          }
          return render();
        }
        if (action === "asso-mode") {
          state.selectedAssoMode = event.currentTarget.getAttribute("data-mode");
          if (state.selectedForPremove) return queuePremove(state.selectedCardId, state.selectedAssoMode);
          return render();
        }
        if (action === "nav-hub" || action === "leave-room") {
          if (action === "leave-room") {
            return leaveCurrentRoom();
          }
          state.view = "hub";
          state.hubMode = null;
          state.snapshot = null;
          state.snapshotKey = "";
          state.roomId = "";
          state.seatId = "";
          state.token = "";
          clearRoomSessionTracking();
          state.selectedCardId = null;
          state.selectedAssoMode = null;
          state.handAnimationKey = "";
          state.trickAnimationKey = "";
          resetTransientAnimations({ dropSeen: true });
          state.joinForm = { roomId: "", seatId: "", token: "" };
          render();
          return ensurePolling();
        }
        if (action === "nav-table") {
          state.view = "table";
          state.seatId = "";
          state.token = "";
          state.handAnimationKey = "";
          resetTransientAnimations();
          markSnapshotEventsSeen(state.snapshot);
          render();
          return ensurePolling();
        }
        if (action === "nav-player") {
          if (!state.seatId || !state.token) return;
          state.view = "player";
          state.handAnimationKey = "";
          resetTransientAnimations();
          markSnapshotEventsSeen(state.snapshot);
          render();
          return ensurePolling();
        }
        if (action === "force-refresh") return fetchSnapshot(true);
        if (action === "social-refresh") return loadSocialData();
        if (action === "send-friend-request") return sendFriendRequest();
        if (action === "friend-request-accept") return respondFriendRequest(event.currentTarget.getAttribute("data-request-id"), "accept");
        if (action === "friend-request-decline") return respondFriendRequest(event.currentTarget.getAttribute("data-request-id"), "decline");
        if (action === "toggle-invitee") return toggleInvitee(event.currentTarget.getAttribute("data-user-id"));
        if (action === "create-friends-lobby") return createFriendsLobby();
        if (action === "invite-accept") return respondInvite(event.currentTarget.getAttribute("data-invite-id"), "accept");
        if (action === "invite-decline") return respondInvite(event.currentTarget.getAttribute("data-invite-id"), "decline");
        if (action === "invite-popup-accept") {
          const id = event.currentTarget.getAttribute("data-invite-id");
          state.invitePopup = null;
          render();
          return respondInvite(id, "accept");
        }
        if (action === "invite-popup-decline") {
          const id = event.currentTarget.getAttribute("data-invite-id");
          state.invitePopup = null;
          render();
          return respondInvite(id, "decline");
        }
        if (action === "invite-popup-dismiss") {
          state.invitePopup = null;
          // Mostra il prossimo invito pendente non ancora notificato
          const next = (state.invitesData || []).find(function (i) {
            return i.status === "pending" && i.lobbyStatus !== "expired" && i.lobbyStatus !== "cancelled" && !_shownInvitePopupIds.has(i.id);
          });
          if (next) { _shownInvitePopupIds.add(next.id); state.invitePopup = next; }
          render();
          return;
        }
        if (action === "join-started-lobby") {
          const lobbyId = event.currentTarget.getAttribute("data-lobby-id");
          const lobby = (state.activeLobbies || []).find(function (entry) { return entry.lobbyId === lobbyId; });
          if (lobby) enterStartedLobby(lobby);
          return;
        }
        if (action === "cancel-lobby") {
          return cancelLobby(event.currentTarget.getAttribute("data-lobby-id"));
        }
        if (action === "hub-mode") {
          state.hubMode = event.currentTarget.getAttribute("data-mode") || null;
          if (state.hubMode === "history" && state.currentUser && !state.historyData) loadHistory();
          render();
          return;
        }
        if (action === "hub-back") {
          const back = event.currentTarget.getAttribute("data-back");
          state.hubMode = back === "null" || !back ? null : back;
          render();
          return;
        }
        if (action === "set-matchmaking-count") {
          state.matchmakingCount = parseInt(event.currentTarget.getAttribute("data-count"), 10) || 4;
          render();
          return;
        }
        if (action === "show-rules") { state.rulesOpen = true; render(); return; }
        if (action === "close-rules") { state.rulesOpen = false; render(); return; }
        if (action === "open-deck-picker") { state.deckPickerOpen = true; render(); return; }
        if (action === "close-deck-picker") { state.deckPickerOpen = false; render(); return; }
        if (action === "hub-mode-friends") {
          haptic([10, 40, 10]); SFX.tick();
          openFriendsHub(false);
          return;
        }
        if (action === "open-friends-search") { openFriendsHub(true); return; }
        if (action === "join-matchmaking") { joinMatchmaking(); return; }
        if (action === "leave-matchmaking") { leaveMatchmaking(); return; }
        if (action === "set-deck") {
          const deck = event.currentTarget.getAttribute("data-deck");
          if (deck) {
            state.deckStyle = deck;
            if (state.deckPickerOpen) state.deckPickerOpen = false;
            localStorage.setItem("zanzo-deck-style", deck);
            render();
          }
          return;
        }
        if (action === "open-profile") { state.profileOpen = true; state.profileTab = "info"; state.profileError = null; state.profileSuccess = null; render(); return; }
        if (action === "close-profile") { state.profileOpen = false; state.profileTab = "info"; state.profileError = null; state.profileSuccess = null; state.profileOldPassword = ""; state.profileNewPassword = ""; state.profileNewUsername = ""; render(); return; }
        if (action === "profile-tab") { state.profileTab = event.currentTarget.getAttribute("data-tab") || "info"; state.profileError = null; state.profileSuccess = null; render(); return; }
        if (action === "profile-save-username") return profileSaveUsername();
        if (action === "profile-save-password") return profileSavePassword();
        if (action === "profile-storico") { state.profileOpen = false; state.hubMode = "history"; if (state.currentUser && !state.historyData) loadHistory(); render(); return; }
        if (action === "open-auth-modal") { state.authModalOpen = true; render(); return; }
        if (action === "close-auth-modal") {
          state.authModalOpen = false;
          state.authUsername = "";
          state.authPassword = "";
          state.authError = null;
          render();
          return;
        }
        if (action === "toggle-auth-mode") {
          state.authMode = state.authMode === "login" ? "register" : "login";
          state.authError = null;
          render();
          return;
        }
        if (action === "submit-auth") return submitAuth();
        if (action === "logout") return logout();
        if (action === "load-history") return loadHistory();
      };
    });

    document.querySelectorAll("[data-auth-field]").forEach(function (input) {
      if (input._zanzoBound) return;
      input._zanzoBound = true;
      input.addEventListener("input", function (event) {
        const field = event.currentTarget.getAttribute("data-auth-field");
        if (field === "username") state.authUsername = event.currentTarget.value;
        if (field === "password") state.authPassword = event.currentTarget.value;
      });
    });

    document.querySelectorAll("[data-profile-field]").forEach(function (input) {
      if (input._zanzoBound) return;
      input._zanzoBound = true;
      input.addEventListener("input", function (event) {
        const field = event.currentTarget.getAttribute("data-profile-field");
        if (field in state) state[field] = event.currentTarget.value;
      });
    });

    document.querySelectorAll('.seat-avatar-wrap[data-action="open-deck-picker"]').forEach(function (node) {
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.deckPickerOpen = true;
          render();
        }
      });
    });

    // ── Swipe touch sul carousel bot ──────────────────────────
    var carouselTrack = document.querySelector(".bot-carousel-track");
    if (carouselTrack && !carouselTrack._zanzoBound) {
      carouselTrack._zanzoBound = true;
      var _swipeStartX = 0;
      var _swipeStartY = 0;
      carouselTrack.addEventListener("touchstart", function (e) {
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
      }, { passive: true });
      carouselTrack.addEventListener("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - _swipeStartX;
        var dy = e.changedTouches[0].clientY - _swipeStartY;
        if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx)) return;
        haptic(8); SFX.swipe();
        if (dx < 0) {
          state.botCarouselIndex = Math.min(6, (state.botCarouselIndex || 0) + 1);
        } else {
          state.botCarouselIndex = Math.max(0, (state.botCarouselIndex || 0) - 1);
        }
        state.botCount = (state.botCarouselIndex || 0) + 1;
        render();
      }, { passive: true });
    }
    // ── Swipe touch sul carousel play-mode ───────────────────
    var playCarouselTrack = document.querySelector(".play-carousel-track");
    if (playCarouselTrack && !playCarouselTrack._zanzoBound) {
      playCarouselTrack._zanzoBound = true;
      var _pSwipeStartX = 0;
      var _pSwipeStartY = 0;
      playCarouselTrack.addEventListener("touchstart", function (e) {
        _pSwipeStartX = e.touches[0].clientX;
        _pSwipeStartY = e.touches[0].clientY;
      }, { passive: true });
      playCarouselTrack.addEventListener("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - _pSwipeStartX;
        var dy = e.changedTouches[0].clientY - _pSwipeStartY;
        if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx)) return;
        haptic(8); SFX.swipe();
        if (dx < 0) {
          state.playModeCarouselIndex = Math.min(2, (state.playModeCarouselIndex || 0) + 1);
        } else {
          state.playModeCarouselIndex = Math.max(0, (state.playModeCarouselIndex || 0) - 1);
        }
        render();
      }, { passive: true });
    }
  }

  function ensureViewportSync() {
    if (viewportHandler) return;
    let rafId = 0;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    viewportHandler = function () {
      if (rafId) return;
      rafId = window.requestAnimationFrame(function () {
        rafId = 0;
        const nextW = window.innerWidth;
        const nextH = window.innerHeight;
        if (nextW === lastW && nextH === lastH) return;
        lastW = nextW;
        lastH = nextH;
        render();
      });
    };
    window.addEventListener("resize", viewportHandler, { passive: true });
    window.addEventListener("orientationchange", viewportHandler, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", viewportHandler, { passive: true });
    }
  }

  function hideSplash() {
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.classList.add("splash-hiding");
    setTimeout(function () { splash.classList.add("splash-hidden"); }, 520);
  }

  var splashColdTimer = setTimeout(function () {
    var sub = document.getElementById("splash-sub");
    if (sub) sub.textContent = "Il server si sta svegliando, attendi qualche secondo\u2026";
  }, 5000);

  loadServerInfo().then(function () {
    clearTimeout(splashColdTimer);
    return loadCurrentUser();
  }).then(function () {
    ensureViewportSync();
    ensureSocialPolling();
    hideSplash();
    render();
    ensurePolling();
  });
})();
