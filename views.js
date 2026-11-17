"use strict";
const el = (id) => document.getElementById(id);
const itemIcons = [
  "anvil", "compass", "backpack", "sparkles", "coins", "scroll-text", "shield", "sword",
  "hammer", "flame", "gift", "settings", "trees", "pickaxe", "castle", "orbit",
];
const icon = (n) => {
  const index = itemIcons.indexOf(n);
  if (index >= 0)
    return '<span aria-hidden="true" class="item-art" style="background-position:' +
      ((index % 4) * 100 / 3) + '% ' + (Math.floor(index / 4) * 100 / 3) + '%"></span>';
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
function scene(id, heading, english, loc, sprite = "", grade = 0) {
  return (
    '<div class="scene" style="--image:url(assets/' +
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
    '<div class="caption"><span class="eyebrow">' +
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
            forest: "직접 사냥 · 자동 배치",
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
  const o = Game.orders[s.order];
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
function forgeView(s) {
  const g = s[gear],
    weapon = gear === "weapon",
    finalChoice = weapon && g.level === 19 && Breakthrough.choices(g, Game.price).length > 0,
    recovery = weapon ? Game.midRecovery(g) : null,
    cost = s.enabled[2] && s.charms[2] ? 0 : Game.price(g);
  const title = Game.name(g, gear),
    stat = Game.stats(s),
    next = Game.stats({ ...s, [gear]: { ...g, level: g.level + 1 } });
  const page = phonePage("forge");
  if (page === "orders") return orderView(s);
  if (page === "craft") {
    const work = patternView(s) + craftEntry(s);
    return card("검 제작", work || desc("검이 +7에 도달하면 칼날 연마를 시작할 수 있습니다."), "anvil");
  }
  if (page === "training") {
    const w = s.weapon, recover = Game.midRecovery(w);
    const training = phoneList([
      recover ? recoveryView(s, recover) : "",
      notebookView(s, s.enabled[2] && s.charms[2] ? 0 : Game.price(w), recover),
      legacyView(s),
    ].filter(Boolean), "", 1);
    return card("단조 수첩과 전승 수련", training || desc("검이 +17에 도달하면 단조 수첩이 열립니다. 첫 환생 이후에는 전승 수련을 시작할 수 있습니다."), "anvil");
  }
  return (
    '<div class="columns"><div class="stage-side">' +
    scene(
      "forge",
      title + (page ? " +" + g.level : ""),
      "THE WORKSHOP",
      page ? tier(g, gear) : "잿불 작업장",
      weapon ? "blade" + (Game.bladeStage(g) || "") : "cuirass",
      g.grade,
    ) +
    '</div><section class="panel"><div class="flex"><h2>장비 강화</h2>' +
    '<button class="inlinehelp" data-open="risk" aria-label="강화 확률과 실패 조건">' +
    icon("circle-help") +
    "</button>" +
    '</div><div class="segment">' +
    [
      ["weapon", "sword", "무기"],
      ["armor", "shield", "방어구"],
    ]
      .map(
        ([id, ic, n]) =>
          '<button data-gear="' +
          id +
          '" aria-pressed="' + (gear === id) + '" class="' +
          (gear === id ? "sel" : "") +
          '">' +
          icon(ic) +
          n +
          "</button>",
      )
      .join("") +
    "</div>" +
    '<div class="gearhead"><span class="gearicon">' +
    gearPortrait(g, gear) +
    '</span><div><small class="grade">' +
    tier(g, gear) +
    '</small><b class="name">' +
    title +
    '</b></div><b class="level">+' +
    g.level +
    "</b></div>" +
    '<div class="stats">' +
    line(
      recovery ? "일반 강화 시 공격력" : weapon ? "공격력" : "체력",
      fmt(weapon ? stat.attack : stat.hp) +
        (g.level >= 20
          ? ""
          : ' <span class="mint">→ ' + fmt(weapon ? next.attack : next.hp) + "</span>"),
    ) +
    forgeChances(s, g) + "</div>" +
    (weapon && !page ? patternView(s) + craftEntry(s) : "") +
    (recovery && !page ? recoveryView(s, recovery) : "") +
    (finalChoice
      ? openBtn(
          "final",
          icon("sword") +
            (g.finalTrial
              ? Breakthrough.methods[g.finalTrial.key].name + " 계속"
              : "+20 돌파 방식 선택"),
          "primary",
        )
      : "") +
    (g.level >= 20
      ? go("growth", "초월 · 환생 확인", "primary")
      : btn(
          "enhance",
          icon("hammer") +
            (recovery ? "일반 강화 +15" : finalChoice ? "일반 강화 +20" : "강화하기") +
            " <small>" +
            fmt(cost) +
            " G</small>",
          gear,
          recovery || finalChoice ? "action split" : "primary split",
          !!g.finalTrial,
        )) +
    (weapon && !page ? notebookView(s, cost, recovery) : "") +
    (weapon && !page ? legacyView(s) : "") +
    '<div class="actions">' +
    openBtn("guards", icon("shield") + "가호" + (s.enabled.some(Boolean) ? " 장착됨" : " 설정")) +
    openBtn("temper", icon("flame") + (s.heat ? "담금질 +" + s.heat + "%p" : "담금질")) +
    "</div></section></div>" +
    (page ? "" : orderView(s) +
    section("모험 지역", go("world", "지도 보기 " + icon("chevron-right"), "textbtn")) +
    portals())
  );
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
function forestView(s, health) {
  const page = phonePage("forest");
  if (page === "field") return fieldView(s);
  const h = s.hunt,
    next = Math.min(60, (s.huntBest || 0) + 1);
  const hud = health ? combatHud(health.hp, health.maxHp, health.enemyHp, health.enemyMax, "이끼등 멧돼지") : "";
  const fight = h
    ? huntIntent(h) + '<div class="hunt-feedback">' + desc(h.last) + (h.rank >= 2 ? huntTools(h) : "") + "</div>" +
      (page ? "" : storyChat(s, "forest")) +
      '<div class="battle-controls">' + hud + (h.rank >= 2 ? huntChoices(h) : '<div class="actions">' +
        btn("strike", icon("sword") + (h.counter ? "반격 ×2.5" : "베기"), "", h.counter ? "primary grow counter-ready" : "primary grow") +
        btn("block", icon("shield") + "방어", "", Game.huntCharge(h.turn) ? "action guard-ready" : "action") +
        btn("flee", "퇴각", "", "mini") + "</div>") + "</div>"
    : huntResult(s.lastHunt, s.chests) + (page ? "" : storyChat(s, "forest")) +
      (s.chests?.some(c => c.id === s.lastHunt?.chestId) ? "" : desc(
        next === 1 ? "돌진을 방어하면 다음 베기가 2.5배 반격이 됩니다. 반격을 맞히고 이기면 골드가 25% 늘어납니다." :
          "기세 2칸을 모으면 강공을 쓸 수 있습니다. 적을 먼저 쓰러뜨리면 피해를 받지 않고, 돌진을 막고 반격하면 골드를 25% 더 받습니다.",
      )) +
      '<div class="battle-controls">' + hud + btn("huntStart", icon("swords") + next + "구역 사냥", next, "primary") + "</div>" +
      (s.huntBest ? btn("huntStart", "이전 구역 재도전", Math.min(s.huntBest, 60), "mini") : "");
  const task = Game.routeTask(s);
  const training =
    !h && s.weapon.route?.trait === "edge" && task?.open
      ? task.ready
        ? go(page ? "forge/training" : "forge", "수련 마감 · +" + task.target, "action")
        : task.needed <= next
          ? btn("huntStart", "전승 수련 · " + task.needed + "구역", task.needed, "action")
          : ""
      : "";
  return '<div class="stack">' + fight + training + "</div>" + (page ? "" : section("자동 사냥") + fieldView(s));
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
    (c.counter || c.extra ? desc("기본 " + fmt(c.base) + " G" + (c.counter ? " · 반격 +" + fmt(c.counter) + " G" : "") +
      (c.extra ? " · 상자 보너스 +" + fmt(c.extra) + " G" : "")) : "") +
    loot("sparkles", "별의 파편", c.shards) + loot("scroll-text", "10% 주문서", c.scrolls) +
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
    "</small>" +
    (chest ? chestButton(chest) : recovery) +
    "</div>"
  );
}
function huntIntent(h) {
  const charge = Game.huntCharge(h.turn);
  return '<div class="hunt-intent ' + (charge ? "charging" : "") + '">' +
    icon(charge ? "shield" : "sword") + '<b>' + (charge ? "돌진 예고 · 3배 피해" : "적의 일반 공격") +
    '</b><span>' + (h.counter ? "반격 가능 · " : "") + h.turn + "턴</span></div>";
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
      g.level >= 13
        ? row(
            Game.name(g) + " +" + g.level,
            fmt(Game.perMinute(g) / 6) + " G / 10초",
            btn("deploy", "배치", i, "mini"),
          )
        : "",
    )
    .filter(Boolean);
  const deployed = s.field.map((g, i) =>
    row(Game.name(g) + " +" + g.level, fmt(Game.perMinute(g) / 6) + " G / 10초", btn("recall", "회수", i, "mini")));
  return (
    metrics(
      gaugeMetric("사냥 무기", s.field.length, 2 + s.imprints.land, "mint"),
      metric("10초당 골드", brief(s.field.reduce((n, g) => n + Game.perMinute(g) / 6, 0))),
      metric("누적 수익", '<span id="yield">' + brief(s.unclaimed) + "</span>"),
    ) +
    btn("collect", "사냥 수익 수령", "", "primary") +
    desc("13강 이상 무기를 보관한 뒤 배치하면 게임을 닫아도 골드가 쌓입니다.") +
    phoneList([...deployed, ...candidates]) +
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
  const last = s.lastHunt?.health;
  const health = id === "forest" && (s.hunt || (last && last.number === s.huntNumber && last));
  return (
    '<div class="columns"><div class="stage-side">' +
    scene(
      id,
      health
        ? "이끼숲 · " + (s.hunt || s.lastHunt).rank + "구역"
        : id === "tower"
          ? Game.bosses[Math.min(19, Math.floor((f - 1) / 5))]
          : z[3],
      z[1],
      z[0],
      id === "forest" && s.hunt ? "boar" : id === "tower" ? creature(f) : "",
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
                openBtn("sell-" + k, s[k].level >= 1 ? "판매" : "판매 조건") +
                "</div>",
            ),
          )
          .join("") +
        "</div>";
    if (page === "gear") return shelf + equipment;
    const stored = card(
          "보관 무기 · " + s.bag.length + " / 20",
          phoneList(s.bag
            .map((g, i) =>
              row(
                Game.name(g) + " +" + g.level,
                [tier(g, "weapon"), craftSummary(g)].filter(Boolean).join(" · "),
                btn("equip", "장착", i, "mini") +
                  (g.level >= 13 ? btn("deploy", "배치", i, "mini") : ""),
                "", gearPortrait(g, "weapon"),
              ),
            ),
            desc("강화한 무기를 보관하면 이곳에서 다시 장착할 수 있습니다. +13부터는 사냥터에 배치할 수 있습니다.") +
              (page ? (Game.canStoreWeapon(s.weapon) ? go("bag", "장착 무기 보기", "action") :
                forgeLink) : "")),
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
                    "새벽의 인장 · 공격력 +" + r.power + "%",
                    r.tries + " / 10회 시도",
                    s.equippedRelic === i
                      ? btn("polish", "대표 · 강화", "", "mini")
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
      line("장착 무기", "+" + s.weapon.level + " / +20") + gauge(s.weapon.level, 20) + desc(
        "20강 무기와 장착 방어구를 초기화하고 등급에 따라 영혼 포인트를 받습니다. 보관 무기와 사냥터는 유지됩니다.",
      ) +
        (s.inheritedRecipe ? line("전승 제작법", recipeName(s.inheritedRecipe)) : "") +
        openBtn("rebirth", s.weapon.level === 20 ? "환생 의식 열기" : "환생 조건 보기", s.weapon.level === 20 ? "primary" : "action"),
      "flame",
    ),
    imprint: card("영혼 각인", phoneList(imprint, "", 1), "sparkles"),
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
  return page ? summary + cards[page] : summary + section("영구 성장") +
    '<div class="baggrid">' + Object.values(cards).join("") + "</div>" + orderView(s);
}
