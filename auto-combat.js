"use strict";
// Session-only intent. Never serialized: a restored battle always waits for manual input.
const AutoCombat = (() => {
  function choose(game, h) {
    const slash = game.huntMove(h, "strike"), heavy = game.huntMove(h, "heavyStrike");
    if (slash.damage >= h.enemyHp) return "strike";
    if (heavy.available && heavy.damage >= h.enemyHp) return "heavyStrike";
    if (game.huntCharge(h)) return "block";
    if (h.counter) return "strike";
    if (heavy.available && heavy.taken < h.hp) return "heavyStrike";
    return "strike";
  }
  function create({ game, hunt, allowed, execute, schedule = setTimeout, cancel = clearTimeout }) {
    let automatic = false, generation = 0, battleId = null, pending = null;
    function stop() {
      automatic = false;
      generation++;
      battleId = null;
      if (pending) cancel(pending.timer);
      pending = null;
    }
    function valid(token) {
      const h = hunt();
      return automatic && allowed() && !h?.exploration && token.generation === generation &&
        h?.id === token.id && h?.turn === token.turn && pending === token;
    }
    function refresh(arm = true) {
      if (!automatic) return;
      const h = hunt();
      // A waiting exploration cart is not a battle and never takes automatic turns.
      if (!allowed() || h?.exploration || (battleId && h?.id !== battleId)) { stop(); return; }
      if (!h || pending) return;
      battleId = h.id;
      if (!arm) return;
      const token = { id: h.id, turn: h.turn, generation, fired: false, used: false };
      pending = token;
      // Arm only after the preceding action's save and presentation have returned.
      // Existing impact/HP animations finish within 960 ms; there is no catch-up loop.
      token.timer = schedule(async () => {
        if (token.fired || !valid(token)) return;
        token.fired = true;
        try {
          await execute(() => {
            // execute must call this inside the same save lock as Game.perform.
            if (token.used || !valid(token)) return null;
            token.used = true;
            return choose(game, hunt());
          });
        } catch {
          stop();
        } finally {
          if (pending === token) {
            pending = null;
            refresh();
          }
        }
      }, 1000);
    }
    function select(value) {
      stop();
      automatic = value === "auto" && allowed();
      refresh();
    }
    return { select, stop, refresh,
      get mode() { return automatic ? "auto" : "manual"; } };
  }
  return { choose, create };
})();
if (typeof module !== "undefined") module.exports = AutoCombat;
