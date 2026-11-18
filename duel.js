"use strict";
const Duel = (() => {
  const craft = typeof module === "undefined" ? Swordcraft : require("./swordcraft.js");
  const moves = { q: "quick", l: "lunge", p: "parry" };
  const stampPrefix = "emberforge.duel.stamp.";
  const publicPage = "https://karajaku.github.io/emberforge-play/duel.html";
  const dayMs = 86400000;
  const today = (time = Date.now()) => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
  function validDay(day) {
    if (!/^20\d\d-\d\d-\d\d$/.test(day)) return false;
    const time = Date.parse(day + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().startsWith(day);
  }
  function begin(day) {
    const serial = Date.parse(day + "T00:00:00Z") / dayMs;
    const work = craft.makeWork(1, () => (serial % 3) / 3, 0);
    work.enemy = 9 + Math.floor(serial / 3) % 3;
    return { work, day, path: "" };
  }
  function play(run, code) {
    if (!Object.hasOwn(moves, code) || !craft.play(run.work, moves[code], 0)) return false;
    run.path += code;
    return true;
  }
  function replay(day, path) {
    if (typeof path !== "string" || !/^[qlp]{1,18}$/.test(path)) return null;
    const run = begin(day);
    for (const code of path) if (!play(run, code)) return null;
    return run.work.ready || run.work.failed ? run : null;
  }
  function readLink(search, now = Date.now()) {
    const fallback = { day: today(now), first: null, second: null, invalid: false };
    const params = new URLSearchParams(search);
    const keys = ["v", "day", "a", "b"];
    if (!keys.some(key => params.has(key))) return fallback;
    const bad = { ...fallback, invalid: true };
    const day = params.get("day");
    if (params.get("v") !== "1" || !validDay(day) || day > fallback.day ||
        keys.some(key => params.getAll(key).length > 1)) return bad;
    const first = replay(day, params.get("a"));
    const second = params.has("b") ? replay(day, params.get("b")) : null;
    if (!first || (params.has("b") && !second)) return bad;
    return { day, first, second, invalid: false };
  }
  function link(first, second) {
    const url = new URL(publicPage);
    url.search = new URLSearchParams({ v: "1", day: first.day, a: first.path });
    if (second) url.searchParams.set("b", second.path);
    return url.href;
  }
  function compare(a, b) {
    if (a.ready !== b.ready) return a.ready ? 1 : -1;
    if (!a.ready) return b.enemy - a.enemy;
    return b.turn - a.turn || a.health - b.health;
  }
  function stamp(storage, run, now) {
    if (!run || !(run.work.ready || run.work.failed) || run.day !== today(now)) return;
    storage.setItem(stampPrefix + run.day, "1");
  }
  function stampCount(storage) {
    let count = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(stampPrefix) && validDay(key.slice(stampPrefix.length))) count++;
    }
    return count;
  }
  return { today, begin, play, replay, readLink, link, compare, stamp, stampCount, heavy: craft.heavy };
})();
if (typeof module !== "undefined") module.exports = Duel;
else startDuel();

function startDuel() {
  const el = id => document.getElementById(id);
  const incoming = Duel.readLink(location.search);
  let run = Duel.begin(incoming.day);
  let shared = "";
  let shareText = "";
  function stamps() {
    const old = incoming.day !== Duel.today();
    el("today-link").hidden = !old;
    try {
      const count = Duel.stampCount(localStorage);
      const next = count < 3 ? "3일 검객까지 " + (3 - count) + "일" :
        count < 7 ? "3일 검객 달성 · 7일 사범까지 " + (7 - count) + "일" : "3일 검객 · 7일 사범 달성";
      el("stamp-progress").textContent = "누적 " + count + "일 · " + next;
      el("stamp-note").textContent = old ? "지난 시검은 연습으로 진행합니다." : "오늘의 시검을 끝내면 이 기기에 하루 한 번 찍힙니다.";
    } catch {
      el("stamp-progress").textContent = "이 브라우저에서 도장을 읽을 수 없습니다.";
    }
  }
  function describe(w) {
    const detail = w.ready ? "내 자세 " + w.health : "수문장 자세 " + w.enemy;
    return (w.ready ? "승리" : "패배") + " · " + w.turn + "턴 · " + detail;
  }
  function arena() {
    el("duel-result").hidden = true;
    el("duel-arena").hidden = false;
    el("opponent").hidden = !incoming.first;
    if (incoming.first) el("opponent").textContent = "친구의 기록 · " + describe(incoming.first.work);
    const w = run.work;
    el("health").textContent = w.health + " / 7";
    el("enemy").textContent = w.enemy;
    el("stamina").textContent = w.stamina + " / 3";
    el("intent").textContent = (w.turn + 1) + "턴 · " + (Duel.heavy(w) ? "수문장이 강타를 준비합니다" : "수문장이 가볍게 견제합니다");
    el("turn-note").textContent = w.turn ? w.note : "예고를 읽고 첫 수를 고르세요. 강타는 받아칠 수 있습니다.";
    document.querySelector('[data-move="l"]').disabled = w.stamina < 2;
    stamps();
  }
  function score(label, entry) {
    const row = document.createElement("div");
    const result = document.createElement("b");
    result.textContent = describe(entry.work);
    row.append(label, result);
    el("scoreboard").append(row);
  }
  function finish(first, second, replyView = false) {
    el("duel-arena").hidden = true;
    el("duel-result").hidden = false;
    el("scoreboard").replaceChildren();
    if (second) {
      const ranking = Duel.compare(first.work, second.work);
      const a = replyView ? "초대자" : "친구";
      const b = replyView ? "응답자" : "나";
      el("result-title").textContent = ranking === 0 ? "두 검객의 무승부" : (ranking > 0 ? a : b) + "의 기록이 앞섭니다";
      score(a, first);
      score(b, second);
      shareText = "같은 검으로 겨룬 결과! 초대자 " + describe(first.work) + " / 응답자 " + describe(second.work);
    } else {
      el("result-title").textContent = first.work.ready ? "수문장을 이겼습니다" : "수문장이 버텨냈습니다";
      score("내 기록", first);
      shareText = "내 시검 기록은 " + describe(first.work) + "! 같은 검으로 겨뤄 볼래?";
    }
    shared = Duel.link(first, second);
    el("share-duel").textContent = replyView ? "두 기록 공유하기" : second ? "친구에게 결과 답장" : "친구에게 도전장 보내기";
    el("manual-share").hidden = true;
    el("share-link").value = shared;
    el("share-status").textContent = "";
    stamps();
    el("result-title").focus({ preventScroll: true });
  }
  document.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => {
    if (!Duel.play(run, button.dataset.move)) return;
    if (run.work.ready || run.work.failed) {
      let stampFailed = false;
      try { Duel.stamp(localStorage, run, Date.now()); } catch { stampFailed = true; }
      finish(incoming.first || run, incoming.first ? run : null);
      if (stampFailed) el("stamp-note").textContent = "이 브라우저에 오늘 도장을 저장할 수 없습니다.";
    } else arena();
  }));
  el("retry-duel").addEventListener("click", () => {
    run = Duel.begin(incoming.day);
    arena();
    document.querySelector("[data-move=q]").focus();
  });
  el("share-duel").addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "잿불 대장간 · 수문장의 시검", text: shareText, url: shared });
        return;
      } catch (error) { if (error.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(shared);
      el("share-status").textContent = "링크를 복사했습니다. 친구와의 대화에 붙여넣으세요.";
    } catch {
      el("manual-share").hidden = false;
      el("share-link").focus();
      el("share-link").select();
    }
  });
  el("day-label").textContent = incoming.day + " · 한국 시간";
  el("link-notice").hidden = !incoming.invalid;
  if (incoming.invalid) el("link-notice").textContent = "도전장 기록을 읽을 수 없어 오늘의 시검을 열었습니다.";
  if (incoming.second) finish(incoming.first, incoming.second, true);
  else arena();
  // Keep a fight from yesterday playable; show today's entry as soon as its date changes.
  const nextMidnight = Date.parse(Duel.today() + "T00:00:00+09:00") + 86400000;
  setTimeout(stamps, Math.max(0, nextMidnight - Date.now()));
  window.addEventListener("pageshow", stamps);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) stamps(); });
}
