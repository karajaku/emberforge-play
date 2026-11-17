"use strict";
const Breakthrough = (() => {
  const methods = {
    edge: {
      name: "삼격 절단",
      description: "세 번 베어 봉인 4점을 깎습니다. 실패하면 +18로 하락하고 단서 1개를 얻습니다.",
    },
    ward: {
      name: "압력 제련",
      description:
        "네 번 안에 압력 한계를 지키며 결속 6점을 만듭니다. 실패하면 제련비를 잃고 +19를 유지합니다.",
    },
    yield: {
      name: "공동 제련",
      description:
        "세 칸에 보급 재료를 배합합니다. 납품량을 채우면 선택한 재료를 지불하고 확정 돌파합니다.",
    },
  };
  const materials = {
    gold: { name: "철괴", points: 1 },
    shards: { name: "별의 파편", points: 2 },
    unclaimed: { name: "사냥터 보급", points: 3 },
  };
  const owns = (map, key) => Object.prototype.hasOwnProperty.call(map, key);
  function rules(count) {
    return {
      wide: 0.14 + 0.02 * count,
      core: 0.045 + 0.015 * count,
      limit: 4 + count,
      goal: 7 - count,
    };
  }
  function choices(w, price) {
    if (w.level !== 19) return [];
    return Object.keys(methods)
      .map((key) => {
        const count = (w.marks || []).filter((m) => m === key).length;
        return { key, count, fee: key === "yield" ? 0 : price(w) * (key === "ward" ? 2 : 1) };
      })
      .filter((o) => o.count);
  }
  function start(s, method, price, t, rng) {
    const w = s.weapon,
      option = choices(w, price).find((o) => o.key === method);
    if (!option || w.finalTrial || s.gold < option.fee) return false;
    s.gold -= option.fee;
    s.finalTrialNumber = (s.finalTrialNumber || 0) + 1;
    w.finalTrial = {
      ...option,
      id: s.finalTrialNumber,
      revision: 0,
      started: t,
      turn: 0,
      score: 0,
      pattern: method === "yield" ? 0 : Math.floor(rng() * 4),
      pressure: 1,
      loads: [],
    };
    return true;
  }
  function cutWindow(f) {
    const center = [0.29, 0.61, 0.43, 0.71][(f.pattern + f.turn) % 4];
    const { wide, core } = rules(f.count);
    return { center, wide, core };
  }
  function position(f, t) {
    const phase = (Math.max(0, t - f.started) % 1900) / 950;
    return 1 - Math.abs(phase - 1);
  }
  function press(f, hard) {
    const pulse = [2, 0, 2, 1][(f.pattern + f.turn) % 4];
    const limit = rules(f.count).limit,
      loaded = f.pressure + pulse;
    const vent = loaded >= limit ? 3 : 2;
    return {
      pulse,
      limit,
      pressure: Math.max(0, loaded + (hard ? 2 : -vent)),
      score: f.score + (hard ? 2 : 1),
    };
  }
  function invoice(w, price) {
    const f = w.finalTrial,
      unit = price(w);
    const costs = { gold: 0, shards: 0, unclaimed: 0 };
    let points = 0;
    for (const key of f.loads) {
      costs[key] += key === "shards" ? 1 : unit;
      points += materials[key].points;
    }
    return { costs, points, goal: rules(f.count).goal, unit };
  }
  function canDeliver(s, bill) {
    return (
      bill.points >= bill.goal && Object.entries(bill.costs).every(([k, cost]) => s[k] >= cost)
    );
  }
  function move(s, token, price, t, pressedAt = t) {
    const w = s.weapon,
      f = w.finalTrial;
    if (w.level !== 19 || !f || typeof token !== "string") return null;
    const [key, id, revision, action] = token.split(":");
    if (f.key !== key || String(f.id || 0) !== id || String(f.revision) !== revision) return null;
    let outcome = "continue",
      note = "";
    if (action === "surrender") {
      outcome = key === "yield" ? "cancel" : "loss";
      note = "도전 포기";
    } else if (key === "edge") {
      if (!["quick", "deep"].includes(action)) return null;
      const window = cutWindow(f),
        deep = action === "deep";
      const hit =
        Math.abs(position(f, pressedAt) - window.center) <= (deep ? window.core : window.wide);
      f.score += hit ? (deep ? 2 : 1) : 0;
      f.turn++;
      f.started = t;
      note = hit ? "명중 · 봉인 피해 " + (deep ? 2 : 1) : "빗나감";
      if (f.score >= 4) outcome = "win";
      else if (f.score + 2 * (3 - f.turn) < 4) {
        outcome = "loss";
        note += " · 봉인 피해 " + f.score + "/4";
      }
    } else if (key === "ward") {
      if (!["press", "vent"].includes(action)) return null;
      const next = press(f, action === "press");
      f.turn++;
      f.score = next.score;
      f.pressure = next.pressure;
      note = "압력 " + f.pressure + "/" + next.limit + " · 결속 " + f.score + "/6";
      if (f.pressure > next.limit || f.score + 2 * (4 - f.turn) < 6) outcome = "loss";
      else if (f.score >= 6) outcome = "win";
    } else if (action === "deliver") {
      const bill = invoice(w, price),
        costs = bill.costs;
      if (!canDeliver(s, bill)) return null;
      for (const k of Object.keys(costs)) s[k] -= costs[k];
      outcome = "win";
    } else if (action === "undo" && f.loads.length) {
      f.loads.pop();
    } else if (owns(materials, action) && f.loads.length < 3) {
      f.loads.push(action);
    } else return null;
    f.revision++;
    f.note = note;
    return { outcome, note };
  }
  return {
    methods,
    materials,
    rules,
    choices,
    start,
    cutWindow,
    position,
    press,
    invoice,
    canDeliver,
    move,
  };
})();
if (typeof module !== "undefined") module.exports = Breakthrough;
