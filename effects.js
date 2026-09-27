(function () {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const sound = true, motion = true;
  let context, buffer, loading, onChange = () => {};
  const sources = new Set(), animated = new WeakSet();
  function enabled() { return motion && !reduced.matches; }
  function stopSound() { for (const source of sources) { try { source.stop(); } catch (_) {} } sources.clear(); }
  async function unlock() {
    if (!sound) return;
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      loading ||= fetch("assets/audio/bald-eagle.mp3").then(r => { if (!r.ok) throw new Error("audio"); return r.arrayBuffer(); }).then(data => context.decodeAudioData(data));
      buffer = await loading;
    } catch (_) { loading = null; }
  }
  // iOS requires unlocking audio in a real tap/key event, never on a network update.
  for (const event of ["pointerdown", "pointerup", "click", "keydown"]) document.addEventListener(event, e => { if (e.isTrusted) unlock(); }, {passive:true});
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopSound(); });

  function play(event) {
    if (event.cardId !== "asso-oro" || !sound || document.hidden || !buffer || context?.state !== "running") return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; gain.gain.value = .38;
    source.connect(gain); gain.connect(context.destination);
    sources.add(source); source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }
  function sync(change) {
    onChange = change;
    document.body.classList.toggle("za-motion-off", !enabled());
    const board = document.querySelector(".za-board");
    if (!board) { stopSound(); return; }
    for (const card of board.querySelectorAll(".za-deal-card, .za-played")) {
      if (animated.has(card)) continue;
      animated.add(card);
      if (!enabled() || !card.animate) continue;
      const rect = card.getBoundingClientRect(), table = board.getBoundingClientRect();
      const deal = card.classList.contains("za-deal-card");
      const seat = Array.from(board.querySelectorAll(".za-seat")).find(s => s.dataset.playerId === card.dataset.owner);
      const origin = deal ? board.querySelector(".za-shuffle")?.getBoundingClientRect() : seat?.querySelector(".za-portrait").getBoundingClientRect();
      let dx = (origin ? origin.left + origin.width/2 : table.left + table.width/2) - (rect.left + rect.width/2);
      let dy = (origin ? origin.top + origin.height/2 : table.top + table.height*.5) - (rect.top + rect.height/2);
      // Played cards land inside their reserved slot, never fly over player stats.
      if (!deal) { const scale = Math.min(1, 6 / Math.max(1, Math.hypot(dx, dy))); dx *= scale; dy *= scale; }
      card.animate([
        {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${deal ? .3 : .96}) rotate(${deal ? -18 : 0}deg)`,opacity:deal ? 0 : 1},
        {opacity:1,offset:.22},
        {transform:"translate(-50%,-50%) scale(1) rotate(0deg)",opacity:1}
      ], {duration:deal ? 460 : 320, delay:deal ? parseFloat(card.style.getPropertyValue("--delay"))*1000 : 0, easing:"cubic-bezier(.16,.8,.3,1)",fill:"backwards"});
    }
  }
  reduced.addEventListener("change", () => { if (!enabled()) for (const a of document.querySelector(".za-game")?.getAnimations({subtree:true}) || []) a.cancel(); onChange(); });
  window.ZanzoEffects = {play, sync, get soundEnabled() { return sound; }, get motionEnabled() { return enabled(); }};
})();
