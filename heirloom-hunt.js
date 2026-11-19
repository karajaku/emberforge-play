"use strict";
const HeirloomHunt = (() => {
  const F = typeof module !== "undefined" ? require("./heirloom-forge.js") : HeirloomForge;
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
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
  const turnMs = 2000;
  function area(rank) {
    F.check(Number.isInteger(rank) && rank >= 1 && rank <= 60, "사냥터를 선택하세요.");
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
      prize: Math.round(g / expectedWins),
      name: rank === 30 ? "황금엄니 토벌" : trail.region(rank).name,
    };
  }
  function recharge(s, now) {
    if (s.externalWallet) return;
    if (s.free >= 30) {
      s.charge = now;
      return;
    }
    const add = Math.max(0, Math.floor((now - s.charge) / 600000));
    s.free = Math.min(30, s.free + add);
    s.charge = s.free === 30 ? now : s.charge + add * 600000;
  }
  function kit(s, type) {
    if (!s[type].broken) return s[type];
    return s.spare?.type === type && !s.spare.broken
      ? s.spare
      : { n: 0, damage: false, trait: -1, grade: 0, work: [] };
  }
  function start(s, rank, seed, now = Date.now()) {
    F.check(!s.hunt, "진행 중인 사냥이 있습니다.");
    const zone = area(rank);
    F.check(rank <= s.best + 1, "앞 구역을 먼저 완료하세요.");
    recharge(s, now);
    F.check(s.free > 0, "무료 사냥권 충전을 기다려 주세요.");
    s.free--;
    const sword = kit(s, "weapon"),
      plate = kit(s, "armor");
    const strength = (g, rec) => Math.min(4, Math.max(0.15, (g.n + 45) / (rec + 45))) * (g.damage ? 0.85 : 1);
    const attack = strength(sword, zone.w),
      rawDefense = strength(plate, zone.a);
    // Once armor reliably survives a charge, further investment mostly helps in the next area.
    const defense =
      rawDefense <= 1.1 ? rawDefense : 1.1 + 0.013 * (1 - Math.exp(-(rawDefense - 1.1) / 0.013));
    const pack = trail.lineup(rank);
    if (rank === 30) pack[pack.length - 1] = "tusk";
    const h = (s.hunt = {
      rank,
      seed: seed >>> 0,
      pack,
      wave: 0,
      turn: 0,
      turns: 0,
      attack,
      defense,
      hp: 100,
      maxHp: 100,
      plate: plate.grade >= 2 ? plate.trait : -1,
      arts: [...s.equipped],
      blade: sword.grade >= 2 ? sword.trait : -1,
      work: sword.work,
      armorWork: plate.work,
      carry: false,
      riposte: false,
      guarded: false,
      escapedDeath: false,
      bonus: s.active.includes(0),
      log: "사냥을 시작했습니다.",
    });
    if (s.weapon.broken) h.arts = [];
    h.force = 0.929 * (0.55 + rand(h));
    enter(h);
    return h.log;
  }
  function rand(h) {
    h.seed = (Math.imul(h.seed, 1664525) + 1013904223) >>> 0;
    return h.seed / 4294967296;
  }
  function enter(h) {
    h.turn = 0;
    h.enemyHp = h.enemyMax = (h.wave === 2 ? 122 : 94) * (0.94 + 0.12 * rand(h));
    h.escapedDeath = false;
    h.riposte = false;
    h.guarded = false;
    if (h.wave > 0 && h.plate === 2) h.hp = Math.min(h.maxHp, h.hp + 7);
  }
  function warning(h) {
    return h.turn === 0 || (h.turn + 1) % 4 === 0;
  }
  function policy(h) {
    if (warning(h)) return "guard";
    if (h.riposte) return h.arts.includes(3) ? "heavy" : "counter";
    if (h.arts.includes(1) && h.enemyHp < h.enemyMax * 0.3) return "heavy";
    return "strike";
  }
  function turn(s, action) {
    const h = s.hunt;
    F.check(
      h && ["guard", "counter", "strike", "heavy"].includes(action),
      "진행 중인 전투 행동을 선택하세요.",
    );
    const danger = warning(h),
      guard = action === "guard",
      boss = h.wave === 2;
    const actual = action === "counter" && !h.riposte ? "strike" : action;
    const foe = trail.enemy(h.rank, h.pack[h.wave]),
      enemy = foe.name;
    h.turn++;
    h.turns++;
    let hit =
      ((boss ? 1.1 : 1) * (h.turn === 1 ? 40 : danger ? 4 : 1) * h.force) / (1 + 0.23 * (h.defense ** 4 - 1));
    if (foe.skill === "fang" && !danger) hit *= 1.25;
    if (foe.skill === "crush" && danger && !guard) hit *= 1.22;
    if (foe.skill === "breath" && h.turn > 4) hit *= 1.12;
    if (guard) hit *= 0.59;
    if (danger && guard && h.plate === 0) hit *= 0.87;
    if (h.turn > 1 && !danger && h.plate === 1) hit *= 0.72;
    const interrupted = foe.skill === "charge" && danger && guard && h.arts.includes(0);
    if (interrupted) hit = 0;
    const prevGuard = h.guarded;
    let damage =
      18.4 *
      Math.max(0.18, h.attack ** 8.5) *
      (0.92 + 0.16 * rand(h)) *
      (guard ? 0.6 : actual === "counter" ? 1.45 : actual === "heavy" ? 1.19 : 1);
    damage *= h.gearBonus ?? 1;
    if (h.work[0] === 1) {
      hit *= 0.95;
      damage *= 0.97;
    }
    if (h.armorWork[0] === 1 && guard) hit *= 0.96;
    if (h.armorWork[1] === 1 && !danger) hit *= 0.94;
    if (h.armorWork[2] === 1 && h.hp < 40) hit *= 0.96;
    if (h.work[1] === 1 && actual === "heavy") damage *= 1.07;
    if (h.work[2] === 1 && !guard) damage *= 1.03;
    if (h.blade === 1 && h.enemyHp < h.enemyMax * 0.35) damage *= 1.1;
    if (h.blade === 2 && h.hp < 35) hit *= 0.87;
    if (h.blade === 3 && actual === "heavy") damage *= 1.08;
    if (h.blade !== 0 && actual === "counter") damage *= 0.97;
    if (actual === "heavy") hit *= 1.32;
    if (h.carry) {
      damage *= 1.5;
      h.carry = false;
    }
    if (h.riposte && actual === "heavy" && h.arts.includes(3)) damage *= 1.55;
    h.enemyHp = Math.max(0, h.enemyHp - damage);
    h.hp = Math.max(0, h.hp - (h.enemyHp > 0 ? hit : 0));
    if (!h.hp && !h.escapedDeath && prevGuard && h.arts.includes(2)) {
      h.hp = 1;
      h.escapedDeath = true;
    }
    h.riposte = (guard && danger) || (h.arts.includes(3) && h.riposte && actual === "strike");
    h.guarded = guard;
    h.log =
      enemy +
      " · " +
      (interrupted
        ? "돌진 끊기"
        : guard
          ? "방어"
          : actual === "counter"
            ? "반격"
            : actual === "heavy"
              ? "강공"
              : "공격") +
      " " +
      Math.round(damage) +
      " · 받은 피해 " +
      Math.round(h.enemyHp > 0 ? hit : 0);
    if (h.hp > 0 && h.enemyHp <= 0) {
      if (h.wave + 1 === h.pack.length) return finish(s, true);
      if (h.arts.includes(1) && (actual === "heavy" || actual === "counter")) h.carry = true;
      h.wave++;
      enter(h);
    }
    if (!h.hp || h.turns >= 120) return finish(s, false);
    return h.log;
  }
  function finish(s, won) {
    const h = s.hunt,
      gold = won ? Math.round(area(h.rank).prize * (h.bonus ? 1.08 : 1)) : 0;
    if (won) {
      s.gold += gold;
      s.bundles++;
      if (h.rank % 5 === 0 && h.rank > s.best) s.stones++;
      s.best = Math.max(s.best, h.rank);
    }
    s.records.unshift({ rank: h.rank, won, gold, turns: h.turns });
    s.records.length = Math.min(60, s.records.length);
    s.hunt = null;
    return F.note(
      s,
      h.rank +
        "단계 " +
        (won ? "승리 · +" + gold.toLocaleString("ko-KR") + " G · 재료 +1" : "패배") +
        " · " +
        h.turns +
        "턴",
    );
  }
  function retreat(s) {
    F.check(s.hunt, "진행 중인 사냥이 없습니다.");
    return finish(s, false);
  }
  return { area, turnMs, recharge, start, turn, policy, warning, kit, retreat };
})();
if (typeof module !== "undefined") module.exports = HeirloomHunt;
