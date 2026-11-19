"use strict";
const el = (id) => document.getElementById(id);
const icon = (n) => {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (ICONS[n] || "") +
  "</svg>";
};
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
const openBtn = (id, label, cls = "action") =>
  '<button class="' + cls + '" data-open="' + id + '">' + label + "</button>";
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
const navItems = [
  ["forge", "대장간", "anvil"],
  ["world", "모험", "compass"],
  ["bag", "보관함", "backpack"],
  ["growth", "성장", "sparkles"],
];
const tier = (g, type) => Game.grades[g.grade] + " " + (type === "armor" ? "방어구" : "무기");
function creature(f) {
  return ["scarecrow", "sentinel", "golem", "dragon"][Math.min(3, Math.floor((f - 1) / 5))];
}
function scene(id, heading, english, loc, sprite = "", grade = 0, enemy = null) {
  return (
    '<div class="scene"' + (enemy ? ' data-enemy="' + enemy.kind + '" data-depth="' + Math.min(3, Math.floor((enemy.rank - 1) / 15)) + '"' : "") + ' style="--image:url(assets/' +
    (id === "forge" ? "hud/workshop.webp" : id + ".png") +
    ')"><span class="location">' + icon("map-pin") + loc + "</span>" +
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
      : "") +
    (enemy ? '<span class="forest-rank">' + (enemy.elite ? "우두머리 · " : "") + "Lv." + enemy.rank + '</span>' : "") +
    '<span class="scene-ambient" aria-hidden="true"></span><div class="caption"><span class="eyebrow">' +
    english +
    "</span><b>" +
    heading +
    "</b></div></div>"
  );
}
function adventureMap(s) {
  const details = {
    forest: s.hunt ? s.hunt.rank + "구역 전투 중" : Math.min(60, s.huntBest + 1) + "구역 사냥",
    mine: s.autoMine ? "자동 탐사 " + s.autoMine.completed + " / " + s.autoMine.limit : s.dive ? fmt(s.dive.depth) + " m 탐사 중" : Game.canDive(s.weapon) ? "산소통 " + fmt(s.tanks) + "개" : "+19 또는 레어 필요",
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
            mine: "무기 +19 또는 레어",
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
function liningCard(s) {
  const level = s.huntLining, cost = Game.liningCosts[level];
  const hp = fmt(Game.huntStats(s).hp);
  const next = cost ? ' → ' + fmt(Game.huntStats({ ...s, huntLining: level + 1 }).hp) : '';
  return '<section class="lining-card" aria-label="숲 방호 안감"><div><b>' + icon('shield') +
    '숲 방호 안감 ' + level + '/5</b><small>사냥 HP ' + hp + next + '</small><small>' +
    icon('trees') + '숲결 섬유 ' + fmt(s.forestFiber) + (cost ? ' / ' + cost + ' · 숲 승리 보물' : '') +
    '</small></div><button class="action" data-act="craftHuntLining" data-level="' + level + '" ' +
    (!cost || s.forestFiber < cost ? 'disabled' : '') + '>' + (!cost ? '완성' : level ? '보강' : '제작') + '</button></section>';
}
function journeyForgeControls(s, type, plan) {
  const level = plan.level, next = plan.next;
  const grade = Game.grades[plan.targetGrade];
  const process = plan.needsProcess && Swordcraft.stages[plan.processIndex];
  const price = fmt(plan.cost) + ' G';
  const title = grade ? grade + ' 승급' : '최종 재련';
  if (s.hunt) return {
    heading: '진행 중인 숲 토벌', detail: fmt(s.hunt.rank) + '단계',
    button: go('forest', icon('trees') + '토벌 계속', 'primary'),
  };
  if (type === 'weapon' && s.weapon.finalTrial) return {
    heading: '진행 중인 돌파', detail: Breakthrough.methods[s.weapon.finalTrial.key].name,
    button: openBtn('final', icon('sword') + '돌파 계속', 'primary'),
  };
  if (process) return {
    heading: process.title, detail: '제작 공정 ' + (plan.processIndex + 1) + ' / ' + Swordcraft.stages.length,
    button: go('forge/craft', icon(process.icon) + '공정 열기<small>' + process.title + '</small>', 'primary'),
  };
  if (plan.atThreshold && plan.needsHunt) return {
    heading: title, detail: '숲 토벌 ' + fmt(Math.min(s.huntBest, plan.requiredHunt)) + ' / ' + plan.requiredHunt + '단계',
    button: go('forest', icon('trees') + '토벌하기<small>' + plan.requiredHunt + '단계 필요</small>', 'primary'),
  };
  if (plan.canPromote) return {
    heading: title, detail: '승급 조건 달성',
    button: openBtn('swordPromotion', icon('sparkles') + title + '<small>' + (plan.targetGrade === 2 ? '특성 선택' : '검 벼리기') + '</small>', 'primary'),
  };
  if (next <= level) return {
    heading: '최종 재련 완료', detail: '+' + fmt(level),
    button: openBtn('journal', icon('scroll-text') + '강화 기록', 'primary'),
  };
  return {
    heading: '안전 재련 +' + fmt(level) + ' → +' + fmt(next), detail: '성공 100%',
    button: s.gold < plan.cost
      ? go('forest', icon('trees') + '골드 사냥<small>재련비 ' + price + '</small>', 'primary')
      : btn('journeyForge', icon('hammer') + '재련<small>' + price + '</small>', type, 'primary'),
  };
}
function journeyDetails(s, type, plan) {
  const controls = journeyForgeControls(s, type, plan);
  const nextGrade = Game.grades[plan.targetGrade];
  let html = line('장비', Game.name(s[type], type) + ' +' + fmt(plan.level));
  const smith = Game.journeySmith(s);
  html += line('대장장이 Lv.' + smith.level, fmt(smith.xp) + (smith.next ? ' / ' + fmt(smith.next) : '') + ' XP') +
    line('즉시 제작 상한', '+' + fmt(smith.cap)) + line('사냥 재료', fmt(smith.bundles) + '묶음 · 재련 시 묶음당 10 XP');
  if (type === 'weapon' && Number.isInteger(s.weapon.journeyTrait)) html += line('에픽 특성', Game.journeyTraits[s.weapon.journeyTrait]);
  if (plan.canChooseTrait) html += openBtn('swordTrait', icon('sparkles') + '에픽 특성 새기기', 'action');
  if (type === 'weapon' && nextGrade) {
    html += line('다음 승급', nextGrade + ' · +' + fmt(plan.threshold)) +
      line('완료한 제작 공정', (s.weapon.marks || []).length + ' / ' + Swordcraft.stages.length) +
      (plan.requiredHunt ? line('숲 토벌', fmt(Math.min(s.huntBest, plan.requiredHunt)) + ' / ' + plan.requiredHunt + '단계') : '');
  }
  if (plan.next <= plan.level) return html + line(controls.heading, controls.detail) + controls.button;
  html += line('다음 재련', '+' + fmt(plan.next) + ' · ' + fmt(plan.cost) + ' G') + line('성공 확률', '100%');
  if (plan.bulk > plan.next && !s.hunt && !s[type].finalTrial) {
    html += '<button class="primary" data-act="journeyBulk" data-arg="' + type + '" data-level="' + plan.level +
      '" data-bulk="' + plan.bulk + '" data-bulk-cost="' + plan.bulkCost + '">+' + fmt(plan.bulk) +
      '까지 재련 · ' + fmt(plan.bulkCost) + ' G</button>';
  }
  if (s.gold < plan.cost) html += go('forest', '숲에서 골드 벌기', 'action');
  return html;
}
function swordPromotionView(s, traitOnly = false) {
  const p = Game.journeyForge(s, 'weapon');
  const available = traitOnly ? p?.canChooseTrait : p?.canPromote;
  if (!available) return ['검의 기록', desc('대장간에서 이 검의 현재 조건을 확인하세요.')];
  const title = traitOnly ? '에픽 특성 새기기' : Game.grades[p.targetGrade] + ' 승급';
  const summary = line('현재 검', Game.name(s.weapon) + ' +' + fmt(p.level)) +
    line('등급', traitOnly ? Game.grades[p.grade] : Game.grades[p.grade] + ' → ' + Game.grades[p.targetGrade]);
  if (!traitOnly && p.targetGrade !== 2) return [title, summary + btn('promoteSword', icon('hammer') + title, 0, 'primary')];
  return [title, summary + section('검에 새길 특성') + '<div class="journey-traits">' +
    Game.journeyTraits.map((name, index) => btn(traitOnly ? 'chooseSwordTrait' : 'promoteSword', icon(['shield','sword','heart','flame'][index]) + '<b>' + name + '</b><small>' +
      ['반격 피해 약 +3%', '적 체력이 30% 미만일 때 피해 +10%', '내 체력이 35% 미만일 때 받는 피해 −13%', '강공 피해 +8%'][index] + '</small>', index)).join('') + '</div>'];
}
function forgeView(s) {
  const g = s[gear], weapon = gear === "weapon", page = phonePage("forge");
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
    "", tier(g, gear), weapon ? "blade" + (Game.bladeStage(g) || "") : "cuirass", g.grade) + '</div><section class="panel">' +
    '<div class="stats">' + line(weapon ? "공격력" : "체력", fmt(weapon ? stat.attack : stat.hp) + (hasNext ? ' <span class="mint">→ ' + fmt(weapon ? next.attack : next.hp) + '</span>' : '')) +
    (journey ? '<div class="forge-odds journey-odds"><b>' + journey.heading + '</b>' +
      (hasNext && !s.hunt && !g.finalTrial ? '<div class="odds-bar" aria-hidden="true"><i class="odds-success"></i></div>' : '') +
      '<span>' + journey.detail + '</span></div>' : forgeChances(s, g)) + '</div>' +
    (equipped.length ? '<div class="forge-blessings" role="group" aria-label="장착한 가호">' + equipped.join('') + '</div>' : '') +
    (recovery ? go("forge/training", "+" + recovery.target + " 확정 복구 가능 · 수련", "action") : "") +
    (finalChoice ? openBtn("final", icon("sword") + (g.finalTrial ? Breakthrough.methods[g.finalTrial.key].name + " 계속" : "+20 돌파 방식 선택"), "primary") : "") +
    (journey ? journey.button : g.level >= 20 ? go("growth", "초월 · 환생 확인", "primary") : btn("enhance", icon("hammer") +
      (recovery ? "일반 강화 +15" : finalChoice ? "일반 강화 +20" : "강화하기") + '<small>' + fmt(cost) + ' G<span class="forge-hold-hint">꾹 눌러 연속</span></small>', gear, finalChoice || recovery ? "action split" : "primary split", !!g.finalTrial)) +
    '<div class="actions forge-support">' + openBtn("temper", icon("flame") + (s.heat ? "담금질 +" + s.heat + "%p" : "담금질")) +
    (journey ? go("forest", icon("trees") + "숲 사냥", "action") : openBtn("guards", icon("shield") + (equipped.length ? "가호 장착됨" : "가호"))) +
    '<button class="round" data-open="risk" aria-label="' + (journey ? "재련 비용과 승급 조건" : "강화 확률과 실패 조건") + '">' + icon("circle-help") + '</button></div>' +
    (weapon ? '' : liningCard(s)) + '</section></div>';
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
  return w.remaining === null ? "자연 충전 대기 · 무료 30개 미만부터 충전" : "다음 무료 충전 " + time + " · 10분마다 1개";
}
function huntingWalletKey(s, w) {
  return [w.free, w.purchased, s.day >= Game.day(Date.now()) || w.daily >= Game.day(Date.now())].join(":");
}
function huntingWalletContent(s) {
  const w = Game.huntingStatus(s);
  const claimed = s.day >= Game.day(Date.now()) || w.daily >= Game.day(Date.now());
  return '<div data-hunting-status="' + huntingWalletKey(s, w) + '">' + line("사냥권", "무료 " + fmt(w.free) + " / 30 · 구매 " + fmt(w.purchased)) +
    '<p class="desc" data-hunting-recharge>' + huntingRechargeText(w) + '</p>' +
    (!w.free && !w.purchased ? desc("사냥권이 부족합니다. 충전을 기다리거나 출석을 확인하세요. 제작·담금질·보관함 정리·배치 수익 수령은 계속할 수 있습니다.") +
      '<div class="actions">' + openBtn("daily", claimed ? "출석 수령 완료" : "출석 +10 받기", "mini") + go("forge", "대장간으로", "mini") + '</div>' : "") +
    '<details class="hunt-wallet-help"><summary>무료 로컬 시험 안내</summary>' +
    desc("실제 구매 미지원 · 기기 시각과 저장 기준. 배치 수익은 전투와 별도로 쌓이며 사냥권을 쓰지 않습니다.") + '</details></div>';
}
function huntModeControls(s) {
  const r = typeof repeatHunting === "undefined" ? null : repeatHunting.summary;
  const active = !!r?.active;
  return '<div class="hunt-mode" data-hunt-mode-controls><div class="segment" role="group" aria-label="전투 방식">' +
    [["manual", "수동"], ["auto", "자동 사냥"]].map(([key, label]) => '<button data-hunt-mode="' + key +
      '" aria-pressed="' + (active === (key === "auto")) + '" class="' + (active === (key === "auto") ? "active" : "") + '">' + label + '</button>').join("") +
    (active ? '<button data-repeat="stop"' + (r.stopping ? ' disabled' : '') + '>' + (r.stopping ? '중단 예정' : '이번 판 후 중단') + '</button>' : '') +
    '</div><small>무료 우선 · 구매분 포함 · 소진까지</small></div>';
}
function repeatPanel(s) {
  const r = typeof repeatHunting === "undefined" ? null : repeatHunting.summary;
  if (!r) return '<section class="repeat-panel" data-repeat-panel></section>';
  return '<section class="repeat-panel" data-repeat-panel><div class="repeat-status"><b>' + r.rank + '구역 · ' +
    (r.active ? (r.stopping ? '이번 판 후 중단' : r.chest ? '보물 수령 중' : r.battle ? '자동 사냥 중' : '다음 사냥 준비') : r.reason) + '</b>' +
    '<small>⚔ ' + r.wins + '승 · 🎟 무료 ' + r.usedFree + ' / 구매 ' + r.usedPurchased + ' · 🎁 ' + r.chests + '</small>' +
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
  const wallet = '<div class="wallet-short"><span data-wallet-summary>사냥권 · 무료 ' + w.free + ' / 구매 ' + w.purchased + '</span>' +
    openBtn("huntWallet", "충전 · 출석", "textbtn") + '</div>';
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
    '</select><button class="primary" data-repeat="start"' + (w.free + w.purchased ? '' : ' disabled') + '>' + icon("sword") + '자동 사냥 시작</button><small>무료 우선 · 구매분 포함 · 소진까지</small></div>' +
    '<div class="actions">' + btn("huntStart", selected + "구역 수동 · 사냥권 1",selected,"action",!w.free && !w.purchased) +
    (s.huntBest ? btn("huntStart","이전 구역 재도전 · 사냥권 1",Math.min(s.huntBest,60),"mini",!w.free && !w.purchased) : '') + '</div>' + repeatPanel(s) +
    (s.lastHunt ? '<details><summary>지난 토벌 결과</summary>' + huntResult(s.lastHunt,s.chests) + '</details>' : '');
  const task = Game.routeTask(s);
  const training = !h && !pendingChest && s.weapon.route?.trait === "edge" && task?.open ? task.ready ?
    go("forge/training","수련 마감 · +" + task.target,"action") : task.needed <= next ?
    btn("huntStart","전승 수련 · " + task.needed + "구역 · 사냥권 1",task.needed,"action") : "" : "";
  return '<div class="stack hunt-stack">' + content + (h ? "" : wallet) +
    (!w.free && !w.purchased && !h ? '<div class="actions">' + openBtn("daily", "출석 보상") + go("forge","대장간으로") + '</div>' : '') +
    training + '<details class="hunt-enemy-help"><summary>적 특성 · 전투 안내</summary>' + forestEncounter(h || selected) +
    (h ? desc(h.last) : '') + desc("이어하기 추가 차감 없음 · 퇴각 시 사냥권 반환 없음") +
    desc("자동은 약 1초마다 행동하고 승리 보물을 수령한 뒤 같은 구역을 반복합니다. 화면을 숨기거나 종료하면 수동 대기로 돌아옵니다.") +
    openBtn("huntRules", "기세와 반격 규칙", "action") + '</details></div>';
}
function chestOrigin(c) {
  return c.source === "tower" ? "무한의 탑 " + c.rank + (c.rankEnd && c.rankEnd !== c.rank ? "~" + c.rankEnd : "") + "층" : "이끼숲 " + c.rank + "구역";
}
function chestButton(c) {
  return btn("openChest", '<i class="chest-art" aria-hidden="true"></i><span><small>' +
    chestOrigin(c) + '</small><b>' + (c.name || '보물상자') + ' 열기</b></span>', c.id, "chest-find");
}
function chestReceipt(c) {
  if (!c) return "";
  const loot = (sprite, name, n) => n ? line(icon(sprite) + name, "+" + fmt(n)) : "";
  return '<div class="chest-reveal tier-' + c.tier + '"><i class="chest-art" aria-hidden="true"></i><b>' +
    (c.name || ["나무 상자", "은장 상자", "황금 상자"][c.tier]) + '</b><small>' + chestOrigin(c) + '</small></div>' +
    '<div class="chest-loot">' + line(icon("coins") + "골드", fmt(c.gold) + " G") +
    (c.counter || c.extra || c.goblinGold ? desc("기본 " + fmt(c.base) + " G" + (c.counter ? " · 반격 +" + fmt(c.counter) + " G" : "") +
      (c.goblinGold ? " · 황금 고블린 +" + fmt(c.goblinGold) + " G" : "") +
      (c.extra ? " · 상자 보너스 +" + fmt(c.extra) + " G" : "")) : "") +
    loot("anvil", "사냥 재료 묶음", c.journeyBundle) + loot("trees", "숲결 섬유", c.fiber) + loot("sparkles", "별의 파편", c.shards) + loot("scroll-text", "10% 주문서", c.scrolls) +
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
    (last.ticketSource ? " · 사냥권 1개 사용" : " · 이전 전투 추가 차감 없음") +
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
      metric("10초당 골드", brief(s.field.reduce((n, g) => n + Game.perMinute(g) / 6, 0))),
      metric("누적 배치 수익", '<span id="yield">' + brief(s.unclaimed) + "</span>"),
    ) +
    btn("collect", "배치 수익 수령", "", "primary") +
    desc("+13 이상 보조 검을 보관한 뒤 배치하면 게임을 닫아도 골드가 쌓입니다.") +
    '<div class="field-slots">' + deployed.join("") + Array.from({length:Math.max(0,2+s.imprints.land-s.field.length)},() => '<div class="field-empty">빈 배치 자리<br><small>+13 이상 무기</small></div>').join("") + '</div>' + (candidates.length ? section("배치할 무기") + '<div class="field-slots">' + candidates.join("") + '</div>' : "") +
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
      desc("화면을 닫아도 경과 시간만큼 탐사합니다. 산소통 한 개를 마칠 때 보상과 피버 1이 정산됩니다.") +
      '<div class="actions">' + openBtn("miningResult", "획득 내역") + openBtn("market", "심해 암시장") + '</div>';
  }
  return metrics(metric("산소통", fmt(s.tanks)), metric("수심", d ? fmt(d.depth) + " m" : "지상"),
    metric("잔여 산소", d ? d.oxygen + gauge(d.oxygen, d.capacity || Math.max(d.oxygen, 100 + 10 * s.imprints.lung),
      d.oxygen <= 20 ? "red" : "mint") : "—")) + feverBar +
    (d ? btn("mine", icon("pickaxe") + (d.fever ? "피버 ×10 · " : "") + "50 m 하강 · " + Math.ceil(d.oxygen / 10) + "회 남음", "", "primary")
      : btn("dive", fever >= rules.feverCost ? "피버 탐사 ×10 · 산소통 1개 + 피버 100" : "직접 탐사 · 산소통 1개", "", "primary", !allowed || !s.tanks)) +
    desc(d?.fever ? "이번 산소통의 광물과 추가 드롭이 10배입니다. 산소를 다 쓰면 복귀합니다."
      : "무기 +19 또는 레어부터 입장 · 50 m당 산소 10 · 자동 탐사로 피버 적립") +
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
    st = !tr && s.towerRun ? s.towerRun.attributes : Game.stats(s, tr);
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
        : btn("fastTower", icon("chevrons-up") + "고속 등반 · 입장권 1장", "", "primary", !s.tickets)) +
    desc(tr
      ? "매 층 체력이 회복됩니다. 20턴 안에 처치해야 승리하며 보상 셋 중 하나를 고릅니다. 매주 월요일 0시(한국 시간) 초기화."
      : "입장 시 능력치로 패배·중단까지 등반합니다. 재접속하면 이어집니다.") +
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
    desc(
      "별의 파편 1개로 장착 장비의 옵션을 다시 새깁니다. 무기는 공격력 +200~600, 방어구는 체력 +400~1,200 중 하나의 값이 정해집니다.",
    ) +
    btn("altar", icon("sword") + "무기 옵션 새기기", "weapon", "primary", !s.shards) +
    btn("altar", icon("shield") + "방어구 옵션 새기기", "armor", "action", !s.shards)
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
      enemy ? enemy.habitat + " · " + enemy.rank + "구역" : z[0],
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
function bagView(s) {
  const shelf = s.chests?.length ? card("미개봉 보물상자 · " + s.chests.length, chestButton(s.chests[0])) : "";
  const page = phonePage("bag"), selected = page || bagTab;
  const forgeLink = '<button class="action" data-go="forge" data-gear="weapon">' + icon("hammer") + '무기 강화</button>';
  const tabBar = page ? "" : tabs(
      [
        ["gear", "장비"],
        ["items", "소모품"],
        ["relics", "유물"],
      ],
      bagTab,
      "bag",
    );
  if (selected === "gear" || selected === "stored") {
    const equipment = '<div class="baggrid equipment-rack">' +
        ["weapon", "armor"]
          .map((k) =>
            card(
              k === "weapon" ? "장착 무기" : "장착 방어구",
              row(
                Game.name(s[k], k) + " +" + s[k].level,
                [tier(s[k], k), craftSummary(s[k])].filter(Boolean).join(" · "),
                "", "", gearPortrait(s[k], k),
              ) +
                '<div class="actions">' +
                (k === "weapon" ? (Game.canStoreWeapon(s.weapon) ? btn("keep", "무기 보관") :
                  forgeLink) : "") +
                (Game.isJourneyGear(s, s[k]) ? "" : openBtn("sell-" + k, s[k].level >= 1 ? "판매" : "판매 조건")) +
                "</div>",
            ),
          )
          .join("") +
        "</div>";
    if (page === "gear") return shelf + equipment;
    const stored = card(
          "보관 무기 · " + s.bag.length + " / 20",
          '<div class="inventory-grid">' + s.bag.map((g,i) => '<article class="inventory-tile">' + gearPortrait(g,"weapon") +
            '<b>' + Game.name(g) + ' +' + g.level + '</b><small>' + [tier(g,"weapon"),craftSummary(g)].filter(Boolean).join(' · ') + '</small>' +
            '<div class="actions">' + btn("equip","장착",i,"mini") + (g.level >= 13 && !Game.isJourneyGear(s, g) ? btn("deploy","배치",i,"mini") : '') + '</div></article>').join('') + '</div>' +
            (s.bag.length ? '' : desc("보관한 무기를 장착할 수 있습니다. +13 이상 보조 검은 사냥터에도 배치할 수 있습니다.") + go("bag","장착 장비 보기","action")),
        );
    return tabBar + shelf + (page ? "" : equipment) + stored;
  }
  return tabBar + shelf + (selected === "items"
        ? card(
            "보유 소모품",
            phoneList([
              ...Game.blessings.map((n, i) =>
                row(n, s.charms[i] + "개", openBtn("guards", "설정", "mini"), ["leaf", "hammer", "star"][i])),
              row("10% 주문서", s.scrolls + "장", openBtn("guards", "설정", "mini")),
              row("산소통", s.tanks + "개", go("mine", "광산", "mini")),
              row("별의 파편", s.shards + "개", go("altar", "제단", "mini"))]),
          )
        : card(
            "유물 보관함 · " + s.relics.length + " / 20",
            desc(
              "대표 유물의 공격력 보너스는 길드 레이드에 적용됩니다. 별의 파편 1개로 60% 확률 강화에 도전할 수 있습니다.",
            ) +
              phoneList(s.relics
                .map((r, i) =>
                  row(
                    "새벽의 인장 · 공격력 +" + r.power + "%" + (r.extraAttack ? " · 추가 +" + r.extraAttack : ""),
                    "남은 강화 " + (10 - r.tries) + "회 · 복구 가능 " + r.failures + "회",
                    s.equippedRelic === i
                      ? openBtn("relicWorkshop", "대표 · 강화", "mini")
                      : btn("relic", "대표 지정", i, "mini"),
                    "star",
                  ),
                )) +
              openBtn("shop", "포인트 상점", "action"),
          ));
}
function growthView(s) {
  const imprint = Object.entries(Game.imprints)
    .map(([key, v]) =>
      row(
        v[0] + " Lv." + s.imprints[key],
        { luck: "강화 성공률 +0.2%p", lung: "탐사 산소 +10", land: "사냥터 +1칸" }[key] +
          " · 주각인 " +
          Game.techniques[key].name +
          " · " +
          Game.techniques[key].text,
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
      (Game.isJourneyGear(s, s.weapon) ? line("환생 재료", "+20 보조 검") + desc("현재 검은 계속 벼릴 수 있습니다. 환생하려면 보관함에서 보조 검을 장착하세요.") :
        line("장착 무기", "+" + s.weapon.level + " / +20") + gauge(s.weapon.level, 20) +
        desc("장착한 +20 보조 검을 바치면 등급에 따라 영혼 포인트를 받습니다.")) +
        (s.inheritedRecipe ? line("전승 제작법", recipeName(s.inheritedRecipe)) : "") +
        openBtn("rebirth", s.weapon.level === 20 && !Game.isJourneyGear(s, s.weapon) ? "환생 의식 열기" : "환생 조건 보기"),
      "flame",
    ),
    imprint: card("영혼 각인", imprint.join(""), "sparkles"),
    fusion: card(
      "초월 합성",
      desc(
        "환생 2,000회부터 장착한 전설 +20~24 무기와 보관 중인 같은 단계 전설 무기를 합성합니다.",
      ) + openBtn("fusion", "합성 재료 보기"),
      "anvil",
    ),
    guild: card(
      "길드 레이드",
      desc(
        s.guild
          ? s.guild.name + " · 누적 레이드 " + s.guild.raids + "회"
          : "개인 길드를 창설해 매일 레이드 보상에 도전합니다. 광산에서 징표를 모으세요.",
      ) + openBtn("guild", s.guild ? "레이드 입장" : "길드 창설"),
      "castle",
    ),
  };
  const page = phonePage("growth");
  return page ? (page === "rebirth" ? '<div class="progression-stage" aria-hidden="true"></div>' : "") + summary + cards[page] : summary + section("영구 성장") +
    '<div class="baggrid">' + Object.values(cards).join("") + "</div>" + orderView(s);
}
