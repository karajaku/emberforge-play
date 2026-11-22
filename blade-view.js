"use strict";
const BladeView = (() => {
  const rules = () => Game.blades;
  const styleHints = {
    heavy: "기세를 모아 일격을 가합니다.",
    counter: "적 스킬 예고에 일반 타격을 방어로 바꿉니다. 막으면 다음 공격으로 되받습니다.",
    wound: "상처는 매 턴 출혈을 일으킵니다. 3겹부터 다음 공격이 방어를 뚫고 파열됩니다.",
  };
  const sideLabel = {prefix: "접두", suffix: "접미"};
  const isArmor = item => item.type === "armor";
  const label = item => rules().name(item) + " +" + item.level;
  const prefix = item => isArmor(item) ? "bladeArmor" : "blade";
  function sprite(item, stage = Game.bladeStage({level:item.level, grade:0})) {
    if (isArmor(item)) return "cuirass";
    return ["axe","mace","dagger"].includes(item.weaponKind) ? "blade-" + item.weaponKind : "blade" + (stage || "");
  }
  function damageRange(stats) {
    return stats.minDamage === stats.maxDamage ? fmt(stats.minDamage) : fmt(stats.minDamage) + "–" + fmt(stats.maxDamage);
  }
  const artwork = item => '<span class="gear-portrait" aria-hidden="true" style="background-image:url(assets/' + sprite(item) + '-sheet.png)"></span>';
  function switches(type) {
    const quick = [["weapon","hunt","무기"],["armor","equip","흉갑"]].map(([id,ic,label]) =>
      '<button data-gear="' + id + '" aria-pressed="' + (type === id) + '">' + controlArt(ic) + label + "</button>");
    return '<div class="segment gear-switch forge-slot-switch">' + quick.join("") +
      '<button data-open="outfit:forge" aria-haspopup="dialog" class="' + (type === "outfit" ? "sel" : "") + '">' +
      icon("layers") + '부위 선택</button>' + openBtn("forgeItem:filter",controlArt("filter") + "필터", ForgeItemView.filtering() ? "sel" : "") + '</div>';
  }
  function forge(s, quote) {
    const b = rules(), item = quote.item, style = b.state(s).style;
    const finished = item.level === 20, rate = quote.success;
    const next = finished ? "" : ' <span class="mint">→ ' + fmt(b.attack(item, item.level + 1)) + "</span>";
    const odds = finished ? "<b>무기 완성</b><span>최고 강화 +20</span>" :
      "<b>강화 +" + item.level + " → +" + (item.level + 1) + '</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:' +
      pct(rate) + '"></i><i class="odds-hold" style="width:' + pct(100-rate) + '"></i></div><span>성공 ' + pct(rate) + " · 유지 " + pct(100-rate) + "</span>";
    const main = ForgeItemView.strike(s,quote);
    return '<div class="columns forge-layout blade-layout"><div class="stage-side">' + switches("weapon") +
      scene("forge", label(item), "", b.baseGradeNames[item.grade] + " · " + b.styles[style] + " 검술", sprite(item), 0, null, "", item) + '</div><section class="panel"><div class="stats">' +
      line("공격력", fmt(b.attack(item)) + next) + '<div class="forge-odds journey-odds">' + odds + "</div></div>" + main +
      '<div class="actions forge-support">' + openBtn("bladeStyles", icon("swords")+"검술") + go("forest", controlArt("hunt")+"숲 사냥", "action") +
      '<button class="round" data-open="' + ForgeItemView.detailKey(quote) + '" aria-label="무기 능력과 강화 조건">' + icon("circle-help") + "</button></div></section></div>";
  }
  function armor(s,quote) {
    const b=rules(), item=quote.item, stats=b.armorStats(s,item), done=item.level>=20;

    const rate=quote.success;
    const readout=line("흉갑 방어력",fmt(b.armorRating(item))+(done?"":' <span class="mint">→ '+fmt(b.armorRating(item,item.level+1))+'</span>'));
    const meter=done ? "<b>방어구 완성</b><span>숲 적용 +20</span>" :
      "<b>강화 +"+item.level+" → +"+(item.level+1)+'</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:'+pct(rate)+
      '"></i><i class="odds-hold" style="width:'+pct(100-rate)+'"></i></div><span>성공 '+pct(rate)+' · 유지 '+pct(100-rate)+'</span>';
    const button=ForgeItemView.strike(s,quote);
    return '<div class="columns forge-layout blade-layout"><div class="stage-side">'+switches("armor")+
      scene("forge",label(item),"",b.baseGradeNames[item.grade]+" · 착용 방어력 "+fmt(stats.armorRating),"cuirass",0,null,"",item)+'</div><section class="panel"><div class="stats">'+
      readout+'<div class="forge-odds journey-odds">'+meter+'</div></div>'+button+'<div class="actions forge-support">'+
      openBtn("bladeStyles",icon("swords")+"검술")+go("forest",controlArt("hunt")+"숲 사냥","action")+
      '<button class="round" data-open="'+ForgeItemView.detailKey(quote)+'" aria-label="방어구 능력">'+icon("circle-help")+'</button></div></section></div>';
  }
  function slots(item, polish = false, ore = 0) {
    const b = rules(), caps = b.itemCaps(item);
    return ["prefix","suffix"].map((side, index) => {
      const list = item.mods.filter(m => b.modDefs[m.key].side === side);
      const filled = list.map(m => {
        if (m.ascended) { const special=SoulView.recipes(item)[m.ascended]; return '<div class="blade-affix soul-special"><span><small>초월</small> <strong>'+escapeHtml(special.name)+'</strong><small class="blade-range">'+escapeHtml(special.detail)+'</small></span></div>'; }
        const def = b.modDefs[m.key];
        const grade = ["초벌","중급","상급","최상급"][m.tier - 1] || "등급 " + m.tier;
        return '<div class="blade-affix"><span><small>' + grade + "</small> " + escapeHtml(def.name) + '</span><b>+' +
          fmt(m.value) + (m.key === "plating" ? "%p" : "%") + (polish ? '<small class="blade-range">' + def.ranges[m.tier-1].join("~") + "%</small>" : "") + "</b>" +
          (polish ? btn(prefix(item)+"Polish",m.value >= def.ranges[m.tier-1][1] ? "최고치" : "연마 · 3석",m.key,"mini",ore<3 || m.value >= def.ranges[m.tier-1][1]) : "") + "</div>";
      }).join("");
      return '<div class="blade-slots"><h4>' + sideLabel[side] + " " + list.length + " / " + caps[index] + "</h4>" +
        filled + (caps[index] > list.length ? '<small class="blade-empty">빈자리 ' + (caps[index] - list.length) + "</small>" : "") + "</div>";
    }).join("");
  }
  function info(s, item, equip = "") {
    const b = rules(), profile = b.weaponProfile(item);
    return GearGradeView.detail(item) + GearCompareView.detail(Game.compareGear(s,item,"blade"), "blade") + equip +
      line("무기 종류", profile.name) +
      (item.weaponKind === "dagger" ? line("치명타 피해", "150%") : line("무기 특성", escapeHtml(profile.trait))) +
      (item.base ? line("재질 특성", escapeHtml(b.bases[item.base].trait)) : "") +
      line("획득", item.base ? "숲 " + item.rank + "단계" : "대장간 지급") +
      line("+20 완성 공격력", fmt(b.attack(item, 20))) + slots(item);
  }
  function itemDetail(s, item) {
    const b = rules(), on = b.current(s).id === item.id;
    const g=Game.endgame.info(s), deployed=g.deployed.includes(item.id);
    const field = item.level >= 13 ? line("배치 수익",fmt(b.income(item)) + " G / 분") +
      (deployed ? btn("bladeRecall","배치 회수",item.id) : !on ? btn("bladeDeploy","사냥터 배치",item.id,"action",g.deployed.length >= (g.unlocked.land?2:1) || item.id===s.hunt?.bladeId || !!item.soulChoice) : "") : "";
    const equip = on ? "" : btn("bladeEquip","이 무기 장착",item.id,"primary",deployed);
    return info(s,item,equip) + field + soulActions(s,item) + (on ? openBtn("bladeCraft","각인·연마","primary") :
      openBtn("bladeSalvage-" + item.id, "분해 · 각인석 회수","action",deployed || item.id===s.hunt?.bladeId || !!item.soulChoice)) + (s.hunt && !on ? desc("새 장착 무기는 다음 사냥에 적용됩니다.") : "");
  }
  function soulActions(s,item) {
    const g=Game.endgame.info(s), deployed=g.deployed.includes(item.id);
    const soul = (item.soulChoice || g.unlocked.luck || g.unlocked.lung || SoulView.tokensFor(s,item).length)
      ? SoulView.open("craft:"+item.id,item.soulChoice?"남길 옵션 선택":"영혼 제작·전승","action",deployed) : "";
    const endgame = (SoulView.canOffer(s,item) ? SoulView.open("offer:"+item.id,"환생 · 옵션 전승") : "") +
      (item.level===20 ? SoulView.open("ascend:"+item.id,item.ascended?"초월 효과":"초월 공정","action",deployed) : "");
    return soul + endgame;
  }
  function collection(s) {
    const b = rules(), rack = b.state(s);
    return line("무기",rack.items.length+" / 120자루") + (Game.endgame.info(s).gift ? SoulView.open("lessons","첫 +20 선물 선택","primary") : "") + rack.items.slice().reverse().map(item => row(GearGradeView.colored(item,label(item)),
      GearCompareView.score(Game.compareGear(s,item,"blade")) + " · 물리 " + damageRange(b.weaponStats(item)) + " · 치명타 " + pct(b.weaponStats(item).critChance) + (item.id === rack.equipped ? " · 장착 중" : [rack.deployed,rack.extraDeployed].includes(item.id) ? " · 배치 중" : ""),
      openBtn("bladeItem-"+item.id,"살펴보기","mini"),"",artwork(item))).join("") +
      '<button class="action" data-archive-blade>기록 검 대장간</button>';
  }
  function processes(s, item) {
    const index = Swordcraft.stageIndex(item);
    let work = "";
    if (index >= 0 && item.level < 20 && !item.finalTrial) {
      const stage = Swordcraft.stages[index];
      work = btn(prefix(item)+"WorkStart", icon(stage.icon) + (item.work ? "공정 계속 · " : "제작 · ") + (isArmor(item) ? armorStageNames[index] : stage.title) +
        "<small>마감 " + fmt(Swordcraft.fee(item, Game.price, index)) + " G</small>", "", "action split");
    }
    if (item.level === 19 && (item.finalTrial || Breakthrough.choices(item, Game.price).length))
      work += openBtn(prefix(item)+"Final", item.finalTrial ? "마지막 돌파 계속" : "+20 돌파 방식 선택");
    return work;
  }
  function workshop(s, armor = false) {
    const b = rules(), item = armor ? b.currentArmor(s) : b.current(s), rack = b.state(s);
    const available = b.available(item).map(key => [key, b.modDefs[key]]);
    if (item.soulChoice) return SoulView.modal(s,"soul:craft:"+item.id)[1];
    const firstProcess = item.level===7 && Swordcraft.stageIndex(item)===0;
    const choice = firstProcess ? line("일반 강화 → +8",fmt(armor ? b.armorCost(s) : b.cost(item))+" G · 성공 "+pct(b.rate(item))) +
      line((armor ? armorStageNames[0] : Swordcraft.stages[0].title)+" → +"+Swordcraft.stages[0].target,"연마 3회 후 마감") : "";
    return line(armor ? "장착 방어구" : "장착 무기", GearGradeView.colored(item,label(item))) + line("베이스 등급",b.baseGradeNames[item.grade]) + line("각인석 / 우두머리 인장",fmt(rack.ore)+"개 / "+fmt(rack.seals || 0)+"개") + choice + processes(s,item) +
      slots(item,true,rack.ore) + (available.length ? btn(prefix(item)+"Etch",icon("sparkles")+"무작위 각인 · 2석","","primary",rack.ore<2) +
        '<label for="bladeTarget">지정 각인</label><select id="bladeTarget">' + available.map(([key,def]) =>
          '<option value="'+key+'">'+sideLabel[def.side]+" · "+escapeHtml(def.name)+'</option>').join("") +
        '</select><button class="action" data-blade-target="'+prefix(item)+'Etch"'+(rack.ore<8 || !rack.seals?' disabled':'')+'>지정 각인 · 8석 + 인장 1</button>' : '') +
      SoulView.open("craft:"+item.id,"영혼 제작·전승") + desc("각인은 빈자리에 새 옵션을 새깁니다. 연마는 선택한 옵션의 등급을 유지하고 수치를 다시 뽑습니다.");
  }
  function armorDetail(s, item) {
    const b=rules(), current=b.currentArmor(s), equipped=item.id===current.id;
    return GearGradeView.detail(item) + GearCompareView.detail(Game.compareGear(s,item,"chest"), "chest") +
      (equipped ? "" : btn("bladeArmorEquip","이 방어구 장착",item.id,"primary")) +
      line("획득", item.base ? "숲 "+item.rank+"단계" : "대장간 지급") +
      line("착용 방어력 합계", fmt(b.armorStats(s,item).armorRating)) +
      desc("방어력은 약한 타격일수록 받는 피해를 더 높은 비율로 줄입니다.") + slots(item) + soulActions(s,item) + (equipped ? openBtn("bladeArmorCraft","각인·연마","primary") :
        openBtn("bladeArmorSalvage-"+item.id,"분해 · 각인석 회수","action",item.id===s.hunt?.armorId || !!item.soulChoice)) +
      (s.hunt && !equipped ? desc("새 방어구는 다음 사냥에 적용됩니다.") : "");
  }
  function armorModal(s, key) {
    const b=rules(), item=b.currentArmor(s), list=b.armors(s);
    if (key==="bladeArmorLining") return ["숲 방호 안감",liningCard(s,true)];
    if (key==="bladeArmorCraft") return ["방어구 제작",openBtn("bladeArmorLining",icon("shield")+"숲 방호 안감") + workshop(s,true)];
    if (key==="bladeArmorWork") return craftWorkshop({...s,weapon:item},"armor");
    if (key==="bladeArmorFinal") return finalWorkshop({...s,weapon:item},"armor");
    if (key==="bladeArmorInfo") return [label(item),armorDetail(s,item),b.itemRarity(item)];
    const target=list.find(it=>key==="bladeArmorItem-"+it.id || key==="bladeArmorSalvage-"+it.id);
    if (target) {
      if (key.startsWith("bladeArmorSalvage-")) return ["방어구 분해",
        line("분해할 방어구",GearGradeView.colored(target,label(target))+" · "+target.id.toUpperCase()) +
        line("받는 각인석",1+target.mods.length+"개") + desc("방어구 한 벌과 강화·옵션이 함께 소모됩니다.") +
        (SoulView.canOffer(s,target) ? SoulView.open("offer:"+target.id,"환생 보상 보기 · 영혼 5 P와 전승 재료") : "") + openBtn("bladeArmorItem-"+target.id,"방어구로 돌아가기") +
        btn("bladeArmorSalvage","각인석으로 분해",target.id,"action",target.id===item.id || target.id===s.hunt?.armorId || !!target.soulChoice)];
      return [label(target),armorDetail(s,target),b.itemRarity(target)];
    }
    return ["방어구 보관함",OutfitView.loadout() + line("흉갑",list.length+" / 120벌") + (Game.endgame.info(s).gift ? SoulView.open("lessons","첫 +20 선물 선택","primary") : "") + list.slice().reverse().map(it=>
      row(GearGradeView.colored(it,label(it)),GearCompareView.score(Game.compareGear(s,it,"chest"))+" · 방어력 "+fmt(b.armorRating(it))+" · 체력 "+fmt(b.armorStats(s,it).hp)+(it.id===item.id?" · 장착 중":""),
        openBtn("bladeArmorItem-"+it.id,"살펴보기","mini"),"",artwork(it))).join("")+
      '<button class="action" data-archive-blade="armor">기록 방어구 대장간</button>'];
  }
  function lootPreview(s, rank) {
    const b=rules();
    if (!Number.isInteger(rank) || rank<1 || rank>60) rank=1;
    const cleared=b.state(s).cleared;
    const first=rank%5===1 && cleared<rank;
    const odds=b.dropOdds(rank,first);
    const percent=value=>Number(value.toFixed(5))+"%";
    const stageText=rank%5===0 ? "우두머리" : first ? "구간 첫 승리" : "일반 사냥";
    const opts=Array.from({length:60},(_,i)=>'<option value="'+(i+1)+'"'+(i+1===rank?' selected':'')+'>'+(i+1)+'단계</option>').join("");
    const table='<table class="loot-table"><caption>승리 한 번 · 부위별 확률</caption><thead><tr><th>베이스 등급</th><th>무기</th><th>방어구</th></tr></thead><tbody>'+
      odds.perWin.map((p,i)=>'<tr><th scope="row">'+b.baseGradeNames[i]+'</th><td>'+percent(p)+'</td><td>'+percent(p)+'</td></tr>').join("")+'</tbody></table>';
    const affixes='<details class="loot-rules"><summary>베이스별 접두·접미</summary><table class="loot-table"><thead><tr><th>베이스 등급</th><th>획득 시</th><th>최대 접두 / 접미</th></tr></thead><tbody>'+
      b.baseGradeRules.map((r,i)=>'<tr><th scope="row">'+b.baseGradeNames[i]+'</th><td>'+r.min+'~'+r.max+'줄</td><td>'+r.caps.join(' / ')+'</td></tr>').join("")+'</tbody></table>'+
      desc("접두·접미가 0개면 일반 장비입니다. 1~3개인 매직 장비는 이름과 테두리가 하늘색이고, 4~6개인 레어 장비는 금색입니다. 높은 단계에서는 한 줄의 수치 등급도 높아질 수 있습니다.")+'</details>';
    return ["장비 획득 확률",'<label for="lootRank">사냥 단계</label><select id="lootRank">'+opts+'</select>'+
      line(stageText,"무기 · 흉갑 각각 "+percent(odds.itemPercent)) + table +
      desc("1단계 첫 승리에는 도끼·철퇴·단검 중 하나를 얻습니다. 이후 무기가 떨어지면 한손검·도끼·철퇴·단검이 각각 25%입니다.") +
      line("속성 장비",pct(Game.outfit.dropChance(s,rank))) +
      desc("무기·흉갑과 별도로 속성 장비 한 개를 추첨합니다. 속성 장비의 첫 획득과 우두머리 승리는 확정입니다.") +
      openBtn("outfit:enemy:" + rank + ":" + Game.trail.lineup(rank,false)[0],"이 단계의 적 저항") +
      (first ? desc("이 단계의 반복 사냥에서는 각 부위 등장률이 "+percent(b.dropOdds(rank,false).itemPercent)+"입니다.") : "")+affixes];
  }
  function styles(s) {
    const b = rules(), st=b.skills(s), chosen=b.state(s).style;
    return Object.entries(b.styles).map(([key,name]) => {
      const special = st.ascension === key && Game.endgame.transform[key];
      return row(special ? name+" · "+special.name : name,special ? special.detail : styleHints[key],btn("bladeStyle",chosen===key?"선택됨":"선택",key,"mini",chosen===key));
    }).join("") +
      line("일반 타격 / 기세 일격", fmt(st.strike)+" / "+fmt(st.heavy)) +
      line("반격 / 파열(3겹)", fmt(st.counter)+" / "+fmt(st.attack+3*st.rupture)) + line("체력 / 상시 피해 감소",fmt(st.hp)+" / "+pct(st.defense)) +
      line("착용 방어력",fmt(st.armorRating)) +
      (s.hunt ? desc("선택한 검술은 다음 사냥에 적용됩니다.") : "");
  }
  function modal(s, key) {
    const b=rules(), item=b.current(s);
    if (key.startsWith("bladeArmor")) return armorModal(s, key);
    if (key.startsWith("bladeLoot-")) return lootPreview(s, Number(key.slice(10)));
    if (key === "bladeWork") return craftWorkshop({...s,weapon:item},true);
    if (key === "bladeFinal") return finalWorkshop({...s,weapon:item},true);
    if (key === "bladeInfo") return [label(item), info(s,item)+desc("실패하면 강화비를 쓰고 현재 강화를 유지합니다.")+openBtn("bladeCraft","각인·연마"),b.itemRarity(item)];
    if (key === "bladeStyles") return ["검술 선택",styles(s)];
    if (key === "bladeCraft") return ["무기 제작",workshop(s)];
    if (key === "bladeCollection") return ["무기 보관함",collection(s)];
    if (key === "bladeGuide") return ["무기 제작 수업", desc("숲에서는 한손검·도끼·철퇴·단검이 떨어집니다. 무기는 기본 피해 폭과 치명타 확률이 다르며, 치명타는 1.5배 피해를 줍니다. 흉갑·투구·어깨·다리·장갑·망토의 방어력은 합산됩니다.") + OutfitView.loadout() +
      line("강화", "공격력 증가 · 최고 +20") + line("각인", "접두·접미에 새 옵션") +
      desc("+7·+9·+11 제작 공정에서 특성을 고르면 +19에 마무리 공법이 열립니다. 각인석은 숲 승리와 여분 무기 분해로 모읍니다. 사냥 전에 검술을 고르면 주사위 전투에서 자동으로 발동합니다.") +
      openBtn("bladeLoot-1","단계별 장비 획득 확률") + openBtn("bladeStyles","검술 고르기") + go("forest","숲 사냥","primary")];
    const target=b.state(s).items.find(it=>key==="bladeItem-"+it.id || key==="bladeSalvage-"+it.id);
    if (!target) return ["무기 보관함",collection(s)];
    if (key.startsWith("bladeSalvage-")) return ["무기 분해", line("분해할 무기",GearGradeView.colored(target,label(target))+" · "+target.id.toUpperCase()) +
      line("받는 각인석",1 + target.mods.length + "개") + desc("강화와 옵션을 포함해 무기 한 자루를 소모합니다.") + (SoulView.canOffer(s,target) ? SoulView.open("offer:"+target.id,"환생 보상 보기 · 영혼 5 P와 전승 재료") : "") + openBtn("bladeItem-"+target.id,"무기로 돌아가기") +
      btn("bladeSalvage","각인석으로 분해",target.id,"action",target.id===item.id)];
    return [label(target),itemDetail(s,target),b.itemRarity(target)];
  }
  return {forge, armor, switches, modal, sprite, artwork, damageRange, itemDetail, armorDetail, label};
})();
