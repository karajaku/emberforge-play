"use strict";
// Consent and summaries are session-only. Durable battles/wallets remain owned by Game/SaveStore.
const RepeatHunting = (() => {
  function quote(game, s, rank, count, now) {
    rank = Number(rank); count = Number(count);
    if (s.hunt || !Number.isInteger(rank) || rank < 1 || rank > Math.min(60, s.huntBest) || ![5, 10].includes(count)) return null;
    const w = game.huntingStatus(s, now), total = Math.min(count, w.free + w.purchased);
    if (!total) return null;
    return Object.freeze({ rank, requested: count, total, free: Math.min(total, w.free),
      purchased: Math.max(0, total - w.free), wallet: w.id, serial: w.serial });
  }
  function create({ game, state, allowed, execute, schedule = setTimeout, cancel = clearTimeout }) {
    let run = null, generation = 0, pending = null, candidate = null;
    function invalidate() { generation++; if (pending) cancel(pending.timer); pending = null; }
    function stop(reason) {
      invalidate();
      if (run?.active) { run.active = false; run.reason = reason; }
    }
    function preview(rank, count, now) {
      const q = quote(game, state(), rank, count, now);
      return q && Object.freeze({ ...q, generation });
    }
    function approve(q, now) {
      const s = state(), current = q && quote(game, s, q.rank, q.requested, now);
      if (run?.active || !allowed() || !current || q.generation !== generation || current.wallet !== q.wallet || current.serial !== q.serial ||
          current.total < q.total || Math.max(0, q.total - current.free) > q.purchased) return false;
      invalidate(); candidate = null;
      run = { ...q, active: true, stopping: false, started: 0, completed: 0, wins: 0,
        usedFree: 0, usedPurchased: 0, chests: 0, battle: null, serial: s.hunting.serial,
        lastId: s.lastHunt?.id, lastTurn: s.lastHunt?.turns, reason: "" };
      return true;
    }
    function afterBattle() {
      if (!run?.active) return;
      if (run.battle) run.stopping = true;
      else stop("이번 전투 후 중단");
    }
    function valid(token) {
      const s = state();
      return run?.active && !run.stopping && allowed() && pending === token && token.generation === generation &&
        !s.hunt && !run.battle && s.hunting.id === run.wallet && s.hunting.serial === token.serial &&
        s.lastHunt?.id === token.lastId && s.lastHunt?.turns === token.lastTurn;
    }
    function refresh() {
      if (!run?.active || run.battle || pending) return;
      if (!allowed()) { stop("실행 중단"); return; }
      const token = { generation, serial: run.serial, lastId: run.lastId, lastTurn: run.lastTurn, fired: false, used: false };
      pending = token;
      token.timer = schedule(async () => {
        if (token.fired) return;
        token.fired = true;
        if (!valid(token)) { if (pending === token) stop("전투 상태 변경"); return; }
        try {
          await execute(() => {
            // Called after sync(), inside the same lock as huntStart and commit.
            if (token.used) return null;
            token.used = true;
            if (!valid(token)) { if (pending === token) stop("전투 상태 변경"); return null; }
            const s = state(), w = s.hunting;
            if (run.started >= run.total || run.rank > s.huntBest) { stop("승인 범위 변경"); return null; }
            if (w.free + w.purchased < 1) { stop("사냥권 부족"); return null; }
            if (!w.free && run.usedPurchased >= run.purchased) { stop("구매분 사용 상한"); return null; }
            return { rank: run.rank, request: token.serial + 1 };
          });
        } catch { stop("저장 실패"); }
        finally { if (pending === token) { pending = null; } }
      }, 1000);
    }
    function stage(action, result, before) {
      if (!run || !result.ok) return;
      const s = state();
      if (action === "huntStart" && run.active && !run.battle && result.receipt?.request === run.serial + 1 &&
          result.receipt.rank === run.rank && s.hunt?.id === result.receipt.id) {
        candidate = { type: "start", id: result.receipt.id, source: result.receipt.source, serial: result.receipt.request };
      } else if (before?.id === run.battle && !s.hunt && s.lastHunt?.id === before.id &&
          ["strike", "heavyStrike", "block"].includes(action)) {
        candidate = { type: "finish", id: before.id, turn: s.lastHunt.turns, win: !!s.lastHunt.chestId };
      }
    }
    function committed() {
      if (!candidate || !run) return;
      const c = candidate; candidate = null;
      if (c.type === "start") {
        run.started++; run[c.source === "free" ? "usedFree" : "usedPurchased"]++;
        run.battle = c.id; run.serial = c.serial;
      } else {
        run.completed++; run.wins += Number(c.win); run.chests += Number(c.win);
        run.battle = null; run.lastId = c.id; run.lastTurn = c.turn;
        if (!c.win) stop("패배");
        else if (run.stopping) stop("이번 전투 후 중단");
        else if (run.completed >= run.total) stop("승인 판수 완료");
      }
    }
    return { preview, approve, afterBattle, stop, refresh, stage, committed,
      get active() { return !!run?.active; },
      get summary() { return run ? { ...run, unconfirmed: candidate?.type || null } : null; } };
  }
  return { quote, create };
})();
if (typeof module !== "undefined") module.exports = RepeatHunting;
