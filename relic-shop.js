"use strict";
const RelicShop = (() => {
  const live = typeof module !== "undefined" ? require("./live-data.js") : LiveData;
  const catalog = [
    { id: "0", name: "정령의 가호", sell: 0.5, charm: 0, text: "강화 단계 하락 방지" },
    { id: "1", name: "대장장이의 가호", sell: 0.5, charm: 1, text: "강화 중 장비 파괴 방지" },
    { id: "2", name: "신의 가호", sell: 30, charm: 2, text: "강화비 무료 · 하락과 파괴 방지" },
    { id: "3", name: "유물 뽑기", text: "당첨 확률 80%" },
    { id: "steady", name: "안정 주문서", chance: 60, gain: 30 },
    { id: "balance", name: "균형 주문서", chance: 40, gain: 50 },
    { id: "gamble", name: "도박 주문서", chance: 10, gain: 80, risk: 1 },
    { id: "option", name: "옵션부여 주문서", text: "레이드 추가 공격력 +50~100 부여 · 유물당 한 번" },
    { id: "fate", name: "운명 주문서", chance: 1, gain: 120, risk: 1 },
    { id: "white", name: "순백의 주문서", chance: 3, recovery: 1, risk: 1 },
    { id: "chaos", name: "혼돈의 주문서", chance: 50, recovery: 10 },
    { id: "origin", name: "태초의 주문서", chance: 99, recovery: 10, risk: 1 },
  ];
  for (const item of catalog) {
    Object.defineProperty(item, "price", { enumerable: true, get: () => live.current.shop[item.id] });
  }
  const scrolls = catalog.filter(item => item.charm === undefined && item.id !== "3");
  for (const item of scrolls) {
    Object.defineProperty(item, "sell", { enumerable: true, get: () => item.price / 2 });
    if (item.text) continue;
    const effect = item.gain ? "옵션별 수치 +" + item.gain + "%" :
      item.recovery === 1 ? "실패 1회 복구" : "누적 실패 전부 복구";
    item.text = "성공 " + item.chance + "% · " + effect + (item.risk ? " · 유물 파괴 1%" : "");
  }
  const find = id => catalog.find(item => item.id === String(id));
  function owned(s, item) {
    if (item.charm !== undefined) return s.charms[item.charm];
    return s.relicScrolls[item.id] || 0;
  }
  function adjust(s, item, delta) {
    if (item.charm === undefined) s.relicScrolls[item.id] = owned(s, item) + delta;
    else {
      s.charms[item.charm] += delta;
      if (!s.charms[item.charm]) s.enabled[item.charm] = false;
    }
  }
  const boost = (value, gain) => Math.round(value * (1 + gain / 100) * 10) / 10;
  function oldFailures(relic) {
    // Older saves stored power and attempts. Reproduce the four possible starting powers.
    let guaranteed;
    for (let base = 1; base <= 4; base++) {
      let power = base;
      for (let hits = 0; hits <= relic.tries; hits++) {
        if (power === relic.power) guaranteed = Math.min(guaranteed ?? relic.tries, relic.tries - hits);
        power = boost(power, 30);
      }
    }
    return guaranteed ?? 0;
  }
  function restriction(relic, item) {
    if (!relic) return "먼저 대표 유물을 지정하세요.";
    if (item.gain && relic.tries >= 10) return "강화 시도를 모두 사용했습니다.";
    if (item.recovery && !relic.failures) return "복구할 실패 횟수가 없습니다.";
    if (item.id === "option" && relic.extraAttack) return "이미 추가 옵션이 있습니다.";
    return "";
  }
  function apply(s, item, random) {
    const relic = s.relics[s.equippedRelic];
    adjust(s, item, -1);
    if (item.id === "option") {
      relic.extraAttack = 50 + Math.floor(random() * 51);
      return ["레이드 추가 공격력 +" + relic.extraAttack, "win"];
    }
    const risk = item.risk || 0;
    if (risk && random() * 100 < risk) {
      s.relics.splice(s.equippedRelic, 1);
      s.equippedRelic = -1;
      return [item.name + " · 대표 유물이 파괴되었습니다.", "loss"];
    }
    // Each line has the listed overall success probability, including destruction.
    const hit = () => random() * (100 - risk) < item.chance;
    if (item.recovery) {
      if (!hit()) return [item.name + " · 복구 실패", "loss"];
      const count = Math.min(relic.failures, item.recovery);
      relic.failures -= count;
      relic.tries -= count;
      return ["강화 기회 " + count + "회 복구", "win"];
    }
    const powerHit = hit();
    const extraHit = relic.extraAttack && hit();
    relic.tries++;
    if (powerHit) relic.power = boost(relic.power, item.gain);
    if (extraHit) relic.extraAttack = boost(relic.extraAttack, item.gain);
    if (powerHit || extraHit) return [item.name + " · " + [powerHit && "공격력 보너스", extraHit && "추가 공격력"].filter(Boolean).join(" · ") + " 상승", "win"];
    relic.failures++;
    return [item.name + " · 강화 실패", "loss"];
  }
  return { catalog, scrolls, find, owned, adjust, boost, oldFailures, restriction, apply };
})();
if (typeof module !== "undefined") module.exports = RelicShop;
