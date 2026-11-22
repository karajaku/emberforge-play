"use strict";
const el = (id) => document.getElementById(id);
const icon = (n) => {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (ICONS[n] || "") +
  "</svg>";
};
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const fmt = (n) => Math.floor(n).toLocaleString("ko-KR");
const brief = (n) =>
  n >= 1e12 ? (n / 1e12).toFixed(1) + "조" : n >= 1e8 ? (n / 1e8).toFixed(1) + "억" : fmt(n);
const pct = (n) => Number(n.toFixed(2)) + "%";
const btn = (action, label, arg = "", cls = "action", disabled = false) =>
  '<button class="' +
  cls +
  '" data-act="' +
  action +
  '" data-arg="' +
  arg +
  '" ' +
  (disabled ? "disabled" : "") +
  ">" +
  label +
  "</button>";
const openBtn = (id, label, cls = "action", disabled = false) =>
  '<button class="' + cls + '" data-open="' + id + '"' + (disabled ? ' disabled' : '') + '>' + label + "</button>";
const go = (id, label, cls = "mini") =>
  '<button class="' + cls + '" data-go="' + id + '">' + label + "</button>";
const metric = (label, value) =>
  '<div class="metric"><small>' + label + "</small><b>" + value + "</b></div>";
const metrics = (...values) => '<div class="metrics">' + values.join("") + "</div>";
function gauge(value, max, tone = "gold") {
  return '<span class="gauge gauge-' + tone + '" aria-hidden="true"><i style="width:' +
    Math.max(0, Math.min(100, value / max * 100)) + '%"></i></span>';
}
function gaugeMetric(name, value, max, tone) {
  return metric(name, fmt(value) + " / " + fmt(max) + gauge(value, max, tone));
}
const card = (title, content, artwork = "") =>
  '<section class="card' + (artwork ? ' illustrated-card card-' + artwork : '') + '"><h3>' +
  (artwork ? icon(artwork) : "") + title + "</h3>" + content + "</section>";
const desc = (text) => '<p class="desc">' + text + "</p>";
const line = (a, b) => '<div class="line"><span>' + a + "</span><strong>" + b + "</strong></div>";
const section = (name, end = "") =>
  '<div class="sectiontitle"><h2>' + name + "</h2>" + end + "</div>";
const gearPortrait = (g, type) => {
  const sprite = type === "armor" ? "cuirass" : "blade" + (Game.bladeStage(g) || "");
  return '<span class="gear-portrait" aria-hidden="true" style="background-image:url(assets/' +
    sprite + '-sheet.png)"></span>';
};
const row = (title, sub, action, img = "", portrait = "") =>
  '<div class="listrow">' +
  portrait +
  (img ? '<img src="assets/' + img + '.png" alt="">' : "") +
  '<div class="grow"><b>' +
  title +
  "</b><small>" +
  sub +
  "</small></div>" +
  action +
  "</div>";
const tabs = (entries, selected, attr) =>
  '<div class="tabrow">' +
  entries
    .map(
      ([id, label]) =>
        '<button class="mini ' +
        (selected === id ? "active" : "") +
        '" aria-pressed="' + (selected === id) + '" data-' +
        attr +
        '="' +
        id +
        '">' +
        label +
        "</button>",
    )
    .join("") +
  "</div>";
const zones = {
  forest: ["사냥터", "HUNTING GROUNDS", "trees", "이끼숲 초입"],
  mine: ["심해 광산", "ABYSSAL MINE", "waves", "침수된 갱도"],
  tower: ["도전의 탑", "TRIAL TOWER", "castle", "수문장의 회랑"],
  altar: ["별의 제단", "STAR ALTAR", "orbit", "별무리 고원"],
};
function controlArt(name) {
  return '<i aria-hidden="true" class="control-art" data-art="' + name + '"></i>';
}
const navItems = [
  ["forge", "대장간", "anvil"],
  ["world", "모험", "compass"],
  ["bag", "보관함", "bag"],
  ["growth", "성장", "growth"],
];
const GearGradeView = {
  emphasized(rarity) {
    return rarity?.key === "magic" || rarity?.key === "rare";
  },
  attribute(rarity) {
    return this.emphasized(rarity) ? ' data-rarity="' + rarity.key + '"' : "";
  },
  lootClass(item) {
    const rarity = Game.blades.itemRarity(item);
    return this.emphasized(rarity) ? "loot-gear loot-" + rarity.key : "loot-gear";
  },
  colored(item, text) {
    const rarity = Game.blades.itemRarity(item), name = escapeHtml(text);
    const attr = this.attribute(rarity);
    const visible = attr ? '<span class="gear-grade"' + attr + '>' + name + '</span>' : name;
    return visible + '<span class="grade-access"> (' + rarity.name + ')</span>';
  },
  detail(item) {
    const count = item.mods?.length || 0;
    return line("접두·접미", count + "개") +
      line("베이스 등급", Game.blades.baseGradeNames[item.grade]);
  },
};
const tier = (g, type) => Game.grades[g.grade] + " " + (type === "armor" ? "방어구" : "무기");
function creature(f) {
  return ["scarecrow", "sentinel", "golem", "dragon"][Math.min(3, Math.floor((f - 1) / 5))];
}
function scene(id, heading, english, loc, sprite = "", grade = 0, enemy = null, artwork = "", item = null) {
  return (
    '<div class="scene"' + (enemy ? ' data-enemy="' + enemy.kind + '" data-depth="' + Math.min(3, Math.floor((enemy.rank - 1) / 15)) + '"' : "") + ' style="--image:url(assets/' +
    (id === "forge" ? "hud/workshop.webp" : id + ".png") +
    ')">' + (loc ? '<span class="location">' + icon("map-pin") + loc + "</span>" : "") +
    (sprite
      ? '<canvas class="grade' +
        grade +
        '" width="' +
        (sprite.startsWith("blade") || sprite === "cuirass" ? 128 : 144) +
        '" height="144" data-sprite="' +
        sprite +
        '" aria-label="' +
        heading +
        ' 애니메이션"></canvas>'
      : artwork) +
    (enemy ? '<span class="forest-rank">' + (enemy.elite ? "우두머리 · " : "") + "Lv." + enemy.rank + '</span>' : "") +
    '<span class="scene-ambient" aria-hidden="true"></span><div class="caption"><span class="eyebrow">' +
    english +
    "</span><b>" +
    (item ? GearGradeView.colored(item,heading) : heading) +
    "</b></div></div>"
  );
}
function adventureMap(s) {
  const details = {
    forest: s.hunt ? s.hunt.rank + "구역 전투 중" : Math.min(60, s.huntBest + 1) + "구역 사냥",
    mine: s.autoMine ? "자동 탐사 " + s.autoMine.completed + " / " + s.autoMine.limit : s.dive ? fmt(s.dive.depth) + " m 탐사 중" : Game.canDive(s.weapon) ? "산소통 " + fmt(s.tanks) + "개" : "+19 또는 베이스 II 이상 필요",
    tower: "무한의 탑 " + fmt(s.tower) + "층",
    altar: "별의 파편 " + fmt(s.shards) + "개",
  };
  return '<div class="adventure-map">' + Object.entries(zones).map(([id, zone]) =>
    go(id, icon(id === "mine" ? "pickaxe" : zone[2]) + "<span>" + zone[0] + "<small>" +
      details[id] + "</small></span>", "map-pin pin-" + id)
  ).join("") + "</div>";
}
function portals() {
  return (
    '<div class="tiles">' +
    Object.entries(zones)
      .map(
        ([id, z]) =>
          '<button data-go="' +
          id +
          '" class="tile" style="background-image:url(assets/' +
          id +
          '.png)"><small>' +
          {
            forest: "토벌 · 배치 수익",
            mine: "무기 +19 또는 베이스 II 이상",
            tower: "전투 · 층별 보상",
            altar: "장비 옵션 부여",
          }[id] +
          "</small><strong>" +
          z[0] +
          "</strong>" +
          icon("arrow-up-right") +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}
function orderView(s) {
  const o = Game.currentOrder(s);
  if (!o) return '<div class="order">' + icon("trophy") + " 모든 대장장이 의뢰 완료</div>";
  return (
    '<div class="order"><span class="ordericon">' +
    icon("scroll-text") +
    "</span><div><b>대장장이 의뢰 · 검 +" +
    o[0] +
    " 달성</b><small>" +
    fmt(o[1]) +
    " G &nbsp;·&nbsp; 별의 파편 ×" +
    o[2] +
    '</small>' + gauge(s.best, o[0]) + '</div><span class="progress">' +
    Math.min(s.best, o[0]) +
    " / " +
    o[0] +
    "</span>" +
    (s.best >= o[0] ? btn("order", "수령", "", "mini active") : "") +
    "</div>"
  );
}
const forgeOutcomes = [["success", "성공"], ["hold", "유지"], ["drop", "하락"], ["destroy", "파괴"]];
function forgeChances(s, g) {
  if (g.level >= 20) return line("일반 강화", "최고 단계 도달");
  const chances = Game.nextEnhancementChances(s, g);
  return '<div class="forge-odds"><b>일반 강화 +' + g.level + ' → +' + (g.level + 1) +
    '</b><div class="odds-bar" aria-hidden="true">' +
    forgeOutcomes.map(([key]) => '<i class="odds-' + key + '" style="width:' + chances[key] + '%"></i>').join("") +
    '</div><div class="odds-labels">' + forgeOutcomes.map(([key, label]) =>
      '<span><i class="odds-' + key + '" aria-hidden="true"></i>' + label + ' <strong>' + pct(chances[key]) + '</strong></span>').join("") +
    '</div></div>';
}
function swordOddsTable(level) {
  const rows = Array.from({length:20}, (_, n) => {
    const chances = Game.baseSwordChances(n);
    return '<tr' + (n === level ? ' aria-current="true"' : '') + '><th scope="row">+' + n + ' → +' + (n+1) + '</th>' +
      forgeOutcomes.map(([key]) => '<td>' + pct(chances[key]) + '</td>').join("") + '</tr>';
  });
  return '<details class="odds-table"><summary>검 단계별 기본 확률</summary><table><thead><tr><th>강화</th>' +
    forgeOutcomes.map(([,label]) => '<th>' + label + '</th>').join("") + '</tr></thead><tbody>' +
    rows.join("") + '</tbody></table></details>';
}
function liningCard(s, huntGear = false) {
  const level = s.huntLining, cost = Game.liningCosts[level];
  const stats = huntGear ? Game.blades.skills : Game.huntStats;
  const hp = fmt(stats(s).hp);
  const next = cost ? ' → ' + fmt(stats({ ...s, huntLining: level + 1 }).hp) : '';
  return '<section class="lining-card" aria-label="숲 방호 안감"><div><b>' + icon('shield') +
    '숲 방호 안감 ' + level + '/5</b><small>사냥 HP ' + hp + next + '</small><small>' +
    icon('trees') + '숲결 섬유 ' + fmt(s.forestFiber) + (cost ? ' / ' + cost + ' · 숲 승리 보물' : '') +
    '</small></div><button class="action" data-act="craftHuntLining" data-level="' + level + '" ' +
    (!cost || s.forestFiber < cost ? 'disabled' : '') + '>' + (!cost ? '완성' : level ? '보강' : '제작') + '</button></section>';
}
function journeyForgeControls(s, type, plan) {
  const level = plan.level, next = plan.next;
  const process = plan.needsProcess && Swordcraft.stages[plan.processIndex];
  if (type === 'weapon' && s.weapon.finalTrial) return {
    heading: '진행 중인 돌파', detail: Breakthrough.methods[s.weapon.finalTrial.key].name,
    button: openBtn('final', icon('sword') + '돌파 계속', 'primary'),
  };
  if (process) return {
    heading: process.title, detail: '제작 공정 ' + (plan.processIndex + 1) + ' / ' + Swordcraft.stages.length,
    button: go('forge/craft', icon(process.icon) + '공정 열기<small>' + process.title + '</small>', 'primary'),
  };
  if (plan.canPromote) {
    const title = Game.grades[plan.targetGrade] + ' 승급';
    const hint = plan.targetGrade === 2 ? '특성 선택' : '검 벼리기';
    return { heading: title, detail: '승급 조건 달성',
      button: openBtn('swordPromotion', icon('sparkles') + title + '<small>' + hint + '</small>', 'primary') };
  }
  if (next <= level) return {
    heading: '최종 재련 완료', detail: '+' + fmt(level),
    button: openBtn('journal', icon('scroll-text') + '강화 기록', 'primary'),
  };
  const shortfall = plan.cost - s.gold;
  const price = fmt(plan.cost) + ' G' + (shortfall > 0 ? '<span class="forge-hold-hint">' + fmt(shortfall) + ' G 부족</span>' : '');
  return {
    heading: '재련 +' + fmt(level) + ' → +' + fmt(next),
    detail: '성공 ' + pct(plan.success) + (plan.success < 100 ? ' · 유지 ' + pct(100 - plan.success) : ''),
    button: btn('journeyForge', icon('hammer') + '재련<small>' + price + '</small>', type, 'primary', shortfall > 0),
  };
}
function journeyDetails(s, type, plan) {
  const controls = journeyForgeControls(s, type, plan);
  const nextGrade = Game.grades[plan.targetGrade];
  let html = line('장비', Game.name(s[type], type) + ' +' + fmt(plan.level));
  const smith = Game.journeySmith(s);
  html += line('대장장이 Lv.' + smith.level, fmt(smith.xp) + (smith.next ? ' / ' + fmt(smith.next) : '') + ' XP') +
    line('즉시 제작 상한', '+' + fmt(smith.cap)) + desc('재련비 1 G를 쓸 때마다 1 XP를 얻습니다. 검이 파괴되면 그 검의 판매가만큼 XP를 얻습니다.');
  if (s.hunt) html += desc('재련한 장비의 능력치는 다음 토벌부터 적용됩니다.');
  if (type === 'weapon' && Number.isInteger(s.weapon.journeyTrait)) html += line('베이스 III 특성', Game.journeyTraits[s.weapon.journeyTrait]);
  if (plan.canChooseTrait) {
    const lock = s.weapon.finalTrial ? ' · 돌파 중' : '';
    html += openBtn('swordTrait', icon('sparkles') + '베이스 III 특성 새기기' + lock, 'action', !!lock);
  }
  if (type === 'weapon' && nextGrade) {
    html += line('다음 승급', nextGrade + ' · +' + fmt(plan.threshold)) +
      line('완료한 제작 공정', (s.weapon.marks || []).length + ' / ' + Swordcraft.stages.length);
  }
  if (plan.next <= plan.level) return html + line(controls.heading, controls.detail) + controls.button;
  html += line('다음 재련', '+' + fmt(plan.next) + ' · ' + fmt(plan.cost) + ' G') + line('성공 확률', pct(plan.success));
  if (plan.success < 100) html += desc('실패하면 장비 단계는 그대로이며 재련비는 전액 사용됩니다.');
  if (plan.bulk > plan.next && !s[type].finalTrial) {
    html += '<button class="primary" data-act="journeyBulk" data-arg="' + type + '" data-level="' + plan.level +
      '" data-bulk="' + plan.bulk + '" data-bulk-cost="' + plan.bulkCost + '" data-bulk-success="' + plan.bulkSuccess +
      '">+' + fmt(plan.bulk) + '까지 재련<small>' + fmt(plan.bulkCost) + ' G · 성공 ' + pct(plan.bulkSuccess) + '</small></button>' +
      desc('모아 재련은 목표 단계까지 한 번에 판정합니다.');
  }
  if (s.gold < plan.cost) html += line('부족한 골드', fmt(plan.cost - s.gold) + ' G') + go('forest', '숲에서 골드 벌기', 'action');
  return html;
}
function swordPromotionView(s, traitOnly = false) {
  const p = Game.journeyForge(s, 'weapon');
  const available = traitOnly ? p?.canChooseTrait : p?.canPromote;
  if (!available) return ['검의 기록', desc('대장간에서 이 검의 현재 조건을 확인하세요.')];
  const title = traitOnly ? '베이스 III 특성 새기기' : Game.grades[p.targetGrade] + ' 승급';
  const summary = line('현재 검', Game.name(s.weapon) + ' +' + fmt(p.level)) +
    line('베이스 등급', traitOnly ? Game.grades[p.grade] : Game.grades[p.grade] + ' → ' + Game.grades[p.targetGrade]);
  if (!traitOnly && p.targetGrade !== 2) return [title, summary + btn('promoteSword', icon('hammer') + title, 0, 'primary')];
  return [title, summary + section('검에 새길 특성') + '<div class="journey-traits">' +
    Game.journeyTraits.map((name, index) => btn(traitOnly ? 'chooseSwordTrait' : 'promoteSword', icon(['shield','sword','heart','flame'][index]) + '<b>' + name + '</b><small>' +
      ['반격 피해 약 +3%', '적 체력이 30% 미만일 때 피해 +10%', '내 체력이 35% 미만일 때 받는 피해 −13%', '강공 피해 +8%'][index] + '</small>', index)).join('') + '</div>'];
}
function smithExperienceBar(s) {
  if (!s.journeyEconomy) return '';
  const smith = Game.journeySmith(s);
  const maximum = smith.next === null;
  const needed = maximum ? 1 : smith.next - smith.floor;
  const progress = maximum ? needed : smith.xp - smith.floor;
  const amount = maximum ? '최고 레벨' : fmt(progress) + ' / ' + fmt(needed) + ' XP';
  const label = '대장장이 Lv.' + fmt(smith.level);
  return '<div class="smith-experience"><b>' + label + '</b><span>' + amount + '</span>' +
    '<progress aria-label="' + label + ' 경험치" aria-valuetext="' + amount + '" value="' + progress +
    '" max="' + needed + '"></progress></div>';
}
function forgeView(s) {
  const g = s[gear], weapon = gear === "weapon", page = phonePage("forge");
  if (typeof BladeView !== "undefined" && !archiveBlade && page === "work") {
    return ForgeItemView.view(s);
  }
  const plan = Game.journeyForge(s, gear);
  const recovery = weapon && !plan ? Game.midRecovery(g) : null;
  const cost = Game.enhancementCost(s, g);
  if (page === "orders") return orderView(s);
  if (page === "craft") return scene("forge", Game.name(s.weapon) + " +" + s.weapon.level, "", "검 제작", "blade" + (Game.bladeStage(s.weapon) || "")) + card("검 제작", patternView(s) + craftEntry(s) ||
    desc("검 +7부터 칼날 연마를 시작할 수 있습니다."), "anvil");
  if (page === "training") {
    if (plan) return card('재련 수첩', journeyDetails(s, gear, plan), 'anvil') + (legacyView(s) || '');
    const w = s.weapon, recover = Game.midRecovery(w);
    return card("단조 수첩 · 전승 수련", [recover ? recoveryView(s, recover) : "",
      notebookView(s, Game.enhancementCost(s, w), recover), legacyView(s)].filter(Boolean).join("") ||
      desc("검 +17부터 단조 수첩 · 첫 환생 이후 전승 수련"), "anvil");
  }
  const stat = Game.stats(s), next = Game.nextEnhancementStats(s, gear);
  const equipped = plan ? [] : Game.blessings.flatMap((name, i) => s.enabled[i] && s.charms[i] > 0
    ? ['<span>' + name + ' <b>' + fmt(s.charms[i]) + '개 남음</b></span>'] : []);
  const finalChoice = !plan && weapon && g.level === 19 && Breakthrough.choices(g, Game.price).length > 0;
  const journey = plan && journeyForgeControls(s, gear, plan);
  const hasNext = plan ? plan.next > g.level : g.level < 20;
  const switcher = '<div class="segment gear-switch">' + [["weapon","sword","무기"],["armor","shield","방어구"]].map(([id,ic,label]) =>
    '<button data-gear="' + id + '" aria-pressed="' + (gear === id) + '" class="' + (gear === id ? 'sel' : '') + '">' + icon(ic) + label + '</button>').join('') + '</div>';
  return '<div class="columns forge-layout"><div class="stage-side">' + switcher + scene("forge", Game.name(g, gear) + " +" + g.level,
    "", tier(g, gear), weapon ? "blade" + (Game.bladeStage(g) || "") : "cuirass", 0, null, "", g) + '</div><section class="panel">' +
    '<div class="stats">' + line(weapon ? "공격력" : "체력", fmt(weapon ? stat.attack : stat.hp) + (hasNext ? ' <span class="mint">→ ' + fmt(weapon ? next.attack : next.hp) + '</span>' : '')) +
    (journey ? '<div class="forge-odds journey-odds"><b>' + journey.heading + '</b>' +
      (hasNext && !g.finalTrial ? '<div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:' +
        pct(plan.success) + '"></i><i class="odds-hold" style="width:' + pct(100 - plan.success) + '"></i></div>' : '') +
      '<span>' + journey.detail + '</span></div>' : forgeChances(s, g)) + '</div>' +
    (equipped.length ? '<div class="forge-blessings" role="group" aria-label="장착한 가호">' + equipped.join('') + '</div>' : '') +
    (recovery ? go("forge/training", "+" + recovery.target + " 확정 복구 가능 · 수련", "action") : "") +
    (finalChoice ? openBtn("final", icon("sword") + (g.finalTrial ? Breakthrough.methods[g.finalTrial.key].name + " 계속" : "+20 돌파 방식 선택"), "primary") : "") +
    (journey ? journey.button : g.level >= 20 ? go("growth", "초월 · 환생 확인", "primary") : btn("enhance", icon("hammer") +
      (recovery ? "일반 강화 +15" : finalChoice ? "일반 강화 +20" : "강화하기") + '<small>' + fmt(cost) + ' G<span class="forge-hold-hint">꾹 눌러 연속</span></small>', gear, finalChoice || recovery ? "action split" : "primary split", !!g.finalTrial)) +
    '<div class="actions forge-support">' + openBtn("temper", icon("flame") + (s.heat ? "담금질 +" + s.heat + "%p" : "담금질")) +
    (journey ? go("forest", icon("trees") + "숲 사냥", "action") : openBtn("guards", icon("shield") + (equipped.length ? "가호 장착됨" : "가호"))) +
    '<button class="round" data-open="risk" aria-label="' + (journey ? "재련 비용과 승급 조건" : "강화 확률과 실패 조건") + '">' + icon("circle-help") + '</button></div>' +
    (weapon ? '' : liningCard(s)) + smithExperienceBar(s) + '</section></div>';
}
function restoreButton(s, book) {
  return btn(
    "restorePeak",
    "+" +
      s.weapon.level +
      " → +" +
      book.peak +
      " 기록 복원 · 단서 " +
      book.restoreCost +
      "개 · " +
      fmt(book.restoreGold) +
      " G",
    "weapon",
    "action",
    book.clues < book.restoreCost || s.gold < book.restoreGold,
  );
}
function recoveryView(s, recovery) {
  const book = Game.enhancementNotebook(s);
  return (
    '<section class="forge-notebook"><b>' +
    icon("hammer") +
    " 칼날 재단조</b>" +
    "<p>골드만 써서 이 검이 통과한 단계로 돌아갑니다. 가호·담금질·주문서는 다음 강화에 쓸 수 있습니다.</p>" +
    btn(
      "recoverEdge",
      "+14 → +" + recovery.target + " 확정 복구 <small>" + fmt(recovery.cost) + " G</small>",
      recovery.target,
      "primary split",
      s.gold < recovery.cost,
    ) +
    (book.canRestore ? restoreButton(s, book) : "") +
    "</section>"
  );
}
function notebookView(s, cost, recovery) {
  const book = Game.enhancementNotebook(s);
  if (!book.active)
    return book.clues
      ? '<small class="craft-summary">단조 단서 ' +
          fmt(book.clues) +
          "개 보유 · +17을 달성한 검에서 사용</small>"
      : "";
  const focus = btn(
    "focusEnhance",
    "집중 강화 " + pct(book.focusRate) + " · " + fmt(cost) + " G",
    "weapon",
    "action",
    !!s.weapon.finalTrial || book.clues < book.focusCost || s.gold < cost,
  );
  return (
    '<section class="forge-notebook"><div class="flex"><b>' +
    icon("book-open") +
    " 단조 수첩</b><strong>단서 " +
    fmt(book.clues) +
    "개</strong></div>" +
    "<p>이 검의 기록 <b>+" +
    book.peak +
    "</b> · 강화 실패 시 단서 +1</p>" +
    '<div class="notebook-choice"><small>' +
    book.focusCost +
    "개 · 이번 성공률 +" +
    pct(book.bonus) +
    "p</small>" +
    focus +
    "</div>" +
    (recovery
      ? ""
      : book.canRestore
        ? '<div class="notebook-choice">' + restoreButton(s, book) + "</div>"
        : "<p>하락하면 단서 " +
          book.restoreCost +
          "개로 이 검의 기록까지 복원할 수 있습니다.</p>") +
    "</section>"
  );
}
function huntingRechargeText(w) {
  const seconds = Math.ceil((w.remaining || 0) / 1000);
  const time = Math.floor(seconds / 60) + "분 " + seconds % 60 + "초";
  return w.remaining === null ? "기본 비축분 " + Game.hunting.cap + "개 미만부터 자동 보급 재개" : "다음 보급 " + time + " · 10분마다 1개";
}
function dailyAvailable(s) {
  const today = Game.day(Date.now());
  return !(s.day >= today || s.hunting.daily >= today);
}
function huntingWalletKey(s, w) {
  return [w.free, w.purchased, !dailyAvailable(s)].join(":");
}
function huntingWalletSummary(w) {
  return "비축 식량 " + fmt(w.free + w.purchased) + "개";
}
function huntingWalletContent(s) {
  const w = Game.huntingStatus(s);
  const claimed = !dailyAvailable(s);
  return '<div data-hunting-status="' + huntingWalletKey(s, w) + '">' + line("보유 식량", fmt(w.free + w.purchased) + "개") +
    '<p class="desc" data-hunting-recharge>' + huntingRechargeText(w) + '</p>' +
    (!w.free && !w.purchased ? desc("식량을 보급해야 출발할 수 있습니다.") : "") +
    '<div class="actions">' + openBtn("daily", claimed ? "오늘의 출석 내역" : "출석 보급품 확인", "primary") +
    (!w.free && !w.purchased ? go("forge", "대장간으로", "mini") : "") + '</div>' +
    '<details class="hunt-wallet-help"><summary>사냥과 보급 안내</summary>' +
    desc("사냥에 나갈 때 식량을 1개 씁니다. 기본 비축분은 " + Game.hunting.cap + "개까지 자동 보급하며 출석으로 더 비축할 수 있습니다.") +
    desc("첫 5단계 지원 재도전은 식량이 1개 이상 있어야 출발할 수 있으며 식량을 쓰지 않습니다. 진행 재개와 배치 수익에도 식량을 쓰지 않습니다.") +
    (w.purchased ? line("별도 보관분", fmt(w.purchased) + "개 · 기본 비축분부터 사용") : "") + '</details></div>';
}
function huntModeControls(s) {
  const r = typeof repeatHunting === "undefined" ? null : repeatHunting.summary;
  const active = !!r?.active;
  return '<div class="hunt-mode" data-hunt-mode-controls><div class="segment" role="group" aria-label="전투 방식">' +
    [["manual", "수동"], ["auto", "자동 사냥"]].map(([key, label]) => '<button data-hunt-mode="' + key +
      '" aria-pressed="' + (active === (key === "auto")) + '" class="' + (active === (key === "auto") ? "active" : "") + '">' + label + '</button>').join("") +
    (active ? '<button data-repeat="stop"' + (r.stopping ? ' disabled' : '') + '>' + (r.stopping ? '중단 예정' : '이번 판 후 중단') + '</button>' : '') +
    '</div><small>식량이 떨어지면 중단</small></div>';
}
function repeatPanel(s) {
  const r = typeof repeatHunting === "undefined" ? null : repeatHunting.summary;
  if (!r) return '<section class="repeat-panel" data-repeat-panel></section>';
  return '<section class="repeat-panel" data-repeat-panel><div class="repeat-status"><b>' + r.rank + '구역 · ' +
    (r.active ? (r.stopping ? '이번 판 후 중단' : r.chest ? '보물 수령 중' : r.battle ? '자동 사냥 중' : '다음 사냥 준비') : r.reason) + '</b>' +
    '<small>⚔ ' + r.wins + '승 · 식량 ' + fmt(r.usedFree + r.usedPurchased) + '개 사용 · 🎁 ' + r.chests + '</small>' +
    '<small>🪙 ' + fmt(r.gold) + ' · 조각 ' + r.shards + ' · 주문서 ' + r.scrolls + ' · 부적 ' + r.charms + '</small>' +
    (r.unconfirmed ? '<small>저장 미확정 · 위 숫자는 저장 완료분</small>' : '') +
    '</div></section>';
}
let huntPreviewRank = null;
function selectedHuntRank(s) {
  const next = Math.min(60, (s.huntBest || 0) + 1);
  return huntPreviewRank && huntPreviewRank <= next ? huntPreviewRank : next;
}
function forestSceneTarget(s) {
  if (s.hunt) return s.hunt;
  if (s.chests?.some(c => c.id === s.lastHunt?.chestId)) return s.lastHunt;
  if (typeof repeatHunting !== "undefined" && repeatHunting.active) return repeatHunting.summary.rank;
  return selectedHuntRank(s);
}
function forestView(s, health) {
  if (phonePage("forest") === "field") return fieldView(s);
  const h = s.hunt, automatic = typeof repeatHunting !== "undefined" && repeatHunting.active;
  const next = Math.min(60, (s.huntBest || 0) + 1), w = Game.huntingStatus(s);
  const pendingChest = s.chests?.find(c => c.id === s.lastHunt?.chestId);
  const selected = selectedHuntRank(s), enemy = Game.huntEnemy(h || selected);
  const hud = h && health ? combatHud(health.hp, health.maxHp, health.enemyHp, health.enemyMax, enemy.name) : "";
  const stats = Game.stats(s);
  const idle = '<div class="idle-stats">' + gearPortrait(s.weapon,"weapon") + '<span>현재 장비</span><b>공격 ' + fmt(stats.attack) + ' · 체력 ' + fmt(stats.hp) + '</b></div>';
  const wallet = '<div class="wallet-short"><span data-wallet-summary>' + huntingWalletSummary(w) + '</span>' +
    openBtn("huntWallet", "식량 보급", "textbtn") + '</div>';
  const canDepart = w.free + w.purchased > 0;
  const foodCost = (rank) => Game.hasBossRetry(s, rank) ? " · 식량 1개 필요, 소모 없음" : " · 식량 1개";
  let content;
  if (h) content = huntIntent(h) + '<div class="battle-controls">' + hud +
    (h.rank >= 2 ? huntTools(h) + huntChoices(h) : '<div class="actions">' +
      btn("strike", icon("sword") + (h.counter ? "반격 ×2.5" : "베기"), "", h.counter ? "primary grow counter-ready" : "primary grow") +
      btn("block", icon("shield") + "방어", "", Game.huntCharge(h) ? "action guard-ready" : "action") + btn("flee","퇴각","","mini") + '</div>') +
    huntModeControls(s) + '</div>' + repeatPanel(s);
  else if (automatic) content = idle + huntModeControls(s) + repeatPanel(s);
  else if (pendingChest) content = huntResult(s.lastHunt,s.chests) + btn("openChest",icon("gift") + "보물 획득",pendingChest.id,"primary") + huntModeControls(s);
  else content = idle + '<div class="auto-start"><label for="repeatRank">자동 사냥 구역</label><select id="repeatRank">' +
    Array.from({length:next},(_,i) => '<option value="' + (i+1) + '"' + (i+1 === selected ? ' selected' : '') + '>' + (i+1) + '구역</option>').join('') +
    '</select><button class="primary" data-repeat="start"' + (canDepart ? '' : ' disabled') + '>' + icon("sword") + '자동 사냥 시작</button><small>출발마다 식량 1개 · 소진까지</small></div>' +
    '<div class="actions">' + btn("huntStart", selected + "구역 수동" + foodCost(selected),selected,"action",!canDepart) +
    (s.huntBest ? btn("huntStart","이전 구역 재도전" + foodCost(Math.min(s.huntBest,60)),Math.min(s.huntBest,60),"mini",!canDepart) : '') + '</div>' + repeatPanel(s) +
    (s.lastHunt ? '<details><summary>지난 토벌 결과</summary>' + huntResult(s.lastHunt,s.chests) + '</details>' : '');
  const task = Game.routeTask(s);
  const training = !h && !pendingChest && s.weapon.route?.trait === "edge" && task?.open ? task.ready ?
    go("forge/training","수련 마감 · +" + task.target,"action") : task.needed <= next ?
    btn("huntStart","전승 수련 · " + task.needed + "구역" + foodCost(task.needed),task.needed,"action",!canDepart) : "" : "";
  return '<div class="stack hunt-stack">' + content + (h ? "" : wallet) +
    (!w.free && !w.purchased && !h ? '<div class="actions">' + openBtn("daily", "출석 보상") + go("forge","대장간으로") + '</div>' : '') +
    training + '<details class="hunt-enemy-help"><summary>적 특성 · 전투 안내</summary>' + forestEncounter(h || selected) +
    (h ? desc(h.last) : '') + desc("진행 재개 시 식량 소모 없음 · 퇴각 시 쓴 식량 반환 없음") +
    desc("자동은 약 1초마다 행동하고 승리 보물을 수령한 뒤 같은 구역을 반복합니다. 화면을 숨기거나 종료하면 수동 대기로 돌아옵니다.") +
    openBtn("huntRules", "기세와 반격 규칙", "action") + '</details></div>';
}
function chestOrigin(c) {
  return c.source === "tower" ? "무한의 탑 " + c.rank + (c.rankEnd && c.rankEnd !== c.rank ? "~" + c.rankEnd : "") + "층" : "이끼숲 " + c.rank + "구역";
}
function chestButton(c) {
  return btn("openChest", '<i class="chest-art" aria-hidden="true"></i><span><small>' +
    escapeHtml(chestOrigin(c)) + '</small><b>' + escapeHtml(c.name || '보물상자') + ' 열기</b></span>', escapeHtml(c.id), "chest-find");
}
function chestReceipt(c) {
  if (!c) return "";
  const loot = (sprite, name, n) => n ? line(icon(sprite) + name, "+" + fmt(n)) : "";
  return '<div class="chest-reveal tier-' + c.tier + '"><i class="chest-art" aria-hidden="true"></i><b>' +
    escapeHtml(c.name || ["나무 상자", "은장 상자", "황금 상자"][c.tier]) + '</b><small>' + escapeHtml(chestOrigin(c)) + '</small></div>' +
    '<div class="chest-loot">' + line(icon("coins") + "골드", fmt(c.gold) + " G") +
    (c.counter || c.extra || c.goblinGold ? desc("기본 " + fmt(c.base) + " G" + (c.counter ? " · 반격 +" + fmt(c.counter) + " G" : "") +
      (c.goblinGold ? " · 황금 고블린 +" + fmt(c.goblinGold) + " G" : "") +
      (c.extra ? " · 상자 보너스 +" + fmt(c.extra) + " G" : "")) : "") +
    loot("trees", "숲결 섬유", c.fiber) + loot("sparkles", "별의 파편", c.shards) + loot("scroll-text", "10% 주문서", c.scrolls) +
    c.charms.map((n, i) => loot("gift", Game.blessings[i], n)).join("") + "</div>";
}
function huntResult(last, chests) {
  if (!last) return "";
  const chest = chests?.find(c => c.id === last.chestId);
  const title = chest ? "토벌 성공" : last.reward ? "토벌 · " + fmt(last.reward) + " G" : "패배";
  const bonus = last.bonus ? " (+" + fmt(last.bonus) + " G)" : "";
  const recovery = last.reward ? "" : go("forge", "장비 강화하러 가기", "mini");
  return (
    '<div class="hunt-result"><b>' + icon(last.reward ? "coins" : "shield") +
    last.rank +
    "구역 " +
    title +
    "</b><small>" +
    last.turns +
    "턴 · 받은 피해 " +
    last.damageTaken +
    " · 반격 " +
    last.ripostes +
    "회" +
    bonus +
    (last.ticketSource === "retry" ? " · 지원 재도전, 식량 소모 없음" : last.ticketSource ? " · 식량 1개 사용" : " · 이전 전투 추가 차감 없음") +
    "</small>" +
    (chest ? desc("보물상자를 발견했습니다. 아래에서 보물을 획득하세요.") : recovery) +
    "</div>"
  );
}
function huntIntent(h) {
  const charge = Game.huntCharge(h), enemy = Game.huntEnemy(h);
  return '<div class="hunt-intent ' + (charge ? "charging" : "") + '">' +
    icon(charge ? "shield" : "sword") + '<b>' + (charge ? "돌진 예고 · " + enemy.power + "배 피해" : "적의 일반 공격") +
    '</b><span>' + (h.counter ? "반격 가능 · " : "") + h.turn + "턴</span></div>";
}
function forestEncounter(huntOrRank, preview = false) {
  const e = Game.huntEnemy(huntOrRank);
  return '<div class="forest-encounter" data-enemy="' + e.kind + '">' +
    (preview ? '<canvas width="144" height="144" data-sprite="boar" aria-hidden="true"></canvas>' : "") + '<div><small>' +
    (preview ? "다음 사냥 · " : "") + e.rank + '구역</small><b>' + e.name + '</b><span>' + e.trait +
    '</span></div><p>' + e.hint + '</p></div>';
}
function huntTools(h) {
  const momentum = h.momentum ?? 1;
  return '<div class="hunt-tools"><button class="momentum-help" data-open="huntRules">기세 ' +
    '<span aria-hidden="true">' + "◆".repeat(momentum) + "◇".repeat(2 - momentum) + '</span> ' +
    momentum + '/2 ' + icon("circle-help") + '</button>' + btn("flee", "퇴각", "", "mini") + "</div>";
}
function huntChoices(h) {
  const moves = [["strike", "sword", h.counter ? "반격" : "베기"], ["heavyStrike", "hammer", "강공"], ["block", "shield", "방어"]];
  return '<div class="hunt-moves">' +
    moves.map(([key, art, title]) => {
      const m = Game.huntMove(h, key);
      const lethal = m.taken >= h.hp;
      const incoming = (lethal ? "쓰러짐 · " : "받을 피해 ") + fmt(m.taken);
      return btn(key, '<b>' + icon(art) + title + '</b><small>줄 피해 ' + fmt(m.damage) +
        '</small><small>' + (m.available ? incoming : "기세 2 필요") + '</small>',
        "", lethal ? "action lethal" : "action", !m.available);
    }).join("") + "</div>";
}
function fieldView(s) {
  const rack = Game.blades.state(s), progress = Game.endgame.info(s);
  const held = progress.deployed.map(id=>rack.items.find(item=>item.id===id)).filter(Boolean);
  const bladeSlot = line("무기 배치",held.length+" / "+(progress.unlocked.land?2:1)) +
    held.map(item=>row(Game.blades.name(item)+" +"+item.level,fmt(Game.blades.income(item))+" G / 분",btn("bladeRecall","회수",item.id,"mini"))).join("") +
    (held.length<(progress.unlocked.land?2:1) ? openBtn("bladeCollection","+13 이상 무기 배치") : "");
  const candidates = s.bag
    .map((g, i) =>
      g.level >= 13 && !Game.isJourneyGear(s, g)
        ? row(
            Game.name(g) + " +" + g.level,
            fmt(Game.perMinute(g) / 6) + " G / 10초",
            btn("deploy", "배치", i, "mini"), "", gearPortrait(g,"weapon"),
          )
        : "",
    )
    .filter(Boolean);
  const deployed = s.field.map((g, i) =>
    row(Game.name(g) + " +" + g.level, Game.isJourneyGear(s, g) ? "기록 검 · 회수 후 재련" : fmt(Game.perMinute(g) / 6) + " G / 10초",
      btn("recall", "회수", i, "mini"), "", gearPortrait(g,"weapon")));
  return (
    metrics(
      gaugeMetric("배치 무기", s.field.length, 2 + s.imprints.land, "mint"),
      metric("10초당 골드", brief((s.field.reduce((n,g)=>n+Game.perMinute(g),0) + held.reduce((n,item)=>n+Game.blades.income(item),0))/6)),
      metric("누적 배치 수익", '<span id="yield">' + brief(s.unclaimed) + "</span>"),
    ) +
    btn("collect", "배치 수익 수령", "", "primary") + bladeSlot +
    (!s.field.length && !candidates.length ? line("배치 조건", "+13 이상 보조 검") : "") +
    '<div class="field-slots">' + deployed.join("") + Array.from({length:Math.max(0,2+s.imprints.land-s.field.length)},() => '<div class="field-empty">빈자리</div>').join("") + '</div>' + (candidates.length ? section("배치할 무기") + '<div class="field-slots">' + candidates.join("") + '</div>' : "") +
    (candidates.length ? "" : go("bag/stored", "무기 보관함 " + icon("arrow-right"), "action"))
  );
}
function miningTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 3600 ? Math.floor(seconds / 3600) + "시간 " + Math.ceil(seconds % 3600 / 60) + "분"
    : Math.floor(seconds / 60) + "분 " + seconds % 60 + "초";
}
function mineView(s) {
  return '<div id="miningStatus">' + miningStatus(s) + '</div>';
}
function miningStatus(s) {
  const d = s.dive, job = s.autoMine, rules = Game.mining;
  const allowed = Game.canDive(s.weapon);
  const fever = (s.fever || 0);
  const feverBar = '<div class="mine-fever' + (fever >= rules.feverCost ? ' ready' : '') + '">' +
    line(icon("flame") + " 피버", fmt(fever) + " / " + rules.feverCost) +
    gauge(Math.min(fever, rules.feverCost), rules.feverCost, "gold") + '</div>';
  if (job) {
    const remaining = job.started + job.limit * job.tankMs - Date.now();
    const tankRemaining = job.started + (job.completed + 1) * job.tankMs - Date.now();
    return metrics(metric("예약 산소통", job.limit + "개"), metric("소모 완료", job.completed + "개"),
      metric("탐사 수심", fmt(1000 + job.steps * 50) + " m")) +
      line(job.stopping ? "복귀 중" : "자동 탐사 중", '<span id="autoRemaining">' + miningTime(remaining) + " 남음</span>") +
      gauge(job.completed, job.limit, "mint") +
      line("현재 산소통", '<span id="tankRemaining">' + miningTime(tankRemaining) + " 남음</span>") + feverBar +
      btn("stopAutoMine", job.stopping ? "현재 산소통 정산 후 복귀" : "탐사 중단 · 남은 산소통 반환", "", "primary", job.stopping) +
      '<div class="actions">' + openBtn("miningResult", "획득 내역") + openBtn("market", "심해 암시장") + '</div>';
  }
  return metrics(metric("산소통", fmt(s.tanks)), metric("수심", d ? fmt(d.depth) + " m" : "지상"),
    metric("잔여 산소", d ? d.oxygen + gauge(d.oxygen, d.capacity || Math.max(d.oxygen, 100 + 10 * s.imprints.lung),
      d.oxygen <= 20 ? "red" : "mint") : "—")) + feverBar +
    (d ? btn("mine", icon("pickaxe") + (d.fever ? "피버 ×10 · " : "") + "50 m 하강 · " + Math.ceil(d.oxygen / 10) + "회 남음", "", "primary")
      : btn("dive", fever >= rules.feverCost ? "피버 탐사 ×10 · 산소통 1개 + 피버 100" : "직접 탐사 · 산소통 1개", "", "primary", !allowed || !s.tanks)) +
    (!allowed && !d ? line("입장 조건", "무기 +19 또는 베이스 II 이상") : "") +
    '<div class="actions">' +
    (d ? btn("air", "산소 보충", "", "action", d.fever || !s.tanks) + btn("surface", "지상 복귀")
      : openBtn("autoMineSetup", "자동 탐사 예약")) +
    btn("tank", "산소통 · 1,000만 G") + openBtn("market", "심해 암시장") +
    (s.lastAutoMine ? openBtn("miningResult", "최근 탐사 결과") : "") + '</div>';
}
function miningResult(s) {
  const job = s.autoMine || s.lastAutoMine;
  if (!job) return desc("자동 탐사를 마치면 획득 내역이 표시됩니다.");
  const loot = job.loot;
  return line(job.stopping ? "중단 탐사" : s.autoMine ? "진행 중" : "탐사 완료", "산소통 " + job.completed + "개 정산") +
    line("피버 적립", "+" + job.completed) +
    line("최대 수심", job.completed ? fmt(1000 + job.steps * 50) + " m" : "첫 산소통 탐사 중") +
    desc("아래 보상은 이미 보관함에 지급되었습니다.") +
    loot.ore.map((q, i) => q ? line(Game.oreNames[i], "×" + fmt(q)) : "").join("") +
    loot.charms.map((q, i) => q ? line(Game.blessings[i], "×" + fmt(q)) : "").join("") +
    [["별의 파편", loot.shards], ["길드 징표", loot.marks], ["전설 제련석", loot.stones]]
      .map(([name, q]) => q ? line(name, "×" + fmt(q)) : "").join("");
}
function towerView(s) {
  const tr = towerMode === "trial",
    run = s.trial,
    f = tr ? run.floor : s.tower,
    st = !tr && s.towerRun ? s.towerRun.attributes : Game.bladeAttributes(s, tr);
  return (
    tabs(
      [
        ["infinite", "무한의 탑"],
        ["trial", "시련의 탑"],
      ],
      towerMode,
      "tower",
    ) +
    metrics(
      metric("도전 층", f + " F"),
      metric("공격력", fmt(st.attack)),
      metric("체력", fmt(st.hp)),
    ) +
    (tr
      ? run.choices.length ? rewardView(s) : btn("trial", icon("swords") + "시련 도전", "", "primary", run.done)
      : s.towerRun
        ? line("고속 등반 중", s.towerRun.cleared + "층 돌파 · 상자 " + s.towerRun.chests.length + "개") +
          btn("stopTower", "등반 중단하고 결과 보기", "", "primary")
        : !s.tickets && dailyAvailable(s)
          ? openBtn("daily", icon("gift") + "출석 보상 · 입장권 5장", "primary")
          : btn("fastTower", icon("chevrons-up") + "고속 등반 · 입장권 1장", "", "primary", !s.tickets)) +
    (tr ? '<details><summary>시련 규칙</summary>' +
      desc("매 층 체력 회복 · 20턴 이내 승리 · 보상 3개 중 1개 선택. 매주 월요일 0시(한국 시간)에 초기화됩니다.") + '</details>' : "") +
    (tr ? openBtn("restart", "1층부터 다시 도전")
      : line("보유 입장권", s.tickets + "장") +
        line(Game.towerReward(f).name, brief(Game.towerReward(f).minGold) + "~" + brief(Game.towerReward(f).maxGold) + " G") +
        '<div class="actions">' +
        (s.towerRun ? "" : btn("tower", "한 층 · 1장", "", "action", !s.tickets)) +
        openBtn("towerRewards", "상자 보상") +
        (s.towerRun || s.lastTowerRun ? openBtn("towerRun", "등반 결과") : "") + '</div>')
  );
}
function towerRunView(s) {
  const run = s.towerRun || s.lastTowerRun;
  if (!run) return desc("고속 등반을 시작하면 결과가 기록됩니다.");
  const ids = new Set(run.chests);
  const pending = s.chests.filter(c => ids.has(c.id));
  const end = run.startFloor + run.cleared - 1;
  return line(s.towerRun ? "등반 중" : run.reason === "defeat" ? "패배로 종료" : "등반 중단",
      run.cleared ? run.startFloor + "~" + end + "층 돌파" : run.startFloor + (s.towerRun ? "층 도전 중" : "층에서 종료")) +
    line("사용 입장권", "1장") + line("획득 상자", run.chests.length + "개") +
    line("미개봉 상자", pending.length + "개") +
    (run.battle ? line("최근 전투", run.battle.f + "층 · " + run.battle.turns + "턴 " + (run.battle.win ? "승리" : "패배")) : "") +
    btn("openTowerChests", "등반 상자 " + pending.length + "개 모두 열기", "", "primary", !pending.length) +
    desc("층마다 상자를 보관합니다. 상자는 보관함에서도 하나씩 열 수 있습니다.");
}

function rewardView(s) {
  return (
    '<div class="stack"><b>승리 보상 선택</b>' +
    s.trial.choices
      .map((c, i) =>
        btn(
          "reward",
          icon({ attack: "sword", hp: "shield", shards: "sparkles" }[c.type]) +
            { attack: "공격력", hp: "체력", shards: "별의 파편" }[c.type] + " +" + fmt(c.amount),
          i,
        ),
      )
      .join("") +
    "</div>"
  );
}
function altarView(s) {
  return (
    metrics(
      metric("별의 파편", s.shards),
      metric("무기 공격 옵션", "+" + s.weapon.star),
      metric("방어구 체력 옵션", "+" + s.armor.star),
    ) +
    line("다시 새기기 비용", "별의 파편 1개") +
    btn("altar", icon("sword") + "공격력 다시 새기기 · +200~600", "weapon", "primary", !s.shards) +
    btn("altar", icon("shield") + "체력 다시 새기기 · +400~1,200", "armor", "action", !s.shards)
  );
}
function zoneView(s, id) {
  const z = zones[id],
    f = towerMode === "trial" ? s.trial.floor : s.tower;
  if (id === "forest" && phonePage(id) === "field")
    return '<section class="panel">' + fieldView(s) + "</section>";
  const health = id === "forest" && s.hunt;
  const enemy = id === "forest" ? Game.huntEnemy(forestSceneTarget(s)) : null;
  return (
    '<div class="columns"><div class="stage-side">' +
    scene(
      id,
      enemy
        ? enemy.name
        : id === "tower"
          ? Game.bosses[Math.min(19, Math.floor((f - 1) / 5))]
          : z[3],
      z[1],
      enemy ? enemy.habitat + " · " + enemy.rank + "구역" : "",
      enemy ? "boar" : id === "tower" ? creature(f) : "",
      0,
      enemy,
    ) +
    '</div><section class="panel"><h2>' +
    {
      forest: s.hunt ? "토벌 중" : s.lastHunt ? "토벌 결과" : "토벌 준비",
      mine: s.autoMine ? "자동 탐사" : s.dive ? "탐사 중" : "탐사 준비",
      tower: "등반 준비",
      altar: "장비 각성",
    }[id] +
    "</h2>" +
    (id === "forest" ? forestView(s, health) : { mine: mineView, tower: towerView, altar: altarView }[id](s)) +
    "</section></div>" +
    ""
  );
}
function growthView(s, archivePage) {
  const page = archivePage || phonePage("growth");
  if (!archivePage && page!=="guild" && typeof SoulView!=="undefined") return SoulView.growth(s,page);
  const imprint = Object.entries(Game.imprints)
    .map(([key, v]) =>
      row(
        v[0] + " Lv." + s.imprints[key],
        { luck: "강화 성공률 +0.2%p", lung: "탐사 산소 +10", land: "사냥터 +1칸" }[key],
        btn(
          "imprint",
          s.imprints[key] >= v[3] ? "최대" : Game.imprintCost(s, key) + " P",
          key,
          "mini",
          s.imprints[key] >= v[3] || s.souls < Game.imprintCost(s, key),
        ),
      ),
    );
  const summary = metrics(
      metric("환생 횟수", fmt(s.rebirths)),
      metric("영혼 포인트", fmt(s.souls)),
      metric("역대 최고 강화", "+" + s.best),
    );
  const cards = {
    rebirth: card(
      "환생",
      (Game.isJourneyGear(s, s.weapon) ? line("환생 재료", "+20 보조 검") :
        line("장착 무기", "+" + s.weapon.level + " / +20") + gauge(s.weapon.level, 20)) +
        (s.inheritedRecipe ? line("전승 제작법", recipeName(s.inheritedRecipe)) : "") +
        openBtn("rebirth", s.weapon.level === 20 && !Game.isJourneyGear(s, s.weapon) ? "환생 의식 열기" : "환생 조건 보기"),
      "flame",
    ),
    imprint: card("영혼 각인", imprint.join("") +
      '<details class="imprint-techniques"><summary>주각인 효과</summary>' +
      Object.entries(Game.techniques).map(([key, technique]) =>
        row(Game.imprints[key][0] + " · " + technique.name, technique.text, "")).join("") + '</details>', "sparkles"),
    fusion: card(
      "초월 합성",
      line("개방 조건", "환생 2,000회") + openBtn("fusion", "합성 재료 보기"),
      "anvil",
    ),
    guild: card(
      "길드 레이드",
      (s.guild ? line(s.guild.name, "레이드 " + s.guild.raids + "회") : "") +
        openBtn("guild", s.guild ? "레이드 입장" : "길드 창설"),
      "castle",
    ),
  };
  // The archive modal selects its historical page explicitly.
  return page ? summary + cards[page] : summary + section("영구 성장") +
    '<div class="baggrid">' + Object.values(cards).join("") + "</div>" + orderView(s);
}
