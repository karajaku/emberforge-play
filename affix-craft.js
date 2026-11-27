"use strict";

const AffixCraft = (() => {
  const kinds = ["weapon", "armor", "helm", "shoulder", "legs", "gloves", "neck", "ring", "cloak"];
  const prefixes = [
    "날카로운",
    "정확한",
    "격렬한",
    "되받는",
    "찢어내는",
    "마무리하는",
    "선제하는",
    "생명 어린",
    "견고한",
    "굳건한",
    "수호하는",
    "버티는",
  ];
  const suffixes = [
    "신속의",
    "예리함의",
    "치명의",
    "기세의",
    "재촉의",
    "응급의",
    "회생의",
    "철벽의",
    "상처의",
    "불길 침식의",
    "서리 침식의",
    "번개 침식의",
  ];
  const uniqueNames = [
    "새벽을 여는 날",
    "불굴의 잔갑",
    "첫 결심",
    "되받는 바위",
    "벼랑의 발걸음",
    "불면의 손",
    "꺼지지 않는 기세",
    "깊은 상흔",
    "귀환의 숨",
  ];
  const currency = [
    "첫불씨",
    "겹불씨",
    "도약 불씨",
    "만개 불씨",
    "별금 불씨",
    "뒤바꿈 불씨",
    "새벽 불씨",
    "비움 불씨",
    "전설 불씨",
    "금단 불씨",
  ];
  const pools = [
    "P1,P2,P3,P4,P5,P6,P7,P8,P10,P11,S1,S2,S3,S4,S5,S8,S9,S10,S11,S12".split(","), // 무기
    "P1,P2,P4,P6,P7,P8,P9,P10,P11,P12,S2,S4,S5,S6,S7,S8,S9,S10,S11,S12".split(","), // 흉갑
    "P1,P2,P3,P5,P6,P7,P8,P10,P11,P12,S2,S3,S4,S5,S6,S7,S8,S10,S11,S12".split(","), // 투구
    "P1,P2,P3,P4,P6,P8,P9,P10,P11,P12,S1,S2,S4,S6,S7,S8,S9,S10,S11,S12".split(","), // 어깨
    "P1,P2,P4,P5,P6,P8,P9,P10,P11,P12,S1,S3,S5,S6,S7,S8,S9,S10,S11,S12".split(","), // 다리
    "P1,P2,P3,P4,P5,P6,P7,P8,P9,P11,S1,S2,S3,S4,S5,S7,S9,S10,S11,S12".split(","), // 장갑
    "P1,P3,P4,P5,P6,P7,P8,P10,P11,P12,S1,S2,S3,S4,S5,S6,S9,S10,S11,S12".split(","), // 목걸이
    "P1,P2,P3,P4,P5,P6,P8,P10,P11,P12,S1,S2,S3,S6,S7,S8,S9,S10,S11,S12".split(","), // 반지
    "P1,P2,P5,P6,P7,P8,P9,P10,P11,P12,S1,S2,S5,S6,S7,S8,S9,S10,S11,S12".split(","), // 망토
  ];
  const defs = Object.fromEntries(
    [
      ["P", prefixes, "ABBBBBBABCDD"],
      ["S", suffixes, "DDBAACCDADDD"],
    ].flatMap(([side, names, groups]) =>
      names.map((name, i) => [side + (i + 1), { name, side, group: groups[i] }]),
    ),
  );
  const family = {
    power: "P1",
    strike: "P2",
    heavy: "P3",
    counter: "P4",
    rupture: "P5",
    finish: "P6",
    vitality: "P8",
    plating: "P10",
    skillWard: "P11",
    lastWard: "P12",
    haste: "S1",
    momentum: "S4",
    cooldown: "S5",
    guard: "S6",
    parryHeal: "S6",
    recovery: "S7",
    mending: "S7",
    fortify: "S8",
    retaliation: "S8",
    wounds: "S9",
    bracing: "legacyBracing",
  };
  const familyOf = (mod) => family[mod.key] || mod.key;
  const sideOf = (mod) => (mod.key === "bracing" ? "P" : mod.key === "lastWard" ? "S" : familyOf(mod)[0]);
  const kindOf = (item) => item.kind || item.type || "weapon";
  const lines = (item) => item.mods || [];
  const rarity = (item) =>
    item.unique ? "unique" : lines(item).length >= 4 ? "rare" : lines(item).length ? "magic" : "normal";
  function integer(rng, min, max) {
    const r = rng();
    if (!(r >= 0 && r < 1)) throw new RangeError("Invalid random draw");
    return min + Math.floor(r * (max - min + 1));
  }
  function pool(item) {
    return pools[kinds.indexOf(kindOf(item))] || [];
  }
  function bounds(key, t) {
    const g = defs[key].group;
    if (g === "B") return [4 * t - 2, 4 * t, 1];
    if (g === "D") return [10 * t - 5, 10 * t, 10];
    return [2 * t - 1, 2 * t, g === "C" ? 10 : 1];
  }
  function candidates(item, excluded) {
    const used = new Set(lines(item).map(familyOf));
    const p = lines(item).filter((m) => sideOf(m) === "P").length;
    const s = lines(item).length - p;
    return pools[kinds.indexOf(kindOf(item))].filter(
      (key) => !used.has(key) && key !== excluded && (key[0] === "P" ? p : s) < 3,
    );
  }
  function weighted(weights, rng) {
    let r = integer(
      rng,
      1,
      weights.reduce((a, b) => a + b, 0),
    );
    return weights.findIndex((weight) => (r -= weight) <= 0);
  }
  function add(item, rng, excluded) {
    const available = candidates(item, excluded);
    if (!available.length) throw new RangeError("No affix available");
    const key = available[integer(rng, 0, available.length - 1)];
    const max = Math.ceil(item.rank / 6);
    const tier =
      1 +
      weighted(
        Array.from({ length: max }, (_, i) => 10 - i),
        rng,
      );
    const [lo, hi, scale] = bounds(key, tier);
    item.mods.push({ key, tier, value: integer(rng, lo, hi) / scale });
  }
  function range(mod, legacyDefs) {
    if (defs[mod.key]) return bounds(mod.key, mod.tier);
    if (mod.ascended || !legacyDefs?.[mod.key]) return null;
    return [...legacyDefs[mod.key].ranges[mod.tier - 1], 1];
  }
  function eligible(item, n, legacyDefs) {
    if (
      !item ||
      item.corrupted ||
      !kinds.includes(kindOf(item)) ||
      !Number.isInteger(item.rank) ||
      item.rank < 1 ||
      item.rank > 60
    )
      return false;
    const mods = lines(item);
    const prefixes = mods.filter((m) => sideOf(m) === "P").length;
    if (prefixes > 3 || mods.length - prefixes > 3 || new Set(mods.map(familyOf)).size !== mods.length)
      return false;
    const k = mods.length;
    if (item.unique) return n === 10;
    switch (n) {
      case 1:
      case 4:
      case 9:
        return k === 0;
      case 2:
        return k === 1;
      case 3:
        return k === 3;
      case 5:
        return k === 4 || k === 5;
      case 6:
        return k >= 4 && k <= 6;
      case 7:
        return lines(item).some((mod) => {
          const r = range(mod, legacyDefs);
          return r && r[0] < r[1];
        });
      case 8:
        return k > 0 && k <= 6;
      case 10:
        return true;
      default:
        return false;
    }
  }
  function apply(source, n, rng, legacyDefs) {
    if (!eligible(source, n, legacyDefs)) return { ok: false };
    const item = structuredClone(source);
    item.mods ??= [];
    if ([1, 2, 3, 5].includes(n)) add(item, rng);
    if (n === 4) {
      const count = 4 + weighted([60, 30, 10], rng);
      for (let i = 0; i < count; i++) add(item, rng);
    }
    if (n === 6 || n === 8) {
      const [removed] = item.mods.splice(integer(rng, 0, item.mods.length - 1), 1);
      if (n === 6) add(item, rng, familyOf(removed));
    }
    if (n === 7)
      for (const mod of item.mods) {
        const r = range(mod, legacyDefs);
        if (r) mod.value = integer(rng, r[0], r[1]) / r[2];
      }
    if (n === 9) {
      if (rng() >= 0.1) return { ok: true, item: null };
      item.unique = kindOf(item);
      item.uniqueStats = [10, 10, 20];
    }
    if (n === 10) {
      item.corrupted = true;
      const result = weighted([40, 35, 25], rng);
      if (result === 1 && item.unique)
        item.uniqueStats = [10, 10, 20].map((v) => v * (rng() < 0.5 ? 0.8 : 1.2));
      if (result === 1 && !item.unique) {
        const count = Math.max(1, item.mods.length);
        item.mods = [];
        for (let i = 0; i < count; i++) add(item, rng);
      }
      if (result === 2)
        item.sockets = Array.from(
          { length: weighted([20, 60, 20], rng) },
          () => ["fire", "life", "iron"][integer(rng, 0, 2)],
        );
    }
    if (item.ascended && !item.mods.some((mod) => mod.ascended)) delete item.ascended;
    return { ok: true, item };
  }
  function effectiveValue(item, mod) {
    if (kindOf(item) !== "weapon") return mod.value;
    const grade = item.promotionGrade ?? (item.recordId ? item.grade : 0);
    return (mod.value * (10 + grade)) / (10 + (mod.migrationGrade || 0));
  }
  function generateDrop(item, rng) {
    const count = weighted([5000, 2100, 1400, 900, 450, 135, 15], rng);
    item.mods = [];
    item.affixVersion = 1;
    for (let i = 0; i < count; i++) add(item, rng);
    return item;
  }
  function validLines(item, legacyDefs = {}) {
    if (!Array.isArray(item.mods) || item.mods.length > 6 || !kinds.includes(kindOf(item))) return false;
    const used = new Set();
    let prefixes = 0;
    for (const mod of item.mods) {
      if (!mod || !Number.isInteger(mod.tier) || mod.tier < 1) return false;
      const def = defs[mod.key];
      if (def) {
        if (
          !pools[kinds.indexOf(kindOf(item))].includes(mod.key) ||
          mod.tier > Math.ceil(item.rank / 6) ||
          mod.ascended !== undefined ||
          mod.migrationGrade !== undefined
        )
          return false;
        const [lo, hi, scale] = bounds(mod.key, mod.tier);
        const raw = mod.value * scale;
        if (!Number.isInteger(raw) || raw < lo || raw > hi) return false;
      } else {
        const range = legacyDefs[mod.key]?.ranges?.[mod.tier - 1];
        if (kindOf(item) !== "weapon" && kindOf(item) !== "armor") return false;
        if (
          [
            "vitality",
            "plating",
            "bracing",
            "skillWard",
            "mending",
            "parryHeal",
            "lastWard",
            "retaliation",
          ].includes(mod.key) !==
          (kindOf(item) === "armor")
        )
          return false;
        if (
          !range ||
          mod.tier > (item.rank <= 10 ? 1 : item.rank <= 20 ? 2 : item.rank <= 40 ? 3 : 4) ||
          !Number.isInteger(mod.value) ||
          (mod.ascended ? mod.value !== 0 : mod.value < range[0] || mod.value > range[1])
        )
          return false;
        if (
          mod.migrationGrade !== undefined &&
          (!Number.isInteger(mod.migrationGrade) ||
            mod.migrationGrade < 0 ||
            mod.migrationGrade > (item.promotionGrade || 0))
        )
          return false;
      }
      const id = familyOf(mod);
      if (used.has(id)) return false;
      used.add(id);
      prefixes += Number(sideOf(mod) === "P");
    }
    return prefixes <= 3 && item.mods.length - prefixes <= 3;
  }
  function validState(item, legacyDefs) {
    if (
      item.promotionGrade !== undefined &&
      (kindOf(item) !== "weapon" ||
        !Number.isInteger(item.promotionGrade) ||
        item.promotionGrade < 0 ||
        item.promotionGrade > 3)
    )
      return false;
    if (
      item.growthLevel !== undefined &&
      (kindOf(item) !== "weapon" ||
        !Number.isInteger(item.growthLevel) ||
        item.growthLevel < 20 ||
        item.growthLevel > 9999)
    )
      return false;
    if (item.affixVersion === undefined)
      return (
        item.unique === undefined &&
        item.corrupted === undefined &&
        item.sockets === undefined &&
        item.uniqueStats === undefined
      );
    if (item.affixVersion !== 1 || !validLines(item, legacyDefs)) return false;
    if (item.corrupted !== undefined && item.corrupted !== true) return false;
    if (
      item.sockets !== undefined &&
      (!item.corrupted ||
        !Array.isArray(item.sockets) ||
        item.sockets.length > 2 ||
        item.sockets.some((k) => !["fire", "life", "iron"].includes(k)))
    )
      return false;
    if (!item.unique) return item.unique === undefined && item.uniqueStats === undefined;
    return (
      item.unique === kindOf(item) &&
      !item.mods.length &&
      Array.isArray(item.uniqueStats) &&
      item.uniqueStats.length === 3 &&
      item.uniqueStats.every(
        (value, i) =>
          value === [10, 10, 20][i] || (item.corrupted && [8, 12].includes(value / (i === 2 ? 2 : 1))),
      )
    );
  }
  return {
    pool,
    currency,
    kinds,
    defs,
    uniqueNames,
    kindOf,
    rarity,
    sideOf,
    familyOf,
    bounds,
    eligible,
    apply,
    add,
    weighted,
    candidates,
    effectiveValue,
    generateDrop,
    validLines,
    validState,
  };
})();
if (typeof module !== "undefined") module.exports = AffixCraft;
