"use strict";

const OutfitView = (() => {
  const spriteIndex = {helm:0, shoulder:1, armor:2, legs:3, gloves:4, neck:5, ring:6, cloak:7};
  const elementIcon = key => key === "lightning" ? '<i aria-hidden="true">ϟ</i>' : icon(key === "fire" ? "flame" : "snowflake");
  const api = () => Game.outfit;
  const loadout = () => openBtn("outfit:slots", icon("shield") + "착용 장비", "action outfit-open");
  const grade = item => Game.blades.itemRarity(item).name;
  const slotFor = (s, id) => api().slots.find(slot => api().state(s).equipped[slot.key] === id);
  function art(kind) {
    const i = spriteIndex[kind];
    return '<i aria-hidden="true" class="outfit-art" style="background-position:' +
      (i % 4) * 100/3 + '% ' + Math.floor(i / 4) * 100 + '%"></i>';
  }
  function effectLabel(item) {
    const effect = api().effect(item), name = api().elements[item.element];
    return name + " 전환 " + pct(effect.conversion) + (effect.exposure ? " · 저항 −" + pct(effect.exposure) + "p" : "");
  }
  function statsLabel(item) {
    const rating = Game.blades.armorRating(item);
    return (rating ? "방어력 " + fmt(rating) + " · " : "") + effectLabel(item);
  }
  function entries(s) {
    return api().state(s).items.map(item => {
      const worn = slotFor(s,item.id);
      return {
        key:"outfit-" + item.id, comparison:Game.compareGear(s,item,"outfit"), id:item.id, wornSlot:worn?.key, group:"gear", name:api().name(item), rarity:Game.blades.itemRarity(item), baseGrade:Game.blades.baseGradeNames[item.grade], mark:"+" + item.level,
        art:art(item.kind), status:worn ? "착용" : "", open:"outfit:item:" + item.id,
      };
    });
  }
  function forgeSlots(s) {
    const kit = api().state(s);
    const chosen = forgeOutfitSlot || (gear === "armor" ? "chest" : "weapon");
    const slots = [{key:"weapon",name:"무기"}, ...api().slots];
    const cells = slots.map(slot => {
      const blade = slot.key === "weapon", chest = slot.kind === "armor";
      const item = blade ? Game.blades.current(s) : chest ? Game.blades.currentArmor(s) :
        kit.items.find(it => it.id === kit.equipped[slot.key]);
      const image = blade || chest ? BladeView.artwork(item) : art(slot.kind);
      const name = item ? grade(item) + " " + (blade || chest ? Game.blades.name(item) : api().name(item)) + " +" + item.level : "빈칸";
      const part = {shoulder:"어깨",legs:"다리"}[slot.key] || slot.name;
      return '<button class="bag-slot bag-worn-slot" data-forge-slot="' + slot.key +
        '" data-empty="' + !item + '" data-rarity="' + (item ? Game.blades.itemRarity(item).key : "") + '" aria-pressed="' + (slot.key === chosen) +
        '" aria-label="' + escapeHtml(slot.name + " · " + name) + '"><span class="bag-worn-part">' + part +
        '</span><span class="bag-slot-art">' + image + '</span><b class="bag-slot-name">' +
        (item ? grade(item) + " +" + item.level : "빈칸") + '</b></button>';
    });
    return ["강화할 부위 선택", '<div class="bag-loadout-grid forge-slot-grid">' + cells.join("") + '</div>'];
  }
  function forge(s, key) {
    const slot = api().slots.find(part => part.key === key);
    const kit = api().state(s), item = kit.items.find(it => it.id === kit.equipped[key]);
    const done = item?.level === 20, detail = item ? "outfit:item:" + item.id + ":" + key : "outfit:slot:" + key;
    let readout, odds, strike;
    if (item) {
      const {cost,success} = api().quote(item);
      const stat = item.mode === "expose" ? "exposure" : "conversion";
      const name = api().elements[item.element] + (stat === "exposure" ? " 저항 감소" : " 피해 전환");
      const next = api().effect({...item,level:item.level + 1});
      const unit = stat === "exposure" ? "%p" : "%";
      readout = line(name, api().effect(item)[stat] + unit + (done ? "" : ' <span class="mint">→ ' + next[stat] + unit + '</span>'));
      const rating = Game.blades.armorRating(item);
      if (rating) readout = line("방어력", fmt(rating) + (done ? "" : ' <span class="mint">→ ' +
        fmt(Game.blades.armorRating(item,item.level+1)) + '</span>'));
      odds = done ? '<b>최고 강화 +20</b>' :
        "<b>강화 +" + item.level + " → +" + (item.level + 1) + '</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:' +
        pct(success) + '"></i><i class="odds-hold" style="width:' + pct(100-success) + '"></i></div><span>성공 ' + pct(success) + " · 유지 " + pct(100-success) + "</span>";
      const fee = fmt(cost) + " G" + (s.gold < cost ? " · 부족 " + fmt(cost-s.gold) + " G" : "");
      strike = done ? '<button class="primary" disabled>' + icon("check") + '강화 완료<small>+20</small></button>' :
        btn("outfitForge",icon("hammer") + "강화<small>" + fee + "</small>",item.id,"primary",s.gold < cost);
    } else {
      const spare = kit.items.some(it => it.kind === slot.kind && !slotFor(s,it.id));
      readout = line("착용 장비","빈칸");
      odds = "<span>" + (spare ? "보관 중인 장비를 착용하세요." : "숲 사냥에서 장비를 얻을 수 있습니다.") + "</span>";
      strike = spare ? openBtn("outfit:forgeEquip:" + key,icon("backpack") + "장비 착용","primary") :
        '<button class="primary" disabled>' + icon("hammer") + '강화 대기</button>';
    }
    const heading = item ? grade(item) + " " + api().name(item) + " +" + item.level : slot.name;
    return '<div class="columns forge-layout outfit-layout" data-empty="' + !item + '"><div class="stage-side">' +
      BladeView.switches("outfit") + scene("forge",heading,"",item ? Game.blades.baseGradeNames[item.grade] + " · " + slot.name : slot.name,"",0,null,art(slot.kind),item) +
      '</div><section class="panel"><div class="stats">' + readout + '<div class="forge-odds journey-odds">' + odds + '</div></div>' +
      strike + '<div class="actions forge-support">' + openBtn("bladeStyles",icon("swords")+"검술") + go("forest",icon("trees")+"숲 사냥","action") +
      '<button class="round" data-open="' + detail + '" aria-label="' + slot.name + ' 상세">' + icon("circle-help") + '</button></div></section></div>';
  }
  function slots(s) {
    const data = api().state(s), armor = Game.blades.currentArmor(s);
    const cells = api().slots.map(slot => {
      const chest = slot.kind === "armor";
      const item = chest ? armor : data.items.find(it => it.id === data.equipped[slot.key]);
      const picture = chest ? BladeView.artwork(armor) : art(slot.kind);
      const label = item ? grade(item) + " " + (chest ? Game.blades.name(item) : api().name(item)) + " +" + item.level : "비어 있음";
      return '<button class="bag-slot outfit-slot" data-open="outfit:slot:' + slot.key +
        '" aria-label="' + escapeHtml(slot.name + ' · ' + label) + '" data-empty="' + !item + '" data-rarity="' +
        (item ? Game.blades.itemRarity(item).key : "") + '"><span class="outfit-slot-title">' + slot.name + '</span><span class="bag-slot-art">' +
        picture + '</span><small>' + (item ? grade(item) + ' +' + item.level : '비어 있음') + '</small></button>';
    });
    return ["착용 장비", '<div class="outfit-grid">' + cells.join("") + '</div>' +
      line("속성 장비 보관",data.items.length + " / " + api().capacity)];
  }
  function slotView(s, slot) {
    if (slot.kind === "armor") {
      const armor = Game.blades.currentArmor(s);
      return [slot.name, '<div class="bag-detail-art">' + BladeView.artwork(armor) + '</div>' +
        line("착용 중", Game.blades.name(armor) + " +" + armor.level) +
        '<button class="primary" data-blade-home="armor">' + icon("hammer") + '흉갑 강화</button>' +
        openBtn("bladeArmorCollection","흉갑 교체") + openBtn("bladeArmorItem-"+armor.id,"장비 상세")];
    }
    const data = api().state(s);
    const list = data.items.filter(item => item.kind === slot.kind &&
      (!slotFor(s,item.id) || data.equipped[slot.key] === item.id)).sort((a,b) =>
      Number(data.equipped[slot.key] === b.id) - Number(data.equipped[slot.key] === a.id) || b.grade - a.grade);
    return [slot.name, list.length ? list.map(item => {
      const worn = slotFor(s,item.id);
      return row(GearGradeView.colored(item,grade(item) + " " + api().name(item) + " +" + item.level),
        GearCompareView.score(Game.compareGear(s,item,"outfit",slot.key)) + " · " + (worn ? worn.name + " 착용 · " : "") + statsLabel(item),
        openBtn("outfit:item:"+item.id+":"+slot.key,"살펴보기","mini"),"",art(item.kind));
    }).join("") : '<div class="bag-detail-art">' + art(slot.kind) + '</div>' +
      desc("숲 사냥에서 얻은 " + (slot.kind === "ring" ? "반지" : slot.name) + "를 여기에 착용할 수 있습니다.")];
  }
  function itemView(s, item, preferred) {
    const current = slotFor(s,item.id);
    const kinds = api().slots.filter(slot => slot.kind === item.kind);
    const targets = preferred ? kinds.filter(slot => slot.key === preferred) : kinds;
    const q = api().quote(item);
    const comparison = Game.compareGear(s,item,"outfit",preferred);
    let body = '<div class="bag-detail-art">' + art(item.kind) + '</div>' + GearGradeView.detail(item);
    if (current) body += GearCompareView.detail(comparison, "outfit");
    else {
      const ordered = [...targets].sort((a,b) => Number(b.key === comparison.slot) - Number(a.key === comparison.slot));
      for (const slot of ordered) {
        const match = slot.key === comparison.slot ? comparison : Game.compareGear(s,item,"outfit",slot.key);
        body += GearCompareView.detail(match,"outfit");
        const armor = match.rows.find(stat => stat.key === "armorRating");
        if (armor) body += line("착용 방어력 합계",fmt(Game.blades.armorStats(s).armorRating + armor.delta));
        body += btn("outfitEquip", slot.name + (match.current ? " 교체" : " 착용"), slot.key + ":" + item.id, "primary");
      }
    }
    body += line("장비 상태",current ? current.name + " 착용" : "미착용") +
      line("획득", "숲 " + item.rank + "단계");
    const region = [1,6,11,16].find(rank => api().preferredElement(rank) === item.element);
    if (region) {
      const area = Game.trail.region(region);
      const kind = area.pack.find(kind => api().profile(region,kind)[item.element] < 0);
      if (kind) body += line("유리한 사냥터",area.name + " · " + Game.trail.enemy(region,kind).name);
    }
    if (current) {
      body += item.level < 20 ? btn("outfitForge","재련 +" + (item.level + 1) + " · " + fmt(q.cost) + " G · 성공 " + pct(q.success),
        item.id,"primary",s.gold < q.cost) : line("재련","최고 단계 +20");
      body += btn("outfitUnequip", current.name + " 해제", current.key + ":" + item.id);
    }
    if (s.hunt) body += desc("착용과 재련으로 바뀐 능력치는 다음 사냥부터 적용됩니다.");
    if (!current) body += openBtn("outfit:salvage:" + item.id, "분해");
    body += openBtn("outfit:slots","착용 장비로");
    return [grade(item) + " " + api().name(item) + " +" + item.level, body];
  }
  function enemyInfo(rank,kind,build) {
    const profile = api().profile(rank,kind);
    const values = api().effective(profile,build);
    const keys = Object.keys(api().elements).sort((a,b) => values[a] - values[b]);
    return {profile,values,keys,build};
  }
  function resistance(percent) { return (percent > 0 ? "+" : "") + pct(percent); }
  function encounterChip(rank,kind,build,active) {
    const info = enemyInfo(rank,kind,build);
    const labels = [[info.keys[0],"약점"],[info.keys.at(-1),"저항"]].map(([key,tag]) =>
      (tag === "약점" && info.values[key] >= 0) || (tag === "저항" && info.values[key] <= 0) ? "" :
        '<span>' + elementIcon(key) + api().elements[key] + " " + tag + " " + resistance(info.values[key]) + '</span>').filter(Boolean);
    return '<button class="outfit-enemy-chip" data-open="outfit:enemy:' + rank + ':' + kind + (active ? ':live' : '') + '" aria-haspopup="dialog">' +
      (labels.length ? labels.join("") : "속성 저항") + icon("circle-help") + '</button>';
  }
  function enemyDetail(s,rank,kind,live) {
    const build = live && s.hunt?.fieldKit || api().build(s);
    const {profile,values,keys} = enemyInfo(rank,kind,build);
    const weak = keys[0];
    const monster = Game.trail.enemy(rank,kind);
    let body = '<table class="loot-table"><thead><tr><th>속성</th><th>기본 저항</th><th>적용 저항</th></tr></thead><tbody>' +
      keys.map(key => '<tr><th>'+ api().elements[key] +'</th><td>'+resistance(profile[key])+'</td><td>'+resistance(values[key])+'</td></tr>').join("") +
      '<tr><th>물리</th><td>0%</td><td>0%</td></tr></tbody></table>';
    const own = keys.filter(key => build.conversion[key] > 0);
    const physical = 100 - own.reduce((sum,key) => sum + build.conversion[key],0);
    body += line("내 피해 구성",["물리 " + pct(physical), ...own.map(key => api().elements[key]+" "+pct(build.conversion[key]))].join(" · "));
    const exposed = keys.filter(key => build.exposure[key] > 0);
    if (exposed.length) body += line("내 저항 감소", exposed.map(key => api().elements[key]+" −"+pct(build.exposure[key])+"p").join(" · "));
    body += line("이 적에게 주는 피해",pct(100 * api().multiplier(profile,build)));
    if (values[weak] < 0) body += desc(monster.name + "에게는 " + api().elements[weak] + " 피해 전환 장비가 유리합니다.");
    const items = api().state(s).items.filter(item => !slotFor(s,item.id));
    let best, multiplier = api().multiplier(profile, api().build(s));
    for (const item of items) {
      for (const slot of api().slots.filter(slot => slot.kind === item.kind)) {
        const next = api().multiplier(profile,api().build(s,{slot:slot.key, id:item.id}));
        if (next <= multiplier + 0.000001) continue;
        multiplier = next;
        best = {item,slot};
      }
    }
    if (best) body += row(escapeHtml(api().name(best.item)),(live ? "다음 사냥 · " : "") +
      best.slot.name + " 착용 시 " + pct(multiplier * 100), openBtn("outfit:item:"+best.item.id+":"+best.slot.key,"살펴보기","mini"),"",art(best.item.kind));
    body += loadout();
    const others = Game.trail.lineup(rank,false).filter(other => other !== kind);
    if (others.length) body += '<details class="loot-rules"><summary>이 단계의 다른 조우</summary>' +
      others.map(other => openBtn("outfit:enemy:" + rank + ":" + other + (live ? ":live" : ""), Game.trail.enemy(rank,other).name,"action")).join(" ") + '</details>';
    return [monster.name + " · 속성 저항",body];
  }
  function modal(s,key) {
    const [,page,arg,target,context] = key.split(":");
    if (page === "forge") return forgeSlots(s);
    if (page === "forgeEquip") {
      const slot = api().slots.find(part => part.key === arg);
      const kit = api().state(s), worn = kit.items.find(it => it.id === kit.equipped[arg]);
      const choices = kit.items.filter(it => it.kind === slot.kind && !slotFor(s,it.id));
      const current = worn ? line("현재 착용",api().name(worn) + " +" + worn.level) + line("능력치",statsLabel(worn)) : "";
      return [slot.name + " 착용", current + (choices.length ? choices.map(it =>
        row(GearGradeView.colored(it,grade(it) + " " + api().name(it) + " +" + it.level), GearCompareView.score(Game.compareGear(s,it,"outfit",arg)) + " · " + statsLabel(it),
          btn("outfitEquip",worn ? "교체" : "착용",arg + ":" + it.id,"mini"),"",art(it.kind))).join("") :
        desc("숲 사냥에서 얻은 장비를 여기에 착용할 수 있습니다."))];
    }
    if (page === "slots") return slots(s);
    if (page === "enemy") return enemyDetail(s,Number(arg),target,context === "live");
    if (page === "slot") {
      const slot = api().slots.find(slot => slot.key === arg);
      if (slot) return slotView(s,slot);
    }
    const item = api().state(s).items.find(item => item.id === arg);
    if (!item) return ["보관 장비", loadout()];
    if (page === "salvage") return ["장비 분해",line("분해 장비",api().name(item) + " +" + item.level) +
      desc("장비와 재련 단계가 사라집니다.") + btn("outfitSalvage","분해 · 각인석 +" + (1 + item.grade),item.id,"action",!!slotFor(s,item.id)) +
      openBtn("outfit:item:"+item.id,"돌아가기")];
    return itemView(s,item,target);
  }
  function receipt(s,result) {
    if (!result) return "";
    if (result.outfitSalvaged) return '<span class="blade-drop">'+icon("gem")+'착용 장비 보관함 가득 참 · 각인석 +1</span>';
    const item = result.outfitDrop;
    if (!item) return "";
    const content = art(item.kind) + '<b>' + GearGradeView.colored(item,grade(item)+" "+api().name(item)) + '</b><small>' + effectLabel(item) + '</small>';
    return api().state(s).items.some(it => it.id === item.id) ?
      openBtn("outfit:item:"+item.id,content,"loot-gear") :
      '<span class="loot-gear">'+content+'</span>';
  }
  return {art,loadout,entries,forge,modal,encounterChip,receipt};
})();
