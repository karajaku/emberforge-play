"use strict";

const HuntLootView = (() => {
  let reading = null, itemDetail = "";

  function settled(s) {
    const chest = s.lastChest;
    if (chest?.source !== "forest" || !chest.id) return null;
    const result = chest.huntLoot || (s.lastHunt?.chestId === chest.id && s.lastHunt);
    return {chest, result:result || {}};
  }

  function isReader(key) {
    return key === "huntLoot" || key === "firstGearCompare" || (!!itemDetail && key === itemDetail);
  }

  function open(s, key, previous) {
    const fromReceipt = isReader(previous);
    itemDetail = "";
    if (key === "huntLoot" || key === "firstGearCompare") {
      if (!fromReceipt) reading = settled(s);
    } else if (fromReceipt && reading) {
      const ids = new Set(drops(reading.result).map(drop => drop.id));
      if (Game.forgeItems.list(s).some(item => ids.has(item.id) && ForgeItemView.detailKey(item) === key))
        itemDetail = key;
    }
  }

  function drops(result) {
    return [...(result.gearDrops || []), ...(result.outfitDrop ? [result.outfitDrop] : [])];
  }

  function select(s, id, source) {
    const receipt = isReader(source) ? reading : settled(s);
    return !!receipt && drops(receipt.result).some(drop => drop.id === id) && ForgeItemView.selectItem(s,id);
  }

  function entry(s, drop, owned, detailed) {
    const item = owned?.item || drop;
    const outfit = !!drop.kind;
    const name = outfit ? Game.outfit.name(item) : Game.blades.name(item);
    const art = outfit ? OutfitView.art(item.kind) : BladeView.artwork(item);
    const label = GearGradeView.colored(item,name);
    if (!owned) return '<span class="loot-gear loot-missing">'+art+'<b>'+label+'</b><small>보관함에 없음</small></span>';

    const comparison = Game.compareGear(s,item,owned.type);
    const delta = comparison.delta;
    const change = delta > 0 ? "+"+fmt(delta) : delta < 0 ? "−"+fmt(-delta) : "0";
    const tone = delta > 0 ? "up" : delta < 0 ? "down" : "equal";
    const slot = Game.outfit.slots.find(slot => slot.key === comparison.slot);
    const baseline = owned.kind === "ring" && slot ? slot.name+" 대비" : "착용 대비";
    const score = '<small class="loot-score">전투력 '+fmt(comparison.score)+' · '+baseline+
      ' <em data-tone="'+tone+'">'+change+'</em></small>';
    const text = '<span class="loot-name"><b>'+label+'</b><small aria-hidden="true">'+Game.blades.itemRarity(item).name+'</small>'+score+'</span>';
    const button = '<button type="button" class="'+GearGradeView.lootClass(item)+'" data-loot-forge="'+escapeHtml(drop.id)+'">'+
      art+text+'<span class="loot-forge-label">'+icon("hammer")+'강화</span></button>';
    if (!detailed) return button;
    return '<div class="loot-item-detail">'+button+'<details><summary>'+escapeHtml(name)+' 능력치</summary>'+
      GearCompareView.detail(comparison,owned.type)+openBtn(ForgeItemView.detailKey(owned),"장비 상세 · 장착")+'</details></div>';
  }

  function rewards(s, receipt, detailed = false) {
    const {chest,result} = receipt;
    const owned = new Map(Game.forgeItems.list(s).map(item => [item.id,item]));
    const equipment = drops(result).map(drop => entry(s,drop,owned.get(drop.id),detailed)).join("");
    const materials = [
      !Array.isArray(result.gearDrops) && result.bladePrize,
      result.materialPrize,
      result.outfitSalvaged && "착용 장비 자동 분해 · 각인석 +1",
      chest.fiber && "숲결 섬유 +"+fmt(chest.fiber),
      chest.goblinGold && "고블린 +"+fmt(chest.goblinGold)+" G 포함",
      chest.shards && "별의 파편 +"+fmt(chest.shards),
      chest.scrolls && "주문서 +"+fmt(chest.scrolls),
      ...(chest.charms || []).map((n,i) => n && Game.blessings[i]+" +"+fmt(n)),
    ].filter(Boolean);
    return (equipment ? '<div class="loot-gear-list">'+equipment+'</div>' : '')+
      (materials.length || chest.counter ? '<div class="loot-materials">'+materials.map(text => '<span>'+escapeHtml(text)+'</span>').join("")+
        (chest.counter ? '<span class="watch-counter-reward">반격 +'+fmt(chest.counter)+' G 포함</span>' : "")+'</div>' : '');
  }

  function resultView(s, receipt, active) {
    const chest = receipt.chest;
    return '<div class="watch-receipt"><div class="watch-receipt-head"><b>'+chest.rank+'단계 클리어</b><strong>'+
      icon("coins")+' +'+fmt(chest.gold)+' G</strong></div><div class="watch-loot">'+rewards(s,receipt)+'</div>'+
      '<div class="loot-actions">'+openBtn("huntLoot",icon("backpack")+"최근 전리품","action")+
      (receipt.result.firstGearChoice ? openBtn("firstGearCompare","장비 비교","action") : "")+
      (!active && chest.fiber ? '<button class="action lining-link" data-go="forge" data-gear="armor">'+icon('shield')+'안감 제작</button>' : '')+
      '</div></div>';
  }

  function detailView(s) {
    if (!reading) return ["최근 전리품",desc("아직 수령한 전리품이 없습니다.")];
    const {chest,result} = reading;
    return [chest.rank+"단계 전리품",'<div class="loot-history"><p class="loot-gold">'+icon("coins")+' +'+fmt(chest.gold)+
      ' G</p>'+rewards(s,reading,true)+(result.firstGearChoice ? openBtn("firstGearCompare","장비 비교") : "")+'</div>'];
  }

  return {settled,open,isReader,select,resultView,detailView,get reading(){return reading;}};
})();
