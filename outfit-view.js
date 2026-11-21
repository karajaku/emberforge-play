"use strict";

const OutfitView = (() => {
  const spriteIndex = {helm:0, shoulder:1, armor:2, legs:3, gloves:4, neck:5, ring:6, cloak:7};
  const elementIcon = key => key === "lightning" ? '<i aria-hidden="true">ϟ</i>' : icon(key === "fire" ? "flame" : "snowflake");
  const api = () => Game.outfit;
  const loadout = () => openBtn("outfit:slots", icon("shield") + "착용 장비", "action outfit-open");
  const grade = item => Game.blades.rarityNames[item.grade];
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
  function entries(s) {
    return api().state(s).items.map(item => ({
      key:"outfit-" + item.id, group:"gear", name:api().name(item), grade:item.grade, mark:"+" + item.level,
      art:art(item.kind), status:slotFor(s,item.id) ? "착용" : "", open:"outfit:item:" + item.id,
    }));
  }
  function slots(s) {
    const data = api().state(s), armor = Game.blades.currentArmor(s);
    const cells = api().slots.map(slot => {
      const chest = slot.kind === "armor";
      const item = chest ? armor : data.items.find(it => it.id === data.equipped[slot.key]);
      const picture = chest ? BladeView.artwork(armor) : art(slot.kind);
      const label = item ? (chest ? Game.blades.name(item) : api().name(item)) + " +" + item.level : "비어 있음";
      return '<button class="bag-slot outfit-slot" data-open="outfit:slot:' + slot.key +
        '" aria-label="' + escapeHtml(slot.name + ' · ' + label) + '" data-empty="' + !item + '" data-rarity="' +
        (item?.grade ?? "") + '"><span class="outfit-slot-title">' + slot.name + '</span><span class="bag-slot-art">' +
        picture + '</span><small>' + (item ? '착용 +' + item.level : '비어 있음') + '</small></button>';
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
      return row(escapeHtml(api().name(item)) + " +" + item.level,
        (worn ? worn.name + " 착용 · " : "") + effectLabel(item),
        openBtn("outfit:item:"+item.id+":"+slot.key,"살펴보기","mini"),"",art(item.kind));
    }).join("") : '<div class="bag-detail-art">' + art(slot.kind) + '</div>' +
      desc("숲 사냥에서 얻은 " + (slot.kind === "ring" ? "반지" : slot.name) + "를 여기에 착용할 수 있습니다.")];
  }
  function itemView(s, item, preferred) {
    const current = slotFor(s,item.id), data = api().state(s);
    const kinds = api().slots.filter(slot => slot.kind === item.kind);
    const targets = preferred ? kinds.filter(slot => slot.key === preferred) : kinds;
    const q = api().quote(item);
    let body = '<div class="bag-detail-art">' + art(item.kind) + '</div>' +
      line("장비",grade(item) + " · " + (current ? current.name + " 착용" : "미착용")) +
      line("획득", "숲 " + item.rank + "단계") + line("속성 효과",effectLabel(item));
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
    for (const slot of current ? [] : targets) {
      const other = data.items.find(it => it.id === data.equipped[slot.key]);
      if (other) body += line(slot.name + "에 착용 중", escapeHtml(api().name(other)) + " +" + other.level);
      body += btn("outfitEquip", slot.name + (other ? " 교체" : " 착용"), slot.key + ":" + item.id, "primary");
    }
    if (s.hunt) body += desc("착용과 재련으로 바뀐 속성은 다음 사냥부터 적용됩니다.");
    if (!current) body += openBtn("outfit:salvage:" + item.id, "분해");
    body += openBtn("outfit:slots","착용 장비로");
    return [api().name(item) + " +" + item.level, body];
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
    const content = art(item.kind) + '<b>' + escapeHtml(grade(item)+" "+api().name(item)) + '</b><small>' + effectLabel(item) + '</small>';
    return api().state(s).items.some(it => it.id === item.id) ?
      openBtn("outfit:item:"+item.id,content,"loot-gear loot-grade-"+item.grade) :
      '<span class="loot-gear loot-grade-'+item.grade+'">'+content+'</span>';
  }
  return {art,loadout,entries,modal,encounterChip,receipt};
})();
