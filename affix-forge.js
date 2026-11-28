"use strict";

function createAffixForge({
  rules,
  blades,
  outfit,
  forgeItems,
  journeyForge,
  name,
  pay,
  weaponAttack,
}) {
  const weights = [2200, 1700, 800, 600, 2500, 600, 100, 800, 100, 600];
  const milestone = [1, 2, 3, 5];
  const materials = [1, 2, 3, 5];
  const craftOutcomes = { 6: "replaced", 7: "rerolled", 8: "removed", 9: "unique", 10: "corrupted" };
  function wallet(s) {
    return (s.affixWallet ??= { version: 1, counts: Array(10).fill(0), claimed: [], revision: 0 });
  }
  function grant(s, rank, rng, monsterDrops) {
    const w = wallet(s),
      received = [];
    function credit(n, source) {
      w.counts[n - 1]++;
      received.push({ n, count: 1, source });
    }
    for (let i = 0; i < milestone.length; i++) {
      if (Math.max(s.huntBest, rank) >= milestone[i] && !w.claimed.includes(milestone[i])) {
        w.claimed.push(milestone[i]);
        credit(materials[i], "milestone");
      }
    }
    if (monsterDrops) {
      for (const drop of monsterDrops) {
        w.counts[drop.n-1]++;
        received.push({...drop,count:1,source:"hunt",sourceStage:rank});
      }
    } else if (rng() < (rank % 5 === 0 ? 0.4 : 0.2)) credit(rules.weighted(weights, rng) + 1, "hunt");
    return received;
  }
  function journeyEntry(s, source) {
    if (!source.recordId || !s.journeyEconomy) return null;
    const id = "j:" + source.recordId;
    const item = {
      ...source,
      id,
      base: 0,
      rank: source.affixRank || 1,
      mods: source.mods || [],
      promotionGrade: source.grade,
    };
    return {
      id,
      item,
      label: name(source),
      source,
      worn: source === s.weapon,
      deployed: s.field.includes(source),
    };
  }
  function list(s) {
    const entries = forgeItems
      .list(s)
      .map(({ id, item, type, wornSlot }) => ({
        id,
        item,
        source: item,
        label: type === "outfit" ? outfit.name(item) : blades.name(item),
        worn: !!wornSlot,
      }));
    for (const source of [s.weapon, ...s.bag, ...s.field]) {
      const entry = journeyEntry(s, source);
      if (entry) entries.push(entry);
    }
    return entries;
  }
  function quote(s, id, n) {
    const entry = list(s).find((i) => i.id === id);
    if (!entry) return { id, n, reason: "대상 장비가 없습니다.", count: 0 };
    const { item, worn } = entry,
      b = s.bladeForge,
      w = s.affixWallet;
    const count = w?.counts[n - 1] || 0;
    let reason = "";
    if (item.mods && !rules.validLines(item, blades.modDefs)) reason = "기존 옵션 구성을 확인하세요.";
    else if (item.corrupted) reason = "타락한 장비입니다.";
    else if (
      entry.deployed ||
      item.locked ||
      item.soulChoice ||
      item.work ||
      item.finalTrial ||
      id === b.deployed ||
      id === b.extraDeployed
    )
      reason = "잠금·배치·진행 중인 공정을 확인하세요.";
    else if (
      (entry.source.recordId && entry.source.recordId === s.hunt?.weaponKey) ||
      [s.hunt?.bladeId, s.hunt?.armorId, ...(s.hunt?.affixGearIds || [])].includes(id) ||
      (s.hunt && !s.hunt.affixGearIds && worn && item.kind)
    )
      reason = "사냥이 끝난 후 사용할 수 있습니다.";
    else if (n === 9 && worn) reason = "파괴될 수 있어 착용 해제 후 사용할 수 있습니다.";
    else if (!rules.eligible(item, n, blades.modDefs)) reason = "옵션 수 또는 장비 상태가 맞지 않습니다.";
    else if (!count) reason = "재료가 부족합니다.";
    const token = JSON.stringify([
      id,
      item,
      w?.revision || 0,
      worn,
      b.deployed,
      b.extraDeployed,
      s.hunt?.id,
      s._save?.generation,
    ]);
    return { id, item, n, count, reason, token };
  }
  function use(s, arg, rng) {
    const { id, n, token } = arg || {},
      q = quote(s, id, n);
    if (q.reason || token !== q.token) return { ok: false, message: q.reason || "장비가 바뀌었습니다." };
    const before = structuredClone(q.item),
      result = rules.apply(before, n, rng, blades.modDefs);
    if (!result.ok) return { ok: false, message: "재료를 사용할 수 없습니다." };
    const entry = list(s).find((e) => e.id === id),
      item = result.item;
    if (!item) {
      const rack = s.bladeForge;
      const inventory = [rack.items, rack.armors, rack.outfit?.items, s.bag].find((items) =>
        items?.includes(entry.source),
      );
      if (!inventory) return { ok: false, message: "착용 장비를 확인하세요." };
      inventory.splice(inventory.indexOf(entry.source), 1);
    } else {
      const target = entry.source;
      target.affixVersion = 1;
      target.mods = item.mods;
      if (id.startsWith("j:")) target.affixRank = item.rank;
      for (const k of ["unique", "uniqueStats", "corrupted", "sockets"])
        if (item[k] !== undefined) target[k] = item[k];
      if (!target.mods.some((m) => m.ascended)) delete target.ascended;
    }
    const w = wallet(s);
    w.counts[n - 1]--;
    w.revision++;
    return {
      ok: true,
      id,
      n,
      consumed: 1,
      operationId: [s._save?.generation || s.created, id, w.revision].join(":"),
      outcome: item ? craftOutcomes[n] || "added" : "destroyed",
      kind: item ? "win" : "loss",
      before,
      item,
      message: rules.currency[n - 1] + (item ? " 사용 · 옵션 " + item.mods.length + "개" : " 사용 · 장비 파괴"),
    };
  }
  function growth(s, id) {
    const entry = list(s).find((e) => e.id === id);
    if (!entry || rules.kindOf(entry.item) !== "weapon" || !s.journeyEconomy) return null;
    const j = id.startsWith("j:"),
      item = entry.item;
    const grade = j ? item.grade : item.promotionGrade || 0;
    const level = j ? item.level : (item.growthLevel ?? item.level);
    const view = j
      ? { ...s, weapon: entry.source }
      : { ...s, weapon: { ...item, recordId: s.swordRecord.id, grade, level } };
    const plan = journeyForge(view, "weapon");
    if (!plan) return null;
    return {
      ...plan,
      grade,
      level,
      canForge: (!j || entry.worn) && plan.next > level && (j || level >= 20) && !item.work && !item.finalTrial,
      canPromote: (!j || entry.worn) && plan.canPromote && !item.work && !item.finalTrial,
    };
  }
  function grow(s, act, arg, rng) {
    const id = arg?.id,
      q = quote(s, id, 1),
      plan = growth(s, id);
    if (!plan || !q.token || arg.token !== q.token)
      return { ok: false, message: "승급할 검을 다시 선택하세요." };
    const entry = list(s).find((e) => e.id === id),
      target = entry.source,
      j = id.startsWith("j:");
    if (entry.deployed) return { ok: false, message: "배치한 검을 먼저 회수하세요." };
    if (act === "affixEquip") {
      if (j) wallet(s).journeyId = id;
      else {
        if (id === s.bladeForge.deployed || id === s.bladeForge.extraDeployed)
          return { ok: false, message: "배치한 검을 회수하세요." };
        s.bladeForge.equipped = id;
        delete wallet(s).journeyId;
      }
      wallet(s).revision++;
      return { ok: true, message: "사냥에 착용했습니다." };
    }
    if (s.bladeForge.deployed === id || s.bladeForge.extraDeployed === id)
      return { ok: false, message: "배치한 검을 먼저 회수하세요." };
    if (act === "affixPromote") {
      if (!plan.canPromote || ![0, 1, 2, 3].includes(arg.trait ?? 0))
        return { ok: false, message: "재련 단계와 공정을 확인하세요." };
      for (const m of target.mods || []) if (!rules.defs[m.key]) m.migrationGrade ??= plan.grade;
      if (j) target.grade++;
      else {
        target.promotionGrade = plan.grade + 1;
        target.growthLevel = plan.level;
      }
      if (plan.grade === 1) target.journeyTrait = arg.trait ?? 0;
      wallet(s).revision++;
      return {
        ok: true,
        message: "승급 완료 · 옵션 " + (1 + (plan.grade + 1) / 10).toFixed(2) + "배",
        promotion: { from: plan.grade, to: plan.grade + 1 },
      };
    }
    if (!plan.canForge || s.gold < plan.cost) return { ok: false, message: "재련 조건과 골드를 확인하세요." };
    pay(s, plan.cost);
    wallet(s).revision++;
    if (plan.success < 100 && rng() >= plan.success / 100)
      return { ok: true, message: "재련 실패 · 단계 유지" };
    if (j) target.level = plan.next;
    else target.growthLevel = plan.next;
    return {
      ok: true,
      message:
        "재련 +" +
        plan.next +
        " / " +
        plan.threshold +
        (plan.grade === 3 ? " · 최고 단계 기록" : " · 승급 준비") +
        " · 전투 수치 변화 0",
    };
  }
  function battleWeapon(s) {
    const j = journeyEntry(s, s.weapon);
    if (j && s.affixWallet?.journeyId === j.id) return { ...j.item, boundAttack: weaponAttack(s.weapon) };
    return blades.current(s);
  }
  return { list, quote, use, growth, grow, grant, battleWeapon, wallet };
}

if (typeof module !== "undefined") module.exports = createAffixForge;
