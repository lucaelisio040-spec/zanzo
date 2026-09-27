/* ZANZO — motore di gioco condiviso (browser per le partite con i bot, server per quelle online). */
function createZanzoEngine() {
  "use strict";

  const SUITS = ["bastoni", "spade", "coppe", "oro"]; // dal piu debole al piu forte
  const SUIT_LABELS = { bastoni: "Bastoni", spade: "Spade", coppe: "Coppe", oro: "Oro" };
  const RANKS = ["asso", "2", "3", "4", "5", "6", "7", "fante", "cavallo", "re"]; // dal piu debole al piu forte
  const RANK_LABELS = { asso: "Asso", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", fante: "Fante", cavallo: "Cavallo", re: "Re" };
  const HAND_SIZES = [5, 4, 3, 2, 1];
  const START_LIVES = 3;

  // Tempi (secondi) allineati alle animazioni del client.
  const T = {
    deal: 3.0,        // animazione distribuzione 2.8s
    botBid: 1.9,      // annuncio dichiarazione 1.7s
    botPlay: 1.1,
    resolve: 1.0,     // l'ultima carta resta visibile prima della presa
    trick: 4.4,       // sweep presa 4.2s
    trickBlind: 5.7,  // rivelazione manche cieca 5.5s
    round: 2.4,       // riepilogo manche 2.2s
    turn: 60,         // tempo massimo per giocatori umani online
    blindReveal: 1.9,
  };

  const BOT_NAMES = ["Giulia", "Marco", "Sofia", "Luca", "Chiara", "Matteo", "Elena", "Davide", "Sara", "Pietro", "Anna", "Tommaso", "Marta", "Nicola", "Irene", "Franco"];

  function randomId(length, alphabet) {
    const chars = alphabet || "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    const bytes = new Uint8Array(length);
    (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    for (let i = 0; i < length; i += 1) out += chars[bytes[i] % chars.length];
    return out;
  }
  function token() { return randomId(28, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"); }

  function makeCard(rank, suit) {
    return { id: `${rank}-${suit}`, rank, suit, rankLabel: RANK_LABELS[rank], suitLabel: SUIT_LABELS[suit] };
  }
  function fullDeck() {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
    return deck;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function isAssoOro(card) { return card && card.rank === "asso" && card.suit === "oro"; }
  function baseStrength(card) { return SUITS.indexOf(card.suit) * 10 + RANKS.indexOf(card.rank); }
  function strength(card, assoMode) {
    if (isAssoOro(card)) return assoMode === "low" ? -1 : 100;
    return baseStrength(card);
  }
  function cardLabel(card, assoMode) {
    let label = `${card.rankLabel} di ${card.suitLabel}`;
    if (isAssoOro(card) && assoMode) label += assoMode === "high" ? " alto" : " basso";
    return label;
  }

  // ─────────────────────────── stato ───────────────────────────
  function createMatch(options) {
    const now = options.now;
    const players = options.players.map(function (p, index) {
      return {
        id: p.id || `P${index + 1}`,
        name: String(p.name || `Giocatore ${index + 1}`).slice(0, 24),
        token: p.token || token(),
        isBot: Boolean(p.isBot),
        userId: p.userId == null ? null : p.userId,
        guest: Boolean(p.guest),
        lives: START_LIVES,
        bid: null,
        tricksWon: 0,
        hand: [],
        inRound: false,
        hasLeft: false,
        premove: null,
        totalErrors: 0,
        lastCardStrength: -2,
        eliminatedAt: null,
        afkStrikes: 0,
      };
    });
    const state = {
      roomId: options.roomId,
      matchId: token().slice(0, 12),
      mode: options.mode || "online",
      botMode: options.mode === "bots",
      createdAt: now,
      updatedAt: now,
      revision: 1,
      phase: "setup",
      cycle: 1,
      roundIndex: 0,
      handSize: HAND_SIZES[0],
      roundCounter: 0,
      dealerIndex: Math.floor(Math.random() * players.length),
      players,
      currentBidderIndex: null,
      currentTurnIndex: null,
      leaderIndex: null,
      tableCards: [],
      turnStartedAt: now,
      timer: null,
      events: [],
      eventSeq: options.eventSeq || 0,
      lastDealEvent: null,
      lastBidEvent: null,
      lastTrickEvent: null,
      winnerLog: [],
      winners: [],
      message: "",
      restart: { approvedIds: [] },
      chat: { seq: 0, messages: [] },
      emotes: { seq: 0, events: [] },
      recorded: false,
      finishOrder: [],
    };
    startRound(state, now, false);
    return state;
  }

  function aliveNotLeft(p) { return p.lives > 0 && !p.hasLeft; }
  function activeInRound(p) { return p.inRound && !p.hasLeft; }

  function pushEvent(state, event, at) {
    state.eventSeq += 1;
    const full = Object.assign({ id: state.eventSeq, createdAt: at }, event);
    state.events.push(full);
    if (state.events.length > 40) state.events = state.events.slice(-40);
    if (full.type === "deal") state.lastDealEvent = full;
    if (full.type === "bid") state.lastBidEvent = full;
    if (full.type === "trick") state.lastTrickEvent = full;
    return full;
  }

  function nextIndex(state, from, predicate) {
    const n = state.players.length;
    for (let step = 1; step <= n; step += 1) {
      const idx = (from + step) % n;
      if (predicate(state.players[idx])) return idx;
    }
    return null;
  }

  function publicPlayer(state, p, index) {
    return {
      id: p.id,
      name: p.name,
      lives: p.lives,
      bid: p.bid,
      tricksWon: p.tricksWon,
      handCount: p.hand.length,
      isBot: p.isBot,
      isDealer: index === state.dealerIndex,
      isCurrentBidder: state.phase === "bidding" && index === state.currentBidderIndex,
      isCurrentTurn: state.phase === "playing" && index === state.currentTurnIndex && !state.timer,
      hasLeft: p.hasLeft,
    };
  }

  function startRound(state, at, suddenDeath) {
    const n = state.players.length;
    state.handSize = HAND_SIZES[state.roundIndex];
    state.roundCounter += 1;
    const deck = shuffle(fullDeck());
    state.players.forEach(function (p) {
      p.bid = null;
      p.tricksWon = 0;
      p.premove = null;
      p.inRound = aliveNotLeft(p);
      p.hand = p.inRound ? deck.splice(0, state.handSize) : [];
      if (p.inRound) p.hand.sort((a, b) => baseStrength(a) - baseStrength(b));
    });
    if (!aliveNotLeft(state.players[state.dealerIndex])) {
      const d = nextIndex(state, state.dealerIndex, aliveNotLeft);
      if (d != null) state.dealerIndex = d;
    }
    state.phase = "bidding";
    state.tableCards = [];
    state.currentTurnIndex = null;
    state.currentBidderIndex = nextIndex(state, state.dealerIndex % n, activeInRound);
    state.leaderIndex = state.currentBidderIndex;
    state.turnStartedAt = at + T.deal;
    state.timer = null;
    pushEvent(state, {
      type: "deal",
      handSize: state.handSize,
      cycle: state.cycle,
      roundIndex: state.roundIndex,
      suddenDeath: Boolean(suddenDeath),
      players: state.players.filter(activeInRound).map(p => ({ id: p.id, name: p.name })),
    }, at);
    const bidder = state.players[state.currentBidderIndex];
    state.message = state.handSize === 1
      ? `Manche cieca: tocca a ${bidder.name} dichiarare.`
      : `Nuova manche da ${state.handSize} carte: dichiara ${bidder.name}.`;
  }

  function forbiddenBidFor(state, index) {
    const active = state.players.filter(activeInRound);
    const undecided = active.filter(p => p.bid == null);
    if (undecided.length !== 1 || undecided[0] !== state.players[index]) return null;
    const sum = active.reduce((acc, p) => acc + (p.bid == null ? 0 : p.bid), 0);
    const forbidden = state.handSize - sum;
    return forbidden >= 0 && forbidden <= state.handSize ? forbidden : null;
  }

  function fail(message, status) {
    const err = new Error(message);
    err.status = status || 400;
    throw err;
  }

  function findPlayer(state, seatId, seatToken) {
    const index = state.players.findIndex(p => p.id === String(seatId || "").toUpperCase());
    if (index < 0) fail("Posto non valido.", 403);
    const p = state.players[index];
    if (!seatToken || p.token !== seatToken) fail("Token del giocatore non valido.", 403);
    return index;
  }

  function applyBid(state, index, bid, at) {
    if (state.phase !== "bidding" || state.timer) fail("Non e il momento di dichiarare.", 409);
    if (index !== state.currentBidderIndex) fail("Non e il tuo turno di dichiarare.", 409);
    const value = Number(bid);
    if (!Number.isInteger(value) || value < 0 || value > state.handSize) fail(`Dichiarazione non valida: scegli tra 0 e ${state.handSize}.`);
    const forbidden = forbiddenBidFor(state, index);
    if (forbidden != null && value === forbidden) fail(`Essendo l'ultimo a dichiarare non puoi scegliere ${forbidden}.`);
    const p = state.players[index];
    p.bid = value;
    pushEvent(state, { type: "bid", playerId: p.id, playerName: p.name, bid: value }, at);
    const next = nextIndex(state, index, q => activeInRound(q) && q.bid == null);
    if (next != null) {
      state.currentBidderIndex = next;
      state.turnStartedAt = at;
      state.message = `Tocca a ${state.players[next].name} dichiarare.`;
      return;
    }
    // Tutti hanno dichiarato.
    state.currentBidderIndex = null;
    state.phase = "playing";
    if (state.handSize === 1) {
      state.currentTurnIndex = null;
      state.timer = { type: "blindReveal", at: at + T.blindReveal };
      state.message = "Carte scoperte: vediamo chi prende.";
      return;
    }
    state.currentTurnIndex = state.leaderIndex;
    state.turnStartedAt = at;
    state.message = `Si gioca: apre ${state.players[state.leaderIndex].name}.`;
  }

  function applyPlay(state, index, cardId, assoMode, at, options) {
    if (state.phase !== "playing" || state.timer) fail("Non e il momento di giocare.", 409);
    if (index !== state.currentTurnIndex) fail("Non e il tuo turno.", 409);
    const p = state.players[index];
    const cardIndex = p.hand.findIndex(c => c.id === cardId);
    if (cardIndex < 0) fail("Carta non presente nella tua mano.");
    const card = p.hand[cardIndex];
    let mode = null;
    if (isAssoOro(card)) {
      if (assoMode !== "high" && assoMode !== "low") fail("Scegli se l Asso di Oro vale massimo o minimo.");
      mode = assoMode;
    }
    p.hand.splice(cardIndex, 1);
    p.premove = null;
    p.lastCardStrength = strength(card, mode);
    const entry = { playerId: p.id, playerName: p.name, card, assoMode: mode };
    state.tableCards.push(entry);
    pushEvent(state, { type: "play", playerId: p.id, playerName: p.name, cardId: card.id, card, assoMode: mode, auto: Boolean(options && options.auto) }, at);
    const next = nextIndex(state, index, q => activeInRound(q) && !state.tableCards.some(e => e.playerId === q.id));
    if (next != null) {
      state.currentTurnIndex = next;
      state.turnStartedAt = at;
      state.message = `Tocca a ${state.players[next].name}.`;
      return;
    }
    state.currentTurnIndex = null;
    state.timer = { type: "resolveTrick", at: at + T.resolve };
  }

  function blindReveal(state, at) {
    const order = [];
    let idx = state.leaderIndex;
    for (let i = 0; i < state.players.length; i += 1) {
      const p = state.players[idx];
      if (activeInRound(p) && p.hand.length) order.push(idx);
      idx = (idx + 1) % state.players.length;
    }
    order.forEach(function (i) {
      const p = state.players[i];
      const card = p.hand.shift();
      const mode = isAssoOro(card) ? (p.bid >= 1 ? "high" : "low") : null;
      p.lastCardStrength = strength(card, mode);
      state.tableCards.push({ playerId: p.id, playerName: p.name, card, assoMode: mode });
      pushEvent(state, { type: "play", playerId: p.id, playerName: p.name, cardId: card.id, card, assoMode: mode, auto: true }, at);
    });
    state.timer = { type: "resolveTrick", at: at + 0.4 };
  }

  function resolveTrick(state, at) {
    let best = null;
    state.tableCards.forEach(function (entry) {
      const s = strength(entry.card, entry.assoMode);
      if (!best || s > best.s) best = { s, entry };
    });
    const winnerIndex = state.players.findIndex(p => p.id === best.entry.playerId);
    const winner = state.players[winnerIndex];
    winner.tricksWon += 1;
    const handSize = state.handSize;
    pushEvent(state, {
      type: "trick",
      winnerId: winner.id,
      winnerName: winner.name,
      card: best.entry.card,
      assoMode: best.entry.assoMode,
      handSize,
      cards: state.tableCards.map(e => ({ playerId: e.playerId, playerName: e.playerName, card: e.card, assoMode: e.assoMode })),
      players: state.players.map((p, i) => Object.assign(publicPlayer(state, p, i), { isCurrentTurn: false, isCurrentBidder: false })),
    }, at);
    state.winnerLog.push(`${winner.name} prende con ${cardLabel(best.entry.card, best.entry.assoMode)}`);
    if (state.winnerLog.length > 30) state.winnerLog = state.winnerLog.slice(-30);
    state.tableCards = [];
    const anim = handSize === 1 ? T.trickBlind : T.trick;
    const cardsLeft = state.players.some(p => activeInRound(p) && p.hand.length > 0);
    if (!cardsLeft) {
      state.timer = { type: "endRound", at: at + anim };
      state.message = `${winner.name} prende l'ultima presa.`;
      return;
    }
    state.leaderIndex = winnerIndex;
    if (!activeInRound(winner)) {
      const nxt = nextIndex(state, winnerIndex, q => activeInRound(q) && q.hand.length > 0);
      state.leaderIndex = nxt;
    }
    state.currentTurnIndex = state.leaderIndex;
    state.turnStartedAt = at + anim;
    state.message = `${winner.name} prende e apre la prossima presa.`;
  }

  function endRound(state, at) {
    const participants = state.players.filter(p => p.inRound);
    participants.forEach(function (p) {
      if (p.hasLeft) { p.lostLives = 0; return; }
      const lost = Math.abs((p.bid || 0) - p.tricksWon);
      p.lostLives = lost;
      p.totalErrors += lost;
      p.lives = Math.max(0, p.lives - lost);
    });
    const alive = state.players.filter(aliveNotLeft);
    let suddenDeath = false;
    const newlyOut = participants.filter(p => !p.hasLeft && p.lives <= 0 && p.eliminatedAt == null);
    if (alive.length === 0 && newlyOut.length > 0) {
      suddenDeath = true;
      newlyOut.forEach(p => { p.lives = 1; });
    } else {
      newlyOut.forEach(p => { p.eliminatedAt = state.roundCounter; state.finishOrder.push(p.id); });
    }
    pushEvent(state, {
      type: "round",
      suddenDeath,
      handSize: state.handSize,
      players: state.players.map((p, i) => Object.assign(publicPlayer(state, p, i), { lostLives: p.inRound ? (p.lostLives || 0) : 0, isCurrentTurn: false, isCurrentBidder: false })),
    }, at);
    state.players.forEach(p => { delete p.lostLives; });
    const stillAlive = state.players.filter(aliveNotLeft);
    if (stillAlive.length <= 1) {
      finishGame(state, at, stillAlive.length === 1 ? [stillAlive[0]] : []);
      return;
    }
    if (suddenDeath) {
      state.roundIndex = 0;
      state.cycle += 1;
      state.message = "Spareggio! Una vita ai finalisti, si riparte da 5 carte.";
    } else {
      state.roundIndex += 1;
      if (state.roundIndex >= HAND_SIZES.length) { state.roundIndex = 0; state.cycle += 1; }
      state.message = "Manche conclusa: vite aggiornate.";
    }
    const d = nextIndex(state, state.dealerIndex, aliveNotLeft);
    if (d != null) state.dealerIndex = d;
    state.phase = "bidding";
    state.currentBidderIndex = null;
    state.currentTurnIndex = null;
    state.players.forEach(p => { p.hand = []; });
    state.timer = { type: "startRound", at: at + T.round, suddenDeath };
  }

  function finishGame(state, at, winners, reason) {
    state.phase = "gameover";
    state.timer = null;
    state.currentBidderIndex = null;
    state.currentTurnIndex = null;
    state.tableCards = [];
    state.players.forEach(p => { p.hand = []; p.premove = null; p.inRound = false; });
    state.winners = winners.map(p => ({ id: p.id, name: p.name }));
    winners.forEach(p => { if (!state.finishOrder.includes(p.id)) state.finishOrder.push(p.id); });
    state.finishedAt = at;
    state.restart = { approvedIds: [] };
    if (reason === "retire" && winners.length === 1) state.message = `${winners[0].name} vince per ritiro.`;
    else state.message = winners.length === 1 ? `Vince ${winners[0].name}.` : "Partita terminata.";
  }

  // ─────────────────────────── bot ───────────────────────────
  function unseenCount(state, p) { return 40 - p.hand.length; }

  function botBid(state, index) {
    const p = state.players[index];
    const others = state.players.filter(q => q !== p && activeInRound(q)).length;
    const forbidden = forbiddenBidFor(state, index);
    let expected;
    if (state.handSize === 1) {
      const visible = state.players.filter(q => q !== p && activeInRound(q) && q.hand[0]).map(q => q.hand[0]);
      const maxVisible = Math.max(-1, ...visible.map(c => (isAssoOro(c) ? 30 : baseStrength(c))));
      const unseen = fullDeck().filter(c => !visible.some(v => v.id === c.id));
      const stronger = unseen.filter(c => isAssoOro(c) || baseStrength(c) > maxVisible).length;
      expected = stronger / Math.max(1, unseen.length) >= 0.5 ? 1 : 0;
    } else {
      const unseen = unseenCount(state, p);
      expected = p.hand.reduce(function (acc, c) {
        if (isAssoOro(c)) return acc + 0.6;
        const weaker = baseStrength(c) - p.hand.filter(h => !isAssoOro(h) && baseStrength(h) < baseStrength(c)).length;
        const prob = Math.pow(Math.max(0, weaker) / unseen, others);
        return acc + prob;
      }, 0);
    }
    let bid = Math.max(0, Math.min(state.handSize, Math.round(expected)));
    if (forbidden != null && bid === forbidden) {
      const up = bid + 1 <= state.handSize ? bid + 1 : null;
      const down = bid - 1 >= 0 ? bid - 1 : null;
      if (up == null) bid = down;
      else if (down == null) bid = up;
      else bid = expected >= bid ? up : down;
    }
    return bid;
  }

  function botPlay(state, index) {
    const p = state.players[index];
    const need = (p.bid || 0) - p.tricksWon;
    const hand = p.hand.slice();
    const tableBest = state.tableCards.reduce((m, e) => Math.max(m, strength(e.card, e.assoMode)), -Infinity);
    const normal = hand.filter(c => !isAssoOro(c)).sort((a, b) => baseStrength(a) - baseStrength(b));
    const asso = hand.find(isAssoOro);
    const choose = (card, mode) => ({ cardId: card.id, assoMode: isAssoOro(card) ? (mode || "high") : null });
    if (need > 0) {
      if (!state.tableCards.length) {
        if (need >= hand.length && asso) return choose(asso, "high");
        return normal.length ? choose(normal[normal.length - 1]) : choose(asso, "high");
      }
      const winning = normal.filter(c => baseStrength(c) > tableBest);
      if (winning.length) {
        const playersAfter = state.players.filter(q => activeInRound(q) && q !== p && !state.tableCards.some(e => e.playerId === q.id)).length;
        return choose(playersAfter > 0 && need >= hand.length ? winning[winning.length - 1] : winning[0]);
      }
      if (asso) return choose(asso, "high");
      return choose(normal[0]);
    }
    // Vuole perdere.
    if (!state.tableCards.length) {
      if (normal.length) return choose(normal[0]);
      return choose(asso, "low");
    }
    const losing = normal.filter(c => baseStrength(c) < tableBest);
    if (losing.length) return choose(losing[losing.length - 1]);
    if (asso) return choose(asso, "low");
    return choose(normal[normal.length - 1]);
  }

  function botDelay(state, kind) {
    const seed = (state.eventSeq * 7 + state.roundCounter * 13) % 5;
    return (kind === "bid" ? T.botBid : T.botPlay) + seed * 0.12;
  }

  // ─────────────────────────── avanzamento temporale ───────────────────────────
  // Applica tutto cio che doveva succedere fino a "now": timer, bot, premove, timeout.
  function tick(state, now) {
    let changed = false;
    for (let guard = 0; guard < 400; guard += 1) {
      if (state.phase === "gameover" || state.phase === "setup") break;
      if (state.timer) {
        if (now < state.timer.at) break;
        const timer = state.timer;
        state.timer = null;
        if (timer.type === "resolveTrick") resolveTrick(state, timer.at);
        else if (timer.type === "endRound") endRound(state, timer.at);
        else if (timer.type === "startRound") startRound(state, timer.at, timer.suddenDeath);
        else if (timer.type === "blindReveal") blindReveal(state, timer.at);
        changed = true;
        continue;
      }
      if (state.phase === "bidding" && state.currentBidderIndex != null) {
        const p = state.players[state.currentBidderIndex];
        const readyAt = state.turnStartedAt;
        if (p.isBot) {
          const at = readyAt + botDelay(state, "bid");
          if (now < at) break;
          applyBid(state, state.currentBidderIndex, botBid(state, state.currentBidderIndex), at);
          changed = true;
          continue;
        }
        if (!state.botMode && now >= readyAt + T.turn) {
          p.afkStrikes += 1;
          applyBid(state, state.currentBidderIndex, botBid(state, state.currentBidderIndex), readyAt + T.turn);
          changed = true;
          continue;
        }
        break;
      }
      if (state.phase === "playing" && state.currentTurnIndex != null) {
        const idx = state.currentTurnIndex;
        const p = state.players[idx];
        const readyAt = state.turnStartedAt;
        if (p.isBot) {
          const at = readyAt + botDelay(state, "play");
          if (now < at) break;
          const move = botPlay(state, idx);
          applyPlay(state, idx, move.cardId, move.assoMode, at, { auto: true });
          changed = true;
          continue;
        }
        if (p.premove && now >= readyAt) {
          const pm = p.premove;
          const valid = pm.roundId === (state.lastDealEvent && state.lastDealEvent.id) && p.hand.some(c => c.id === pm.cardId);
          if (valid) {
            try { applyPlay(state, idx, pm.cardId, pm.assoMode, Math.max(readyAt, pm.at || readyAt)); changed = true; continue; } catch (_e) { /* premove non valido */ }
          }
          p.premove = null;
          changed = true;
          continue;
        }
        if (!state.botMode && now >= readyAt + T.turn) {
          p.afkStrikes += 1;
          const move = botPlay(state, idx);
          applyPlay(state, idx, move.cardId, move.assoMode, readyAt + T.turn, { auto: true });
          changed = true;
          continue;
        }
        break;
      }
      break;
    }
    return changed;
  }

  // ─────────────────────────── azioni pubbliche ───────────────────────────
  function bid(state, seatId, seatToken, value, now) {
    tick(state, now);
    const index = findPlayer(state, seatId, seatToken);
    if (state.players[index].hasLeft) fail("Hai abbandonato questa partita.", 410);
    applyBid(state, index, value, now);
    tick(state, now);
  }

  function play(state, seatId, seatToken, cardId, assoMode, now) {
    tick(state, now);
    const index = findPlayer(state, seatId, seatToken);
    const p = state.players[index];
    if (p.hasLeft) fail("Hai abbandonato questa partita.", 410);
    let id = cardId;
    if (state.handSize === 1 && p.hand.length === 1 && String(cardId || "").startsWith("coperta-")) id = p.hand[0].id;
    applyPlay(state, index, id, assoMode, now);
    tick(state, now);
  }

  function premove(state, seatId, seatToken, body, now) {
    tick(state, now);
    const index = findPlayer(state, seatId, seatToken);
    const p = state.players[index];
    if (!body.cardId) { p.premove = null; return; }
    if (body.matchId && body.matchId !== state.matchId) fail("La partita e cambiata.", 409);
    if (state.phase !== "playing" || state.handSize === 1) fail("Non puoi preparare una carta adesso.", 409);
    if (!activeInRound(p)) fail("Non sei in gioco in questa manche.", 409);
    const card = p.hand.find(c => c.id === body.cardId);
    if (!card) fail("Carta non presente nella tua mano.");
    if (isAssoOro(card) && body.assoMode !== "high" && body.assoMode !== "low") fail("Scegli se l Asso di Oro vale massimo o minimo.");
    p.premove = { cardId: card.id, assoMode: isAssoOro(card) ? body.assoMode : null, roundId: state.lastDealEvent && state.lastDealEvent.id, at: now };
    tick(state, now);
  }

  function leave(state, seatId, seatToken, now) {
    tick(state, now);
    const index = findPlayer(state, seatId, seatToken);
    const p = state.players[index];
    if (p.hasLeft) return;
    p.hasLeft = true;
    p.leftVoluntarily = true;
    p.premove = null;
    if (state.phase === "gameover") return;
    p.lives = 0;
    p.hand = [];
    if (p.eliminatedAt == null) p.eliminatedAt = -1;
    state.message = `${p.name} ha abbandonato la partita.`;
    const remaining = state.players.filter(aliveNotLeft);
    if (remaining.length <= 1) {
      finishGame(state, now, remaining, "retire");
      return;
    }
    // Rimuove le sue carte dal tavolo corrente se non ancora giocate e fa avanzare il turno.
    if (state.phase === "bidding" && state.currentBidderIndex === index) {
      const next = nextIndex(state, index, q => activeInRound(q) && q.bid == null);
      if (next != null) { state.currentBidderIndex = next; state.turnStartedAt = now; }
      else {
        state.currentBidderIndex = null;
        state.phase = "playing";
        if (state.handSize === 1) state.timer = { type: "blindReveal", at: now + T.blindReveal };
        else {
          if (!activeInRound(state.players[state.leaderIndex])) state.leaderIndex = nextIndex(state, state.leaderIndex, activeInRound);
          state.currentTurnIndex = state.leaderIndex; state.turnStartedAt = now;
        }
      }
    } else if (state.phase === "bidding" && state.leaderIndex === index) {
      state.leaderIndex = nextIndex(state, index, activeInRound);
    } else if (state.phase === "playing" && !state.timer) {
      if (state.leaderIndex === index && !state.tableCards.length) state.leaderIndex = nextIndex(state, index, activeInRound);
      if (state.currentTurnIndex === index) {
        const next = nextIndex(state, index, q => activeInRound(q) && !state.tableCards.some(e => e.playerId === q.id));
        if (next != null) { state.currentTurnIndex = next; state.turnStartedAt = now; }
        else if (state.tableCards.length) { state.currentTurnIndex = null; state.timer = { type: "resolveTrick", at: now + T.resolve }; }
        else { state.currentTurnIndex = null; state.timer = { type: "endRound", at: now }; }
      }
    }
    tick(state, now);
  }

  function requestRestart(state, seatId, seatToken, now) {
    tick(state, now);
    const index = findPlayer(state, seatId, seatToken);
    const p = state.players[index];
    if (state.phase !== "gameover") fail("La partita non e ancora finita.", 409);
    if (p.hasLeft) fail("Hai abbandonato questa partita.", 410);
    if (!state.restart.approvedIds.includes(p.id)) state.restart.approvedIds.push(p.id);
    const required = state.players.filter(q => !q.hasLeft && !q.isBot);
    if (required.every(q => state.restart.approvedIds.includes(q.id))) {
      const fresh = createMatch({
        roomId: state.roomId,
        mode: state.mode,
        now,
        eventSeq: state.eventSeq,
        players: state.players.filter(q => !q.hasLeft).map(q => ({ id: q.id, name: q.name, token: q.token, isBot: q.isBot, userId: q.userId, guest: q.guest })),
      });
      fresh.chat = state.chat;
      fresh.emotes = state.emotes;
      fresh.revision = state.revision + 1;
      Object.keys(state).forEach(k => { delete state[k]; });
      Object.assign(state, fresh);
    }
  }

  function addChat(state, seatId, seatToken, kind, value, now) {
    const index = findPlayer(state, seatId, seatToken);
    const p = state.players[index];
    if (state.botMode) fail("Chat non disponibile contro i bot.", 400);
    if (kind === "emote") {
      const allowed = ["laugh", "wow", "fire", "crown", "gg", "angry"];
      if (!allowed.includes(value)) fail("Emote non valida.");
      const last = state.emotes.events.filter(e => e.playerId === p.id).slice(-1)[0];
      if (last && now - last.createdAt < 1.5) fail("Aspetta un attimo prima della prossima emote.", 429);
      state.emotes.seq += 1;
      const message = { id: state.emotes.seq, kind: "emote", playerId: p.id, name: p.name, value, createdAt: now };
      state.emotes.events.push(message);
      state.emotes.events = state.emotes.events.slice(-20);
      return message;
    }
    const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (!text) fail("Scrivi un messaggio.");
    const recent = state.chat.messages.filter(m => m.playerId === p.id && now - m.createdAt < 10).length;
    if (recent >= 5) fail("Stai scrivendo troppo velocemente.", 429);
    state.chat.seq = Math.max(state.chat.seq, state.emotes.seq) + 1;
    const message = { id: state.chat.seq, kind: "text", playerId: p.id, name: p.name, value: text, createdAt: now };
    state.chat.messages.push(message);
    state.chat.messages = state.chat.messages.slice(-60);
    return message;
  }

  // ─────────────────────────── snapshot per il client ───────────────────────────
  function snapshot(state, viewer, now) {
    const role = viewer && viewer.role === "player" ? "player" : "table";
    let viewerIndex = -1;
    if (role === "player") viewerIndex = findPlayer(state, viewer.seatId, viewer.token);
    const me = viewerIndex >= 0 ? state.players[viewerIndex] : null;
    if (me && me.hasLeft && me.leftVoluntarily) fail("Hai abbandonato questa partita.", 410);
    const blind = state.handSize === 1 && (state.phase === "bidding" || state.phase === "playing");
    const players = state.players.map(function (p, i) {
      const out = publicPlayer(state, p, i);
      if (i === viewerIndex) {
        out.hand = blind
          ? p.hand.map(() => ({ id: `coperta-${p.id}`, hidden: true, rank: "", suit: "", rankLabel: "Carta", suitLabel: "coperta" }))
          : p.hand.slice();
      }
      if (blind && i !== viewerIndex && p.hand.length) out.visibleCards = p.hand.slice();
      return out;
    });
    const canBid = Boolean(me && state.phase === "bidding" && !state.timer && viewerIndex === state.currentBidderIndex);
    const canPlay = Boolean(me && state.phase === "playing" && !state.timer && viewerIndex === state.currentTurnIndex && state.handSize > 1);
    const canPremove = Boolean(me && state.phase === "playing" && state.handSize > 1 && activeInRound(me) && me.hand.length > 0 && !canPlay);
    const humans = state.players.filter(q => !q.hasLeft && !q.isBot);
    const approved = state.restart.approvedIds.filter(id => humans.some(h => h.id === id));
    let turnDeadline = null;
    if (!state.botMode && !state.timer) {
      if (state.phase === "bidding" && state.currentBidderIndex != null) turnDeadline = state.turnStartedAt + T.turn;
      if (state.phase === "playing" && state.currentTurnIndex != null) turnDeadline = state.turnStartedAt + T.turn;
    }
    return {
      ok: true,
      roomId: state.roomId,
      matchId: state.matchId,
      revision: state.revision,
      updatedAt: state.updatedAt,
      serverTime: now,
      botMode: state.botMode,
      phase: state.phase,
      cycle: state.cycle,
      roundIndex: state.roundIndex,
      handSize: state.handSize,
      currentBidderIndex: state.phase === "bidding" ? state.currentBidderIndex : null,
      currentTurnIndex: state.phase === "playing" && !state.timer ? state.currentTurnIndex : null,
      turnDeadline,
      players,
      tableCards: state.tableCards.map(e => ({ playerId: e.playerId, playerName: e.playerName, card: e.card, assoMode: e.assoMode })),
      events: state.events.slice(-30),
      lastDealEvent: state.lastDealEvent,
      lastBidEvent: state.lastBidEvent,
      lastTrickEvent: state.lastTrickEvent,
      winnerLog: state.winnerLog.slice(-12),
      winners: state.winners,
      message: state.message,
      viewer: { role, seatId: me ? me.id : null },
      allowedActions: { canBid, canPlay, canPremove },
      premove: me && me.premove ? { cardId: me.premove.cardId, assoMode: me.premove.assoMode } : null,
      restartStatus: {
        required: humans.length,
        approved: approved.length,
        approvedIds: approved,
        pendingNames: humans.filter(h => !approved.includes(h.id)).map(h => h.name),
      },
      chat: state.botMode ? null : { seq: state.chat.seq, messages: state.chat.messages.slice(-40) },
      tableEmotes: state.botMode ? null : { seq: state.emotes.seq, events: state.emotes.events.slice(-10) },
    };
  }

  // Classifica finale: ordine di eliminazione, poi meno errori, poi carta finale piu forte.
  function standings(state) {
    const list = state.players.map(function (p) {
      return {
        id: p.id, name: p.name, userId: p.userId, guest: p.guest, isBot: p.isBot,
        lives: p.lives, left: Boolean(p.leftVoluntarily),
        won: state.winners.some(w => w.id === p.id),
        eliminatedAt: p.eliminatedAt, totalErrors: p.totalErrors, lastCardStrength: p.lastCardStrength,
      };
    });
    list.sort(function (a, b) {
      if (a.won !== b.won) return a.won ? -1 : 1;
      if (a.left !== b.left) return a.left ? 1 : -1;
      const ea = a.eliminatedAt == null ? Infinity : a.eliminatedAt;
      const eb = b.eliminatedAt == null ? Infinity : b.eliminatedAt;
      if (ea !== eb) return eb - ea;
      if (a.totalErrors !== b.totalErrors) return a.totalErrors - b.totalErrors;
      return b.lastCardStrength - a.lastCardStrength;
    });
    return list.map((p, i) => Object.assign(p, { position: i + 1 }));
  }

  function createBotMatch(options) {
    const count = Math.max(2, Math.min(8, Number(options.playerCount) || 2));
    const names = shuffle(BOT_NAMES).filter(n => n.toLowerCase() !== String(options.humanName || "").toLowerCase());
    const players = [{ name: options.humanName || "Tu", userId: options.userId || null }];
    for (let i = 1; i < count; i += 1) players.push({ name: names[i - 1], isBot: true });
    return createMatch({ roomId: options.roomId, mode: "bots", players, now: options.now });
  }

  return {
    createMatch, createBotMatch, tick, bid, play, premove, leave, requestRestart, addChat, snapshot, standings,
    randomId, token, fullDeck, strength, TIMING: T,
  };
}

if (typeof window !== "undefined") window.ZanzoEngine = createZanzoEngine();
if (typeof module !== "undefined" && module.exports) module.exports = createZanzoEngine;
