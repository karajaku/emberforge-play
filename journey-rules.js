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
  const forgeRates = [[1,95],[20,90],[200,85],[1000,80],[limit - 1,70]];
  function forgeSuccess(target, smithCap) {
    if (target >= limit) return 100;
    const n = Math.max(1, target);
    const index = forgeRates.findIndex(([end]) => n <= end);
    const [end, low] = forgeRates[index];
    const [start, high] = forgeRates[Math.max(0, index - 1)];
    const base = index === 0 ? high : Math.round(high + (low - high) * (n - start) / (end - start));
    return Math.min(95, base + (n <= smithCap ? 5 : 0));
  }
  // Four opening strikes buy level 2. Higher tiers follow the rising cost of both equipment slots.
  function xpAt(level) {
    const n = level - 1;
    return 436 * n + 64 * n ** 4;
  }
  function convertLegacyXp(xp) {
    const oldAt = level => 7 * (level - 1) * (level + 2);
    let level = 1;
    while (level < 70 && xp >= oldAt(level + 1)) level++;
    if (level === 70) return xpAt(level);
    const fraction = (xp - oldAt(level)) / (oldAt(level + 1) - oldAt(level));
    return xpAt(level) + Math.floor(fraction * (xpAt(level + 1) - xpAt(level)));
  }
  function smith(xp) {
    let level = 1;
    while (level < 70 && xp >= xpAt(level + 1)) level++;
    const next = caps.findIndex((row) => row[0] > level);
    if (next < 0) return { level, cap: 9900 };
    const [a, x] = caps[next - 1],
      [b, y] = caps[next];
    return { level, cap: Math.floor(x + ((level - a) * (y - x)) / (b - a)) };
  }
  const baseStep = target => live.current.balance.journeyForgeBase + 10 * target;
  const step = target => Math.ceil(baseStep(target) * 0.75);
  function workshopCost(from, to) {
    return (to - from) * (baseStep(from + 1) + baseStep(to)) / 2;
  }
  function cost(from, to, cap) {
    if (to <= from) return 0;
    const jump = Math.min(cap, to);
    const first = jump > from ? step(jump) : 0;
    const start = Math.max(from, jump);
    const count = to - start;
    // The live base is even. Every other discounted step ends in half a gold.
    const roundedSteps = Math.floor(count / 2) + (count % 2 && baseStep(start + 1) % 4 === 2 ? 1 : 0);
    return first + workshopCost(start, to) * 0.75 + roundedSteps * 0.5;
  }
  // Stage, recommended sword/armor, ordinary monster HP/attack, and gold.
  const anchors = [
    [1, 0, 0, 45, 16, 1400],
    [5, 3, 2, 160, 25, 2240],
    [10, 8, 6, 800, 54, 14000],
    [20, 55, 34, 20000, 850, 77000],
    [30, 330, 220, 500000, 17000, 154000],
    [40, 1700, 1150, 9000000, 250000, 336000],
    [50, 5000, 3100, 55000000, 1250000, 504000],
    [60, 9999, 6000, 168000000, 3300000, 560000],
  ];
  function stageBalance(rank) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 60) throw RangeError("Invalid hunting area");
    const hi = anchors.findIndex((a) => a[0] >= rank),
      low = anchors[Math.max(0, hi - 1)],
      high = anchors[hi];
    const t = (rank - low[0]) / (high[0] - low[0] || 1);
    // Interpolate proportions so the first step after a milestone is no steeper than the last.
    const curved = (i, offset = 0) => Math.round((low[i] + offset) * ((high[i] + offset) / (low[i] + offset)) ** t - offset);
    const w = curved(1, 1), a = curved(2, 1);
    const enemyHp = curved(3), enemyAttack = curved(4);
    const g = Math.round(low[5] + (high[5] - low[5]) * t);
    return {rank, w, a, g, enemyHp, enemyAttack};
  }
  function area(rank, time = Date.now()) {
    const stage = stageBalance(rank);
    // Ordinary two-encounter clears are more reliable than the three-wave boss trials.
    const expectedWins = rank % 5 === 0 ? 0.8 : 1;
    return {
      ...stage,
      prize: Math.round(Math.round(stage.g / expectedWins) * live.current.balance.journeyForestGold / anchors[0][5]) * live.forestMultiplier(time),
    };
  }
  return { limit, bladeTraits, processOptions, thresholds, smith, xpAt, convertLegacyXp, cost, step, workshopCost, stageBalance, area, forgeSuccess };
})();
if (typeof module !== "undefined") module.exports = JourneyRules;
