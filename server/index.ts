// @ts-nocheck
// ZANZO — Edge Function "api" per Supabase. File generato: incollalo cosi com'e.
// Importante: nelle impostazioni della funzione disattiva "Verify JWT" (Enforce JWT verification).

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


/* Store su Supabase (tabella "kv") tramite l'API REST di Supabase. */
function createSupabaseStore(url, key) {
  const base = String(url || "").replace(/\/+$/, "") + "/rest/v1/kv";
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (String(key || "").startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  const q = v => encodeURIComponent(String(v));

  async function call(method, query, body, prefer) {
    const h = Object.assign({}, headers);
    if (prefer) h.Prefer = prefer;
    const res = await fetch(base + (query ? "?" + query : ""), { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    if (res.status === 409) return { conflict: true };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Database ${res.status}: ${text.slice(0, 300)}`);
      err.status = 503;
      throw err;
    }
    if (res.status === 204) return { rows: [] };
    const text = await res.text();
    return { rows: text ? JSON.parse(text) : [] };
  }
  const now = () => new Date().toISOString();

  const store = {
    async get(ns, id) {
      const { rows } = await call("GET", `select=id,data,rev&ns=eq.${q(ns)}&id=eq.${q(id)}&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async insert(ns, id, data, extra) {
      const r = await call("POST", "", { ns, id, data, rev: 1, k1: extra && extra.k1 || null, k2: extra && extra.k2 || null, updated_at: now() }, "return=minimal");
      return !r.conflict;
    },
    async update(ns, id, data, rev, extra) {
      const patch = { data, rev: rev + 1, updated_at: now() };
      if (extra && extra.k1 !== undefined) patch.k1 = extra.k1;
      if (extra && extra.k2 !== undefined) patch.k2 = extra.k2;
      const { rows } = await call("PATCH", `ns=eq.${q(ns)}&id=eq.${q(id)}&rev=eq.${q(rev)}&select=rev`, patch, "return=representation");
      return Array.isArray(rows) && rows.length === 1;
    },
    async put(ns, id, data, extra) {
      for (let i = 0; i < 6; i += 1) {
        if (await store.insert(ns, id, data, extra)) return true;
        const row = await store.get(ns, id);
        if (row && await store.update(ns, id, data, row.rev, extra || {})) return true;
      }
      return false;
    },
    async del(ns, id) {
      await call("DELETE", `ns=eq.${q(ns)}&id=eq.${q(id)}`, null, "return=minimal");
      return true;
    },
    async list(ns, filter) {
      let query = `select=id,data,rev&ns=eq.${q(ns)}&limit=2000`;
      if (filter && filter.k1 != null) query += `&k1=eq.${q(filter.k1)}`;
      if (filter && filter.k2 != null) query += `&k2=eq.${q(filter.k2)}`;
      const { rows } = await call("GET", query);
      return rows || [];
    },
    async cleanup(ns, olderThanSeconds) {
      const limit = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
      await call("DELETE", `ns=eq.${q(ns)}&updated_at=lt.${q(limit)}`, null, "return=minimal");
    },
  };
  return store;
}
if (typeof module !== "undefined" && module.exports) module.exports = createSupabaseStore;


/* ZANZO — API del server (stesse rotte del server originale). Indipendente dal database: usa "store". */
function createZanzoServer(options) {
  "use strict";
  const E = options.engine;
  const store = options.store;
  const clock = options.now || (() => Date.now() / 1000);
  const ONLINE_WINDOW = 75;
  const MM_COUNTDOWN = 50;
  const MM_MIN = 2;
  const MM_MAX = 8;

  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const fail = (status, message) => { throw new HttpError(status, message); };

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-queue-token, x-zanzo-auth, x-client-info, apikey",
    "Access-Control-Max-Age": "86400",
  };
  function json(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, CORS) });
  }

  // ───────────── utilità database ─────────────
  async function mutate(ns, id, fn, extra) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const row = await store.get(ns, id);
      if (!row) return null;
      const data = row.data;
      const result = await fn(data);
      if (result === false) return data;
      const ok = await store.update(ns, id, data, row.rev, extra);
      if (ok) return data;
      await new Promise(r => setTimeout(r, 15 + Math.random() * 40));
    }
    fail(503, "Server momentaneamente occupato. Riprova tra qualche secondo.");
  }

  // ───────────── password e sessioni ─────────────
  const enc = new TextEncoder();
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  async function hashPassword(password, saltHex) {
    const salt = saltHex || hex(crypto.getRandomValues(new Uint8Array(16)));
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 60000 }, key, 256);
    return { salt, hash: hex(bits) };
  }
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  function validUsername(name) {
    const value = String(name || "").trim();
    if (value.length < 3 || value.length > 20) fail(400, "Lo username deve avere tra 3 e 20 caratteri.");
    if (!/^[A-Za-z0-9_.\-]+$/.test(value)) fail(400, "Lo username puo contenere solo lettere, numeri, punto, trattino e underscore.");
    return value;
  }
  function validPassword(pw) {
    if (!pw || String(pw).length < 10) fail(400, "La password deve avere almeno 10 caratteri.");
    if (String(pw).length > 200) fail(400, "Password troppo lunga.");
    return String(pw);
  }
  async function createSession(userId) {
    const tokenValue = E.token() + E.token();
    await store.insert("sess", tokenValue, { userId, createdAt: clock() }, { k1: String(userId) });
    return tokenValue;
  }
  async function currentUser(req, required) {
    const custom = req.headers.get("x-zanzo-auth") || "";
    const header = custom ? (custom.startsWith("Bearer ") ? custom : "Bearer " + custom) : (req.headers.get("authorization") || "");
    const tokenValue = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!tokenValue) { if (required) fail(401, "Accedi per continuare."); return null; }
    const sess = await store.get("sess", tokenValue);
    if (!sess) { if (required) fail(401, "Sessione scaduta: accedi di nuovo."); return null; }
    const user = await store.get("user", String(sess.data.userId));
    if (!user) { if (required) fail(401, "Account non trovato."); return null; }
    return Object.assign({ token: tokenValue }, user.data);
  }
  const publicUser = u => ({ id: u.id, username: u.username });
  const isOnline = u => Boolean(u && u.lastSeen && clock() - u.lastSeen < ONLINE_WINDOW);

  async function touch(user) {
    if (clock() - (user.lastSeen || 0) < 20) return;
    await mutate("user", String(user.id), d => { d.lastSeen = clock(); });
  }

  // ───────────── auth ─────────────
  async function register(body) {
    const username = validUsername(body.username);
    const password = validPassword(body.password);
    const lower = username.toLowerCase();
    let userId = 0;
    for (let i = 0; i < 5 && !userId; i += 1) {
      const candidate = 100000 + Math.floor(Math.random() * 2000000000);
      if (!(await store.get("user", String(candidate)))) userId = candidate;
    }
    const claimed = await store.insert("uname", lower, { userId });
    if (!claimed) fail(409, "Username gia in uso.");
    const { salt, hash } = await hashPassword(password);
    await store.insert("user", String(userId), { id: userId, username, salt, hash, createdAt: clock(), lastSeen: clock() });
    const tokenValue = await createSession(userId);
    return { ok: true, token: tokenValue, user: { id: userId, username } };
  }
  async function login(body) {
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const map = await store.get("uname", username.toLowerCase());
    const user = map && await store.get("user", String(map.data.userId));
    if (!user) fail(401, "Username o password non corretti.");
    const { hash } = await hashPassword(password, user.data.salt);
    if (!safeEqual(hash, user.data.hash)) fail(401, "Username o password non corretti.");
    const tokenValue = await createSession(user.data.id);
    await touch(user.data);
    return { ok: true, token: tokenValue, user: publicUser(user.data) };
  }
  async function updateAccount(user, body) {
    const current = String(body.currentPassword || "");
    const { hash } = await hashPassword(current, user.salt);
    if (!safeEqual(hash, user.hash)) fail(403, "Password attuale non corretta.");
    if (body.newUsername) {
      const username = validUsername(body.newUsername);
      const lower = username.toLowerCase();
      const oldLower = user.username.toLowerCase();
      if (lower !== oldLower) {
        const claimed = await store.insert("uname", lower, { userId: user.id });
        if (!claimed) fail(409, "Username gia in uso.");
        await store.del("uname", oldLower);
      }
      await mutate("user", String(user.id), d => { d.username = username; });
      await mutate("score", String(user.id), d => { d.username = username; });
      return { ok: true, username };
    }
    if (body.newPassword) {
      const pw = validPassword(body.newPassword);
      const next = await hashPassword(pw);
      await mutate("user", String(user.id), d => { d.salt = next.salt; d.hash = next.hash; });
      return { ok: true, username: user.username };
    }
    fail(400, "Nessuna modifica richiesta.");
  }

  // ───────────── amici ─────────────
  async function friendships(userId) {
    const [out, inc] = await Promise.all([store.list("freq", { k1: String(userId) }), store.list("freq", { k2: String(userId) })]);
    return out.concat(inc).map(r => Object.assign({ id: r.id }, r.data));
  }
  async function friendIds(userId) {
    return (await friendships(userId)).filter(r => r.status === "accepted").map(r => (r.from === userId ? r.to : r.from));
  }
  async function getUser(id) {
    const row = await store.get("user", String(id));
    return row ? row.data : null;
  }
  async function friendsOverview(user) {
    await touch(user);
    const all = await friendships(user.id);
    const accepted = all.filter(r => r.status === "accepted");
    const ids = Array.from(new Set(accepted.map(r => (r.from === user.id ? r.to : r.from))));
    const others = Array.from(new Set(all.map(r => (r.from === user.id ? r.to : r.from))));
    const users = new Map((await Promise.all(others.map(getUser))).filter(Boolean).map(u => [u.id, u]));
    const friends = ids.map(id => users.get(id)).filter(Boolean).map(u => ({ id: u.id, username: u.username, online: isOnline(u) }))
      .sort((a, b) => (b.online - a.online) || a.username.localeCompare(b.username));
    const incoming = all.filter(r => r.to === user.id && r.status === "pending").map(r => ({ id: r.id, status: r.status, user: publicUser(users.get(r.from) || { id: r.from, username: "?" }) }));
    const outgoing = all.filter(r => r.from === user.id && r.status === "pending").map(r => ({ id: r.id, status: r.status, user: publicUser(users.get(r.to) || { id: r.to, username: "?" }) }));
    const { invites, lobbies } = await lobbiesFor(user);
    return { ok: true, friends, requests: { incoming, outgoing }, invites, lobbies };
  }
  async function sendFriendRequest(user, body) {
    const username = String(body.username || "").trim();
    if (!username) fail(400, "Inserisci lo username dell'amico.");
    const map = await store.get("uname", username.toLowerCase());
    if (!map) fail(404, "Nessun giocatore con questo username.");
    const target = map.data.userId;
    if (target === user.id) fail(400, "Non puoi aggiungere te stesso.");
    const all = await friendships(user.id);
    const existing = all.find(r => (r.from === target || r.to === target) && (r.status === "accepted" || r.status === "pending"));
    if (existing && existing.status === "accepted") fail(409, "Siete gia amici.");
    if (existing && existing.from === user.id) fail(409, "Richiesta gia inviata.");
    if (existing && existing.from === target) {
      await mutate("freq", existing.id, d => { d.status = "accepted"; d.respondedAt = clock(); });
      return { ok: true, accepted: true };
    }
    const id = E.randomId(12);
    await store.insert("freq", id, { from: user.id, to: target, status: "pending", createdAt: clock() }, { k1: String(user.id), k2: String(target) });
    return { ok: true };
  }
  async function respondFriendRequest(user, id, action) {
    const row = await store.get("freq", id);
    if (!row || row.data.to !== user.id) fail(404, "Richiesta non trovata.");
    if (row.data.status !== "pending") fail(409, "Richiesta gia gestita.");
    await mutate("freq", id, d => { d.status = action === "accept" ? "accepted" : "declined"; d.respondedAt = clock(); });
    return { ok: true };
  }

  // ───────────── stanze ─────────────
  async function createRoom(mode, players) {
    if (store.cleanup && Math.random() < 0.05) { try { await store.cleanup("room", 2 * 86400); await store.cleanup("lobby", 2 * 86400); } catch (_e) { /* pulizia facoltativa */ } }
    for (let i = 0; i < 6; i += 1) {
      const roomId = E.randomId(6);
      const state = E.createMatch({ roomId, mode, players, now: clock() });
      if (await store.insert("room", roomId, state)) return state;
    }
    fail(503, "Impossibile creare la stanza, riprova.");
  }

  async function withRoom(roomId, fn) {
    const id = String(roomId || "").toUpperCase();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const row = await store.get("room", id);
      if (!row) fail(404, "Stanza non trovata.");
      const state = row.data;
      const now = clock();
      const ticked = E.tick(state, now);
      let result;
      let mutated = ticked;
      if (fn) {
        try {
          const out = await fn(state, now);
          result = out && out.result;
          if (!out || out.changed !== false) mutated = true;
        } catch (err) {
          if (!ticked) throw err;
          // Salva comunque l'avanzamento del tempo, poi ripropone l'errore.
          state.revision += 1; state.updatedAt = now;
          await store.update("room", id, state, row.rev);
          throw err;
        }
      }
      if (!mutated) return { state, result };
      state.revision += 1;
      state.updatedAt = now;
      let needsRecord = false;
      if (state.phase === "gameover" && !state.recorded) { state.recorded = true; needsRecord = true; }
      if (await store.update("room", id, state, row.rev)) {
        if (needsRecord) { try { await recordGame(state); } catch (_e) { /* non bloccante */ } }
        return { state, result };
      }
      await new Promise(r => setTimeout(r, 10 + Math.random() * 30));
    }
    fail(503, "Server momentaneamente occupato. Riprova tra qualche secondo.");
  }

  function mapEngineError(err) {
    if (err instanceof HttpError) throw err;
    if (err && err.status) throw new HttpError(err.status, err.message);
    throw err;
  }

  async function recordGame(state) {
    if (state.mode === "bots") return;
    const standings = E.standings(state);
    const n = standings.length;
    const ranked = standings.every(p => p.userId != null && !p.isBot && !p.guest);
    const gameId = `${state.roomId}-${state.matchId}`;
    const finishedAt = state.finishedAt || clock();
    const players = standings.map(p => ({ name: p.name, userId: p.userId, won: p.won, lives: p.lives, position: p.position, left: p.left }));
    for (const p of standings) {
      if (p.userId == null) continue;
      await store.put("gp", `${gameId}_${p.userId}`, { gameId, finishedAt, playerCount: n, players, ranked }, { k1: String(p.userId), k2: gameId });
      const points = ranked && !p.left ? 5 * Math.pow(n - p.position + 1, 2) : 0;
      const user = await getUser(p.userId);
      const username = user ? user.username : p.name;
      const exists = await store.get("score", String(p.userId));
      if (!exists) await store.insert("score", String(p.userId), { userId: p.userId, username, points: 0, wins: 0, games: 0, allWins: 0, allGames: 0 });
      await mutate("score", String(p.userId), d => {
        d.username = username;
        d.allGames += 1;
        if (p.won) d.allWins += 1;
        if (ranked) { d.games += 1; d.points += points; if (p.won) d.wins += 1; }
      });
    }
  }

  function viewerFrom(params) {
    return { role: params.get("role") === "player" ? "player" : "table", seatId: params.get("seatId"), token: params.get("token") };
  }

  async function roomSnapshot(roomId, params) {
    const viewer = viewerFrom(params);
    const { state } = await withRoom(roomId, null);
    try { return E.snapshot(state, viewer, clock()); } catch (err) { mapEngineError(err); }
  }

  async function roomAction(roomId, body, action) {
    const { state, result } = await withRoom(roomId, (st, now) => {
      try {
        if (action === "bid") E.bid(st, body.seatId, body.token, body.bid, now);
        else if (action === "play") E.play(st, body.seatId, body.token, body.cardId, body.assoMode, now);
        else if (action === "premove") E.premove(st, body.seatId, body.token, body, now);
        else if (action === "leave") E.leave(st, body.seatId, body.token, now);
        else if (action === "restart") E.requestRestart(st, body.seatId, body.token, now);
        else if (action === "chat") return { result: E.addChat(st, body.seatId, body.token, body.kind === "emote" ? "emote" : "text", body.value, now) };
        return {};
      } catch (err) { mapEngineError(err); }
    });
    if (action === "restart") return E.snapshot(state, { role: "player", seatId: body.seatId, token: body.token }, clock());
    if (action === "chat") return { ok: true, message: result };
    if (action === "leave") {
      if (state.mode === "friends") await forgetLobbyForSeat(state, body.seatId);
      return { ok: true };
    }
    return { ok: true, revision: state.revision };
  }

  async function createBotRoomRemote(user, body) {
    const count = Math.max(2, Math.min(8, Number(body.playerCount) || 2));
    for (let i = 0; i < 6; i += 1) {
      const roomId = E.randomId(6);
      const state = E.createBotMatch({ roomId, playerCount: count, humanName: String(body.humanName || (user && user.username) || "Ospite").slice(0, 24), userId: user ? user.id : null, now: clock() });
      if (await store.insert("room", roomId, state)) {
        const me = state.players[0];
        return { ok: true, roomId, seatId: me.id, seatToken: me.token, seats: state.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })), snapshot: E.snapshot(state, { role: "player", seatId: me.id, token: me.token }, clock()) };
      }
    }
    fail(503, "Impossibile creare la stanza, riprova.");
  }

  // ───────────── lobby con amici ─────────────
  function lobbyView(lobby, userId, room) {
    const meMember = lobby.members.find(m => m.userId === userId);
    return {
      lobbyId: lobby.lobbyId,
      hostUserId: lobby.hostUserId,
      status: lobby.status,
      roomId: lobby.roomId || null,
      createdAt: lobby.createdAt,
      members: lobby.members.map(m => ({ userId: m.userId, username: m.username, status: lobby.status === "started" && m.status === "accepted" ? "started" : m.status })),
      me: meMember ? { status: meMember.status, seatId: lobby.status === "started" ? meMember.seatId || null : null, seatToken: lobby.status === "started" ? meMember.seatToken || null : null, hasSeat: Boolean(lobby.status === "started" && meMember.seatId && !(room && roomLeft(room, meMember.seatId))) } : null,
    };
  }
  function roomLeft(state, seatId) {
    const p = state.players.find(q => q.id === seatId);
    return !p || p.hasLeft;
  }

  async function lobbiesFor(user) {
    const links = await store.list("lm", { k1: String(user.id) });
    const invites = [];
    const lobbies = [];
    for (const link of links) {
      const lobbyId = link.data.lobbyId;
      let row = await store.get("lobby", lobbyId);
      if (!row) { await store.del("lm", link.id); continue; }
      let lobby = row.data;
      if ((lobby.status === "pending") && clock() - lobby.createdAt > 300) {
        lobby = await mutate("lobby", lobbyId, d => { if (d.status !== "pending") return false; d.status = "expired"; });
      }
      if (lobby.status === "cancelled" || lobby.status === "expired") {
        if (clock() - lobby.createdAt > 900) await store.del("lm", link.id);
        const mine = lobby.members.find(m => m.userId === user.id);
        if (mine && lobby.hostUserId !== user.id) invites.push({ id: `${lobbyId}_${user.id}`, lobbyId, status: mine.status, lobbyStatus: lobby.status, host: { id: lobby.hostUserId, username: (lobby.members.find(m => m.userId === lobby.hostUserId) || {}).username || "?" } });
        continue;
      }
      let room = null;
      if (lobby.status === "started") {
        const r = lobby.roomId && await store.get("room", lobby.roomId);
        room = r ? r.data : null;
        const me = lobby.members.find(m => m.userId === user.id);
        const finishedLongAgo = room && room.phase === "gameover" && clock() - (room.finishedAt || 0) > 120;
        if (!room || !me || !me.seatId || roomLeft(room, me.seatId) || finishedLongAgo || clock() - lobby.createdAt > 6 * 3600) {
          await store.del("lm", link.id);
          continue;
        }
      }
      const mine = lobby.members.find(m => m.userId === user.id);
      if (mine && lobby.hostUserId !== user.id) {
        invites.push({ id: `${lobbyId}_${user.id}`, lobbyId, status: mine.status, lobbyStatus: lobby.status, host: { id: lobby.hostUserId, username: (lobby.members.find(m => m.userId === lobby.hostUserId) || {}).username || "?" } });
      }
      if (mine && mine.status !== "declined") lobbies.push(lobbyView(lobby, user.id, room));
    }
    return { invites, lobbies };
  }

  async function createLobby(user, body) {
    await touch(user);
    const ids = Array.from(new Set((body.inviteeIds || []).map(Number).filter(Boolean))).filter(id => id !== user.id).slice(0, 7);
    if (!ids.length) fail(400, "Seleziona almeno un amico online.");
    const friends = new Set(await friendIds(user.id));
    const invitees = [];
    for (const id of ids) {
      if (!friends.has(id)) fail(403, "Puoi invitare solo i tuoi amici.");
      const u = await getUser(id);
      if (!u) fail(404, "Giocatore non trovato.");
      if (!isOnline(u)) fail(409, `${u.username} non e piu online.`);
      invitees.push(u);
    }
    // Una sola lobby aperta per host.
    const { lobbies } = await lobbiesFor(user);
    const open = lobbies.find(l => l.hostUserId === user.id && (l.status === "pending" || l.status === "ready"));
    if (open) fail(409, "Hai gia una lobby in attesa: completa quella prima di inviare nuovi inviti.");
    const lobbyId = E.randomId(10);
    const lobby = {
      lobbyId, hostUserId: user.id, status: "pending", roomId: null, createdAt: clock(),
      members: [{ userId: user.id, username: user.username, status: "accepted" }].concat(invitees.map(u => ({ userId: u.id, username: u.username, status: "pending" }))),
    };
    await store.insert("lobby", lobbyId, lobby);
    for (const m of lobby.members) await store.put("lm", `${lobbyId}_${m.userId}`, { lobbyId, userId: m.userId }, { k1: String(m.userId), k2: lobbyId });
    return { ok: true, lobby: lobbyView(lobby, user.id, null) };
  }

  async function maybeStartLobby(lobbyId) {
    const row = await store.get("lobby", lobbyId);
    if (!row) return null;
    const lobby = row.data;
    if (lobby.status !== "pending") return lobby;
    const pending = lobby.members.filter(m => m.status === "pending");
    const accepted = lobby.members.filter(m => m.status === "accepted");
    if (pending.length) return lobby;
    if (accepted.length < 2) {
      return await mutate("lobby", lobbyId, d => { if (d.status !== "pending") return false; d.status = "cancelled"; });
    }
    // Crea la stanza una sola volta: prima "prenota" la lobby con CAS.
    const reserved = await store.update("lobby", lobbyId, Object.assign({}, lobby, { status: "ready" }), row.rev);
    if (!reserved) return (await store.get("lobby", lobbyId) || {}).data;
    const state = await createRoom("friends", accepted.map(m => ({ name: m.username, userId: m.userId })));
    return await mutate("lobby", lobbyId, d => {
      d.status = "started";
      d.roomId = state.roomId;
      d.startedAt = clock();
      accepted.forEach((m, i) => {
        const member = d.members.find(x => x.userId === m.userId);
        member.seatId = state.players[i].id;
        member.seatToken = state.players[i].token;
      });
    });
  }

  async function respondInvite(user, inviteId, action) {
    const lobbyId = String(inviteId).split("_")[0];
    const row = await store.get("lobby", lobbyId);
    if (!row) fail(404, "Invito non trovato.");
    const updated = await mutate("lobby", lobbyId, d => {
      const m = d.members.find(x => x.userId === user.id);
      if (!m || d.hostUserId === user.id) fail(404, "Invito non trovato.");
      if (d.status !== "pending") fail(409, d.status === "started" ? "La partita e gia partita." : "Invito non piu valido.");
      if (m.status !== "pending") return false;
      m.status = action === "accept" ? "accepted" : "declined";
    });
    const lobby = await maybeStartLobby(lobbyId) || updated;
    return { ok: true, lobby: lobbyView(lobby, user.id, null) };
  }

  async function cancelLobby(user, lobbyId) {
    const row = await store.get("lobby", lobbyId);
    if (!row) fail(404, "Lobby non trovata.");
    if (row.data.hostUserId !== user.id) {
      await mutate("lobby", lobbyId, d => { const m = d.members.find(x => x.userId === user.id); if (!m) return false; m.status = "declined"; });
      await maybeStartLobby(lobbyId);
      return { ok: true };
    }
    await mutate("lobby", lobbyId, d => { if (d.status === "started") fail(409, "La partita e gia partita."); d.status = "cancelled"; });
    return { ok: true };
  }

  async function forgetLobbyForSeat(_state, _seatId) { /* le lobby avviate spariscono automaticamente quando il posto risulta abbandonato */ }

  // ───────────── matchmaking pubblico ─────────────
  async function ensureQueue() {
    if (!(await store.get("mm", "queue"))) await store.insert("mm", "queue", { entries: [] });
  }
  function queueDeadline(active) {
    const first = Math.min(...active.map(e => e.joinedAt));
    const last = Math.max(...active.map(e => e.joinedAt));
    return Math.max(first + MM_COUNTDOWN, active.length >= MM_MIN ? last + 12 : 0);
  }
  async function joinQueue(user, body) {
    await ensureQueue();
    const entry = {
      id: E.randomId(10), token: E.token(), joinedAt: clock(), lastSeen: clock(), status: "waiting",
      userId: user ? user.id : null,
      name: user ? user.username : String(body.guestName || "Ospite").replace(/[^\w .-]/g, "").slice(0, 20) || "Ospite",
    };
    await mutate("mm", "queue", d => {
      const now = clock();
      pruneQueue(d, now);
      if (user) d.entries = d.entries.filter(e => !(e.userId === user.id && e.status === "waiting"));
      d.entries.push(entry);
    });
    return { ok: true, queueId: entry.id, queueToken: entry.token };
  }
  function pruneQueue(d, now) {
    d.entries.forEach(e => { if (e.status === "matching" && now - e.matchingAt > 15) { e.status = "waiting"; e.lastSeen = now; } });
    d.entries = d.entries.filter(e =>
      (e.status === "waiting" && now - e.lastSeen < 8) ||
      e.status === "matching" ||
      (e.status === "matched" && now - e.matchedAt < 90));
  }
  async function queueStatus(req, queueId) {
    const tokenValue = req.headers.get("x-queue-token") || "";
    await ensureQueue();
    for (let round = 0; round < 3; round += 1) {
      let toCreate = null;
      const data = await mutate("mm", "queue", d => {
        toCreate = null; // ogni tentativo riparte da zero (la scrittura precedente puo essere stata rifiutata)
        const now = clock();
        const entry = d.entries.find(e => e.id === queueId);
        if (!entry || entry.token !== tokenValue) fail(404, "Ricerca non trovata.");
        pruneQueue(d, now);
        if (!d.entries.includes(entry)) fail(404, "Ricerca scaduta: riprova.");
        if (entry.status !== "waiting") return false;
        entry.lastSeen = now;
        const active = d.entries.filter(e => e.status === "waiting");
        const deadline = queueDeadline(active);
        if ((active.length >= MM_MIN && now >= deadline) || active.length >= MM_MAX) {
          toCreate = active.slice(0, MM_MAX);
          toCreate.forEach(e => { e.status = "matching"; e.matchingAt = now; });
        }
      });
      if (toCreate) {
        const state = await createRoom("online", toCreate.map(e => ({ name: e.name, userId: e.userId, guest: e.userId == null })));
        await mutate("mm", "queue", d => {
          toCreate.forEach((e, i) => {
            const x = d.entries.find(q => q.id === e.id);
            if (!x) return;
            x.status = "matched"; x.matchedAt = clock(); x.roomId = state.roomId; x.seatId = state.players[i].id; x.seatToken = state.players[i].token;
          });
        });
        continue;
      }
      const entry = data.entries.find(e => e.id === queueId);
      if (!entry) fail(404, "Ricerca scaduta: riprova.");
      const active = data.entries.filter(e => e.status === "waiting" || e.status === "matching");
      const deadline = active.length ? queueDeadline(active) : entry.joinedAt + MM_COUNTDOWN;
      const response = {
        ok: true,
        status: entry.status === "matched" ? "matched" : "waiting",
        waitingCount: entry.status === "matched" ? data.entries.filter(e => e.roomId === entry.roomId).length : active.length,
        totalNeeded: MM_MAX,
        minPlayers: MM_MIN,
        countdownTotal: MM_COUNTDOWN,
        countdownRemaining: entry.status === "waiting" ? Math.max(0, Math.min(MM_COUNTDOWN, Math.ceil(deadline - clock()))) : 0,
      };
      if (entry.status === "matching") response.countdownRemaining = 1;
      if (entry.status === "matched") Object.assign(response, { roomId: entry.roomId, seatId: entry.seatId, seatToken: entry.seatToken });
      return response;
    }
    return { ok: true, status: "waiting", waitingCount: 1, totalNeeded: MM_MAX, minPlayers: MM_MIN, countdownTotal: MM_COUNTDOWN, countdownRemaining: 1 };
  }
  async function leaveQueue(req, body) {
    const tokenValue = req.headers.get("x-queue-token") || "";
    await ensureQueue();
    await mutate("mm", "queue", d => {
      const before = d.entries.length;
      d.entries = d.entries.filter(e => !(e.id === body.queueId && e.status === "waiting" && (!tokenValue || e.token === tokenValue)));
      if (d.entries.length === before) return false;
    });
    return { ok: true };
  }

  // ───────────── storico e classifica ─────────────
  async function history(user) {
    const rows = await store.list("gp", { k1: String(user.id) });
    const games = rows.map(r => r.data).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 40).map(g => ({
      finishedAt: g.finishedAt,
      playerCount: g.playerCount,
      ranked: Boolean(g.ranked),
      players: g.players.map(p => ({ name: p.name, won: p.won, lives: p.lives, isMe: p.userId === user.id })),
    }));
    return { ok: true, games };
  }
  async function saveBotHistory(user, body) {
    const players = Array.isArray(body.players) ? body.players.slice(0, 8) : [];
    if (players.length < 2 || !players.some(p => p.isMe)) fail(400, "Partita non valida.");
    const gameId = `bot-${String(body.matchId || E.randomId(8)).replace(/[^\w-]/g, "").slice(0, 24)}`;
    await store.put("gp", `${gameId}_${user.id}`, {
      gameId, finishedAt: clock(), playerCount: players.length, ranked: false, bot: true,
      players: players.map(p => ({ name: String(p.name || "?").slice(0, 24), won: Boolean(p.won), lives: Math.max(0, Math.min(3, Number(p.lives) || 0)), userId: p.isMe ? user.id : null })),
    }, { k1: String(user.id), k2: gameId });
    return { ok: true };
  }
  async function leaderboard() {
    const rows = (await store.list("score", {})).map(r => r.data);
    const players = rows.filter(r => r.games > 0).sort((a, b) => (b.points - a.points) || (b.wins - a.wins) || a.username.localeCompare(b.username)).slice(0, 50)
      .map(r => ({ username: r.username, points: r.points, wins: r.wins, games: r.games }));
    const champions = rows.filter(r => r.allWins > 0).sort((a, b) => (b.allWins - a.allWins) || (a.allGames - b.allGames)).slice(0, 50)
      .map(r => ({ username: r.username, wins: r.allWins, games: r.allGames }));
    return { ok: true, players, champions };
  }

  // ───────────── router ─────────────
  async function route(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path.startsWith("/functions/v1")) path = path.slice("/functions/v1".length);
    if (!path.startsWith("/api/")) path = path.replace(/^\/[^/]+/, "");
    if (path.startsWith("/api/api/")) path = path.slice(4);
    const method = req.method.toUpperCase();
    let body = {};
    if (method === "POST" || method === "DELETE") {
      const text = await req.text();
      if (text) { try { body = JSON.parse(text); } catch (_e) { fail(400, "Richiesta non valida."); } }
    }
    const parts = path.split("/").filter(Boolean); // ["api", ...]
    const [, a, b, c, d] = parts;

    if (a === "info") return { ok: true, realtime: false, server: "zanzo-supabase", time: clock() };

    if (a === "auth") {
      if (b === "register" && method === "POST") return register(body);
      if (b === "login" && method === "POST") return login(body);
      if (b === "me") { const u = await currentUser(req, true); await touch(u); return { ok: true, user: publicUser(u) }; }
      if (b === "logout") { const u = await currentUser(req, false); if (u) await store.del("sess", u.token); return { ok: true }; }
      if (b === "update" && method === "POST") return updateAccount(await currentUser(req, true), body);
    }
    if (a === "presence" && b === "ping") { const u = await currentUser(req, true); await touch(Object.assign({}, u, { lastSeen: 0 })); return { ok: true }; }
    if (a === "history") {
      const u = await currentUser(req, true);
      if (b === "bot" && method === "POST") return saveBotHistory(u, body);
      return history(u);
    }
    if (a === "leaderboard") return leaderboard();
    if (a === "friends") {
      const u = await currentUser(req, true);
      if (!b) return friendsOverview(u);
      if (b === "request" && !c && method === "POST") return sendFriendRequest(u, body);
      if (b === "request" && c && (d === "accept" || d === "decline")) return respondFriendRequest(u, c, d);
    }
    if (a === "lobbies") {
      const u = await currentUser(req, true);
      if (!b && method === "POST") return createLobby(u, body);
      if (b && method === "DELETE") return cancelLobby(u, b);
    }
    if (a === "invites" && b && (c === "accept" || c === "decline")) return respondInvite(await currentUser(req, true), b, c);
    if (a === "matchmaking") {
      if (b === "join" && method === "POST") return joinQueue(await currentUser(req, false), body);
      if (b === "status") return queueStatus(req, url.searchParams.get("id"));
      if (b === "leave") return leaveQueue(req, body);
    }
    if (a === "rooms") {
      if (b === "bots" && method === "POST") return createBotRoomRemote(await currentUser(req, false), body);
      if (b && c === "snapshot") return roomSnapshot(b, url.searchParams);
      if (b && ["bid", "play", "premove", "restart", "chat"].includes(c) && method === "POST") return roomAction(b, body, c);
      if (b && c === "leave") return roomAction(b, body, "leave");
    }
    fail(404, "Risorsa non trovata.");
  }

  async function handle(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      const data = await route(req);
      return json(data, 200);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      if (status >= 500 && !(err instanceof HttpError)) console.error(err);
      return json({ ok: false, error: status >= 500 && !(err instanceof HttpError) ? "Errore interno del server." : err.message }, status);
    }
  }

  return { handle };
}

if (typeof module !== "undefined" && module.exports) module.exports = createZanzoServer;


const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const first = keys.default || Object.values(keys)[0];
    if (first) return first;
  } catch (_e) { /* formato non previsto */ }
  return Deno.env.get("SERVICE_ROLE_KEY");
}
const SERVICE_KEY = secretKey();
const zanzo = createZanzoServer({ engine: createZanzoEngine(), store: createSupabaseStore(SUPABASE_URL, SERVICE_KEY) });

Deno.serve((req) => zanzo.handle(req));
