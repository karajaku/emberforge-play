"use strict";
const SoulView = (() => {
  const grade = tier => ["", "초벌", "중급", "상급", "최상급"][tier];
  const label = item => BladeView.label(item);
  const bosses = ["황금엄니 우두머리", "잿불 무리어미", "안개 비늘용", "천년 고목왕"];
  const lessons = {
    luck: "검마다 한 번, 무작위 각인 후보 두 줄 중 하나를 고릅니다.",
    lung: "검마다 한 번, 기존 수치와 연마한 수치 중 하나를 고릅니다.",
    land: "검신 배치 자리가 한 칸 늘어납니다.",
  };
  const soulAction = (name, arg, title, disabled = false, cls = "action") =>
    '<button class="' + cls + '" data-soul-act="' + name + '" data-soul-arg="' + escapeHtml(JSON.stringify(arg)) +
    '"' + (disabled ? ' disabled' : '') + '>' + title + '</button>';
  const open = (path, title, cls = "action", disabled = false) => openBtn("soul:" + path, title, cls, disabled);
  const prop = m => m.ascended ? Game.endgame.transform[m.ascended].name :
    grade(m.tier) + " " + Game.blades.modDefs[m.key].name + " +" + m.value + "%";
  const where = (s, item) => Game.blades.current(s).id === item.id ? "장착 중" :
    Game.endgame.info(s).deployed.includes(item.id) ? "배치 중" : s.hunt?.bladeId === item.id ? "사냥 중" : "보관 중";
  const identity = item => label(item) + " · " + item.id.toUpperCase();
  const normMods = item => item.mods.filter(m => !m.ascended);
  const canOffer = (s, item) => item.level === 20 && where(s,item) === "보관 중" && !item.soulChoice && normMods(item).length>0;
  const mark = () => '<div class="progression-stage" aria-hidden="true"></div>';
  function growth(s, page) {
    const g = Game.endgame.info(s), b = Game.blades.state(s), item = Game.blades.current(s);
    let body;
    if (page === "imprint") {
      body = card("영혼각인", line("영구 기술", Object.values(g.unlocked).filter(Boolean).length + " / 3") +
        line("사용할 영혼", fmt(g.souls) + " P") + open("lessons",g.gift ? "첫 +20 선물 선택" : "기술 살펴보기","primary"), "sparkles");
    } else if (page === "fusion") {
      body = card("검술 초월", line("장착 검신", label(item)) + line("60단계 토벌", b.cleared>=60 ? "완료" : b.cleared + " / 60") +
        open("ascend:"+item.id, item.ascended ? "초월 효과 보기" : "초월 공정 보기","primary"), "anvil");
    } else {
      const count = b.items.filter(it=>canOffer(s,it)).length;
      body = card("검신 환생", (!g.first ? line("첫 기술 개방", "검신 +" + item.level + " / +20") : "") + line("바칠 여분 +20", count+"자루") + line("전승 재료", g.tokens.length+"개") +
        (g.gift ? open("lessons","첫 +20 선물 선택","primary") : "") +
        open("offer", count ? "바칠 검 고르기" : "환생 조건 보기",g.gift?"action":"primary") + (g.tokens.length ? open("transfer:"+item.id,"전승 재료 쓰기") : ""), "flame");
    }
    return mark() + '<div class="soul-growth">' + body + open("archive","기록 검 성장","mini soul-archive") + "</div>";
  }
  function skillLearn(s) {
    const g = Game.endgame.info(s);
    return [g.gift ? "첫 +20 영혼각인" : "영혼각인", line("보유 영혼",fmt(g.souls)+" P") +
      (g.gift ? desc("완성한 검을 간직하고 기술 하나를 무료로 배웁니다.") : !g.first ? desc("첫 검신 +20을 완성하면 기술 하나를 무료로 배웁니다.") : "") +
      Object.keys(lessons).map(key => row(g.names[key],lessons[key],g.unlocked[key] ? "<strong>습득</strong>" :
        soulAction("soulLearn",{key,free:g.gift},g.gift ? "무료 습득" : g.costs[key]+" P",!g.first || (!g.gift && g.souls<g.costs[key]),"mini"))).join("")];
  }
  function offering(s,item,key) {
    if (!item) {
      const candidates = Game.blades.state(s).items.filter(it=>canOffer(s,it));
      return ["환생할 검신", desc("여분의 +20 검 한 자루를 바치고 영혼 5 P와 선택한 옵션 한 줄의 전승 재료를 얻습니다.") +
        (candidates.length ? candidates.map(it=>row(identity(it), normMods(it).map(prop).join(" · "),open("offer:"+it.id,"선택","mini"),"",BladeView.artwork(it))).join("") :
          line("필요 장비","옵션이 붙은 보관 중 +20 검신") + openBtn("bladeCollection","검신함 열기"))];
    }
    const m = normMods(item).find(mod=>mod.key===key);
    if (!m) return ["전승할 옵션 선택", line("환생할 검",identity(item)) + line("검 상태",where(s,item)) + desc("검 한 자루에서 한 줄의 종류와 등급을 전승할 수 있습니다.") +
      normMods(item).map(mod=>open("offer:"+item.id+":"+mod.key,prop(mod),"action",!canOffer(s,item))).join("")];
    return ["환생 미리보기",line("소모할 검 한 자루", identity(item)) + line("전승 재료",grade(m.tier)+" "+Game.blades.modDefs[m.key].name) +
      line("추가 보상","영혼 5 P") + (item.ascended ? line("함께 소멸",Game.endgame.transform[item.ascended.style].name) : "") + desc("환생하면 이 검과 남은 옵션을 잃습니다. 전승할 때 수치는 새로 정해집니다.") +
      open("offer:"+item.id,"다시 선택") + soulAction("soulRebirth",{id:item.id,key}, "검을 바치고 환생",!canOffer(s,item),"primary")];
  }
  function transfer(s,item,tokenId) {
    const g = Game.endgame.info(s), staged = g.tokens.find(t=>String(t.id)===tokenId);
    const allowed = Game.blades.available(item);
    const ready = !item.inherited && !item.soulChoice && !g.deployed.includes(item.id);
    if (!staged) return ["옵션 전승",line("전승받을 검",identity(item)) +
      (item.inherited ? desc("이 검은 이미 한 줄을 전승받았습니다.") : desc("빈자리에 한 줄을 전승합니다. 같은 종류의 옵션은 중복되지 않습니다.")) +
      (g.tokens.length ? g.tokens.map(t=>row(grade(t.tier)+" "+Game.blades.modDefs[t.key].name,Game.blades.modDefs[t.key].side==="prefix"?"접두":"접미",
        open("transfer:"+item.id+":"+t.id,allowed.includes(t.key)?"미리보기":"자리 없음","mini",!ready || !allowed.includes(t.key)))).join("") : line("보유 전승 재료","0개"))];
    const tier = Math.min(staged.tier,Game.blades.maxTier(item.rank));
    return ["전승 미리보기",line("전승받을 검",identity(item)) + line("쓸 재료",grade(staged.tier)+" "+Game.blades.modDefs[staged.key].name) +
      line("새 옵션",grade(tier)+" · "+Game.blades.modDefs[staged.key].ranges[tier-1].join("~")+"%") +
      desc("재료 한 개를 소모합니다. 이 검이 받을 수 있는 전승은 한 줄입니다.") +
      soulAction("soulTransfer",{id:item.id,token:staged.id},"재료를 써서 전승",!ready || !allowed.includes(staged.key),"primary")];
  }
  function craft(s,item) {
    const g=Game.endgame.info(s), b=Game.blades.state(s);
    if(item.soulChoice) return ["남길 옵션 선택",line("검신",identity(item)) + item.soulChoice.mods.map((m,i)=>
      row(prop(m),item.soulChoice.type==="lung"?(i?"새 연마 수치":"기존 수치"):"각인 후보 "+(i+1),soulAction("soulChoose",{id:item.id,index:i},"선택",false,"mini"))).join("")];
    const mods=normMods(item).filter(m=>m.value<Game.blades.modDefs[m.key].ranges[m.tier-1][1]);
    return ["영혼 제작",line("검신",identity(item))+line("각인석",fmt(b.ore)+"개") +
      (g.unlocked.luck ? line("행운",item.luckUsed?"사용 완료":"검마다 1회") +
        soulAction("soulLuck",{id:item.id},"후보 두 줄 보기 · 2석",item.luckUsed || b.ore<2 || Game.blades.available(item).length<2) : "") +
      (g.unlocked.lung ? line("폐활량",item.lungUsed?"사용 완료":"기존·새 수치 중 선택 · 3석") +
        (item.lungUsed ? "" : mods.map(m=>row(prop(m),"선택 연마",soulAction("soulPolish",{id:item.id,key:m.key},"3석",b.ore<3,"mini"))).join("") || desc("연마할 수 있는 옵션이 없습니다.")) : "") +
      (!g.unlocked.luck && !g.unlocked.lung ? open("lessons","영혼각인 배우기") : "") + open("transfer:"+item.id,"전승 재료 · "+g.tokens.length+"개")];
  }
  function ascension(s,item,style,family) {
    const g=Game.endgame.info(s), b=Game.blades.state(s), defs=Game.endgame.transform;
    if(item.ascended) {
      const def=defs[item.ascended.style];
      return ["초월 검신",line("완성한 검",identity(item))+line("초월",def.name)+desc(def.detail)];
    }
    const def=defs[style], m=def && item.mods.find(m=>m.key===def.key && !m.ascended);
    if(!def) return ["초월 공정",line("대상 검신",identity(item)) + desc("이 검에 맞는 검술을 장착하고 60단계 우두머리를 잡으세요. 초월에는 같은 우두머리의 인장 3개가 필요합니다.") +
      Object.entries(defs).map(([key,d])=>row(Game.blades.styles[key]+" · "+d.name,d.detail,open("ascend:"+item.id+":"+key,"조건","mini"))).join("")];
    const mask=item.proofs?.[style] || 0;
    if(family===undefined) return [def.name,line("검신",identity(item)) + line("필요 강화", "+"+item.level+" / +20") +
      line("대체할 접두", m ? prop(m) : Game.blades.modDefs[def.key].name+" 필요") + desc(def.detail) +
      bosses.map((boss,i)=>row(boss,(mask&(1<<i)?"이 검술로 토벌 완료":"이 검술로 토벌 필요")+" · 고유 인장 "+g.bossSeals[i]+"/"+def.cost,
        open("ascend:"+item.id+":"+style+":"+i,"미리보기","mini",!m || item.level!==20 || b.cleared<60 || !(mask&(1<<i)) || g.bossSeals[i]<def.cost || !!item.soulChoice))).join("")];
    const i=Number(family);
    return ["초월 미리보기",line("검신",identity(item)) + line("대체할 접두",m?prop(m):"없음") +
      line("완성 효과",def.name) + desc(def.detail) + line("쓸 인장",bosses[i]+" ×"+def.cost) +
      desc("선택한 접두 한 줄이 이 효과로 바뀝니다. 검 한 자루에서 초월은 한 번입니다.") +
      soulAction("soulAscend",{id:item.id,style,family:i},"인장을 써서 초월",!m || !(mask&(1<<i)) || g.bossSeals[i]<def.cost,"primary")];
  }
  function modal(s, route) {
    const [,view,id,option,family] = route.split(":");
    const item=Game.blades.state(s).items.find(it=>it.id===id);
    if(view==="lessons") return skillLearn(s);
    if(view==="archive") {
      const page=["rebirth","imprint","fusion"].includes(id)?id:"rebirth";
      return ["기록 검 성장",["rebirth","imprint","fusion"].map((p,i)=>open("archive:"+p,["환생","영혼각인","초월"][i],"mini",page===p)).join("")+growthView(s,page)];
    }
    if(view==="offer" && (!id || item)) return offering(s,item,option);
    if(!item) return ["검신 보관함",openBtn("bladeCollection","검신함으로")];
    if(view==="transfer") return transfer(s,item,option);
    if(view==="craft") return craft(s,item);
    return ascension(s,item,option,family);
  }
  return {growth,modal,open,canOffer,prop};
})();
