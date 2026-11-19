"use strict";
const LiveData = (() => {
  const defaults = {
    game: {
      swords: ["순철 장검", "서리결 장검", "황혼의 마검", "태양의 성검"],
      armors: ["순철 흉갑", "청명한 흉갑", "황혼의 흉갑", "별무리 성갑"],
    },
    balance: {
      journeyDailyGold: 1000, journeyForestGold: 1400, journeyForgeBase: 100,
      dailyGold: 1000000, dailyTickets: 10, forestBaseGold: 800,
      // Indexed by current level. Sword tuples are success, drop, destruction. See reference/sword-raising-balance.md.
      swordRates: [
        [100,0,0], [100,0,0], [100,0,0], [95,0,0], [90,0,0],
        [85,0,0], [80,0,0], [75,0,0], [65,3,0], [55,5,0],
        [50,8,2], [40,10,5], [32,10,5], [24,10,5], [16,10,5],
        [10,10,5], [6,10,5], [3,10,5], [2,10,5], [1,10,5],
      ],
      armorRates: [100,100,100,100,100,98,97,96,95,94,92,91,90,82,74,66,56,46,36,26],
    },
    shop: { 0: 20, 1: 10, 2: 60, 3: 30, steady: 30, balance: 40, gamble: 60, option: 50, fate: 100, white: 200, chaos: 4000, origin: 10000 },
    events: [],
  };
  let current = defaults;
  function keys(value, expected) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
  }
  function number(value, low, high) {
    return Number.isSafeInteger(value) && value >= low && value <= high;
  }
  function name(value) {
    return typeof value === "string" && value === value.trim() && /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ·()-]{1,32}$/u.test(value);
  }
  function utc(value) {
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString() === value;
  }
  function validate(data) {
    if (!keys(data, Object.keys(defaults)) || !keys(data.game, ["swords", "armors"]) ||
        ![data.game.swords, data.game.armors].every(list => Array.isArray(list) && list.length === 4 && Array.from(list).every(name)))
      throw new Error("검과 갑옷 이름을 확인하세요.");
    const b = data.balance;
    if (!keys(b, Object.keys(defaults.balance)) || !number(b.dailyGold, 1, 100000000) ||
        !number(b.dailyTickets, 1, 100) || !number(b.forestBaseGold, 4, 100000) || b.forestBaseGold % 4)
      throw new Error("출석 보상과 숲 기본 골드 범위를 확인하세요.");
    if (!number(b.journeyDailyGold, 1, 100000000) || !number(b.journeyForestGold, 1, 100000) ||
        !number(b.journeyForgeBase, 2, 100000) || b.journeyForgeBase % 2)
      throw new Error("본편 출석 보상, 숲 골드와 재련 비용을 확인하세요.");
    const percent = n => number(n, 0, 100);
    if (!Array.isArray(b.swordRates) || b.swordRates.length !== 20 ||
        !Array.from(b.swordRates).every((row, level) => Array.isArray(row) && row.length === 3 &&
          Array.from(row).every(percent) && row[0] + row[1] + row[2] <= 100 && (level > 0 || row[1] === 0)) ||
        !Array.isArray(b.armorRates) || b.armorRates.length !== 20 || !Array.from(b.armorRates).every(percent))
      throw new Error("각 단계의 강화 확률과 합계를 확인하세요.");
    if (!keys(data.shop, Object.keys(defaults.shop)) ||
        !Object.entries(data.shop).every(([id, price]) => number(price, id === "2" ? 30 : 1, 1000000)))
      throw new Error("상점 구매 가격을 확인하세요.");
    if (!Array.isArray(data.events) || data.events.length > 24) throw new Error("이벤트는 최대 24개까지 등록할 수 있습니다.");
    const ids = new Set();
    for (const e of data.events) {
      if (!keys(e, ["id", "name", "enabled", "startsAt", "endsAt", "multiplier"]) ||
          typeof e.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.id) ||
          ids.has(e.id) || !name(e.name) || typeof e.enabled !== "boolean" ||
          !utc(e.startsAt) || !utc(e.endsAt) || e.startsAt >= e.endsAt || !number(e.multiplier, 2, 10))
        throw new Error("이벤트 이름·기간·배율을 확인하세요.");
      ids.add(e.id);
    }
    return data;
  }
  function forestMultiplier(time) {
    let multiplier = 1;
    for (const e of current.events) {
      if (e.enabled && time >= Date.parse(e.startsAt) && time < Date.parse(e.endsAt))
        multiplier = Math.max(multiplier, e.multiplier);
    }
    return multiplier;
  }
  function forestGold(rank, time) {
    return rank * rank * current.balance.forestBaseGold * forestMultiplier(time);
  }
  return { defaults, validate, forestMultiplier, forestGold, get current() { return current; }, apply(data) { current = validate(data); } };
})();
if (typeof module !== "undefined") module.exports = LiveData;
