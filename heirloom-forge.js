"use strict";
const HeirloomForge = (() => {
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
  const grades = ["일반", "레어", "에픽", "전설"];
  const imprints = ["사냥꾼의 몫", "호흡 단조", "쌍타", "전승 수련"];
  const arts = ["돌진 받아치기", "몰아베기", "버티는 검등", "되받는 칼끝"];
  const bladeTraits = ["받아치는 칼날", "마무리 날", "끈질긴 검등", "기세를 품은 홈"];
  const armorTraits = ["충격 분산", "겹댄 안감", "숨 고르기"];
  const processes = ["칼날 연마", "시검", "이중 담금질"];
  const options = [
    ["예리한 날", "보강한 검등"],
    ["받아치기", "몰아치기"],
    ["물 담금질", "기름 담금질"],
  ];
  const armorProcesses = ["철판 성형", "착용 시험", "이중 담금질"];
  const armorOptions = [
    ["가벼운 철판", "보강 철판"],
    ["충격 흡수", "관절 보강"],
    ["물 담금질", "기름 담금질"],
  ];
  function workNames(g) {
    return g.type === "armor" ? armorOptions : options;
  }
  function processNames(g) {
    return g.type === "armor" ? armorProcesses : processes;
  }
  const stages = [7, 9, 11];
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
  const step = (type, n) => (100 + 10 * n) / (type === "armor" ? 2 : 1);
  function cost(type, from, to, cap) {
    if (to <= from) return 0;
    const jump = Math.min(cap, to);
    const first = jump > from ? step(type, jump) : 0;
    const start = Math.max(from, jump);
    return first + ((to - start) * (step(type, start + 1) + step(type, to))) / 2;
  }
  function gear(type, name, n = 0, grade = 0) {
    return {
      type,
      name,
      n,
      grade,
      work: [],
      history: [],
      scars: 0,
      broken: false,
      damage: false,
      invested: 0,
      training: 0,
      peak: n,
      trait: 0,
    };
  }
  function fresh(slot, now = Date.now()) {
    const s = {
      version: 1,
      revision: 0,
      gold: 1000,
      xp: 0,
      bundles: 0,
      free: 30,
      charge: now,
      attendance: "",
      weapon: gear("weapon", "잔불"),
      armor: gear("armor", "잿빛 갑옷"),
      spare: null,
      recipes: [],
      souls: 0,
      stones: 0,
      known: [],
      active: [],
      arts: [],
      equipped: [],
      mastery: [0, 0, 0, 0],
      best: 0,
      records: [],
      hunt: null,
      journal: [],
      seen: [],
      protection: false,
    };
    if (slot !== "journey") {
      check(["base", "blade", "plate"].includes(slot), "알 수 없는 여정입니다.");
      s.gold = 1540000;
      s.xp = xpAt(25);
      s.best = 30;
      s.bundles = 5;
      s.stones = 6;
      s.weapon = gear("weapon", "잔불", 2000, 3);
      s.armor = gear("armor", "잿빛 갑옷", 1700, 3);
      for (const g of [s.weapon, s.armor]) g.work = [0, 0, 0];
      if (slot !== "base") {
        const g = slot === "blade" ? s.weapon : s.armor,
          to = slot === "blade" ? 2075 : 1871;
        const paid = cost(g.type, g.n, to, 0);
        s.gold -= paid;
        g.n = g.peak = to;
        g.invested = paid;
      }
    }
    return s;
  }
  function check(ok, msg) {
    if (!ok) throw Error(msg);
  }
  function note(s, text) {
    s.journal.unshift(text);
    s.journal.length = Math.min(40, s.journal.length);
    return text;
  }
  function pay(s, amount) {
    check(s.gold >= amount, "골드가 부족합니다.");
    s.gold -= amount;
  }
  function item(s, key) {
    check(["weapon", "armor", "spare"].includes(key) && s[key], "장비를 선택하세요.");
    return s[key];
  }
  function band(g) {
    return g.n < 20 ? 0 : g.n < 200 ? 1 : g.n < 1000 ? 2 : 3;
  }
  function risk(s, g) {
    return Math.max(0, 10 - 2 * s.mastery[band(g)]);
  }
  function ceiling(g) {
    if (g.work.length < 3) return stages[g.work.length];
    if (g.grade === 0 && g.n < 19) return 19;
    return thresholds[g.grade] ?? limit;
  }
  function learn(s, g, newProcess = false) {
    if (!s.bundles) return;
    const used = s.bundles;
    s.bundles = 0;
    const xp = Math.floor(used * 10 * (newProcess && s.active.includes(3) ? 1.25 : 1));
    s.xp += xp;
    if (g.n > g.peak) {
      g.training += xp;
      g.peak = g.n;
    }
  }
  function record(s, g, message) {
    g.history.push(message);
    return note(s, g.name + " · " + message);
  }
  function forge(s, key, target, bold, random = Math.random) {
    const g = item(s, key);
    check(!s.hunt && !g.broken && !g.damage, "사냥을 마치거나 장비를 복원하세요.");
    const cap = smith(s.xp).cap;
    check(
      Number.isInteger(target) && target > g.n && (target <= ceiling(g) || (!bold && target <= cap)),
      "다음 공정이나 승급을 먼저 마치세요.",
    );
    check(target < limit || (!bold && g.n === limit - 1), "마지막 한 단계는 직접 안전 재련하세요.");
    const fee = cost(g.type, g.n, target, smith(s.xp).cap);
    pay(s, fee);
    g.invested += fee;
    const b = band(g),
      chance = risk(s, g),
      roll = bold ? random() * 100 : 100;
    if (bold && roll < 20 + chance) {
      if (roll < chance && !s.protection) {
        g.broken = true;
        const newWork = target > g.peak ? s.bundles * 10 : 0;
        const bonus = Math.floor((g.training + newWork) / 2);
        s.xp += s.bundles * 10 + bonus;
        s.bundles = 0;
        g.training = 0;
        g.peak = Math.max(g.peak, target);
        return record(s, g, "+" + g.n + " 파괴 · 깨달음 +" + bonus + " XP");
      }
      if (roll < chance) s.protection = false;
      g.damage = true;
      return record(s, g, "+" + g.n + " 제련 손상");
    }
    const gain = target - g.n;
    g.n = bold ? Math.min(ceiling(g), limit - 1, target + gain * (s.active.includes(2) ? 2 : 1)) : target;
    const first = !s.seen.includes("공정" + b);
    learn(s, g, first);
    g.peak = Math.max(g.peak, g.n);
    if (bold || first) {
      s.mastery[b] = Math.min(5, s.mastery[b] + 1);
      if (first) s.seen.push("공정" + b);
    }
    if (g.n === limit) return record(s, g, "마지막 망치질 · +9,999 완성");
    return note(s, g.name + " +" + g.n + " · " + fee.toLocaleString("ko-KR") + " G");
  }
  function process(s, key, choice) {
    const g = item(s, key),
      i = g.work.length;
    check(
      !g.broken && !g.damage && i < 3 && g.n >= stages[i] && [0, 1].includes(choice),
      "지금은 이 공정을 진행할 수 없습니다.",
    );
    g.work.push(choice);
    const signature = g.type + i + choice;
    learn(s, g, !s.seen.includes(signature));
    if (!s.seen.includes(signature)) s.seen.push(signature);
    const b = band(g),
      inherited = s.recipes.includes(recipeName(g, i));
    s.mastery[b] = Math.min(5, s.mastery[b] + (inherited ? 2 : 1));
    return record(s, g, processNames(g)[i] + " · " + workNames(g)[i][choice]);
  }
  function promote(s, key, choice = 0) {
    const g = item(s, key),
      need = [0, 5, 15][g.grade];
    check(
      !g.broken && !g.damage && g.work.length === 3 && g.n >= thresholds[g.grade] && s.best >= need,
      "공정·강화·우두머리 조건을 확인하세요.",
    );
    check(
      Number.isInteger(choice) && choice >= 0 && choice < (g.type === "armor" ? 3 : 4),
      "특성을 선택하세요.",
    );
    g.grade++;
    if (g.grade === 2) g.trait = choice;
    const mark =
      g.grade === 1
        ? options[2][g.work[2]]
        : g.grade === 2
          ? "첫 우두머리의 " +
            (g.type === "armor" ? "가죽" : "엄니") +
            " · " +
            (g.type === "armor" ? armorTraits : bladeTraits)[choice]
          : "전설의 무늬";
    return record(s, g, grades[g.grade] + " 승급 · " + mark);
  }
  function make(s, type, n) {
    check(!s.spare, "현재 보조 장비를 먼저 납품하거나 전승하세요.");
    check(
      ["weapon", "armor"].includes(type) && Number.isInteger(n) && n >= 0 && n <= smith(s.xp).cap,
      "즉시 제작 상한을 확인하세요.",
    );
    const fee = step(type, n);
    pay(s, fee);
    s.spare = gear(type, type === "armor" ? "공방 갑옷" : "공방 검", n);
    s.spare.invested = fee;
    return note(s, s.spare.name + " +" + n + " 제작");
  }
  function mend(s, key) {
    const g = item(s, key);
    check(g.broken || g.damage, "복원할 장비를 선택하세요.");
    const fee = step(g.type, g.n) * (g.broken ? 2 : 1);
    pay(s, fee);
    g.broken = false;
    g.damage = false;
    g.scars++;
    return record(s, g, "+" + g.n + " 복원 · " + g.scars + "번째 이음선");
  }
  function deliver(s) {
    const g = item(s, "spare");
    check(!g.broken && !g.damage, "먼저 복원하세요.");
    const value = Math.floor(g.invested * 0.7);
    s.gold += value;
    s.spare = null;
    return note(s, "납품 +" + value + " G");
  }
  function recipeName(g, i) {
    return (g.type === "armor" ? "갑옷" : "검") + " · " + workNames(g)[i][g.work[i]];
  }
  function rebirth(s, index, imprint) {
    const g = item(s, "spare");
    check(
      !g.broken && !g.damage && g.grade >= 1 && s.weapon.n >= 200,
      "대표 검 +200, 직접 공정을 마친 레어 보조 장비가 필요합니다.",
    );
    check(
      Number.isInteger(index) &&
        index >= 0 &&
        index < g.work.length &&
        Number.isInteger(imprint) &&
        imprint >= 0 &&
        imprint < 4,
      "전승 공정과 각인을 선택하세요.",
    );
    const recipe = recipeName(g, index);
    check(!s.recipes.includes(recipe), "이미 전승한 제작법입니다.");
    pay(s, 25000 * (s.recipes.length + 1));
    s.recipes.push(recipe);
    s.souls += 20;
    if (!s.known.includes(imprint)) s.known.push(imprint);
    if (!s.active.length) s.active.push(imprint);
    s.spare = null;
    return note(s, "환생 · " + recipe + " · 영혼 +20");
  }
  const fusionLevels = [1000, 3800, 6500, 8800],
    fusionFees = [600000, 1600000, 2800000, 4000000];
  function fuse(s, random = Math.random) {
    const g = item(s, "spare"),
      i = s.arts.length;
    check(
      i < 4 &&
        s.weapon.grade === 3 &&
        !s.weapon.broken &&
        !s.weapon.damage &&
        s.weapon.n >= fusionLevels[i] &&
        g.grade === 3 &&
        g.type === "weapon" &&
        !g.broken &&
        !g.damage &&
        !s.arts.includes(g.trait),
      "대표 검 단계와 다른 특성의 보조 전설 검을 확인하세요.",
    );
    check(s.stones >= i + 1 && s.souls >= 5, "제련석 또는 영혼이 부족합니다.");
    pay(s, fusionFees[i]);
    s.stones -= i + 1;
    s.souls -= 5;
    if (i && random() < 0.2) {
      const lost = random() < 0.25;
      if (lost) s.spare = null;
      return note(s, "초월 실패 · 보조 검 " + (lost ? "소실" : "유지"));
    }
    s.arts.push(g.trait);
    if (s.equipped.length < 2) s.equipped.push(g.trait);
    s.spare = null;
    return record(s, s.weapon, "초월 · " + arts[g.trait] + " 무늬");
  }
  function toggle(s, which, value) {
    const mark = which === "mark",
      known = mark ? s.known : s.arts,
      list = mark ? s.active : s.equipped;
    check(known.includes(value), "먼저 배워야 합니다.");
    const idx = list.indexOf(value);
    if (idx >= 0) list.splice(idx, 1);
    else {
      check(list.length < (mark && s.recipes.length < 3 ? 1 : 2), "장착 중인 항목을 먼저 해제하세요.");
      list.push(value);
    }
    if (mark && !list.includes(1)) s.protection = false;
    return note(s, "장착 변경");
  }
  function prepare(s) {
    check(s.active.includes(1) && !s.protection, "호흡 단조 각인이 필요합니다.");
    check(s.bundles > 0, "담금질에 사냥 재료 1묶음이 필요합니다.");
    s.bundles--;
    s.protection = true;
    return note(s, "정밀 담금질 · 파괴 1회 완화");
  }
  return {
    limit,
    grades,
    imprints,
    arts,
    bladeTraits,
    armorTraits,
    processNames,
    workNames,
    stages,
    thresholds,
    xpAt,
    smith,
    step,
    cost,
    fresh,
    check,
    note,
    band,
    risk,
    ceiling,
    forge,
    process,
    promote,
    make,
    mend,
    deliver,
    rebirth,
    fuse,
    toggle,
    prepare,
    fusionFees,
    fusionLevels,
  };
})();
if (typeof module !== "undefined") module.exports = HeirloomForge;
