"use strict";
const Game = (() => {
  const story = typeof module !== "undefined" ? require("./charcoal-story.js") : CharcoalStory;
  const craft = typeof module !== "undefined" ? require("./swordcraft.js") : Swordcraft;
  const finale = typeof module !== "undefined" ? require("./breakthrough.js") : Breakthrough;
  const grades = ["일반", "레어", "에픽", "전설"];
  const swords = ["순철 장검", "서리결 장검", "황혼의 마검", "태양의 성검"];
  const armors = ["순철 흉갑", "청명한 흉갑", "황혼의 흉갑", "별무리 성갑"];
  const armorRates = [
    100, 100, 100, 100, 100, 98, 97, 96, 95, 94, 92, 91, 90, 82, 74, 66, 56, 46, 36, 26,
  ];
  // Indexed by the current level. See reference/sword-raising-balance.md for provenance.
  // Tuples are success, drop and destruction percentages. The remainder is hold.
  const swordRates = [
    [100,0,0], [100,0,0], [100,0,0], [95,0,0], [90,0,0],
    [85,0,0], [80,0,0], [75,0,0], [65,3,0], [55,5,0],
    [50,8,2], [40,10,5], [32,10,5], [24,10,5], [16,10,5],
    [10,10,5], [6,10,5], [3,10,5], [2,10,5], [1,10,5],
  ];
  function baseSwordChances(level) {
    if (!swordRates[level]) return null;
    const [success, drop, destroy] = swordRates[level];
    return { success, hold: 100 - success - drop - destroy, drop, destroy };
  }
  const income = [2000, 4000, 8000, 16000, 30000, 50000, 80000, 120000];
  const mining = { stepMs: 6000, maxTanks: 500, feverCost: 100, feverMultiplier: 10 };
  // Gold ranges and floors 1–40 are documented. Upper cutoffs are provisional.
  const towerRewards = [
    { max: 40, name: "낡은 나무 상자", minGold: 10000, maxGold: 50000 },
    { max: 80, name: "강철 상자", minGold: 5000000, maxGold: 15000000 },
    { max: 120, name: "황금 상자", minGold: 300000000, maxGold: 1000000000 },
    { max: Infinity, name: "고대 상자", minGold: 5000000000, maxGold: 10000000000 },
  ];
  function towerReward(floor) {
    return towerRewards.find(reward => floor <= reward.max);
  }
  const blessings = ["정령의 가호", "대장장이의 가호", "신의 가호"];
  const oreNames = ["석탄", "구리", "은", "금", "보석", "다이아", "에테르", "미스릴"];
  const orePrices = [50000, 100000, 500000, 3000000, 5000000, 30000000, 1000000000, 50000000000];
  const bosses = [
    "수련의 허수아비",
    "강철 수문장",
    "광폭한 검귀",
    "무형의 그림자",
    "불굴의 석상",
    "혈향의 나찰",
    "천공의 수호자",
    "불멸의 거인",
    "파멸의 검성",
    "심연의 군주",
    "불괴의 마신",
    "허공의 지배자",
    "시련의 초월자",
    "파천의 마룡",
    "절대자의 잔영",
    "무저갱의 폭군",
    "종말의 사도",
    "천멸의 화신",
    "태초의 공포",
    "시련의 종언",
  ];
  const imprints = {
    luck: ["행운", 5, 1.5, 50],
    lung: ["폐활량", 10, 5, 50],
    land: ["영토", 500, 500, 5],
  };
  const journeys = {
    edge: { name: "사냥꾼의 검", task: "이끼숲 토벌" },
    ward: { name: "장인의 검", task: "정밀 담금질" },
    yield: { name: "개척자의 검", task: "별의 파편 납품" },
  };
  const techniques = {
    luck: { name: "쌍타", text: "+13~+17에서 성공하면 두 단계 상승. 실패 시 일반 강화 위험 적용" },
    lung: { name: "호흡 단조", text: "+13부터 정밀 담금질 두 번으로 한 단계 확정 상승. 최대 +19" },
    land: {
      name: "수비대 호위",
      text: "+13부터 미수령 사냥터 수익 2,000 G로 다음 하락·파괴 한 번 방지",
    },
  };
  const routeTargets = [4, 7, 15];
  // 1.4 saves recorded the next route step, but not which early lessons were claimed.
  function migrateTraining(s) {
    for (const w of [s.weapon, ...s.bag, ...s.field]) {
      const r = w.route;
      if (!r || r.learned !== undefined) continue;
      r.learned = [0, 4, 7, 7][r.step] || 0;
      r.index = s.inheritedRecipe?.trait === r.trait ? s.inheritedRecipe.index : null;
    }
  }
  function breakPattern(w) {
    const r = w.route;
    if (!r?.learned || !Number.isInteger(r.index) || !w.seal) return null;
    return {
      trait: r.trait,
      index: r.index,
      seal: w.seal.key,
      level: r.learned,
      mark: r.learned === 7 ? w.marks?.[0] || null : null,
      ...(r.learned === 7 && w.grind ? { grind: [...w.grind] } : {}),
    };
  }
  function reforgeOptions(s) {
    const w = s.weapon,
      p = w.pattern,
      recipe = s.inheritedRecipe;
    if (
      !p ||
      !recipe ||
      !s.imprints[p.seal] ||
      recipe.trait !== p.trait ||
      recipe.index !== p.index ||
      (w.route && (w.route.trait !== p.trait || w.route.index !== p.index)) ||
      (w.seal && w.seal.key !== p.seal) ||
      w.level >= p.level ||
      w.marks?.length
    )
      return null;
    return { pattern: p, copyFee: p.mark ? craft.fee(w, price, 0) : null };
  }
  function imprintCost(s, key) {
    const level = s.imprints[key],
      def = imprints[key];
    return key === "land" && !level ? 15 : Math.floor(def[1] + level * def[2]);
  }
  function routeTask(s) {
    const r = s.weapon.route;
    if (!r || r.step >= routeTargets.length) return null;
    const target = routeTargets[r.step];
    const needed = r.step + 1;
    const open = s.weapon.level >= [0, 4, 13][r.step];
    const ready =
      r.trait === "yield" ? s.shards >= needed : r.progress >= (r.trait === "edge" ? 1 : needed);
    const supplyGold = needed * 1000;
    const canSupply = r.trait === "yield" && s.unclaimed >= supplyGold;
    return { target, needed, open, ready, supplyGold, canSupply, threshold: [0, 4, 13][r.step] };
  }
  function recordWeapon(s) {
    const w = s.weapon;
    s.best = Math.max(s.best, w.level);
    if (w.level >= 15) w.forgePeak = knownPeak(w);
    while (w.route && w.level >= routeTargets[w.route.step]) {
      w.route.step++;
      w.route.progress = 0;
      delete w.route.hunt;
    }
  }
  function techniqueAvailable(s, key) {
    const w = s.weapon,
      seal = w.seal;
    if (seal?.key !== key || seal.uses >= 2 || w.level < 13) return false;
    if (key === "luck") return w.level <= 17;
    if (key === "lung") return w.level < 19 && seal.beats >= 2;
    return w.level < 20 && !seal.escort && Math.floor(s.unclaimed) >= 2000;
  }
  const orders = [
    [3, 1200, 1],
    [7, 4500, 2],
    [13, 16000, 3],
    [16, 120000, 4],
    [19, 500000, 5],
    [20, 1000000, 8],
    [21, 3000000, 12],
    [25, 10000000, 20],
  ];
  const freshGear = (grade = 0) => ({ level: 0, grade, star: 0 });
  const day = (t) => new Date(t + 32400000).toISOString().slice(0, 10);
  function week(t) {
    const date = new Date(t + 32400000);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  const freshTrial = () => ({
    floor: 1,
    buffs: { attack: 0, hp: 0 },
    choices: [],
    claimed: [],
    best: 0,
    done: false,
  });
  const hunting = { initial: 30, cap: 30, interval: 600000, daily: 10 };
  function freshHunting(t) {
    return { version: 1, id: globalThis.crypto.randomUUID(), free: hunting.initial, purchased: 0,
      rechargeAt: null, observedAt: t, daily: "", serial: 0, lastStart: null };
  }
  // Local trial only: device time and restored snapshots are not server authority.
  function settleHunting(s, t = Date.now()) {
    if (!s.hunting) {
      s.hunting = freshHunting(t);
      s.hunting.daily = s.day || "";
    }
    const w = s.hunting;
    t = Math.max(t, w.observedAt);
    w.observedAt = t;
    if (w.free >= hunting.cap) w.rechargeAt = null;
    else {
      w.rechargeAt ??= t;
      const count = Math.floor(Math.max(0, t - w.rechargeAt) / hunting.interval);
      w.free = Math.min(hunting.cap, w.free + count);
      w.rechargeAt = w.free >= hunting.cap ? null : w.rechargeAt + count * hunting.interval;
    }
    if (s.hunt && !s.hunt.id) {
      s.hunt.id = "legacy-" + w.id;
      s.hunt.ticketSource = null; // Never charge a battle that predates migration.
    }
    return w;
  }
  function huntingStatus(s, t = Date.now()) {
    const copy = { hunting: { ...s.hunting }, hunt: null };
    const w = settleHunting(copy, t);
    return { ...w, remaining: w.rechargeAt === null ? null :
      Math.max(0, w.rechargeAt + hunting.interval - w.observedAt) };
  }
  function resetProgress(s, t = Date.now()) {
    settleHunting(s, t);
    const next = fresh(t);
    next.hunting = JSON.parse(JSON.stringify(s.hunting));
    next.day = s.day; // Resetting progress does not grant another daily supply.
    return next;
  }
  function fresh(t = Date.now()) {
    return {
      version: 1,
      hunting: freshHunting(t),
      story: story.fresh(),
      apprentice: { visible: true, tempered: false, deployed: false, collected: false },
      lastHunt: null,
      chests: [],
      chestSerial: 0,
      lastChest: null,
      gold: 12000,
      forgeClues: 0,
      weapon: freshGear(),
      armor: freshGear(),
      bag: [],
      field: [],
      best: 0,
      order: 0,
      heat: 0,
      temperStart: 0,
      hunt: null,
      huntBest: 0,
      attempts: 0,
      hits: 0,
      breaks: 0,
      charms: [3, 3, 1],
      enabled: [false, false, false],
      scrolls: 3,
      scrollOn: false,
      shards: 4,
      tickets: 0,
      tanks: 1,
      ore: Array(8).fill(0),
      dive: null,
      autoMine: null,
      lastAutoMine: null,
      fever: 0,
      souls: 0,
      rebirths: 0,
      lifeSouls: 0,
      inheritedRecipe: null,
      imprints: { luck: 0, lung: 0, land: 0 },
      tower: 1,
      towerRun: null,
      lastTowerRun: null,
      trial: freshTrial(),
      relics: [],
      equippedRelic: -1,
      stones: 0,
      points: 0,
      activeMs: 0,
      marks: 0,
      guild: null,
      week: week(t),
      day: "",
      last: t,
      fieldIncomeVersion: 2,
      unclaimed: 0,
      created: t,
      log: [],
    };
  }
  function bladeStage(g) {
    return Math.max(g.grade, g.level >= 19 ? 3 : g.level >= 13 ? 2 : g.level >= 7 ? 1 : 0);
  }
  function name(g, type = "weapon") {
    return type === "armor" ? armors[g.grade] : swords[bladeStage(g)];
  }
  function stats(s, trial = false, raid = false) {
    let attack = Math.round(
      (24 + 9 * s.weapon.level ** 1.65 + s.weapon.star) *
        (1 + s.weapon.grade * 0.3) *
        (1 + 0.1 * craft.count(s.weapon, "edge")) *
        (1 + craft.grindBonus(s.weapon.grind, 2) / 100),
    );
    let hp = Math.round(
      (160 + 46 * s.armor.level ** 1.6 + s.armor.star) * (1 + s.armor.grade * 0.3),
    );
    if (trial) {
      attack += s.trial.buffs.attack;
      hp += s.trial.buffs.hp;
    }
    if (raid && s.relics[s.equippedRelic])
      attack = Math.round(attack * (1 + s.relics[s.equippedRelic].power / 100));
    return { attack, hp };
  }
  function price(g) {
    return Math.round((80 + 40 * g.level ** 1.8) * (1 + g.grade * 0.5));
  }
  function enhancementChances(s, g, focusBonus = 0) {
    const sword = g === s.weapon ? baseSwordChances(g.level) : null;
    const base = sword?.success ?? armorRates[g.level] ?? 0;
    const success = Math.min(
      100,
      (base + s.imprints.luck * 0.2 + s.heat) * (s.scrollOn && s.scrolls ? 1.1 : 1) + focusBonus,
    );
    const failure = 100 - success;
    // Success bonuses displace holds first on cards with explicit risks.
    const destroy = sword ? Math.min(failure, sword.destroy) : g.level >= 15 ? failure * 0.15 : 0;
    const drop = sword ? Math.min(failure - destroy, sword.drop) : g.level >= 12 ? failure - destroy : 0;
    return { success, hold: failure - destroy - drop, drop, destroy };
  }
  function odds(s, g) {
    return enhancementChances(s, g).success;
  }
  function enhancementProtection(s, g) {
    const active = s.enabled.map((on, i) => on && s.charms[i] > 0);
    const swordWard = g === s.weapon && (g.seal?.escort || craft.wards(g) > 0);
    return { active, drop: active[0] || active[2] || swordWard, destroy: active[1] || active[2] || swordWard };
  }
  function nextEnhancementChances(s, g) {
    const chances = enhancementChances(s, g);
    const protection = enhancementProtection(s, g);
    for (const outcome of ["drop", "destroy"]) {
      if (protection[outcome]) {
        chances.hold += chances[outcome];
        chances[outcome] = 0;
      }
    }
    return chances;
  }
  function perMinute(g) {
    return 6 * Math.round(
      (income[Math.min(g.level, 20) - 13] || 0) *
        [1, 6.5, 55, 200][g.grade] *
        (1 + 0.35 * craft.count(g, "yield")) * (1 + craft.grindBonus(g.grind, 1) / 100),
    );
  }
  function knownPeak(g) {
    // A completed +15 route is also evidence on old swords without a recorded peak.
    const routePeak =
      g.route?.step >= routeTargets.length ? routeTargets[routeTargets.length - 1] : 0;
    return Math.min(19, Math.max(g.level, g.forgePeak || 0, routePeak));
  }
  function midRecovery(g) {
    if (g.level !== 14) return null;
    const target = Math.min(16, knownPeak(g));
    return target >= 15 ? { target, cost: price({ level: target - 1, grade: g.grade }) } : null;
  }
  function enhancementNotebook(s) {
    const g = s.weapon;
    const peak = knownPeak(g);
    const active = peak >= 17 && g.level < 20;
    const normalRate = odds(s, g);
    const focusRate = Math.min(100, normalRate + 15);
    return {
      peak,
      active,
      canRestore: active && g.level < peak,
      clues: s.forgeClues || 0,
      focusRate,
      bonus: focusRate - normalRate,
      focusCost: 1,
      restoreCost: 2,
      restoreGold: active ? price({ level: peak - 1, grade: g.grade }) : 0,
    };
  }
  const forestEnemies = [
    { kind: "moss", name: "이끼등 멧돼지", trait: "이끼 가죽", hint: "2턴부터 3턴마다 돌진 · 방어 후 반격", first: 2, interval: 3, power: 3 },
    { kind: "red", name: "붉은갈기 멧돼지", trait: "붉은 갈기", hint: "2턴부터 3턴마다 돌진 · 강공으로 먼저 끝내거나 방어", first: 2, interval: 3, power: 3 },
    { kind: "stone", name: "바위등 멧돼지", trait: "단단한 가죽", hint: "베기 피해 20% 감소 · 강공은 가죽을 뚫음", first: 2, interval: 3, power: 3 },
    { kind: "swift", name: "잿빛 질주멧돼지", trait: "빠른 돌진", hint: "2턴부터 2턴마다 2배 돌진 · 방어와 반격을 자주 교대", first: 2, interval: 2, power: 2 },
    { kind: "crown", name: "황금엄니 우두머리", trait: "우두머리", hint: "3턴부터 4턴마다 4배 돌진 · 돌진 전 기세를 모으세요", first: 3, interval: 4, power: 4 },
  ];
  function huntEnemy(huntOrRank) {
    const rank = Math.max(1, Math.min(60, Number(typeof huntOrRank === "number" ? huntOrRank : huntOrRank?.rank) || 1));
    // An already-running legacy hunt keeps its original moves until it ends.
    const enemy = typeof huntOrRank === "number" ? forestEnemies[(rank - 1) % 5]
      : forestEnemies.find(e => e.kind === huntOrRank?.enemyKind) || forestEnemies[0];
    const depth = Math.floor((rank - 1) / 5);
    const habitat = ["이끼숲 초입", "붉은 낙엽길", "안개 바위골", "고목의 심장"][Math.min(3, Math.floor(depth / 3))];
    const prefix = depth >= 9 ? "태고의 " : depth >= 6 ? "심연의 " : depth >= 3 ? "고목의 " : depth >= 1 ? "깊은숲 " : "";
    return { ...enemy, rank, habitat, name: prefix + enemy.name, elite: enemy.kind === "crown" };
  }
  function huntCharge(turnOrHunt) {
    const h = typeof turnOrHunt === "number" ? { turn: turnOrHunt } : turnOrHunt;
    const enemy = huntEnemy(h);
    return h.turn >= enemy.first && (h.turn - enemy.first) % enemy.interval === 0;
  }
  function canStoreWeapon(w) {
    return Boolean(w.level || w.grade || w.route || w.seal || w.pattern);
  }
  function canDive(w) {
    return w.level >= 19 || w.grade > 0;
  }
  function huntHealth({ number, hp, maxHp, enemyHp, enemyMax }) {
    return { number, hp, maxHp, enemyHp, enemyMax };
  }
  function huntMove(h, action) {
    const heavy = action === "heavyStrike", block = action === "block";
    const charge = huntCharge(h), enemy = huntEnemy(h);
    const momentum = h.momentum ?? 1;
    const hide = enemy.kind === "stone" && !heavy ? 0.8 : 1;
    const damage = block ? 0 : Math.min(h.enemyHp, Math.round(h.attack * (h.counter ? 2.5 : 1) * (heavy ? 2 : 1) * hide));
    const exposure = block ? 0.15 * (1 - (h.guardReduction || 0) / 100) : heavy ? 1.5 : 1;
    const retaliation = Math.max(1, Math.round(h.enemyAttack * (charge ? enemy.power : 1) * exposure));
    return {
      available: !heavy || (h.rank >= 2 && momentum >= 2),
      damage, taken: damage >= h.enemyHp ? 0 : Math.min(h.hp, retaliation),
      momentum: heavy ? 0 : Math.min(2, momentum + (block && !charge ? 0 : 1)),
    };
  }
  function settle(s, t = Date.now()) {
    settleHunting(s, t);
    if (t > s.last) {
      // Settle pre-update time at the old rate before switching existing saves.
      const divisor = s.fieldIncomeVersion === 2 ? 1 : 6;
      s.unclaimed += ((t - s.last) / 60000) * s.field.reduce((n, g) => n + perMinute(g) / divisor, 0);
      s.last = t;
    }
    s.fieldIncomeVersion = 2;
    s.fever ??= 0;
    settleAutoMine(s, t);
    if (s.week !== week(t)) {
      s.week = week(t);
      s.trial = freshTrial();
    }
  }
  function miningLoot(depth, multiplier, random) {
    const int = (a, b) => a + Math.floor(random() * (b - a + 1));
    const ore = Array(8).fill(0), charms = [0, 0, 0];
    const index = int(0, Math.min(7, 1 + Math.floor((depth - 1000) / 400)));
    ore[index] = int(1, 4) * multiplier;
    const shards = random() < 0.25 ? multiplier : 0;
    if (random() < 0.15) charms[int(0, 2)] = multiplier;
    const marks = random() < 0.1 ? multiplier : 0;
    const stones = random() < 0.03 ? multiplier : 0;
    return { ore, charms, shards, marks, stones };
  }
  function addMiningLoot(target, loot) {
    loot.ore.forEach((q, i) => { target.ore[i] += q; });
    loot.charms.forEach((q, i) => { target.charms[i] += q; });
    for (const key of ["shards", "marks", "stones"]) target[key] += loot[key];
  }
  function settleAutoMine(s, t) {
    const job = s.autoMine;
    if (!job) return;
    const completed = Math.min(job.limit, Math.max(0, Math.floor((t - job.started) / job.tankMs)));
    // Persist the PRNG cursor so reloads and different polling intervals give the same loot.
    const random = () => {
      job.seed = (Math.imul(job.seed, 1664525) + 1013904223) >>> 0;
      return job.seed / 4294967296;
    };
    while (job.completed < completed) {
      for (let step = 1; step <= job.steps; step++) {
        const loot = miningLoot(1000 + step * 50, 1, random);
        addMiningLoot(s, loot);
        addMiningLoot(job.loot, loot);
      }
      job.completed++;
      s.fever++;
    }
    if (job.completed === job.limit) {
      s.lastAutoMine = { ...job, finished: job.started + job.limit * job.tankMs };
      s.autoMine = null;
    }
  }
  function awardChest(s, source, rank, base, counter, int) {
    const tower = source === "tower";
    const reward = tower ? towerReward(rank) : null;
    const roll = int(1, 100);
    const tier = tower ? towerRewards.indexOf(reward) : roll <= 70 ? 0 : roll <= 95 ? 1 : 2;
    if (tower) base = int(reward.minGold, reward.maxGold);
    const percent = tier === 0 ? int(0, 10) : tier === 1 ? int(12, 25) : int(30, 50);
    const extra = tower ? 0 : Math.round((base + counter) * percent / 100);
    const shards = Number(tower || rank % 3 === 0) + (tier === 2 ? int(2, 4) : tier);
    const charms = [0, 0, 0];
    if (tower) charms[int(0, 1)]++;
    if (tier === 2) charms[int(0, 2)]++;
    s.chestSerial = (s.chestSerial || 0) + 1;
    const chest = { id: s.created + "-" + s.chestSerial, source, rank, tier, base, counter, extra,
      gold: base + counter + extra, shards, charms, scrolls: Number(tower) };
    if (tower) chest.name = reward.name;
    (s.chests ||= []).push(chest);
    return chest;
  }
  function towerBattle(f, tr, attributes) {
    const { attack, hp } = attributes;
    const enemyHp = Math.round((tr ? 66 : 36) * Math.pow(1.09, Math.min(f, 120)) + (f - 1) * (tr ? 650 : 55));
    const enemyAtk = Math.round((tr ? 28 : 12) * Math.pow(1.06, Math.min(f, 120)) + f * (tr ? 14 : 3));
    const attacksToWin = Math.ceil(enemyHp / attack);
    const attacksToLose = Math.ceil(hp / enemyAtk);
    const turnLimit = tr ? 20 : Infinity;
    const win = attacksToWin <= Math.min(attacksToLose, turnLimit);
    const turns = Math.min(attacksToWin, attacksToLose, turnLimit);
    const timedOut = !win && attacksToLose > turnLimit;
    return { f, hp, attack, enemyHp, enemyAtk, win, tr, turns, timedOut };
  }
  function finishTowerRun(s, reason, t) {
    s.lastTowerRun = { ...s.towerRun, reason, finished: t };
    s.towerRun = null;
  }
  function perform(s, act, arg, t = Date.now(), random = Math.random, pressedAt = t) {
    settle(s, t);
    const fail = (message) => ({ ok: false, message });
    const success = (message, kind = "info") => {
      s.log.unshift({ message, time: t, kind });
      s.log.length = Math.min(s.log.length, 30);
      return { ok: true, message, kind };
    };
    const int = (a, b) => a + Math.floor(random() * (b - a + 1));
    const type = arg === "armor" ? "armor" : "weapon";
    const g = s[type];
    const validIndex = (list, index) =>
      Number.isInteger(index) && index >= 0 && index < list.length;
    const chanceGrade = () => {
      const r = random();
      return r < 0.005 ? 3 : r < 0.035 ? 2 : r < 0.2 ? 1 : 0;
    };
    switch (act) {
      case "openChest": {
        const index = (s.chests || []).findIndex((c) => c.id === arg);
        if (index < 0) return fail("이미 열었거나 보관함에 없는 상자입니다.");
        const [c] = s.chests.splice(index, 1);
        s.gold += c.gold;
        s.shards += c.shards;
        s.scrolls += c.scrolls;
        c.charms.forEach((amount, i) => { s.charms[i] += amount; });
        s.lastChest = c;
        return success("보물상자 개봉 · " + c.gold.toLocaleString() + " G", "win");
      }
      case "beginPath": {
        const w = s.weapon,
          recipe = s.inheritedRecipe;
        if (!s.rebirths || !recipe || w.route || w.level >= 15)
          return fail("시작할 전승 수련이 없습니다.");
        w.route = { trait: recipe.trait, index: recipe.index, learned: 0, step: 0, progress: 0 };
        recordWeapon(s);
        return success(journeys[recipe.trait].name + " 수련 시작");
      }
      case "routeSupply":
      case "routeFinish": {
        const task = routeTask(s);
        const supply = act === "routeSupply";
        if (arg && Number(arg) !== task?.target) return fail("수련 목표가 바뀌었습니다.");
        if (!task?.open || !(supply ? task.canSupply : task.ready))
          return fail("수련 조건을 먼저 달성하세요.");
        if (supply) s.unclaimed -= task.supplyGold;
        else if (s.weapon.route.trait === "yield") s.shards -= task.needed;
        if (task.target <= 7) s.weapon.route.learned = task.target;
        s.weapon.level = task.target;
        recordWeapon(s);
        return success("전승 수련 완료 · 검 +" + task.target, "win");
      }
      case "reforge": {
        const options = reforgeOptions(s);
        if (!options || !["blank", "copy"].includes(arg))
          return fail("이 검에서 사용할 수 있는 초벌본이 없습니다.");
        const { pattern: p, copyFee } = options;
        const copy = arg === "copy";
        if (copy && (copyFee === null || s.gold < copyFee))
          return fail("첫 연마 기록과 마감 비용이 필요합니다.");
        const w = s.weapon;
        if (copy) {
          s.gold -= copyFee;
          w.marks = [p.mark];
          if (p.grind) w.grind = [...p.grind];
        }
        w.level = copy ? craft.stages[0].target : p.level;
        w.route = { trait: p.trait, index: p.index, learned: p.level, step: 0, progress: 0 };
        w.seal = { key: p.seal, uses: 0, beats: 0 };
        delete w.pattern;
        recordWeapon(s);
        return success(
          "초벌본 재제작 · +" +
            w.level +
            " · " +
            (copy ? craft.traits[p.mark].name : "칼날 특성 새로 선택"),
          "win",
        );
      }
      case "attune": {
        if (
          !s.rebirths ||
          !Object.prototype.hasOwnProperty.call(techniques, arg) ||
          !s.imprints[arg] ||
          s.weapon.seal ||
          s.weapon.level >= 20
        )
          return fail("이 검에는 해금한 주각인 하나를 새길 수 있습니다.");
        s.weapon.seal = { key: arg, uses: 0, beats: 0 };
        return success(imprints[arg][0] + " 주각인 · " + techniques[arg].name + " 습득");
      }
      case "breathForge":
      case "hireEscort": {
        const key = act === "breathForge" ? "lung" : "land";
        if (!techniqueAvailable(s, key)) return fail("각인 기술의 사용 조건을 확인하세요.");
        const seal = s.weapon.seal;
        seal.uses++;
        if (key === "land") {
          s.unclaimed -= 2000;
          seal.escort = true;
          return success("수비대 도착 · 다음 하락 또는 파괴 1회 보호");
        }
        seal.beats = 0;
        s.weapon.level++;
        recordWeapon(s);
        return success("호흡 단조 완료 · 검 +" + s.weapon.level, "win");
      }
      case "finalStart":
        return finale.start(s, arg, price, t, random)
          ? success(finale.methods[arg].name + " 시작")
          : fail("검의 특성, 진행 중인 돌파, 시작 비용을 확인하세요.");
      case "finalMove": {
        const w = s.weapon,
          f = w.finalTrial;
        const result = finale.move(s, arg, price, t, pressedAt);
        if (!result) return fail("돌파 수련 상태와 보유 재료를 확인하세요.");
        if (result.outcome === "continue") return { ok: true, kind: "training", message: "" };
        const method = finale.methods[f.key].name;
        delete w.finalTrial;
        if (result.outcome === "cancel") return success("납품 계획을 취소했습니다.");
        s.attempts++;
        if (result.outcome === "win") {
          w.level = 20;
          w.finishMethod = f.key;
          s.hits++;
          recordWeapon(s);
          return success(method + " 완성 · " + name(w) + " +20", "win");
        }
        if (f.key === "edge") {
          w.forgePeak = 19;
          w.level = 18;
          s.forgeClues = (s.forgeClues || 0) + 1;
          return success(method + " 실패 · " + result.note + " · +18로 하락 · 단서 +1", "loss");
        }
        return success(method + " 실패 · " + result.note + " · +19 유지 · 제련비 소모", "loss");
      }
      case "craftStart":
      case "craftMove":
      case "craftInherit":
      case "craftFinish": {
        const sword = s.weapon,
          i = craft.stageIndex(sword);
        if (i < 0) return fail("지금 진행할 제작 공정이 없습니다.");
        const stage = craft.stages[i],
          w = sword.work;
        if (act === "craftStart") {
          if (!w || w.index !== i || w.failed) sword.work = craft.makeWork(i, random, t);
          return { ok: true, kind: "craft" };
        }
        const inherit = act === "craftInherit";
        let trait = arg;
        if (inherit) {
          if (s.inheritedRecipe?.index !== i) return fail("이 공정에 전승한 제작법이 없습니다.");
          trait = s.inheritedRecipe.trait;
        } else {
          if (!w || w.index !== i) return fail("제작 공정을 먼저 시작하세요.");
          if (act === "craftMove")
            return craft.play(w, String(arg), t)
              ? { ok: true, kind: "craft" }
              : fail("현재 사용할 수 없는 동작입니다.");
          if (!w.ready) return fail("공정을 마치고 특성을 선택하세요.");
        }
        if (!Object.prototype.hasOwnProperty.call(craft.traits, trait))
          return fail("검 특성을 선택하세요.");
        const fee = craft.fee(sword, price, i);
        if (s.gold < fee) return fail("마감 비용이 부족합니다. 작업 진행은 저장됩니다.");
        s.gold -= fee;
        sword.marks = sword.marks || [];
        sword.marks[i] = trait;
        if (i === 0) {
          const passes = inherit ? s.inheritedRecipe.grind : w.passes;
          if (passes) sword.grind = [...passes];
        }
        sword.level = Math.max(sword.level, stage.target);
        recordWeapon(s);
        delete sword.work;
        return success(
          stage.title +
            (inherit ? " 전승" : " 완료") +
            " · " +
            name(sword) +
            " +" +
            sword.level +
            " · " +
            craft.traits[trait].name,
          "win",
        );
      }
      case "recoverEdge": {
        const w = s.weapon,
          recovery = midRecovery(w);
        if (!recovery || Number(arg) !== recovery.target)
          return fail("현재 검에서 재단조할 수 있는 단계를 확인하세요.");
        if (s.gold < recovery.cost) return fail("재단조 비용이 부족합니다.");
        s.gold -= recovery.cost;
        w.forgePeak = knownPeak(w);
        w.level = recovery.target;
        return success(
          "칼날 재단조 · +14 → +" + w.level + " · " + recovery.cost.toLocaleString() + " G",
          "win",
        );
      }
      case "restorePeak": {
        if (type !== "weapon") return fail("단조 수첩은 검에만 사용할 수 있습니다.");
        const book = enhancementNotebook(s);
        if (!book.canRestore) return fail("이 검이 잃어버린 단계가 없습니다.");
        if (book.clues < book.restoreCost || s.gold < book.restoreGold)
          return fail("복원에 필요한 단서 또는 골드가 부족합니다.");
        s.forgeClues -= book.restoreCost;
        s.gold -= book.restoreGold;
        const old = s.weapon.level;
        s.weapon.level = book.peak;
        return success(
          "기록 복원 · +" + old + " → +" + book.peak + " · 단서 " + book.restoreCost + "개 사용",
          "win",
        );
      }
      case "focusEnhance":
      case "doubleStrike":
      case "enhance": {
        if (g.finalTrial) return fail("진행 중인 마지막 돌파를 마치거나 포기하세요.");
        const double = act === "doubleStrike";
        if (double && (type !== "weapon" || !techniqueAvailable(s, "luck")))
          return fail("쌍타 사용 조건을 확인하세요.");
        if (g.level >= 20) return fail("20강부터는 초월 합성으로 성장합니다.");
        const book = type === "weapon" ? enhancementNotebook(s) : null;
        const focused = act === "focusEnhance";
        if (focused && (!book?.active || book.clues < book.focusCost))
          return fail("집중 강화에는 +17을 달성한 검과 단서 1개가 필요합니다.");
        const protection = enhancementProtection(s, g);
        const guards = protection.active;
        const cost = guards[2] ? 0 : price(g);
        if (s.gold < cost) return fail("골드가 부족합니다. 장비 판매 또는 출석 보상을 이용하세요.");
        const chances = enhancementChances(s, g, focused ? book.bonus : 0);
        if (double) g.seal.uses++;
        if (focused) s.forgeClues -= book.focusCost;
        if (book && book.peak >= 15) g.forgePeak = book.peak;
        s.gold -= cost;
        s.attempts++;
        s.heat = 0;
        if (s.scrollOn && s.scrolls) {
          s.scrolls--;
          if (!s.scrolls) s.scrollOn = false;
        }
        guards.forEach((v, i) => {
          if (v) {
            s.charms[i]--;
            if (!s.charms[i]) s.enabled[i] = false;
          }
        });
        if (random() * 100 < chances.success) {
          const previousStage = bladeStage(g);
          g.level += double ? 2 : 1;
          s.hits++;
          if (type === "weapon") recordWeapon(s);
          const evolved = type === "weapon" && bladeStage(g) > previousStage;
          return success(
            (double ? "쌍타 성공 · " : focused ? "집중 강화 · " : "") +
              name(g, type) +
              " +" +
              g.level +
              (evolved ? " · 검 외형 진화!" : " 강화 성공"),
            "win",
          );
        }
        const mixedFailure = chances.destroy > 0 || (chances.drop > 0 && chances.hold > 0);
        const failureRoll = mixedFailure ? random() * (100 - chances.success) : 0;
        const destroyed = failureRoll < chances.destroy;
        const dropped = !destroyed && failureRoll < chances.destroy + chances.drop;
        // Record the failure before resolving protection or replacing a destroyed sword.
        const note = focused ? " · 단서 1개 사용 후 1개 회수" : book?.active ? " · 단서 +1" : "";
        if (book?.active) s.forgeClues = (s.forgeClues || 0) + 1;
        const harmful = !guards[2] && ((destroyed && !guards[1]) || (dropped && !guards[0]));
        if (type === "weapon" && harmful && g.seal?.escort) {
          g.seal.escort = false;
          return success("수비대 호위 · " + (destroyed ? "파괴" : "하락") + " 방지" + note);
        }
        if (type === "weapon" && harmful && craft.wards(g) > 0) {
          g.spentWards = (g.spentWards || 0) + 1;
          return success(
            "검등 보강 1회 소모 · " +
              (destroyed ? "파괴" : "하락") +
              " 방지 · +" +
              g.level +
              " 유지" +
              note,
          );
        }
        if (destroyed && !protection.destroy) {
          s[type] = freshGear();
          const pattern = type === "weapon" ? breakPattern(g) : null;
          if (pattern) s.weapon.pattern = pattern;
          s.breaks++;
          return success(
            "장비가 파괴되어 순철 장비를 다시 받았습니다." +
              note +
              (pattern ? " · 초벌본 +" + pattern.level + " 회수" : ""),
            "loss",
          );
        }
        if (dropped && !protection.drop) {
          g.level--;
          const recovery = type === "weapon" ? midRecovery(g) : null;
          return success(
            "강화 실패 · +" +
              g.level +
              "로 하락" +
              note +
              (recovery ? " · +" + recovery.target + " 재단조 가능" : ""),
            "loss",
          );
        }
        return success("강화 유지 · +" + g.level + (destroyed || dropped ? " · 가호로 보호" : "") + note, "loss");
      }
      case "guard": {
        const i = Number(arg);
        if (!validIndex(s.charms, i) || !s.charms[i]) return fail("보유한 가호가 없습니다.");
        s.enabled[i] = !s.enabled[i];
        if (i === 2 && s.enabled[2]) s.enabled = [false, false, true];
        if (i < 2 && s.enabled[i]) s.enabled[2] = false;
        return success(blessings[i] + (s.enabled[i] ? " 장착" : " 해제"));
      }
      case "scroll":
        if (!s.scrolls) return fail("주문서가 없습니다.");
        s.scrollOn = !s.scrollOn;
        return success("10% 주문서 " + (s.scrollOn ? "장착" : "해제"));
      case "temperStart":
        s.temperStart = t;
        return { ok: true, message: "", kind: "start" };
      case "temper": {
        const elapsed = t - s.temperStart;
        if (!s.temperStart || elapsed < 0 || elapsed > 15000) {
          s.temperStart = 0;
          return fail("담금질을 다시 시작하세요.");
        }
        const pos = temperPosition(elapsed);
        s.temperStart = 0;
        const good = pos >= 0.55 && pos <= 0.78;
        const w = s.weapon,
          task = routeTask(s);
        let training = "";
        if (good && w.route?.trait === "ward" && task?.open && !task.ready) {
          w.route.progress++;
          training += " · 수련 " + w.route.progress + "/" + task.needed;
        }
        if (
          good &&
          w.seal?.key === "lung" &&
          w.level >= 13 &&
          w.level < 19 &&
          w.seal.uses < 2 &&
          w.seal.beats < 2
        ) {
          w.seal.beats++;
          training += " · 호흡 " + w.seal.beats + "/2";
        }
        s.heat = good ? 5 : 1;
        s.apprentice.tempered = true;
        const gold = good ? 450 : 100;
        s.gold += gold;
        return success(
          (good ? "정밀 타격" : "담금질 완료") +
            " · 다음 강화 +" +
            s.heat +
            "%p · " +
            gold +
            " G" +
            training,
          good ? "win" : "info",
        );
      }
      case "order": {
        const order = orders[s.order];
        if (!order || s.best < order[0]) return fail("목표 강화를 달성하세요.");
        s.gold += order[1];
        s.shards += order[2];
        s.order++;
        return success(
          "의뢰 완료 · " + order[1].toLocaleString() + " G와 별의 파편 " + order[2] + "개",
          "win",
        );
      }
      case "sell": {
        if (g.level < 1) return fail("1강 이상 장비를 판매할 수 있습니다.");
        const value = 300 + Math.round(price(g) * (1 + g.level) * 1.6);
        s.gold += value;
        s[type] = freshGear(chanceGrade());
        return success(
          "장비 판매 +" + value.toLocaleString() + " G · " + name(s[type], type) + " 획득",
        );
      }
      case "keep":
        if (!canStoreWeapon(s.weapon))
          return fail("강화한 무기를 보관하세요.");
        if (s.bag.length >= 20) return fail("보관함이 가득 찼습니다.");
        s.bag.push(s.weapon);
        s.weapon = freshGear();
        return success("무기를 보관했습니다.");
      case "equip": {
        const i = Number(arg);
        if (!validIndex(s.bag, i)) return fail("무기를 선택하세요.");
        const previous = s.weapon;
        s.weapon = s.bag.splice(i, 1)[0];
        if (previous.level || previous.grade || previous.route || previous.seal || previous.pattern)
          s.bag.push(previous);
        return success(name(s.weapon) + " 장착");
      }
      case "deploy": {
        const i = Number(arg);
        if (!validIndex(s.bag, i) || s.bag[i].level < 13)
          return fail("보관한 13강 이상 무기가 필요합니다.");
        if (s.field.length >= 2 + s.imprints.land) return fail("사냥터 슬롯이 가득 찼습니다.");
        s.field.push(s.bag.splice(i, 1)[0]);
        s.apprentice.deployed = true;
        return success("사냥터 배치 · 자동 수익 시작");
      }
      case "recall": {
        const i = Number(arg);
        if (!validIndex(s.field, i) || s.bag.length >= 20)
          return fail("회수할 무기와 빈 보관함 칸이 필요합니다.");
        s.bag.push(s.field.splice(i, 1)[0]);
        return success("보관함으로 무기를 회수했습니다.");
      }
      case "collect": {
        const value = Math.floor(s.unclaimed);
        if (value < 1) return fail("수익이 쌓이면 수령할 수 있습니다.");
        s.gold += value;
        s.unclaimed -= value;
        s.apprentice.collected = true;
        return success("사냥 수익 +" + value.toLocaleString() + " G", "win");
      }
      case "daily":
        if (s.day >= day(t) || s.hunting.daily >= day(t)) return fail("오늘 보상을 이미 받았습니다.");
        s.day = day(t);
        s.hunting.daily = s.day;
        s.hunting.free += hunting.daily;
        if (s.hunting.free >= hunting.cap) s.hunting.rechargeAt = null;
        s.gold += 1000000;
        s.tickets += 5;
        s.tanks++;
        s.charms[0] += 3;
        s.charms[1] += 3;
        return success("출석 · 무료 사냥권 10개, 100만 G, 입장권 5장, 산소통 1개, 가호 2종 각 3개", "win");
      case "tank":
        if (s.gold < 10000000) return fail("산소통은 1,000만 G입니다.");
        s.gold -= 10000000;
        s.tanks++;
        return success("산소통 1개 구입");
      case "huntStart": {
        const w = s.hunting;
        const request = typeof arg === "object" && arg !== null ? arg.request : w.serial + 1;
        if (!Number.isSafeInteger(request) || request < 1) return fail("사냥 시작 요청이 올바르지 않습니다.");
        if (request <= w.serial) {
          if (request === w.lastStart?.request)
            return { ok: true, message: s.hunt?.id === w.lastStart.id ? "진행 중이던 전투입니다." : "이미 처리한 사냥 시작입니다.", receipt: { ...w.lastStart } };
          return fail("이미 처리한 이전 사냥 요청입니다.");
        }
        if (request !== w.serial + 1) return fail("최신 사냥 상태를 다시 확인하세요.");
        if (s.hunt) return fail("이미 교전 중입니다.");
        const rank = Number(typeof arg === "object" && arg !== null ? arg.rank : arg);
        if (!Number.isInteger(rank) || rank < 1 || rank > Math.min(60, s.huntBest + 1))
          return fail("먼저 이전 지역을 토벌하세요.");
        if (w.free + w.purchased < 1) return fail("사냥권이 부족합니다. 10분 충전·오늘의 출석을 확인하거나 대장간과 배치 수익을 이용하세요.");
        const st = stats(s),
          enemyHp = 90 + Math.round(36 * (rank - 1) ** 1.65);
        const enemy = huntEnemy(rank);
        const task = routeTask(s);
        const source = w.free > 0 ? "free" : "purchased";
        w[source]--;
        if (w.free < hunting.cap && w.rechargeAt === null) w.rechargeAt = w.observedAt;
        w.serial = request;
        w.lastStart = { request, id: w.id + "-" + request, rank, source };
        s.huntNumber = (s.huntNumber || 0) + 1;
        if (s.weapon.route?.trait === "edge" && task?.open && rank >= task.needed)
          s.weapon.route.hunt = s.huntNumber;
        s.hunt = {
          id: w.lastStart.id,
          request,
          ticketSource: source,
          number: s.huntNumber,
          rank,
          enemyKind: enemy.kind,
          turn: 1,
          hp: st.hp,
          maxHp: st.hp,
          attack: st.attack,
          guardReduction: craft.grindBonus(s.weapon.grind, 0),
          enemyHp,
          enemyMax: enemyHp,
          enemyAttack: 20 + 9 * rank,
          counter: false,
          momentum: 1,
          ripostes: 0,
          last: enemy.name + " 출현 · " + enemy.trait,
        };
        return { ...success("이끼숲 " + rank + "구역 사냥 시작 · 사냥권 1개 사용"), receipt: { ...w.lastStart } };
      }
      case "flee":
        if (!s.hunt) return fail("교전 중인 적이 없습니다.");
        s.hunt = null;
        return success("숲길에서 안전하게 퇴각했습니다. 사용한 사냥권은 반환되지 않습니다.");
      case "strike":
      case "heavyStrike":
      case "block": {
        const h = s.hunt;
        if (!h) return fail("먼저 사냥을 시작하세요.");
        const charge = huntCharge(h),
          block = act === "block";
        const move = huntMove(h, act);
        if (!move.available) return fail("2구역부터 기세 2칸으로 강공을 사용할 수 있습니다.");
        const { damage, taken } = move;
        h.momentum = move.momentum;
        const impact = {
          kind: block ? (charge ? "parry" : "block") : h.counter ? "counter" : "slash",
          damage: Math.min(h.enemyHp, damage),
          taken: 0,
        };
        if (!block && h.counter) h.ripostes = (h.ripostes || 0) + 1;
        h.enemyHp = Math.max(0, h.enemyHp - damage);
        if (!h.enemyHp) {
          const base = 800 * h.rank * h.rank;
          const bonus = h.ripostes ? base / 4 : 0;
          const chest = awardChest(s, "forest", h.rank, base, bonus, int);
          s.lastHunt = {
            id: h.id, ticketSource: h.ticketSource,
            health: huntHealth(h),
            rank: h.rank,
            enemyKind: huntEnemy(h).kind,
            turns: h.turn,
            damageTaken: h.maxHp - h.hp,
            ripostes: h.ripostes || 0,
            chestId: chest.id,
            reward: chest.gold,
            bonus,
          };
          s.huntBest = Math.max(s.huntBest, h.rank);
          const route = s.weapon.route;
          const trained =
            route?.trait === "edge" && h.number && route.hunt === h.number && route.progress === 0;
          if (trained) route.progress = 1;
          s.hunt = null;
          return {
            ...success(
              "토벌 성공 · 보물상자 발견" +
                (trained ? " · 전승 수련 달성" : ""),
              "win",
            ),
            impact,
          };
        }
        impact.taken = Math.min(taken, h.hp);
        h.hp = Math.max(0, h.hp - taken);
        h.counter = block && charge;
        if (!h.hp) {
          s.lastHunt = {
            id: h.id, ticketSource: h.ticketSource,
            health: huntHealth(h),
            rank: h.rank,
            enemyKind: huntEnemy(h).kind,
            turns: h.turn,
            damageTaken: h.maxHp,
            ripostes: h.ripostes || 0,
            reward: 0,
            bonus: 0,
          };
          s.hunt = null;
          return { ...success("사냥 실패 · 장비를 챙겨 야영지로 돌아왔습니다.", "loss"), impact };
        }
        h.turn++;
        h.last =
          (h.counter ? "돌진 방어 · 다음 공격 2.5배" : block ? "방어 태세" : (act === "heavyStrike" ? "강공 " : "타격 ") + damage) +
          " · 받은 피해 " +
          taken;
        return { ok: true, message: h.last, kind: h.counter ? "win" : "info", impact };
      }
      case "air": {
        if (s.dive?.fever) return fail("피버 탐사는 산소통 한 개로 진행합니다.");
        if (!s.dive || !s.tanks) return fail("탐사 중에 여분 산소통을 사용할 수 있습니다.");
        s.tanks--;
        s.dive.oxygen += 100 + 10 * s.imprints.lung;
        s.dive.capacity = Math.max(s.dive.capacity || 0, s.dive.oxygen);
        return success("산소통 연결 · 탐사를 이어갑니다.");
      }
      case "surface":
        if (!s.dive) return fail("탐사가 진행 중이지 않습니다.");
        s.dive = null;
        return success("채굴한 광물을 가지고 복귀했습니다.");
      case "dive": {
        if (s.dive || s.autoMine) return fail("진행 중인 탐사를 먼저 마치세요.");
        if (!canDive(s.weapon))
          return fail("19강 무기 또는 레어 이상 무기를 장착하세요.");
        if (!s.tanks) return fail("산소통이 필요합니다.");
        s.tanks--;
        const oxygen = 100 + 10 * s.imprints.lung;
        const fever = s.fever >= mining.feverCost;
        if (fever) s.fever -= mining.feverCost;
        s.dive = { depth: 1000, oxygen, capacity: oxygen, fever };
        return success(fever ? "피버 발동 · 이번 탐사 드롭 보상 10배" : "수심 1,000 m에서 탐사를 시작합니다.");
      }
      case "mine": {
        if (!s.dive) return fail("먼저 탐사를 시작하세요.");
        const d = s.dive;
        d.capacity ??= Math.max(d.oxygen, 100 + 10 * s.imprints.lung);
        d.depth += 50;
        d.oxygen -= 10;
        const loot = miningLoot(d.depth, d.fever ? mining.feverMultiplier : 1, random);
        addMiningLoot(s, loot);
        const i = loot.ore.findIndex(q => q > 0);
        const qty = loot.ore[i];
        let bonus = d.fever ? " · 피버 ×10" : "";
        if (loot.shards) bonus += " · 별의 파편 +" + loot.shards;
        if (loot.charms.some(Boolean)) bonus += " · 가호 +" + loot.charms.reduce((a, b) => a + b, 0);
        if (loot.marks) bonus += " · 길드 징표 +" + loot.marks;
        if (loot.stones) bonus += " · 전설 제련석 +" + loot.stones;
        if (d.oxygen <= 0) {
          s.dive = null;
          bonus += " · 지상 복귀";
        }
        return success(d.depth + " m · " + oreNames[i] + " ×" + qty + bonus);
      }
      case "autoMine": {
        if (s.dive || s.autoMine) return fail("진행 중인 탐사를 먼저 마치세요.");
        if (!canDive(s.weapon)) return fail("19강 무기 또는 레어 이상 무기를 장착하세요.");
        const count = Number(arg);
        if (!Number.isInteger(count) || count < 1 || count > mining.maxTanks || count > s.tanks)
          return fail("보유 산소통 안에서 1~500개를 선택하세요.");
        const steps = Math.floor((100 + 10 * s.imprints.lung) / 10);
        s.tanks -= count;
        s.autoMine = {
          total: count, limit: count, completed: 0, started: t,
          steps, tankMs: steps * mining.stepMs,
          seed: Math.floor(random() * 4294967296) >>> 0,
          loot: { ore: Array(8).fill(0), charms: [0, 0, 0], shards: 0, marks: 0, stones: 0 },
        };
        return success("자동 탐사 시작 · 산소통 " + count + "개 예약");
      }
      case "stopAutoMine": {
        const job = s.autoMine;
        if (!job) return fail("진행 중인 자동 탐사가 없습니다.");
        if (job.stopping) return fail("사용 중인 산소통을 마치고 복귀합니다.");
        job.stopping = true;
        const limit = job.completed + 1;
        const refund = job.limit - limit;
        s.tanks += refund;
        job.limit = limit;
        return success("현재 산소통을 마치고 복귀 · 남은 " + refund + "개 반환");
      }
      case "market": {
        const value = s.ore.reduce((n, q, i) => n + q * marketPrice(i, t), 0);
        if (!value) return fail("판매할 광물이 없습니다.");
        s.gold += value;
        s.ore.fill(0);
        return success("광물 판매 +" + value.toLocaleString() + " G", "win");
      }
      case "altar":
        if (!s.shards) return fail("별의 파편이 부족합니다.");
        s.shards--;
        g.star = type === "armor" ? int(400, 1200) : int(200, 600);
        return success(
          "별의 제단 · " + (type === "armor" ? "체력" : "공격력") + " +" + g.star,
          "win",
        );
      case "rebirth": {
        if (s.weapon.level !== 20) return fail("20강 무기를 장착하세요.");
        const choices = s.weapon.marks || [];
        if (choices.length && arg !== "keep") {
          const index = arg === "" || arg == null ? 0 : Number(arg);
          if (!Number.isInteger(index) || !craft.stages[index] || !craft.traits[choices[index]])
            return fail("전승할 공정을 선택하세요.");
          s.inheritedRecipe = { index, trait: choices[index] };
          if (index === 0 && s.weapon.grind) s.inheritedRecipe.grind = [...s.weapon.grind];
        }
        const pts = [20, 60, 200, 600][s.weapon.grade];
        if (!s.rebirths) {
          if (!s.story) s.story = story.restore(s);
          s.story.firstGift = { points: pts, trait: s.inheritedRecipe?.trait || null };
        }
        s.souls += pts;
        s.lifeSouls += pts;
        s.rebirths += pts / 20;
        s.weapon = freshGear();
        s.armor = freshGear();
        return success("환생 완료 · 영혼 포인트 +" + pts, "win");
      }
      case "imprint": {
        if (!Object.prototype.hasOwnProperty.call(imprints, arg)) return fail("각인을 선택하세요.");
        const def = imprints[arg],
          level = s.imprints[arg],
          cost = imprintCost(s, arg);
        if (level >= def[3] || s.souls < cost)
          return fail("영혼 포인트가 부족하거나 최대 단계입니다.");
        s.souls -= cost;
        s.imprints[arg]++;
        return success(def[0] + " 각인 Lv." + s.imprints[arg], "win");
      }
      case "fastTower": {
        if (s.towerRun) return fail("고속 등반이 진행 중입니다.");
        if (!s.tickets) return fail("입장권이 필요합니다.");
        s.tickets--;
        s.towerRun = { startFloor: s.tower, cleared: 0, chests: [],
          attributes: stats(s), nextAt: t + 1000, started: t, battle: null };
        return success("고속 등반 시작 · 입장권 1장 사용");
      }
      case "fastTowerStep": {
        const run = s.towerRun;
        if (!run || t < run.nextAt) return fail("");
        const fight = towerBattle(s.tower, false, run.attributes);
        run.battle = fight;
        run.nextAt = t + 1000;
        if (fight.win) {
          const chest = awardChest(s, "tower", s.tower, 0, 0, int);
          run.chests.push(chest.id);
          run.cleared++;
          s.tower++;
        } else finishTowerRun(s, "defeat", t);
        return { ok: true, kind: fight.win ? "win" : "loss" };
      }
      case "stopTower":
        if (!s.towerRun) return fail("진행 중인 고속 등반이 없습니다.");
        finishTowerRun(s, "stopped", t);
        return success("등반 중단 · 획득한 상자는 보관함에 보관됩니다.");
      case "openTowerChests": {
        const run = s.towerRun || s.lastTowerRun;
        const ids = new Set(run?.chests || []);
        const chests = s.chests.filter(c => ids.has(c.id));
        if (!chests.length) return fail("열 수 있는 등반 상자가 없습니다.");
        const receipt = { source: "tower", rank: chests[0].rank, rankEnd: chests.at(-1).rank,
          name: "등반 보물상자 " + chests.length + "개", tier: Math.max(...chests.map(c => c.tier)),
          gold: 0, shards: 0, scrolls: 0, charms: [0, 0, 0] };
        for (const chest of chests) {
          for (const key of ["gold", "shards", "scrolls"]) receipt[key] += chest[key];
          chest.charms.forEach((n, i) => { receipt.charms[i] += n; });
        }
        for (const key of ["gold", "shards", "scrolls"]) s[key] += receipt[key];
        receipt.charms.forEach((n, i) => { s.charms[i] += n; });
        s.chests = s.chests.filter(c => !ids.has(c.id));
        s.lastChest = receipt;
        return success("등반 상자 " + chests.length + "개 개봉", "win");
      }
      case "tower":
      case "trial": {
        const tr = act === "trial", trial = s.trial;
        if (tr && (trial.choices.length || trial.done))
          return fail("보상을 선택하거나 처음부터 도전하세요.");
        if (!tr && s.towerRun) return fail("고속 등반을 먼저 마치세요.");
        if (!tr && !s.tickets) return fail("입장권이 필요합니다. 오늘의 출석 보상을 확인하세요.");
        if (!tr) s.tickets--;
        const f = tr ? trial.floor : s.tower;
        const fight = towerBattle(f, tr, stats(s, tr));
        const { win, turns, timedOut } = fight;
        let message = f + "층 · " + turns + "턴 " + (win ? "승리" : timedOut ? "제한 초과 · 패배" : "패배");
        let chest;
        if (win && tr) {
          trial.best = Math.max(trial.best, f);
          trial.choices = [
            { type: "attack", amount: int(500, 1600) },
            { type: "hp", amount: int(3000, 10000) },
            trial.claimed.includes(f)
              ? { type: "attack", amount: int(600, 1700) }
              : { type: "shards", amount: int(1, 4) },
          ];
        } else if (win) {
          s.tower++;
          chest = awardChest(s, "tower", f, 0, 0, int);
          message += " · 보물상자 발견";
        }
        const result = success(message, win ? "win" : "loss");
        result.battle = fight;
        if (chest) result.battle.chestId = chest.id;
        return result;
      }
      case "reward": {
        const tr = s.trial,
          i = Number(arg);
        if (!validIndex(tr.choices, i)) return fail("보상을 선택하세요.");
        const c = tr.choices[i];
        if (c.type === "shards") {
          s.shards += c.amount;
          tr.claimed.push(tr.floor);
        } else tr.buffs[c.type] += c.amount;
        tr.choices = [];
        if (tr.floor === 100) tr.done = true;
        else tr.floor++;
        return success("시련 보상을 받았습니다.", "win");
      }
      case "restart":
        s.trial = { ...freshTrial(), claimed: s.trial.claimed, best: s.trial.best };
        return success("1층부터 다시 도전합니다.");
      case "shop": {
        const i = Number(arg),
          cost = [20, 10, 60, 30][i];
        if (!cost || s.points < cost) return fail("상점 포인트가 부족합니다.");
        if (i === 3 && s.relics.length >= 20) return fail("유물 보관함이 가득 찼습니다.");
        s.points -= cost;
        if (i === 3) {
          if (random() < 0.2) return success("이번 뽑기에서는 유물이 나오지 않았습니다.");
          addRelic(s, int(1, 4));
        } else s.charms[i]++;
        return success(i === 3 ? "유물을 획득했습니다." : blessings[i] + " 구입", "win");
      }
      case "relic": {
        const i = Number(arg);
        if (!validIndex(s.relics, i)) return fail("유물을 선택하세요.");
        s.equippedRelic = i;
        return success("대표 유물을 지정했습니다.");
      }
      case "polish": {
        const r = s.relics[s.equippedRelic];
        if (!r || !s.shards || r.tries >= 10)
          return fail("대표 유물, 별의 파편, 남은 시도가 필요합니다.");
        s.shards--;
        r.tries++;
        if (random() < 0.6) {
          r.power = Math.round(r.power * 1.3 * 10) / 10;
          return success("유물 강화 성공", "win");
        }
        return success("유물 강화 실패", "loss");
      }
      case "guild": {
        if (s.guild || s.marks < 10 || s.gold < 3000000000)
          return fail("길드 창설에는 징표 10개와 30억 G가 필요합니다.");
        const n = String(arg).trim();
        if (!/^[가-힣a-zA-Z0-9]{2,12}$/.test(n))
          return fail("길드명은 공백 없이 한글·영문·숫자 2~12자입니다.");
        s.gold -= 3000000000;
        s.marks -= 10;
        s.guild = { name: n, raids: 0, last: "" };
        return success("길드를 창설했습니다.");
      }
      case "raid": {
        if (!s.guild || s.guild.last === day(t))
          return fail("하루 한 번 길드 레이드에 도전할 수 있습니다.");
        s.guild.last = day(t);
        const damage = stats(s, false, true).attack * 10;
        s.guild.raids++;
        s.gold += damage * 100;
        s.points += 200;
        if (s.relics.length < 20) addRelic(s, int(1, 4));
        return success("레이드 피해 " + damage.toLocaleString() + " · 200 P 획득", "win");
      }
      case "fuse": {
        const a = s.weapon,
          l = a.level,
          i = s.bag.findIndex((b) => b.level === l && b.grade === 3),
          idx = l - 20;
        if (s.rebirths < 2000 || a.grade !== 3 || idx < 0 || idx > 4 || i < 0)
          return fail("환생 2,000회와 같은 단계 전설 무기 2개가 필요합니다.");
        const cost = [150e9, 300e9, 1e12, 2e12, 4e12][idx],
          stones = 10 * (idx + 1),
          souls = 5 * (idx + 1);
        if (s.gold < cost || s.stones < stones || s.souls < souls)
          return fail("골드, 전설 제련석 또는 영혼 포인트가 부족합니다.");
        s.gold -= cost;
        s.stones -= stones;
        s.souls -= souls;
        const roll = random() * 100,
          rate = [0.5, 0.35, 0.2, 0.1, 0.05][idx];
        if (roll < rate) {
          a.level++;
          s.best = Math.max(s.best, a.level);
          s.bag.splice(i, 1);
          return success("초월 성공 · +" + a.level, "win");
        }
        if (roll < rate + 15) {
          s.bag.splice(i, 1);
          return success("초월 실패 · 보조 무기가 파괴되었습니다.", "loss");
        }
        return success("초월 실패 · 두 무기가 유지되었습니다.", "loss");
      }
      default:
        return fail("알 수 없는 행동입니다.");
    }
  }
  function addRelic(s, base) {
    s.relics.push({ power: base, tries: 0 });
    if (s.equippedRelic < 0) s.equippedRelic = 0;
  }
  function marketPrice(i, t) {
    const period = Math.floor((t + 32400000) / 28800000);
    return Math.round(orePrices[i] * (1.25 + 0.7 * Math.sin(period * 1.6 + i * 2.1)));
  }
  function temperPosition(elapsed) {
    return 1 - Math.abs((elapsed % 1800) / 900 - 1);
  }
  return {
    hunting, settleHunting, huntingStatus, resetProgress,
    migrateTraining,
    reforgeOptions,
    breakPattern,
    journeys,
    techniques,
    routeTask,
    imprintCost,
    techniqueAvailable,
    enhancementNotebook,
    midRecovery,
    huntCharge,
    huntEnemy,
    canStoreWeapon,
    canDive,
    mining,
    towerReward,
    towerRewards,
    huntMove,
    orders,
    bladeStage,
    temperPosition,
    fresh,
    settle,
    perform,
    stats,
    price,
    odds,
    enhancementChances,
    baseSwordChances,
    nextEnhancementChances,
    perMinute,
    day,
    name,
    grades,
    blessings,
    oreNames,
    marketPrice,
    bosses,
    imprints,
  };
})();
if (typeof module !== "undefined") module.exports = Game;
