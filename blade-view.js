"use strict";
const BladeView = (() => {
  const rules = () => Game.blades;
  const styleHints = {
    heavy: "기세를 모아 일격을 가합니다.",
    counter: "적 스킬 예고에 일반 타격을 방어로 바꿉니다. 막으면 다음 공격으로 되받습니다.",
    wound: "상처는 매 턴 출혈을 일으킵니다. 3겹부터 다음 공격이 방어를 뚫고 파열됩니다.",
  };
  const sideLabel = {prefix: "접두", suffix: "접미"};
  const sprite = item => "blade" + (Game.bladeStage({level:item.level,grade:0}) || "");
  const artwork = item => '<span class="gear-portrait" aria-hidden="true" style="background-image:url(assets/' + sprite(item) + '-sheet.png)"></span>';
  function switches(type) {
    return '<div class="segment gear-switch">' + [["weapon","sword","무기"],["armor","shield","방어구"]].map(([id,ic,label]) =>
      '<button data-gear="' + id + '" aria-pressed="' + (type === id) + '" class="' + (type === id ? "sel" : "") + '">' + icon(ic) + label + "</button>").join("") + "</div>";
  }
  function forge(s) {
    const b = rules(), item = b.current(s), style = b.state(s).style;
    const finished = item.level === 20, cost = b.cost(item), rate = b.rate(item);
    const next = finished ? "" : ' <span class="mint">→ ' + fmt(b.attack(item, item.level + 1)) + "</span>";
    const odds = finished ? "<b>검신 완성</b><span>최고 강화 +20</span>" :
      "<b>강화 +" + item.level + " → +" + (item.level + 1) + '</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:' +
      pct(rate) + '"></i><i class="odds-hold" style="width:' + pct(100-rate) + '"></i></div><span>성공 ' + pct(rate) + " · 유지 " + pct(100-rate) + "</span>";
    const main = item.finalTrial ? openBtn("bladeFinal",icon("sword")+"돌파 계속<small>+20 마감</small>","primary") :
      finished ? openBtn("bladeCollection", icon("sword")+"검신 선택<small>+20 완성</small>", "primary") :
      btn("bladeForge", icon("hammer")+"강화<small>"+fmt(cost)+" G</small>", item.id, "primary", s.gold < cost);
    return '<div class="columns forge-layout blade-layout"><div class="stage-side">' + switches("weapon") +
      scene("forge", b.name(item) + " +" + item.level, "", b.styles[style] + " 검술", sprite(item)) + '</div><section class="panel"><div class="stats">' +
      line("공격력", fmt(b.attack(item)) + next) + '<div class="forge-odds journey-odds">' + odds + "</div></div>" + main +
      '<div class="actions forge-support">' + openBtn("bladeStyles", icon("swords")+"검술") + go("forest", icon("trees")+"숲 사냥", "action") +
      '<button class="round" data-open="bladeInfo" aria-label="검신 능력과 강화 조건">' + icon("circle-help") + "</button></div></section></div>";
  }
  function armor(s) {
    const b=rules(), item=s.armor, stats=b.skills(s), done=item.level>=20;
    const next=done ? stats : b.skills({...s,armor:{...item,level:item.level+1}});
    const rate=b.armorRate(s), fee=b.armorCost(s);
    const readout=line("체력",fmt(stats.hp)+(done?"":' <span class="mint">→ '+fmt(next.hp)+'</span>'));
    const meter=done ? "<b>방어구 완성</b><span>숲 적용 +20</span>" :
      "<b>강화 +"+item.level+" → +"+(item.level+1)+'</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:'+pct(rate)+
      '"></i><i class="odds-hold" style="width:'+pct(100-rate)+'"></i></div><span>성공 '+pct(rate)+' · 유지 '+pct(100-rate)+'</span>';
    const button=done?openBtn("bladeArmorInfo",icon("shield")+"완성<small>방어구 +20</small>","primary"):
      btn("bladeArmor",icon("hammer")+"강화<small>"+fmt(fee)+" G</small>","","primary",s.gold<fee);
    return '<div class="columns forge-layout blade-layout"><div class="stage-side">'+switches("armor")+
      scene("forge",Game.name(item,"armor")+" +"+fmt(item.level),"","피해 감소 "+fmt(stats.defense)+"%","cuirass",item.grade)+'</div><section class="panel"><div class="stats">'+
      readout+'<div class="forge-odds journey-odds">'+meter+'</div></div>'+button+'<div class="actions forge-support">'+
      openBtn("bladeStyles",icon("swords")+"검술")+go("forest",icon("trees")+"숲 사냥","action")+
      '<button class="round" data-open="bladeArmorInfo" aria-label="방어구 능력">'+icon("circle-help")+'</button></div>'+liningCard(s)+'</section></div>';
  }
  function slots(item, polish = false, ore = 0) {
    const b = rules(), caps = b.caps(item.rank);
    return ["prefix","suffix"].map((side, index) => {
      const list = item.mods.filter(m => b.modDefs[m.key].side === side);
      const filled = list.map(m => {
        const def = b.modDefs[m.key];
        const grade = ["초벌","중급","상급","최상급"][m.tier - 1] || "등급 " + m.tier;
        return '<div class="blade-affix"><span><small>' + grade + "</small> " + escapeHtml(def.name) + '</span><b>+' +
          fmt(m.value) + "%" + (polish ? '<small class="blade-range">' + def.ranges[m.tier-1].join("~") + "%</small>" : "") + "</b>" +
          (polish ? btn("bladePolish",m.value >= def.ranges[m.tier-1][1] ? "최고치" : "연마 · 3석",m.key,"mini",ore<3 || m.value >= def.ranges[m.tier-1][1]) : "") + "</div>";
      }).join("");
      return '<div class="blade-slots"><h4>' + sideLabel[side] + " " + list.length + " / " + caps[index] + "</h4>" +
        filled + (caps[index] > list.length ? '<small class="blade-empty">빈자리 ' + (caps[index] - list.length) + "</small>" : "") + "</div>";
    }).join("");
  }
  function info(s, item) {
    const b = rules(), base = b.bases[item.base];
    const now = b.attack(item), cap = b.attack(item, 20);
    return line("획득", item.base ? "숲 " + item.rank + "단계" : "대장간 지급") +
      line("공격력", fmt(now) + " · +20 완성 시 " + fmt(cap)) +
      (base.trait ? line("검신 고유", escapeHtml(base.trait)) : "") + slots(item);
  }
  function itemDetail(s, item) {
    const b = rules(), on = b.current(s).id === item.id;
    const equipped = b.current(s), difference = b.attack(item) - b.attack(equipped);
    const compare = on ? "" : line("장착 검 대비 공격력", (difference > 0 ? "+" : "") + difference);
    const rack = b.state(s), deployed = rack.deployed === item.id;
    const field = item.level >= 13 ? line("배치 수익",fmt(b.income(item)) + " G / 분") +
      (deployed ? btn("bladeRecall","배치 회수") : !on ? btn("bladeDeploy","사냥터 배치",item.id,"action",!!rack.deployed || item.id===s.hunt?.bladeId) : "") : "";
    return info(s,item) + compare + field + (on ? openBtn("bladeCraft","각인·연마","primary") :
      btn("bladeEquip","이 검신 장착",item.id,"primary",deployed) +
      openBtn("bladeSalvage-" + item.id, "분해하기","action",deployed || item.id===s.hunt?.bladeId)) + (s.hunt && !on ? desc("새 장착 검신은 다음 사냥에 적용됩니다.") : "");
  }
  function collection(s) {
    const b = rules(), rack = b.state(s);
    return line("검신",rack.items.length+" / 120자루") + rack.items.slice().reverse().map(item => row(b.name(item) + " +" + item.level,
      "공격력 " + fmt(b.attack(item)) + " · 옵션 " + item.mods.length + "줄" + (item.id === rack.equipped ? " · 장착 중" : item.id === rack.deployed ? " · 배치 중" : ""),
      openBtn("bladeItem-"+item.id,"살펴보기","mini"),"",artwork(item))).join("") +
      '<button class="action" data-archive-blade>기록 검 대장간</button>';
  }
  function processes(s, item) {
    const index = Swordcraft.stageIndex(item);
    let work = "";
    if (index >= 0 && item.level < 20 && !item.finalTrial) {
      const stage = Swordcraft.stages[index];
      work = btn("bladeWorkStart", icon(stage.icon) + (item.work ? "공정 계속 · " : "제작 · ") + stage.title +
        "<small>마감 " + fmt(Swordcraft.fee(item, Game.price, index)) + " G</small>", "", "action split");
    }
    if (item.level === 19 && (item.finalTrial || Breakthrough.choices(item, Game.price).length))
      work += openBtn("bladeFinal", item.finalTrial ? "마지막 돌파 계속" : "+20 돌파 방식 선택");
    return work;
  }
  function workshop(s) {
    const b = rules(), item = b.current(s), rack = b.state(s);
    const available = b.available(item).map(key => [key, b.modDefs[key]]);
    return line("장착 검신", b.name(item) + " +" + item.level) + line("각인석 / 우두머리 인장",fmt(rack.ore)+"개 / "+fmt(rack.seals || 0)+"개") + processes(s,item) +
      slots(item,true,rack.ore) + (available.length ? btn("bladeEtch",icon("sparkles")+"무작위 각인 · 2석","","primary",rack.ore<2) +
        '<label for="bladeTarget">지정 각인</label><select id="bladeTarget">' + available.map(([key,def]) =>
          '<option value="'+key+'">'+sideLabel[def.side]+" · "+escapeHtml(def.name)+'</option>').join("") +
        '</select><button class="action" data-blade-target'+(rack.ore<8 || !rack.seals?' disabled':'')+'>지정 각인 · 8석 + 인장 1</button>' : '') +
      desc("각인은 빈자리에 새 옵션을 새깁니다. 연마는 선택한 옵션의 등급을 유지하고 수치를 다시 뽑습니다.");
  }
  function styles(s) {
    const b = rules(), st=b.skills(s), chosen=b.state(s).style;
    return Object.entries(b.styles).map(([key,name]) => row(name,styleHints[key],btn("bladeStyle",chosen===key?"선택됨":"선택",key,"mini",chosen===key))).join("") +
      line("일반 타격 / 기세 일격", fmt(st.strike)+" / "+fmt(st.heavy)) +
      line("반격 / 파열(3겹)", fmt(st.counter)+" / "+fmt(st.attack+3*st.rupture)) + line("체력 / 피해 감소",fmt(st.hp)+" / "+fmt(st.defense)+"%") +
      (s.hunt ? desc("선택한 검술은 다음 사냥에 적용됩니다.") : "");
  }
  function modal(s, key) {
    const b=rules(), item=b.current(s);
    if (key === "bladeWork") return craftWorkshop({...s,weapon:item},true);
    if (key === "bladeFinal") return finalWorkshop({...s,weapon:item},true);
    if (key === "bladeArmorInfo") {
      const st=b.skills(s);
      return ["방어구 능력",line("방어구",Game.name(s.armor,"armor")+" +"+fmt(s.armor.level))+line("체력",fmt(st.hp))+
        line("피해 감소",fmt(st.defense)+"%")+desc("숲 전투에 적용되는 방어구 강화 상한은 +20입니다. 실패 시 강화는 유지됩니다.")];
    }
    if (key === "bladeInfo") return [b.name(item)+" +"+item.level, info(s,item)+desc("실패하면 강화비를 쓰고 현재 강화를 유지합니다.")+openBtn("bladeCraft","각인·연마")];
    if (key === "bladeStyles") return ["검술 선택",styles(s)];
    if (key === "bladeCraft") return ["검신 제작",workshop(s)];
    if (key === "bladeCollection") return ["검신 보관함",collection(s)];
    if (key === "bladeGuide") return ["검신 제작 수업", desc("숲에서 검신을 얻고 대장간 망치로 +20까지 강화하세요. 첫 승리에서 받은 검신은 검신함에서 비교하고 장착합니다.") +
      line("강화", "공격력 증가 · 최고 +20") + line("각인", "접두·접미에 새 옵션") +
      desc("+7·+9·+11 제작 공정에서 특성을 고르면 +19에 마무리 공법이 열립니다. 각인석은 숲 승리와 여분 검신 분해로 모읍니다. 사냥 전에 검술을 고르면 주사위 전투에서 자동으로 발동합니다.") +
      openBtn("bladeStyles","검술 고르기") + go("forest","숲 사냥","primary")];
    const target=b.state(s).items.find(it=>key==="bladeItem-"+it.id || key==="bladeSalvage-"+it.id);
    if (!target) return ["검신 보관함",collection(s)];
    if (key.startsWith("bladeSalvage-")) return ["검신 분해", line("분해할 검신",b.name(target)+" +"+target.level) +
      line("받는 각인석",1 + target.mods.length + "개") + desc("강화와 옵션을 포함해 검신 한 자루를 소모합니다.") + openBtn("bladeItem-"+target.id,"검신으로 돌아가기") +
      btn("bladeSalvage","각인석으로 분해",target.id,"action",target.id===item.id)];
    return [b.name(target)+" +"+target.level,itemDetail(s,target)];
  }
  return {forge, armor, modal, artwork, itemDetail};
})();
