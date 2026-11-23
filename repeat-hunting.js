"use strict";
// Session-only intent; Game/SaveStore own every durable battle, chest and wallet.
const RepeatHunting = (() => {
  function create({ game, state, allowed, execute, schedule = setTimeout, cancel = clearTimeout }) {
    let run = null, generation = 0, pending = null, candidate = null;
    function invalidate() { generation++; if (pending) cancel(pending.timer); pending = null; }
    function stop(reason) {
      invalidate();
      if (run?.active) { run.active = false; run.reason = reason; }
    }
    function start(rank, now) {
      const s = state();
      rank = Number(rank);
      if (run?.active || candidate || !allowed() || !Number.isInteger(rank) || rank < 1 || rank > Math.min(60, s.huntBest + 1)) return false;
      // The legacy runner never sends explore-v1 and never resolves a waiting exploration cart.
      if (s.hunt?.exploration) return false;
      if (s.hunt && s.hunt.rank !== rank) return false;
      const chest = !s.hunt && s.lastHunt?.rank === rank && s.chests.find(c => c.id === s.lastHunt.chestId && c.source === "forest");
      const w = game.huntingStatus(s, now);
      if (!s.hunt && !chest && w.free + w.purchased < 1) return false;
      invalidate();
      run = { rank, wallet: w.id, serial: w.serial, active: true, stopping: false,
        started: 0, completed: 0, wins: 0, usedFree: 0, usedPurchased: 0, chests: 0,
        gold: 0, shards: 0, scrolls: 0, charms: 0,
        battle: s.hunt?.id || null, chest: chest?.id || null,
        lastId: s.lastHunt?.id, lastTurn: s.lastHunt?.turns, resultChest: s.lastHunt?.chestId, reason: "" };
      return true;
    }
    function afterBattle() {
      if (!run?.active) return;
      if (run.battle || run.chest) run.stopping = true;
      else stop("이번 전투 후 중단");
    }
    function valid(token) {
      const s = state();
      return run?.active && allowed() && pending === token && token.generation === generation &&
        !s.hunt && !run.battle && s.hunting.id === run.wallet && s.hunting.serial === token.serial &&
        s.lastHunt?.id === token.lastId && s.lastHunt?.turns === token.lastTurn && s.lastHunt?.chestId === token.resultChest &&
        run.chest === token.chest && (token.chest ? s.lastHunt?.chestId === token.chest &&
          s.chests.some(c => c.id === token.chest && c.source === "forest" && c.rank === run.rank) : !run.stopping);
    }
    function refresh() {
      if (!run?.active || run.battle || pending || candidate) return;
      if (!allowed()) { stop("실행 중단"); return; }
      const token = { generation, serial: run.serial, lastId: run.lastId, lastTurn: run.lastTurn,
        chest: run.chest, resultChest: run.resultChest, fired: false, used: false };
      pending = token;
      token.timer = schedule(async () => {
        if (token.fired) return;
        token.fired = true;
        if (!valid(token)) { if (pending === token) stop("전투 상태 변경"); return; }
        try {
          await execute(() => {
            // Called after sync(), inside the same lock as perform and commit.
            if (token.used) return null;
            token.used = true;
            if (!valid(token)) { if (pending === token) stop("전투 상태 변경"); return null; }
            if (token.chest) return { action: "openChest", arg: token.chest };
            const s = state(), w = s.hunting;
            if (run.rank > Math.min(60, s.huntBest + 1)) { stop("구역 변경"); return null; }
            if (w.free + w.purchased < 1) { stop("식량 소진"); return null; }
            return { action: "huntStart", arg: { rank: run.rank, request: token.serial + 1 } };
          });
        } catch { stop("저장 실패"); }
        finally { if (pending === token) { pending = null; refresh(); } }
      }, 1000);
    }
    function stage(action, result, before, arg) {
      if (!run || !result.ok) return;
      const s = state();
      if (action === "huntStart" && run.active && !run.battle && !run.chest && result.receipt?.request === run.serial + 1 &&
          result.receipt.rank === run.rank && s.hunt?.id === result.receipt.id) {
        candidate = { type: "start", id: result.receipt.id, source: result.receipt.source, serial: result.receipt.request };
      } else if (before?.id === run.battle && !s.hunt && s.lastHunt?.id === before.id &&
          ["strike", "heavyStrike", "block"].includes(action)) {
        candidate = { type: "finish", id: before.id, turn: s.lastHunt.turns, chest: s.lastHunt.chestId || null };
      } else if (action === "openChest" && run.chest && arg === run.chest && s.lastChest?.id === run.chest &&
          !s.chests.some(c => c.id === run.chest)) {
        const c = s.lastChest;
        candidate = { type: "chest", id: c.id, gold: c.gold, shards: c.shards, scrolls: c.scrolls,
          charms: c.charms.reduce((sum, n) => sum + n, 0) };
      }
    }
    function committed() {
      if (!candidate || !run) return;
      const c = candidate; candidate = null;
      if (c.type === "start") {
        run.started++;
        if (c.source === "free") run.usedFree++;
        else if (c.source === "purchased") run.usedPurchased++;
        run.battle = c.id; run.serial = c.serial;
      } else if (c.type === "finish") {
        run.completed++; run.wins += Number(!!c.chest);
        run.battle = null; run.chest = c.chest; run.lastId = c.id; run.lastTurn = c.turn; run.resultChest = c.chest || undefined;
        if (!c.chest) stop("패배");
      } else {
        run.chests++; for (const key of ["gold", "shards", "scrolls", "charms"]) run[key] += c[key];
        run.chest = null;
        if (run.stopping) stop("이번 전투 후 중단");
        else if (!state().hunting.free && !state().hunting.purchased) stop("식량 소진");
      }
    }
    return { start, afterBattle, stop, refresh, stage, committed,
      get active() { return !!run?.active; },
      get summary() { return run ? { ...run, unconfirmed: candidate?.type || null } : null; } };
  }
  return { create };
})();
if (typeof module !== "undefined") module.exports = RepeatHunting;
