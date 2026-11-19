"use strict";
// Shared forge prices, smith XP and hunting anchors from the original sword journey.
const JourneyRules = (() => {
  const live = typeof module !== "undefined" ? require("./live-data.js") : LiveData;
  const limit = 9999;
  const caps = [
    [1, 0],
    [5, 10],
    [10, 100],
    [20, 500],
    [30, 2000],
    [40, 4000],
    [50, 6500],
    [60, 8500],
    [70, 9900],
  ];
  const bladeTraits = ["받아치는 칼날", "마무리 날", "끈질긴 검등", "기세를 품은 홈"];
  const processOptions = [
    [{key:"edge", name:"예리한 날", detail:"기본 공격과 방어"},
     {key:"ward", name:"보강한 검등", detail:"숲에서 받는 피해 −5% · 주는 피해 −3%"}],
    [{key:"edge", name:"받아치기", detail:"기본 공격 리듬"},
     {key:"ward", name:"몰아치기", detail:"숲에서 강공 피해 +7%"}],
    [{key:"edge", name:"물 담금질", detail:"기본 칼날 마감"},
     {key:"ward", name:"기름 담금질", detail:"숲에서 공격 시 피해 +3%"}],
  ];
  const thresholds = [20, 200, 1000];
  const xpAt = (level) => 7 * (level - 1) * (level + 2);
  function smith(xp) {
    let level = 1;
    while (level < 70 && xp >= xpAt(level + 1)) level++;
    const next = caps.findIndex((row) => row[0] > level);
    if (next < 0) return { level, cap: 9900 };
    const [a, x] = caps[next - 1],
      [b, y] = caps[next];
    return { level, cap: Math.floor(x + ((level - a) * (y - x)) / (b - a)) };
  }
  const step = (type, n) => (live.current.balance.journeyForgeBase + 10 * n) / (type === "armor" ? 2 : 1);
  function cost(type, from, to, cap) {
    if (to <= from) return 0;
    const jump = Math.min(cap, to);
    const first = jump > from ? step(type, jump) : 0;
    const start = Math.max(from, jump);
    return first + ((to - start) * (step(type, start + 1) + step(type, to))) / 2;
  }
  const anchors = [
    [1, 0, 0, 1400],
    [5, 20, 10, 2240],
    [10, 200, 150, 14000],
    [20, 1000, 800, 77000],
    [30, 2000, 1700, 154000],
    [40, 5000, 4500, 336000],
    [50, 8500, 7800, 504000],
    [60, 9999, 9300, 560000],
  ];
  function area(rank, time = Date.now()) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 60) throw RangeError("Invalid hunting area");
    const hi = anchors.findIndex((a) => a[0] >= rank),
      low = anchors[Math.max(0, hi - 1)],
      high = anchors[hi];
    const t = (rank - low[0]) / (high[0] - low[0] || 1);
    const [w, a, g] = [1, 2, 3].map((i) => Math.round(low[i] + (high[i] - low[i]) * t));
    // Ordinary two-encounter clears are more reliable than the three-wave boss trials.
    const expectedWins = rank % 5 === 0 ? 0.8 : 1;
    return {
      rank,
      w,
      a,
      g,
      prize: Math.round(Math.round(g / expectedWins) * live.current.balance.journeyForestGold / anchors[0][3]) * live.forestMultiplier(time),
    };
  }
  return { limit, bladeTraits, processOptions, thresholds, smith, xpAt, cost, step, area };
})();
if (typeof module !== "undefined") module.exports = JourneyRules;
