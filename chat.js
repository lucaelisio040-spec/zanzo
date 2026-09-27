(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const emotes = {laugh:["\u{1f602}","Che risata!"], wow:["\u{1f631}","Incredibile!"], fire:["\u{1f525}","Che giocata!"], crown:["\u{1f451}","Il re del tavolo"], gg:["\u{1f91d}","Bella partita!"], angry:["\u{1f624}","Rivincita!"]};
  const desktop = matchMedia("(min-width:1024px)");
  let room = null, me = null, send = null, change = () => {}, messages = [], seq = -1, emoteSeq = -1;
  let opened = false, unread = 0, draft = "", timer = null, clockOffset = 0;
  let muted = false, scrollNext = false;
  let pending = {text:false, emote:false}, errors = {text:"", emote:""};
  const active = new Map();
  try { muted = localStorage.getItem("zanzo-emotes-muted") === "true"; } catch (_) {}

  function atBottom(log) { return !log || log.scrollHeight - log.scrollTop - log.clientHeight < 45; }
  function ingestChat(chat, initial) {
    if (!chat || chat.seq < seq) return;
    const incoming = chat.messages.filter(m => m.kind === "text");
    const fresh = incoming.filter(m => m.id > seq);
    if (initial || fresh.length) {
      scrollNext = initial || atBottom(document.querySelector(".za-chat-log"));
      if (!initial && (!scrollNext || document.hidden || !opened)) unread += fresh.filter(m => m.playerId !== me).length;
    }
    seq = chat.seq;
    messages = incoming.slice(-40);
  }
  function ingestEmotes(reactions, initial) {
    if (!reactions || reactions.seq <= emoteSeq) return;
    for (const event of reactions.events) {
      if (event.id <= emoteSeq || initial || muted || !emotes[event.value]) continue;
      if (Date.now()/1000 - clockOffset - event.createdAt < 8) active.set(event.playerId, {...event, expires:Date.now()+3200});
    }
    emoteSeq = reactions.seq;
  }
  function scheduleExpiry() {
    clearTimeout(timer);
    if (!active.size) return;
    timer = setTimeout(() => {
      for (const [id, event] of active) if (event.expires <= Date.now()) active.delete(id);
      change();
    }, Math.max(30, Math.min(...Array.from(active.values(), m => m.expires)) - Date.now()));
  }
  function configure(options) {
    const snapshot = options.snapshot;
    const nextRoom = snapshot && snapshot.chat ? snapshot.roomId + ":" + snapshot.matchId : null;
    const initial = nextRoom !== room;
    if (initial) {
      clearTimeout(timer); active.clear(); messages = []; seq = -1; emoteSeq = -1;
      opened = false; unread = 0; draft = "";
      pending = {text:false, emote:false}; errors = {text:"", emote:""};
    }
    room = nextRoom; me = options.seatId; send = options.send; change = options.onChange;
    if (room) {
      clockOffset = Number.isFinite(snapshot.serverTime) ? Date.now()/1000 - snapshot.serverTime : 0;
      ingestChat(snapshot.chat, initial);
      ingestEmotes(snapshot.tableEmotes, initial);
    }
    scheduleExpiry();
  }
  async function submit(kind, value) {
    if (!room || pending[kind] || !send || !value.trim()) return;
    const currentRoom = room, sendMessage = send;
    pending[kind] = true; errors[kind] = ""; change();
    try {
      const result = await sendMessage(kind, value);
      if (room !== currentRoom) return;
      const message = result.message;
      if (kind === "emote") ingestEmotes({seq:message.id, events:[message]}, false);
      else {
        ingestChat({seq:message.id, messages:messages.filter(m => m.id !== message.id).concat(message)}, false);
        draft = ""; unread = 0; scrollNext = true;
      }
    } catch (e) {
      if (room === currentRoom) errors[kind] = e.message || "Invio non riuscito. Riprova.";
    } finally {
      if (room === currentRoom) { pending[kind] = false; change(); }
    }
  }
  function badge() {
    return room ? `<button class="za-tool" type="button" data-chat-action="open" aria-expanded="${opened}" aria-controls="room-chat">Chat${unread ? ` <b>${Math.min(99, unread)}</b>` : ""}</button>` : "";
  }
  function portrait(id) {
    const m = active.get(id);
    return m && !muted ? `<span class="za-emote" data-key="emote-${m.id}" role="img" aria-label="${esc(m.name + ': ' + emotes[m.value][1])}">${emotes[m.value][0]}</span>` : "";
  }
  function reactions() {
    if (!room) return "";
    return `<section class="za-reaction-controls" data-key="table-reactions" aria-label="Reazioni sul tavolo"><div class="za-emote-picker" aria-label="Invia una emote">${Object.entries(emotes).map(([key, [emoji, label]]) => `<button type="button" data-chat-emote="${key}" title="${esc(label)}" aria-label="${esc(label)}" ${pending.emote ? "disabled" : ""}><span aria-hidden="true">${emoji}</span><small>${esc(label)}</small></button>`).join("")}</div><button class="za-tool za-reactions-mute" type="button" data-chat-action="mute" aria-pressed="${muted}" title="${muted ? "Riattiva emote" : "Silenzia emote"}" aria-label="${muted ? "Riattiva emote" : "Silenzia emote"}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14q4 5 8 0M8 8v2m8-2v2${muted ? 'M3 3l18 18' : ''}"/></svg></button>${errors.emote ? `<p class="za-chat-error" role="alert">${esc(errors.emote)}</p>` : ""}</section>`;
  }
  function render() {
    if (!room) return "";
    return `<aside class="za-chat${opened ? " za-chat-open" : ""}" id="room-chat" data-key="room-chat" role="complementary" aria-hidden="${!opened}" aria-labelledby="room-chat-title">
      <div class="za-chat-heading"><h2 id="room-chat-title">CHAT DEL TAVOLO</h2><button class="za-tool za-chat-close" type="button" data-chat-action="close" aria-label="Chiudi chat">Chiudi</button></div>
      <p class="za-chat-privacy">Solo i partecipanti a questa partita.</p>
      <div id="room-chat-body" data-key="chat-body"><div class="za-chat-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Messaggi">${messages.length ? messages.map(m => `<div class="za-message${m.playerId === me ? " za-message-self" : ""}" data-key="message-${m.id}"><b>${esc(m.playerId === me ? "Tu" : m.name)}</b><span>${esc(m.value)}</span></div>`).join("") : '<p class="za-chat-empty">Scrivi al tavolo, anche mentre giochi.</p>'}</div>${unread ? `<button class="za-chat-unread" type="button" data-chat-action="latest">${unread} nuovi messaggi</button>` : ""}<form class="za-chat-form" data-key="chat-form"><label class="za-sr-only" for="chat-message">Messaggio alla stanza</label><input id="chat-message" data-key="chat-input" type="text" maxlength="180" autocomplete="off" placeholder="Scrivi al tavolo..." value="${esc(draft)}"><button class="za-primary" type="submit" ${pending.text ? "disabled" : ""}>${pending.text ? "Invio..." : "Invia"}</button></form></div>
      ${errors.text ? `<p class="za-chat-error" role="alert">${esc(errors.text)}</p>` : ""}</aside>`;
  }
  function bind() {
    document.body.classList.remove("za-chat-is-open");
    const input = document.getElementById("chat-message");
    if (input) {
      if (input.value !== draft) input.value = draft;
      input.oninput = () => { draft = input.value; };
      input.onkeydown = e => { if (e.key === "Enter" && e.isComposing) e.preventDefault(); };
      input.form.onsubmit = e => { e.preventDefault(); submit("text", draft); };
    }
    const log = document.querySelector(".za-chat-log");
    if (log && scrollNext) { log.scrollTop = log.scrollHeight; scrollNext = false; }
    if (log) log.onscroll = () => { if (unread && opened && atBottom(log)) { unread = 0; change(); } };
  }
  function close() {
    opened = false; change();
    document.querySelector('[data-chat-action="open"]')?.focus({preventScroll:true});
  }
  document.addEventListener("click", e => {
    const emote = e.target.closest("[data-chat-emote]");
    if (emote) { submit("emote", emote.dataset.chatEmote); return; }
    const button = e.target.closest("[data-chat-action]");
    if (!button || !room) return;
    const action = button.dataset.chatAction;
    if (action === "close") { close(); return; }
    if (action === "open" && opened) { close(); return; }
    if (action === "mute") {
      muted = !muted; if (muted) active.clear();
      try { localStorage.setItem("zanzo-emotes-muted", String(muted)); } catch (_) {}
    } else { if (action === "open") opened = true; unread = 0; scrollNext = true; }
    change();
    if (action === "open") {
      // Phones keep the table interactive: reveal an in-flow chat, not a modal.
      const panel = document.getElementById("room-chat");
      if (!desktop.matches) panel?.scrollIntoView({block:"nearest", behavior:"instant"});
      else document.getElementById("chat-message")?.focus({preventScroll:true});
    }
  });
  document.addEventListener("keydown", e => {
    if (!room || !opened) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  desktop.addEventListener("change", () => {
    const wasInChat = document.activeElement?.closest("#room-chat");
    opened = false; change();
    if (wasInChat && !desktop.matches) document.querySelector('[data-chat-action="open"]')?.focus({preventScroll:true});
  });
  function viewport() { document.documentElement.style.setProperty("--za-visual-height", `${window.visualViewport?.height || innerHeight}px`); }
  window.visualViewport?.addEventListener("resize", viewport);
  window.addEventListener("resize", viewport);
  viewport();
  window.ZanzoChat = {configure, render, badge, portrait, reactions, bind};
})();
