"use strict";
const BladeRules = (() => {
  const styles = { heavy: "강공", counter: "반격", wound: "상처" };
  const names = [
    "이끼철",
    "불갈기",
    "안개결정",
    "고목심",
    "청이끼 강철",
    "홍염 송곳니",
    "서리맥 결정",
    "고목 수심",
    "심층 이끼강",
    "잿불왕 송곳니",
    "용비늘 결정",
    "천년 심재",
  ];
  const traits = ["조우 첫 타격 피해 +20%", "체력 30% 이하 적에게 피해 +15%", "강공 피해 +12%", "반격 피해 +30%"];
  const powers = [35, 36, 37, 38, 41, 42, 43, 44, 48, 49, 50, 51];
  const bases = [
    { name: "순철 검신", power: 30, trait: "기본 검신", family: -1 },
    ...names.map((n, i) => ({ name: n + " 검신", power: powers[i], family: i % 4, trait: traits[i % 4] })),
  ];
  // All affixes are percentages. Tier 4 is the highest; each integer within a tier is equiprobable.
  const modDefs = {};
  function define(side, key, name, ranges) {
    modDefs[key] = { side, name, ranges };
  }
  const damage = [
    [4, 6],
    [7, 10],
    [11, 15],
    [16, 20],
  ];
  const utility = [
    [3, 5],
    [6, 9],
    [10, 13],
    [14, 18],
  ];
  define("prefix", "power", "무기 공격력", [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);
  define("prefix", "strike", "일반 타격 피해", damage);
  define("prefix", "heavy", "강공 피해", damage);
  define("prefix", "counter", "반격 피해", damage);
  define("prefix", "rupture", "파열 피해", damage);
  define("prefix", "finish", "체력 30% 이하 적 피해", damage);
  define("suffix", "momentum", "일반 타격 추가 기세 확률", utility);
  define("suffix", "cooldown", "강공 대기 1턴 단축 확률", utility);
  define("suffix", "guard", "스킬 방어 시 최대 체력 회복", [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 5],
  ]);
  define("suffix", "fortify", "반격 후 다음 피격 감소", damage);
  define("suffix", "wounds", "상처 추가 중첩 확률", utility);
  define("suffix", "recovery", "처치 후 최대 체력 회복", [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);
  const value = (item, key) => item.mods.find((m) => m.key === key)?.value || 0;
  const craft = typeof module !== "undefined" ? require("./swordcraft.js") : Swordcraft;
  const marks = (item, key) => (item.marks || []).filter((mark) => mark === key).length;
  const name = (item) => bases[item.base].name;
  const attack = (item, level = item.level) =>
    Math.round(
      bases[item.base].power *
        (1 + 0.08 * level) *
        (1 + value(item, "power") / 100) *
        (1 + 0.02 * marks(item, "edge")) *
        (1 + craft.grindBonus(item.grind, 2) / 100),
    );
  const caps = (r) => (r <= 10 ? [1, 1] : r <= 20 ? [2, 1] : r <= 40 ? [2, 2] : r <= 50 ? [3, 2] : [3, 3]);
  const maxTier = (r) => (r <= 10 ? 1 : r <= 20 ? 2 : r <= 40 ? 3 : 4);
  const cost = (item) =>
    Math.round((80 + 40 * item.level ** 1.8) * (1 + Math.floor(Math.max(0, item.base - 1) / 4) * 0.25));
  const rates = [100, 100, 100, 95, 90, 85, 80, 80, 78, 75, 72, 70, 68, 65, 60, 55, 50, 45, 40, 35];
  const rate = (item) => rates[item.level] || 0;
  const income = (item) =>
    item && item.level >= 13
      ? Math.round(
          bases[item.base].power *
            (item.level - 12) *
            0.6 *
            (1 + 0.2 * marks(item, "yield")) *
            (1 + craft.grindBonus(item.grind, 1) / 100),
        )
      : 0;
  const armorCost = (s) => Math.ceil(cost({ base: 0, level: Math.min(20, s.armor.level) }) / 2);
  const armorRate = (s) => rate(s.armor);
  const blade = (id, base, rank, level = 0) => ({ id, base, rank, level, grade: 0, mods: [] });
  function state(s) {
    if (!s.bladeForge) {
      const rank = Math.max(1, Math.min(60, s.huntBest || 0));
      const base = s.huntBest ? 1 + Math.floor((rank - 1) / 5) : 0;
      // Keep prior weapons and their progress intact. Give returning smiths a playable equivalent.
      const item = blade("b1", base, rank, Math.min(20, s.weapon?.level || 0));
      s.bladeForge = {
        version: 1,
        items: [item],
        serial: 1,
        equipped: item.id,
        style: "heavy",
        ore: 0,
        seals: 0,
        deployed: null,
        previousBest: s.best || 0,
        cleared: s.huntBest || 0,
        master: 3,
      };
    }
    return s.bladeForge;
  }
  const current = (s) => {
    const b = state(s);
    return b.items.find((i) => i.id === b.equipped);
  };
  function skills(s) {
    const item = current(s),
      family = bases[item.base].family,
      a = attack(item);
    const armor = Math.min(20, s.armor?.level || 0);
    const defense = Math.min(32, Math.round(armor * 1.3) + (s.armor?.grade || 0) * 2 + 3 * marks(item, "ward"));
    const pct = (key) => 1 + value(item, key) / 100;
    return {
      attack: a,
      hp: Math.round((170 + armor * 6) * (1 + 0.04 * (s.huntLining || 0))),
      defense,
      heavy: Math.round(a * 2.1 * pct("heavy") * (family === 2 ? 1.12 : 1)),
      counter: Math.round(a * 2.8 * pct("counter") * (family === 3 ? 1.3 : 1) * (item.ascended?.style === "counter" ? 0.8 : 1)),
      rupture: Math.round(a * 0.85 * pct("rupture")),
      strike: Math.round(a * pct("strike")),
      opening: family === 0 ? 20 : 0,
      finish: value(item, "finish") + (family === 1 ? 15 : 0),
      style: state(s).style,
      ascension: item.ascended?.style,
      guardBonus: craft.grindBonus(item.grind, 0),
      mods: Object.fromEntries(item.mods.map((m) => [m.key, m.value])),
    };
  }
  const anchors = [
    [1, 30, 32, 8, 420],
    [5, 42, 73, 12, 900],
    [10, 60, 106, 16, 1800],
    [15, 77, 139, 19, 3000],
    [20, 88, 169, 23, 4400],
    [25, 92, 184, 24, 5000],
    [30, 97, 199, 25, 5800],
    [35, 101, 210, 26, 6500],
    [40, 106, 228, 27, 7200],
    [45, 109, 242, 28, 8000],
    [50, 114, 254, 29, 8800],
    [55, 121, 274, 30, 9600],
    [60, 125, 290, 31, 11000],
  ];
  function area(rank) {
    const i = anchors.findIndex((row) => rank <= row[0]),
      hi = anchors[i],
      lo = anchors[Math.max(0, i - 1)];
    const t = (rank - lo[0]) / (hi[0] - lo[0] || 1);
    const field = (n) => Math.round(lo[n] + t * (hi[n] - lo[n]));
    return { rank, attack: field(1), enemyHp: field(2), enemyAttack: field(3), g: field(4) };
  }
  function available(item) {
    const [p, s] = caps(item.rank);
    const prefixes = item.mods.filter((m) => modDefs[m.key].side === "prefix").length;
    return Object.keys(modDefs).filter(
      (k) =>
        !item.mods.some((m) => m.key === k) &&
        (modDefs[k].side === "prefix" ? prefixes < p : item.mods.length - prefixes < s),
    );
  }
  const integer = (lo, hi, rng) => lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
  function addMod(item, key, rng) {
    const choices = available(item);
    if (!choices.length || (key && !choices.includes(key))) return false;
    key ||= choices[integer(0, choices.length - 1, rng)];
    item.mods.push(rollMod(key,item.rank,rng));
    return true;
  }
  function rollMod(key,rank,rng) {
    const roll=rng();
    return rollValue(key,Math.min(maxTier(rank),roll<.4?1:roll<.72?2:roll<.94?3:4),rng);
  }
  function rollValue(key,tier,rng) {
    const [lo,hi]=modDefs[key].ranges[tier-1];
    return {key,tier,value:integer(lo,hi,rng)};
  }
  function validMod(m,rank) {
    if (!m || !Object.hasOwn(modDefs,m.key) || !Number.isInteger(m.tier) || m.tier<1 || m.tier>maxTier(rank) || m.ascended!==undefined) return false;
    const [lo,hi]=modDefs[m.key].ranges[m.tier-1];
    return Number.isInteger(m.value) && m.value>=lo && m.value<=hi;
  }
  function reward(s, h, rng) {
    const b = state(s),
      boss = h.rank % 5 === 0,
      first = h.rank > b.cleared && h.rank % 5 === 1;
    b.cleared = Math.max(b.cleared, h.rank);
    const ore = boss ? 3 : 1;
    b.ore += ore;
    if (boss) b.seals++;
    let msg = "각인석 +" + ore + (boss ? " · 우두머리 인장 +1" : "");
    if (!boss && !first && rng() >= 0.2) return msg;
    const base = 1 + Math.floor(((h.territoryRank || h.rank) - 1) / 5);
    const item = blade("b" + ++b.serial, base, h.rank);
    const limit = caps(h.rank).reduce((a, n) => a + n, 0);
    let count = integer(0, limit, rng);
    if (boss && h.rank >= 51) {
      const roll = rng();
      count = roll < 0.15 ? integer(0, 2, rng) : roll < 0.35 ? 3 : roll < 0.65 ? 4 : roll < 0.9 ? 5 : 6;
    }
    for (let i = 0; i < count; i++) addMod(item, null, rng);
    b.items.push(item);
    return name(item) + " · 옵션 " + count + "줄 · " + msg;
  }
  function act(s, action, arg, rng, pay) {
    const b = state(s),
      item = current(s);
    const ok = (message, kind = "win") => ({ ok: true, message, kind });
    const fail = (message) => ({ ok: false, message });
    const deployed = (id) => !!id && (id===b.deployed || id===b.extraDeployed);
    if (item.soulChoice && (action==="bladeEtch" || action==="bladePolish")) return fail("영혼각인 후보를 먼저 확정하세요.");
    switch (action) {
      case "bladeStyle":
        if (!Object.hasOwn(styles, arg)) return fail("검술을 확인하세요.");
        b.style = arg;
        return ok(styles[arg] + " 검술 선택");
      case "bladeMaster": {
        const i = Number(arg);
        if (b.cleared < 60 || !Number.isInteger(i) || i < 0 || i > 3) return fail("60단계 첫 승리가 필요합니다.");
        b.master = i;
        return ok(names[8 + i] + " 우두머리 추적");
      }
      case "bladeEquip": {
        const target = b.items.find((x) => x.id === arg);
        if (!target || deployed(target.id)) return fail("검신을 회수한 뒤 장착하세요.");
        b.equipped = target.id;
        return ok(name(target) + " 장착");
      }
      case "bladeDeploy": {
        const target = b.items.find((x) => x.id === arg);
        if (
          !target ||
          target.level < 13 ||
          target.soulChoice ||
          target.id === b.equipped ||
          target.id === s.hunt?.bladeId ||
          deployed(target.id) || (b.deployed && (b.extraDeployed || !(b.soul?.learned.land || s.imprints?.land)))
        )
          return fail("여분의 +13 이상 검신과 빈 배치 자리가 필요합니다.");
        if (b.deployed) b.extraDeployed=target.id;
        else b.deployed=target.id;
        return ok(name(target) + " 배치 · 분당 " + income(target) + " G");
      }
      case "bladeRecall": {
        const id=arg || b.deployed;
        if (!deployed(id)) return fail("배치한 검신을 확인하세요.");
        if (id===b.extraDeployed) b.extraDeployed=null;
        else { b.deployed=b.extraDeployed || null; b.extraDeployed=null; }
        return ok("검신을 보관함으로 회수했습니다.");
      }
      case "bladeSalvage": {
        const i = b.items.findIndex((x) => x.id === arg);
        if (i < 0 || arg === b.equipped || arg === s.hunt?.bladeId || deployed(arg) || b.items[i].soulChoice)
          return fail("전투·장착 중인 검신은 분해할 수 없습니다.");
        const n = 1 + b.items[i].mods.length;
        b.items.splice(i, 1);
        b.ore += n;
        return ok("검신 분해 · 각인석 +" + n);
      }
      case "bladeArmor": {
        if (s.armor.level >= 20) return fail("숲 방어구가 +20에 도달했습니다.");
        const fee = armorCost(s);
        if (s.gold < fee) return fail("방어구 강화 골드가 부족합니다.");
        pay(s, fee);
        if (rng() * 100 >= armorRate(s)) return ok("방어구 강화 유지 · +" + s.armor.level, "info");
        s.armor.level++;
        return ok("방어구 +" + s.armor.level + " 강화 성공");
      }
      case "bladeForge": {
        if (arg && arg !== item.id) return fail("장착 검신이 바뀌었습니다.");
        if (item.finalTrial) return fail("진행 중인 마지막 돌파를 먼저 마치세요.");
        if (item.level >= 20) return fail("+20 완성 검신입니다.");
        const fee = cost(item);
        if (s.gold < fee) return fail("강화 골드가 부족합니다.");
        pay(s, fee);
        if (rng() * 100 >= rate(item)) return ok("강화 유지 · " + name(item) + " +" + item.level, "info");
        item.level++;
        return ok(name(item) + " +" + item.level + " 강화 성공");
      }
      case "bladeEtch": {
        const charge = arg ? 8 : 2;
        if (b.ore < charge || (arg && !b.seals))
          return fail("각인석 " + charge + "개" + (arg ? "와 우두머리 인장 1개" : "") + "가 필요합니다.");
        if (!addMod(item, arg, rng)) return fail("빈 접두·접미 자리와 중복 옵션을 확인하세요.");
        b.ore -= charge;
        if (arg) b.seals--;
        const m = item.mods.at(-1);
        return ok(modDefs[m.key].name + " +" + m.value + "% 각인");
      }
      case "bladePolish": {
        const m = item.mods.find((x) => x.key === arg);
        if (!m || m.ascended || b.ore < 3) return fail("연마할 옵션과 각인석 3개가 필요합니다.");
        const [lo, hi] = modDefs[m.key].ranges[m.tier - 1];
        if (m.value >= hi) return fail("이미 이 등급의 최고 수치입니다.");
        b.ore -= 3;
        m.value = integer(lo, hi, rng);
        return ok(modDefs[m.key].name + " 연마 · " + m.value + "%");
      }
    }
    return fail("알 수 없는 검신 행동입니다.");
  }
  function valid(b) {
    const nat = (n) => Number.isSafeInteger(n) && n >= 0,
      ids = new Set();
    if (
      !b ||
      b.version !== 1 ||
      !nat(b.serial) ||
      !nat(b.ore) ||
      !nat(b.cleared) ||
      b.cleared > 60 ||
      !nat(b.master) ||
      b.master > 3 ||
      !Object.hasOwn(styles, b.style) ||
      !Array.isArray(b.items) ||
      !b.items.length ||
      b.items.length > 120
    )
      return false;
    for (const i of b.items) {
      if (
        !i ||
        typeof i.id !== "string" ||
        !/^b[1-9]\d*$/.test(i.id) ||
        Number(i.id.slice(1)) > b.serial ||
        ids.has(i.id) ||
        !nat(i.base) ||
        !bases[i.base] ||
        !nat(i.rank) ||
        i.rank < 1 ||
        i.rank > 60 ||
        !nat(i.level) ||
        i.level > 20 ||
        !Array.isArray(i.mods)
      )
        return false;
      if (
        i.grade !== 0 ||
        (i.marks !== undefined &&
          (!Array.isArray(i.marks) ||
            i.marks.length > 3 ||
            i.marks.some((m) => !["edge", "ward", "yield"].includes(m)))) ||
        (i.grind !== undefined &&
          (!Array.isArray(i.grind) || i.grind.length !== 3 || !i.grind.every((z) => [0, 1, 2].includes(z))))
      )
        return false;
      if (
        i.work !== undefined &&
        (!i.work ||
          !Number.isInteger(i.work.index) ||
          i.work.index < 0 ||
          i.work.index > 2 ||
          (i.work.index === 0 && !Array.isArray(i.work.passes)) ||
          (i.work.index === 1 && !["turn", "health", "enemy", "stamina", "offset"].every((k) => nat(i.work[k]))) ||
          (i.work.index === 2 && (!nat(i.work.dips) || i.work.dips > 2 || !Number.isFinite(i.work.started))))
      )
        return false;
      if (
        i.finalTrial !== undefined &&
        (!i.finalTrial ||
          i.level !== 19 ||
          !["edge", "ward", "yield"].includes(i.finalTrial.key) ||
          !nat(i.finalTrial.revision) ||
          !nat(i.finalTrial.id) ||
          !Array.isArray(i.finalTrial.loads))
      )
        return false;
      ids.add(i.id);
      const seen = { ...i, mods: [] };
      for (const m of i.mods) {
        if (!m || !available(seen).includes(m.key) || !nat(m.tier) || !m.tier || m.tier > maxTier(i.rank))
          return false;
        const [lo, hi] = modDefs[m.key].ranges[m.tier - 1];
        if (m.ascended===undefined ? !nat(m.value) || m.value<lo || m.value>hi : m.value!==0) return false;
        seen.mods.push(m);
      }
    }
    return (
      ids.has(b.equipped) &&
      nat(b.seals) &&
      (b.extraDeployed==null || (b.deployed && b.extraDeployed!==b.deployed && b.extraDeployed!==b.equipped && b.items.some(i=>i.id===b.extraDeployed && i.level>=13))) &&
      (b.deployed === null ||
        (b.deployed !== b.equipped && b.items.some((i) => i.id === b.deployed && i.level >= 13)))
    );
  }
  return {
    styles,
    bases,
    modDefs,
    state,
    current,
    name,
    attack,
    area,
    caps,
    cost,
    rate,
    income,
    armorCost,
    armorRate,
    skills,
    available, maxTier, integer, rollMod, rollValue, validMod,
    reward,
    act,
    valid,
  };
})();
if (typeof module !== "undefined") module.exports = BladeRules;
