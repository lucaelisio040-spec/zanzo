/* Table geometry is independent of turn, phase and number of played cards. */
(function () {
  "use strict";
  const escape = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const layouts = {
    2: ["self", "north"],
    3: ["self", "north-west", "north-east"],
    4: ["self", "west", "north", "east"],
    5: ["self", "west", "north-west", "north-east", "east"],
    6: ["self", "south-west", "north-west", "north", "north-east", "south-east"],
    7: ["self", "south-west", "west", "north-west", "north-east", "east", "south-east"],
    8: ["self", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"]
  };

  function avatar(player) {
    const seatNumber = Number(String(player.id).replace(/^P/, ""));
    if (Number.isInteger(seatNumber) && seatNumber > 0) return `assets/avatars/face-${(seatNumber - 1) % 12}.svg`;
    let hash = 0;
    for (const ch of String(player.name || player.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `assets/avatars/face-${hash % 12}.svg`;
  }

  function card(entry, model, selectable) {
    const c = entry.card || entry;
    const label = c.hidden ? "Carta coperta" : `${c.rankLabel} di ${c.suitLabel}`;
    const mode = c.suit === "oro" && c.rank === "asso" ? entry.assoMode : null;
    return `<button type="button" class="za-card${c.hidden ? " za-back" : ""}" data-key="card-${escape(c.id)}" ${selectable ? `data-action="pick-card" data-card-id="${escape(c.id)}"` : "disabled"} aria-label="${escape(label)}${mode ? `, asso ${mode === "high" ? "alto" : "basso"}` : ""}"><img src="${escape(model.image(c, c.hidden))}" alt="${escape(label)}" draggable="false" width="120" height="184">${mode ? `<span class="za-ace">${mode === "high" ? "ALTO" : "BASSO"}</span>` : ""}</button>`;
  }

  function seat(player, slot, model) {
    const active = (player.isCurrentBidder || player.isCurrentTurn) && !model.dealing && !model.trick && !model.round;
    const self = player.id === model.seatId;
    const hearts = Array.from({length:3}, (_, i) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="za-heart${i >= player.lives ? ' za-heart-empty' : ''}"><path d="M12 21 3 12C-3 5 6-2 12 5c6-7 15 0 9 7Z"/></svg>`).join("");
    const penalty = model.round && player.lostLives > 0 ? `<span class="za-life-loss" data-key="loss-${model.round.id}">-${player.lostLives}</span>` : "";
    return `<article class="za-seat za-${slot}${active ? " za-active" : ""}${player.lives <= 0 ? " za-out" : ""}" data-key="seat-${escape(player.id)}" data-player-id="${escape(player.id)}" aria-label="${escape(player.name)}${self ? ", tu" : ""}">
      <div class="za-portrait"><img src="${avatar(player)}" alt="" width="80" height="80">${active ? '<span class="za-turn-dot" title="Turno attuale"></span>' : ""}${penalty}${window.ZanzoChat.portrait(player.id)}</div>
      <div class="za-name" title="${escape(player.name)}">${escape(self ? "Tu" : player.name)}</div>
      <div class="za-hearts" aria-label="${player.lives} vite">${hearts}<small>${player.lives}/3</small></div>
      <div class="za-stats"><span aria-label="Dichiarate ${player.bid == null ? "non ancora" : player.bid}"><small>D</small> <b>${player.bid == null ? "-" : player.bid}</b></span><span aria-label="Prese ${player.tricksWon}"><small>P</small> <b>${player.tricksWon}</b></span></div>
    </article>`;
  }

  function render(model) {
    const s = model.snapshot;
    if (!s) return '<main class="za-game"><p role="status">Connessione al tavolo...</p></main>';
    const clock = s.turnDeadline ? `<span class="za-turn-clock" data-deadline="${s.turnDeadline}" data-offset="${Date.now()/1000 - s.serverTime}" title="Massimo 60 secondi per dichiarare o giocare">${Math.max(0, Math.min(60, Math.ceil(s.turnDeadline - s.serverTime)))}s</span>` : "";
    const players = (model.round && model.round.players || model.trick && model.trick.players || s.players).slice();
    const selfIndex = players.findIndex(p => p.id === model.seatId);
    if (selfIndex > 0) players.push(...players.splice(0, selfIndex));
    const slots = layouts[players.length] || layouts[8];
    const entries = model.round ? [] : model.trick ? model.trick.cards : s.tableCards;
    const reveal = model.trick && model.trick.handSize === 1;
    const played = new Map((entries || []).map(entry => [entry.playerId, entry]));
    let table = players.map((p, i) => {
      const entry = played.get(p.id) || (!model.round && !model.dealing && !model.trick && p.visibleCards && p.visibleCards[0] ? {card:p.visibleCards[0]} : null);
      return seat(p, slots[i], model) + (entry && !reveal && !model.dealing ? `<div class="za-played za-${slots[i]}${model.trick && model.trick.winnerId === p.id ? " za-winning" : ""}" data-key="played-${escape(p.id)}-${escape(entry.card.id)}" data-owner="${escape(p.id)}" aria-label="Carta di ${escape(p.name)}">${card(entry, model, false)}</div>` : "");
    }).join("");
    if (model.dealing) table += players.filter(p => p.lives > 0).map(p => {
      const i = players.indexOf(p);
      return `<div class="za-deal-card za-${slots[i]}" style="--delay:${1.25 + i * .13}s" aria-hidden="true" data-key="dealt-${model.dealing.id}-${escape(p.id)}"><img src="${escape(model.image({hidden:true}, true))}" alt="" width="120" height="184"></div>`;
    }).join("");
    let announcement = `<div class="za-watermark">ZANZO<span>Ciclo ${s.cycle || 1} &middot; ${s.handSize} carte</span></div>`;
    if (model.bid) announcement = `<div class="za-announcement" role="status" data-key="bid-${model.bid.id}"><small>DICHIARAZIONE</small><strong>${escape(model.bid.playerName)}</strong><span>${model.bid.bid} ${model.bid.bid === 1 ? "presa" : "prese"}</span></div>`;
    if (model.trick) announcement = `<div class="za-announcement" role="status" data-key="trick-${model.trick.id}"><small>PRESA ASSEGNATA</small><strong>${escape(model.trick.winnerName)} prende</strong><span>${escape(model.winnerLabel)}</span></div>`;
    if (reveal) announcement = `<div class="za-reveal" data-key="reveal-${model.trick.id}">${announcement}<div class="za-reveal-cards">${entries.map(entry => `<div class="${entry.playerId === model.trick.winnerId ? "za-winning" : ""}">${card(entry, model, false)}<small>${escape(entry.playerName)}</small></div>`).join("")}</div></div>`;
    if (model.round) announcement = `<div class="za-announcement za-round-summary" role="status" data-key="round-${model.round.id}"><small>FINE MANCHE</small><strong>${model.round.suddenDeath ? "Spareggio" : "Vite aggiornate"}</strong><span>${model.round.suddenDeath ? "Una vita ai finalisti" : "Controlla i cuori"}</span></div>`;
    if (model.dealing) announcement = `<div class="za-dealing" data-key="deal-${model.dealing.id}" role="status"><div class="za-shuffle" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><strong>Mischio e distribuisco</strong><span>${model.dealing.handSize} carte a testa</span></div>`;
    table += `<div class="za-center" data-key="center">${announcement}</div>`;
    let controls = "";
    if (model.canBid) controls = `<section class="za-bid" aria-label="Dichiara le prese" data-key="bidding"><div class="za-controls-heading"><h2>Dichiara le prese</h2><span>${s.handSize} ${s.handSize === 1 ? "carta" : "carte"}</span></div><div class="za-bid-options">${model.bidValues.map(v => `<button type="button" class="za-bid-option${model.selectedBid === v ? " za-chosen" : ""}" data-action="select-bid" data-bid="${v}" aria-pressed="${model.selectedBid === v}" ${model.forbiddenBid === v || model.busy ? "disabled" : ""} title="${model.forbiddenBid === v ? "Il totale delle dichiarazioni non puo essere uguale alle carte" : `${v} prese`}">${v}</button>`).join("")}</div><div class="za-bid-footer"><p>${model.forbiddenBid == null ? "Scegli e conferma. Le dichiarazioni restano visibili sul tavolo." : `Non puoi dichiarare ${model.forbiddenBid}: il totale sarebbe ${s.handSize}.`}</p><button class="za-primary" type="button" data-action="submit-bid" ${model.busy || !model.bidValues.includes(model.selectedBid) || model.selectedBid === model.forbiddenBid ? "disabled" : ""}>Conferma</button></div></section>`;
    if (model.assoChoice) controls += `<section class="za-asso-choice" aria-label="Valore asso di oro"><p>Asso di Oro: scegli il valore, poi tocca la carta.</p><div>${["high","low"].map(mode => `<button class="za-secondary${model.assoMode === mode ? " za-chosen" : ""}" type="button" data-action="asso-mode" data-mode="${mode}">Asso ${mode === "high" ? "alto" : "basso"}</button>`).join("")}</div></section>`;
    const queued = model.hand.find(c => c.id === s.premove?.cardId);
    if (queued) controls += `<section class="za-premove-status" role="status" data-key="premove-status">Premove: ${escape(queued.rankLabel)} di ${escape(queued.suitLabel)}${s.premove.assoMode ? ` (${s.premove.assoMode === "high" ? "ALTO" : "BASSO"})` : ""}<button type="button" class="za-tool" data-action="cancel-premove" ${model.busy ? "disabled" : ""}>Annulla</button></section>`;
    else if (model.canPremove && !model.canPlay) controls += '<p class="za-hint">Puoi selezionare una carta in anticipo: partira al tuo turno.</p>';
    const hand = model.hand.map((c, i, all) => `<div class="za-hand-card${model.selectedCardId === c.id ? " za-selected" : ""}${queued?.id === c.id ? " za-queued" : ""}" data-key="hand-${escape(c.id)}" style="--angle:${(i - (all.length - 1) / 2) * 6}deg;--lift:${Math.abs(i - (all.length - 1) / 2) * 7}px;--order:${i}">${card(queued?.id === c.id ? {card:c, assoMode:s.premove.assoMode} : c, model, (model.canPlay || model.canPremove) && !model.busy)}</div>`).join("");
    const result = model.gameover ? `<section class="za-result" data-key="result"><small>PARTITA CONCLUSA</small><h2>${escape(model.winners)}</h2><button class="za-primary" type="button" data-action="restart-room" ${model.busy || model.restartApproved ? "disabled" : ""}>${model.restartApproved ? "In attesa degli altri" : "Rivincita"}</button><button class="za-secondary" type="button" data-action="leave-room">Torna al menu</button></section>` : "";
    return `<main class="za-game${s.chat ? " za-with-chat" : ""}" data-key="arena"><div class="za-game-meta"><span>${s.botMode ? "ALLENAMENTO CON BOT" : "TAVOLO ONLINE"}</span><span>D = dichiarate &middot; P = prese</span>${clock}${window.ZanzoChat.badge()}</div><div class="za-match-layout" data-key="match-layout"><div class="za-play-area" data-key="play-area"><section class="za-board" aria-label="Tavolo da ${players.length} giocatori" data-key="board">${table}</section><div class="za-controls" data-key="controls"><div class="za-decisions">${result}${controls}<p class="za-hint" role="status">${escape(model.hint)}</p></div><div class="za-hand" data-key="hand" style="--cards:${Math.max(1, model.hand.length)}" aria-label="Le tue carte">${model.dealing ? '<span class="za-muted">Le carte arrivano dopo la distribuzione.</span>' : hand}</div></div>${window.ZanzoChat.reactions()}</div>${window.ZanzoChat.render()}</div></main>`;
  }

  // Keyed reconciliation keeps cards, focus and animations alive across polling.
  function key(node) { return node.nodeType === 1 && (node.getAttribute("data-key") || node.id); }
  function patch(parent, desired) {
    const old = Array.from(parent.childNodes);
    const keyed = new Map(old.filter(key).map(n => [key(n), n]));
    const used = new Set();
    let cursor = parent.firstChild;
    for (const template of Array.from(desired.childNodes)) {
      const k = key(template);
      let node = k ? keyed.get(k) : old.find(n => !used.has(n) && !key(n) && n.nodeType === template.nodeType && n.nodeName === template.nodeName);
      if (!node || node.nodeType !== template.nodeType || node.nodeName !== template.nodeName) node = template.cloneNode(true);
      else if (node.nodeType === 1) {
        for (const attr of Array.from(node.attributes)) if (!template.hasAttribute(attr.name)) node.removeAttribute(attr.name);
        for (const attr of Array.from(template.attributes)) if (node.getAttribute(attr.name) !== attr.value) node.setAttribute(attr.name, attr.value);
        patch(node, template);
      } else if (node.nodeValue !== template.nodeValue) node.nodeValue = template.nodeValue;
      used.add(node);
      if (node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }
    for (const node of old) if (!used.has(node)) node.remove();
  }
  function update(root, markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    patch(root, template.content);
  }
  window.ZanzoArena = {render, update};
  setInterval(() => {
    const clock = document.querySelector(".za-turn-clock");
    if (!clock) return;
    const seconds = Math.max(0, Math.min(60, Math.ceil(Number(clock.dataset.deadline) - (Date.now()/1000 - Number(clock.dataset.offset)))));
    clock.textContent = `${seconds}s`;
    clock.dataset.urgent = String(seconds <= 10);
  }, 500);
})();
