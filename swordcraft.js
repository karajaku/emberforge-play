"use strict";
const Swordcraft = (() => {
  const stages = [
    {
      level: 7,
      target: 9,
      title: "칼날 연마",
      icon: "sword",
      detail: "이 검을 어디에 쓸까요? 세 번의 연마를 나눠 쓰거나 한 부위에 모으세요. 첫 연마의 효과가 가장 큽니다.",
    },
    {
      level: 9,
      target: 11,
      title: "수문장의 시검",
      icon: "shield",
      detail: "예고된 공격을 읽고 수문장의 자세를 무너뜨립니다.",
    },
    {
      level: 11,
      target: 13,
      title: "이중 담금질",
      icon: "flame",
      detail: "칼날과 칼등을 서로 다른 온도에서 차례로 식힙니다.",
    },
  ];
  const traits = {
    edge: { name: "예리한 날", text: "이 검의 공격력 +10%", icon: "sword" },
    ward: { name: "보강한 검등", text: "가호가 막지 못한 하락·파괴 1회 방지", icon: "shield" },
    yield: { name: "개척자의 홈", text: "이 검의 분당 배치 수익 +35%", icon: "trees" },
  };
  const grindZones = [
    { name: "밑날", effect: "숲에서 방어 시 받는 피해", sign: "−", icon: "shield", values: [0, 15, 24, 30] },
    { name: "중앙", effect: "+13부터 배치 수익", sign: "+", icon: "trees", values: [0, 10, 16, 20] },
    { name: "칼끝", effect: "장착 시 공격력", sign: "+", icon: "sword", values: [0, 4, 6, 7] },
  ];
  function grindBonus(passes, zone) {
    const count = (passes || []).filter((n) => n === zone).length;
    return grindZones[zone].values[Math.min(3, count)];
  }
  // Previous saves may still have a partially solved burr pattern.
  const cuts = [
    { label: "밑날", zones: [0] },
    { label: "중앙", zones: [1] },
    { label: "칼끝", zones: [2] },
    { label: "밑날 + 중앙", zones: [0, 1] },
    { label: "중앙 + 칼끝", zones: [1, 2] },
  ];
  const baths = [
    { low: 0.24, high: 0.52, period: 2450, name: "칼날 · 물 담금질" },
    { low: 0.58, high: 0.8, period: 1880, name: "칼등 · 기름 담금질" },
  ];
  function stageIndex(g) {
    return stages.findIndex((s, i) => g.level >= s.level && !g.marks?.[i]);
  }
  function count(g, key) {
    return (g.marks || []).filter((value) => value === key).length;
  }
  function wards(g) {
    return Math.max(0, count(g, "ward") - (g.spentWards || 0));
  }
  function fee(g, price, index) {
    const s = stages[index];
    return [s.level, s.level + 1].reduce((n, level) => n + price({ level, grade: g.grade }), 0);
  }
  function makeWork(i, random, t) {
    if (i === 0) return { index: i, passes: [], note: "" };
    if (i === 1)
      return {
        index: i,
        turn: 0,
        health: 7,
        enemy: 10,
        stamina: 2,
        offset: Math.floor(random() * 3),
        note: "먼저 수문장의 자세를 읽으세요.",
      };
    return { index: i, dips: 0, started: t, note: "바늘이 표시된 온도에 들어오면 담그세요." };
  }
  function heavy(w) {
    return (w.turn + w.offset) % 3 === 1;
  }
  function needle(w, t) {
    const phase = Math.max(0, t - w.started) / baths[w.dips].period;
    return 1 - Math.abs((phase % 1) * 2 - 1);
  }
  function play(w, move, t) {
    if (w.index === 0 && w.stock && move === "redesign") {
      delete w.stock;
      delete w.left;
      w.failed = false;
      w.ready = false;
      w.passes = [];
      w.note = "";
      return true;
    }
    if (w.index === 0 && Array.isArray(w.passes)) {
      if (move === "undo" && w.passes.length) w.passes.pop();
      else if (["0", "1", "2"].includes(move) && w.passes.length < 3) w.passes.push(Number(move));
      else return false;
      w.ready = w.passes.length === 3;
      return true;
    }
    if (w.ready || w.failed) return false;
    if (w.index === 0) {
      const cut = cuts.find((_, i) => move === String(i));
      if (!cut) return false;
      w.left--;
      if (cut.zones.some((z) => w.stock[z] === 0)) {
        w.failed = true;
        w.note = "이미 평평한 부분을 과하게 갈았습니다.";
        return true;
      }
      cut.zones.forEach((z) => w.stock[z]--);
      w.ready = w.stock.every((v) => !v);
      w.failed = !w.ready && !w.left;
      w.note = w.failed ? "돌기가 남은 채 연마 횟수를 다 썼습니다." : cut.label + " 연마 완료";
      return true;
    }
    if (w.index === 1) {
      if (!["quick", "lunge", "parry"].includes(move) || (move === "lunge" && w.stamina < 2))
        return false;
      const strong = heavy(w),
        parry = move === "parry";
      const incoming = parry ? (strong ? 0 : 2) : strong ? 4 : 1;
      const damage = move === "quick" ? 2 : move === "lunge" ? 5 : strong ? 3 : 0;
      w.enemy = Math.max(0, w.enemy - damage);
      w.stamina = Math.min(3, w.stamina + (move === "lunge" ? -2 : parry && !strong ? 0 : 1));
      w.health = Math.max(0, w.health - (w.enemy ? incoming : 0));
      w.turn++;
      w.ready = w.enemy === 0;
      w.failed = w.health === 0;
      w.note =
        (parry
          ? damage
            ? "강타를 받아쳐 자세 피해 3"
            : "견제에 중심을 잃었습니다"
          : "자세 피해 " + damage) + (w.enemy && incoming ? " · 받은 피해 " + incoming : "");
      return true;
    }
    if (move !== "dip") return false;
    const b = baths[w.dips],
      pos = needle(w, t);
    if (pos < b.low || pos > b.high) {
      w.note = "온도를 놓쳤습니다. 다음 왕복에서 다시 담그세요.";
      return true;
    }
    w.dips++;
    w.ready = w.dips === baths.length;
    w.started = t;
    w.note = "칼날 냉각 완료 · 이번에는 칼등을 식히세요.";
    return true;
  }
  return {
    stages,
    traits,
    cuts,
    grindZones,
    grindBonus,
    baths,
    stageIndex,
    count,
    wards,
    fee,
    heavy,
    needle,
    makeWork,
    play,
  };
})();
if (typeof module !== "undefined") module.exports = Swordcraft;
