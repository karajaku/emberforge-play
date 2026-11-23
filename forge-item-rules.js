"use strict";

function createForgeItems(blades, outfit, craft, price) {
  const saleRates = [[0,45], [5,65], [9,90], [10,110], [13,150], [16,220], [18,300], [20,400]];
  function list(s) {
    const rack = blades.state(s), kit = outfit.state(s);
    const worn = new Map(Object.entries(kit.equipped).map(([slot, id]) => [id, slot]));
    return [
      ...rack.items.map(item => ({id:item.id, item, type:"blade", kind:"weapon",
        wornSlot:item.id === rack.equipped ? "weapon" : ""})),
      ...blades.armors(s).map(item => ({id:item.id, item, type:"chest", kind:"chest",
        wornSlot:item.id === rack.armorEquipped ? "chest" : ""})),
      ...kit.items.map(item => ({id:item.id, item, type:"outfit", kind:item.kind, wornSlot:worn.get(item.id) || ""})),
    ];
  }

  function enhancementQuote(type, item) {
    if (type === "outfit") return outfit.quote(item);
    return {cost:blades.cost(item), success:blades.rate(item)};
  }

  function canUsePermit(s, { type, item }) {
    if (type === "outfit" || item.level < 3 || item.level > 18 || item.work || item.finalTrial ||
        craft.stageIndex(item) >= 0 || blades.rate(item) >= 100) return false;
    const rack = blades.state(s);
    return item.id !== rack.deployed && item.id !== rack.extraDeployed;
  }

  function hasPermitTarget(s) {
    const rack = s.bladeForge;
    return !!(rack?.items?.some(item => canUsePermit(s, { type:"blade", item })) ||
      rack?.armors?.some(item => canUsePermit(s, { type:"chest", item })));
  }

  function standardCost(type, item) {
    let total = 0;
    for (let level = 0; level < item.level;) {
      // A mark identifies a completed workshop stage, including on older saves.
      // Its finishing fee covers both levels reached by that stage.
      const index = craft.stages.findIndex((stage, i) => level === stage.level &&
        stage.target <= item.level && item.marks?.[i]);
      if (index >= 0) {
        total += craft.fee(item, price, index);
        level = craft.stages[index].target;
      } else {
        const step = enhancementQuote(type, {...item, level});
        total += step.cost * 100 / step.success;
        level++;
      }
    }
    return total;
  }

  function salePercent(level) {
    const next = saleRates.findIndex(([at]) => at >= level);
    if (next === 0) return saleRates[0][1];
    const [lo, start] = saleRates[next - 1], [hi, end] = saleRates[next];
    return start + (end - start) * (level - lo) / (hi - lo);
  }

  function quote(s, id) {
    const entry = list(s).find(candidate => candidate.id === id);
    if (!entry) return null;
    const {item, type, kind, wornSlot} = entry;
    const rack = blades.state(s);
    const deployed = id === rack.deployed || id === rack.extraDeployed;
    const hunting = id === s.hunt?.bladeId || id === s.hunt?.armorId;
    const recall = deployed ? "사냥터에 배치한 무기를 먼저 회수하세요." : "";
    let disposeBlocked = recall;
    if (wornSlot) disposeBlocked = "착용 중인 장비입니다.";
    else if (hunting) disposeBlocked = "현재 사냥에서 사용 중인 장비입니다.";
    else if (item.soulChoice) disposeBlocked = "영혼각인 후보를 먼저 확정하세요.";
    let enhanceBlocked = recall;
    if (item.finalTrial) enhanceBlocked = "진행 중인 마지막 돌파를 먼저 마치세요.";
    else if (item.level >= 20) enhanceBlocked = "+20 완성 장비입니다.";
    const equipBlocked = wornSlot ? "이미 착용한 장비입니다." : recall;
    const equipped = outfit.state(s).equipped;
    const equipTargets = type === "outfit"
      ? outfit.slots.filter(slot => slot.kind === kind).map(({key}) => ({
        slot:key, currentId:equipped[key] ?? null,
      }))
      : [{slot:kind, currentId:type === "chest" ? rack.armorEquipped : rack.equipped}];

    const productionCost = standardCost(type, item);
    const value = 20 + 5 * item.base + 10 * item.grade + Math.floor(productionCost * salePercent(item.level) / 100);
    const ore = type === "outfit" ? outfit.salvageOre(item) : blades.salvageOre(item);
    const {cost, success} = enhancementQuote(type, item);
    const permitId = s.artisanCache?.status === "claimed" && canUsePermit(s, entry) ? s.artisanCache.id : undefined;
    const token = JSON.stringify([item, wornSlot, hunting, deployed, cost, success, value, ore, permitId]);
    return {...entry, cost, success, value, productionCost, ore, enhanceBlocked, disposeBlocked, equipBlocked, equipTargets, token,
      permitId, permitApplies: permitId !== undefined};
  }

  function act(s, action, request, rng, pay) {
    const q = quote(s, request?.id);
    if (!q || q.token !== request.token) {
      const message = action === "forgeItemEquip" ? "장비가 바뀌었습니다. 착용할 장비를 다시 확인하세요." :
        "장비가 바뀌었습니다. 대상과 금액을 다시 확인하세요.";
      return {ok:false, message};
    }
    const {item, type} = q;
    if (action === "forgeItemEquip") {
      if (q.equipBlocked) return {ok:false, message:q.equipBlocked};
      const target = q.equipTargets.find(entry => entry.slot === request.slot);
      if (!target || target.currentId !== request.currentId)
        return {ok:false, message:"착용 장비가 바뀌었습니다. 교체할 자리를 다시 확인하세요."};
      if (type === "outfit") return outfit.act(s, "outfitEquip", target.slot + ":" + item.id, rng, pay);
      return blades.act(s, type === "chest" ? "bladeArmorEquip" : "bladeEquip", item.id, rng, pay);
    }
    const itemName = type === "outfit" ? outfit.name(item) : blades.name(item);
    if (action === "forgeItemEnhance") {
      if (q.enhanceBlocked) return {ok:false, message:q.enhanceBlocked};
      if (request.permitId !== undefined) {
        if (!q.permitId || request.permitId !== q.permitId)
          return {ok:false, message:"현재 장비에 사용할 장인의 보증을 다시 확인하세요."};
        const result = blades.enhance(s, item, { ...q, success: 100 }, itemName, () => 0, pay);
        if (!result.ok) return result;
        s.artisanCache.status = "spent";
        return {...result, message:result.message + " · 장인의 보증 사용", item, type};
      }
      const result = blades.enhance(s, item, q, itemName, rng, pay);
      return {...result, item, type};
    }
    if (q.disposeBlocked) return {ok:false, message:q.disposeBlocked};
    if (action === "forgeItemSalvage") {
      if (type === "outfit") return outfit.act(s, "outfitSalvage", item.id, rng, pay);
      return blades.act(s, type === "chest" ? "bladeArmorSalvage" : "bladeSalvage", item.id, rng, pay);
    }
    if (action !== "forgeItemSell") return {ok:false, message:"대장간 작업을 확인하세요."};
    const items = type === "outfit" ? outfit.state(s).items : type === "chest" ? blades.armors(s) : blades.state(s).items;
    items.splice(items.indexOf(item), 1);
    s.gold += q.value;
    return {ok:true, kind:"win", message:itemName + " 판매 · +" + q.value.toLocaleString("ko-KR") + " G"};
  }
  return {list, quote, act, hasPermitTarget};
}
if (typeof module !== "undefined") module.exports = createForgeItems;
