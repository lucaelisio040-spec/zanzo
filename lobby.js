/* Lobby presentation only. Game state and actions stay in app.js. */
(function () {
  "use strict";
  const escape = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  const spark = '<svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="m40 2 8 25 22-15-15 22 23 6-23 7 15 22-22-15-8 24-8-24-22 15 15-22L2 40l23-6-15-22 22 15Z" fill="currentColor"/></svg>';
  const icons = {
    bot: '<path d="M8 8h16v14H8zM12 13v3m8-3v3m-8 3h8M16 8V4m-3 0h6M4 12v6m24-6v6"/>',
    friends: '<circle cx="11" cy="10" r="4"/><path d="M3 26v-3a8 8 0 0 1 16 0v3M22 6a4 4 0 0 1 0 8m1 4a7 7 0 0 1 6 7"/>',
    online: '<circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24"/>',
  };
  const icon = name => `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">${icons[name]}</svg>`;
  const back = '<button class="zl-back" type="button" data-action="hub-back" data-back="null">&larr; Torna al club</button>';

  function header(user, notifications) {
    return `<header class="zl-header" data-key="lobby-header">
      <button class="zl-logo" type="button" data-action="nav-hub" aria-label="Zanzo, pagina iniziale">ZANZO<span class="zl-logo-mark">${spark}</span></button>
      <nav class="zl-nav" aria-label="Navigazione principale"><button type="button" data-action="nav-hub">Gioca</button><button type="button" data-action="open-leaderboard">Classifica</button><button type="button" data-action="show-rules">Le regole</button></nav>
      <div class="zl-account">${user ? `<button class="zl-friends-button" type="button" data-action="open-friends-search" aria-label="Amici${notifications ? `, ${notifications} notifiche` : ""}">${icon("friends")}${notifications ? `<span>${Math.min(notifications, 99)}</span>` : ""}</button><button class="zl-profile" type="button" data-action="open-profile" aria-label="Profilo di ${escape(user.username)}"><img src="assets/avatars/face-0.svg" alt="" width="40" height="40"><span>${escape(user.username)}</span></button>` : '<button class="zl-login" type="button" data-action="open-auth-modal">Accedi <span aria-hidden="true">&nearr;</span></button>'}</div>
    </header>`;
  }

  function modes(user) {
    const options = [
      ["bot", "01", "Il tuo riscaldamento.", "Contro bot", "Affina l'intuito. Sfida fino a 7 bot, senza aspettare nessuno.", "hub-mode-bot", "Nessun account necessario"],
      ["friends", "02", "I soliti. Una nuova sfida.", "Con amici", "Porta il tuo gruppo al tavolo. Inviti privati, rivalit&agrave; vere.", "hub-mode-friends", user ? "Invita i tuoi amici" : "Crea un account per invitare"],
      ["online", "03", "Avversari da scoprire.", "Online", "Entra nella coda pubblica e incontra gli altri giocatori in cerca di una partita.", "play-mode-online", "Da 2 a 8 giocatori in coda"],
    ];
    return `<div class="zl-modes">${options.map(([id, n, eyebrow, title, copy, action, note]) => `<button class="zl-mode zl-mode-${id}" type="button" data-action="${action}"><span class="zl-mode-top"><span class="zl-mode-number">${n}</span>${icon(id)}</span><span class="zl-mode-eyebrow">${eyebrow}</span><strong>${title}</strong><span class="zl-mode-copy">${copy}</span><span class="zl-mode-bottom"><span>${note}</span>${arrow}</span></button>`).join("")}</div>`;
  }

  function artwork() {
    return `<div class="zl-art" aria-label="Le carte napoletane di Zanzo">
      <div class="zl-felt" aria-hidden="true"><span>Z</span></div>
      <div class="zl-art-label">TRADIZIONE ITALIANA.<br>SPIRITO COMPETITIVO.</div>
      <div class="zl-art-card zl-art-left"><img src="assets/cards/napoletane/re-spade.jpg" alt="Re di Spade" width="200" height="307" fetchpriority="high"></div>
      <div class="zl-art-card zl-art-right"><img src="assets/cards/napoletane/7-coppe.jpg" alt="Sette di Coppe" width="200" height="307"></div>
      <div class="zl-art-card zl-art-front"><img src="assets/cards/napoletane/asso-oro.jpg" alt="Asso di Oro" width="200" height="307" fetchpriority="high"></div>
      <div class="zl-art-stamp" aria-hidden="true">${spark}<span>UN GIRO<br>NON BASTA.</span></div>
      <div class="zl-art-caption"><span class="zl-caption-line"></span> La prossima mossa &egrave; tua.</div>
    </div>`;
  }

  function home(user) {
    return `<main class="zl-home" id="lobby-main" data-key="lobby-home">
      <section class="zl-hero" aria-labelledby="zl-title"><div class="zl-hero-copy"><p class="zl-eyebrow"><span></span> IL TUO NUOVO TAVOLO DA GIOCO</p>
        <h1 id="zl-title">NON &Egrave;<br>SOLO <em>fortuna.</em></h1>
        <p class="zl-intro">Tre vite. Una dichiarazione. E quel momento in cui capisci di aver osato troppo. Questo &egrave; Zanzo.</p>
        <div class="zl-hero-actions"><button class="zl-primary" type="button" data-action="hub-mode" data-mode="play-mode">Entra in partita ${arrow}</button><button class="zl-text-button" type="button" data-action="show-rules">Come si gioca <span aria-hidden="true">&nearr;</span></button></div>
        <p class="zl-hero-note">${user ? `Bentornato, <strong>${escape(user.username)}</strong>. Il tavolo ti aspetta.` : 'Gratis. Nel browser. Anche senza registrarti.'}</p>
      </div>${artwork()}</section>
      <div class="zl-facts" aria-label="Il gioco in breve"><div><strong>2&ndash;8</strong><span>GIOCATORI AL TAVOLO</span></div><div><strong>3</strong><span>VITE. FALLE VALERE.</span></div><div><strong>0</strong><span>INSTALLAZIONI</span></div><span class="zl-facts-star" aria-hidden="true">${spark}</span></div>
      <section class="zl-choose" aria-labelledby="zl-choose-title"><div class="zl-section-heading"><div><p class="zl-eyebrow">TROVA LA TUA SFIDA</p><h2 id="zl-choose-title">C'&egrave; posto per te.</h2></div><p>Da solo per allenarti.<br>In compagnia per il resto.</p></div>${modes(user)}</section>
      <section class="zl-manifesto" aria-labelledby="zl-rules-title"><div><p class="zl-eyebrow">SEMPLICE DA IMPARARE. MENO DA DOMINARE.</p><h2 id="zl-rules-title">Non basta prendere.<br>Devi <em>prevedere.</em></h2><button class="zl-text-button" type="button" data-action="show-rules">Scopri tutte le regole ${arrow}</button></div><ol><li><span>01</span><div><h3>Dichiara</h3><p>Guarda la tua mano e scegli quante prese farai.</p></div></li><li><span>02</span><div><h3>Gioca</h3><p>Una carta alla volta. Leggi le dichiarazioni degli altri e scegli quando vincere.</p></div></li><li><span>03</span><div><h3>Resisti</h3><p>Ogni presa in pi&ugrave; o in meno costa una vita. Resta l'ultimo al tavolo.</p></div></li></ol></section>
      <section class="zl-rank-callout"><div><p class="zl-eyebrow">DA UNA PARTITA A UNA RIVALIT&Agrave;</p><h2>Lascia il segno<br>in classifica.</h2><p>Le partite online tra account registrati contano. Bot e ospiti restano fuori dai punti: qui si vince sul serio, non per finta.</p></div><button class="zl-primary zl-cream" type="button" data-action="open-leaderboard">Guarda la classifica ${arrow}</button></section>
    </main>`;
  }

  function selection(user) {
    return `<main class="zl-subpage" id="lobby-main" data-key="lobby-modes">${back}<p class="zl-eyebrow">IL TAVOLO &Egrave; PRONTO</p><h1>Come vuoi <em>giocare?</em></h1><p class="zl-subtitle">Scegli la tua compagnia. Al resto pensano le carte.</p>${modes(user)}</main>`;
  }

  function bots(index, busy) {
    const count = Math.max(1, Math.min(7, index + 1));
    return `<main class="zl-subpage" id="lobby-main" data-key="lobby-bots">${back}<div class="zl-bot-layout"><div><p class="zl-eyebrow">ALLENAMENTO LIBERO</p><h1>Tu. Le carte.<br><em>${count === 1 ? "Un rivale." : count + " rivali."}</em></h1><p class="zl-subtitle">I bot giocano a turno, dichiarano e provano a vincere. Prenditi il tuo tempo e trova il tuo stile.</p><p class="zl-bot-note">Nessun account. Nessun punto in classifica.<br>Solo tu e la prossima mossa.</p></div><section class="zl-bot-panel" aria-label="Configura gli avversari"><div class="zl-bot-faces" aria-hidden="true">${Array.from({length:count}, (_, i) => `<img src="assets/avatars/face-${i + 1}.svg" width="60" height="60" alt="">`).join("")}</div><h2>Quanti avversari?</h2><div class="zl-bot-count" role="group" aria-label="Numero di bot">${Array.from({length:7}, (_, i) => `<button type="button" data-action="bot-carousel-select" data-index="${i}" aria-pressed="${i + 1 === count}" aria-label="${i + 1} ${i ? "bot" : "bot"}" ${busy ? "disabled" : ""}>${i + 1}</button>`).join("")}</div><p>Tu + ${count} bot <span>&middot; ${count + 1} giocatori al tavolo</span></p><button class="zl-primary" type="button" data-action="start-bot-game" ${busy ? "disabled" : ""}>${busy ? "Preparo il tavolo..." : "Si gioca"} ${arrow}</button></section></div></main>`;
  }

  function waiting(user, guestName, waitingCount, seconds) {
    const count = Math.max(1, Math.min(8, waitingCount || 1));
    const remaining = Math.max(0, Math.min(50, Number(seconds) || 0));
    return `<main class="zl-subpage zl-waiting" id="lobby-main" data-key="lobby-waiting"><p class="zl-eyebrow">MATCHMAKING PUBBLICO</p><h1>${count > 1 ? 'La sfida <em>si avvicina.</em>' : 'Chi si siede <em>con te?</em>'}</h1><p class="zl-subtitle">${count > 1 ? 'La partita parte allo scadere del conto alla rovescia.' : 'Serve almeno un altro giocatore. Invita un amico a cercare una partita nello stesso momento.'}</p><div class="zl-wait-clock" style="--progress:${(50 - remaining) * 7.2}deg"><div><strong>${String(remaining).padStart(2, "0")}</strong><span>SECONDI</span></div></div><div class="zl-wait-seats" aria-label="${count} giocatori in coda su 8 posti">${Array.from({length:8}, (_, i) => `<span class="${i < count ? "is-occupied" : ""}">${i < count ? icon("friends") : i + 1}</span>`).join("")}</div><p class="zl-wait-status" role="status">${count}/8 giocatori &middot; Giochi come <strong>${escape(user ? user.username : guestName)}</strong></p><button class="zl-text-button" type="button" data-action="leave-matchmaking">Annulla ricerca</button></main>`;
  }

  function footer() {
    return `<footer class="zl-footer" data-key="lobby-footer"><span class="zl-footer-brand">ZANZO<span>.</span></span><div><p>CARTE ITALIANE. SFIDE SENZA DISTANZA.</p><span>Beta pubblica &middot; PC &amp; mobile &middot; Nessuna installazione</span></div><nav aria-label="Altri collegamenti"><button type="button" data-action="show-rules">Regole</button><button type="button" data-action="hub-mode" data-mode="history">Le mie partite</button></nav></footer>`;
  }

  let activeDialog = null;
  let returnFocus = null;
  let previousView = null;
  const focusable = dialog => Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select, summary, a[href], [tabindex="0"]')).filter(node => node.getClientRects().length);

  function sync() {
    const view = document.body.dataset.view + ":" + document.body.dataset.hubMode;
    if (previousView !== null && previousView !== view) window.scrollTo(0, 0);
    previousView = view;
    const dialogs = document.querySelectorAll(".rules-modal, .auth-modal, .profile-modal");
    const dialog = dialogs[dialogs.length - 1] || null;
    const shell = document.querySelector(".app-shell");
    if (shell) shell.inert = !!dialog;
    if (dialog) {
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", dialog.querySelector("h2")?.textContent || "Account");
      dialog.querySelectorAll(".field input").forEach(input => {
        const label = input.closest(".field").querySelector("label");
        if (label) input.setAttribute("aria-label", label.textContent);
      });
      dialog.querySelector(".auth-modal-close")?.setAttribute("aria-label", "Chiudi");
    }
    if (dialog !== activeDialog) {
      if (dialog) {
        if (!activeDialog) returnFocus = document.activeElement;
        (dialog.querySelector("input") || focusable(dialog)[0])?.focus({preventScroll:true});
      } else if (returnFocus?.isConnected) {
        returnFocus.focus({preventScroll:true});
        returnFocus = null;
      }
      activeDialog = dialog;
    }
  }

  document.addEventListener("keydown", event => {
    if (!activeDialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      activeDialog.querySelector(".auth-modal-close")?.click();
    } else if (event.key === "Enter" && event.target.matches("input[data-auth-field]")) {
      event.preventDefault();
      activeDialog.querySelector('[data-action="submit-auth"]:not(:disabled)')?.click();
    } else if (event.key === "Tab") {
      const controls = focusable(activeDialog);
      const first = controls[0], last = controls[controls.length - 1];
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !activeDialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });

  window.ZanzoLobby = { header, home, selection, bots, waiting, footer, sync };
}());
