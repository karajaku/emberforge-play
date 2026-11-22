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

  function enhancementQuote(s, type, item) {
    if (type === "outfit") return outfit.quote(item);
    return {cost:type === "chest" ? blades.armorCost(s, item) : blades.cost(item), success:blades.rate(item)};
  }

  function standardCost(s, type, item) {
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
        const step = enhancementQuote(s, type, {...item, level});
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
    const {item, type, wornSlot} = entry;
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

    const productionCost = standardCost(s, type, item);
    const value = 20 + 5 * item.base + 10 * item.grade + Math.floor(productionCost * salePercent(item.level) / 100);
    const ore = type === "outfit" ? outfit.salvageOre(item) : blades.salvageOre(item);
    const {cost, success} = enhancementQuote(s, type, item);
    const token = JSON.stringify([item, wornSlot, hunting, deployed, cost, success, value, ore]);
    return {...entry, cost, success, value, productionCost, ore, enhanceBlocked, disposeBlocked, token};
  }

  function act(s, action, request, rng, pay) {
    const q = quote(s, request?.id);
    if (!q || q.token !== request.token)
      return {ok:false, message:"장비가 바뀌었습니다. 대상과 금액을 다시 확인하세요."};
    const {item, type} = q;
    const itemName = type === "outfit" ? outfit.name(item) : blades.name(item);
    if (action === "forgeItemEnhance") {
      if (q.enhanceBlocked) return {ok:false, message:q.enhanceBlocked};
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
  return {list, quote, act};
}
if (typeof module !== "undefined") module.exports = createForgeItems;
