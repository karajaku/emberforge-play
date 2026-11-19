"use strict";
function createHeirloomScreen(root, host) {
  const F = HeirloomForge,
    H = HeirloomHunt,
    app = root.querySelector("#app"),
    status = root.querySelector("#status");
  const slots = {
    journey: "첫 검부터",
    base: "30단계 · 기준 장비",
    blade: "30단계 · 검 투자",
    plate: "30단계 · 갑옷 투자",
  };
  const slot = host ? "journey" : new URLSearchParams(location.search).get("slot");
  const storage = host || HeirloomStore;
  const fmt = (n) => n.toLocaleString("ko-KR");
  const esc = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const icons = {
    forge: "hammer", bold: "flame", mend: "anvil", catchup: "chevrons-up", process: "anvil",
    promote: "crown", make: "hammer", rebirth: "refresh-cw", fuse: "sparkles", deliver: "hand-coins",
    toggle: "gem", daily: "gift", relief: "coins", start: "swords", stop: "shield", auto: "refresh-cw",
    retreat: "arrow-left", prepare: "shield", rename: "scroll-text",
  };
  const turnIcons = { strike: "sword", guard: "shield", counter: "swords", heavy: "hammer" };
  function glyph(name) {
    if (!ICONS[name]) return "";
    return `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }
  const button = (label, action, arg = "", style = "", off = false) =>
    `<button data-act="${action}" data-arg="${esc(arg)}" class="${style}" ${off ? "disabled" : ""}>${glyph(action === "turn" ? turnIcons[arg] : icons[action])}${label}</button>`;
  function gearSprite(g) {
    const asset = g.type === "armor" ? "cuirass" : "blade" + (g.grade || "");
    return `<span aria-hidden="true" class="gear-sprite ${g.scars ? "mended" : ""} ${g.broken ? "broken" : ""}" style="background-image:url(assets/${asset}-sheet.png)"></span>`;
  }
  const opts = (items, sel) =>
    items
      .map(([v, label]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(label)}</option>`)
      .join("");
  const choices = (labels, selected = 0) =>
    opts(
      labels.map((v, i) => [i, v]),
      selected,
    );
  const val = (id) => root.getElementById(id).value;
  const hero = (name, detail, brow = "", scene = "assets/forge.png") =>
    `<section class="hero" style="--scene:url(${scene})"><small>${brow}</small><h1>${name}</h1><p>${detail}</p></section>`;
  if (!Object.hasOwn(slots, slot)) {
    app.innerHTML =
      hero("한 자루의 여정", "처음 벼린 검과 갑옷을 +9,999까지 키우세요.", "잿불 대장간") +
      `<section class="panel"><h2>잔불의 첫날</h2><p>1,000 G와 사냥권 30장으로 시작합니다. 이 여정은 기존 대장간과 별도로 자동 저장됩니다.</p><a class="link primary" href="?slot=journey">첫 검부터 플레이</a></section><h2 style="margin-top:20px">황금엄니 토벌 · 30단계 체험</h2><p class="muted">같은 154만 G를 어디에 썼는지에 따라 사냥 결과가 달라집니다. 세 조건은 각각 저장됩니다.</p><div class="grid">` +
      [
        ["base", "검 +2,000 · 갑옷 +1,700", "154만 G를 직접 투자할 수 있습니다."],
        ["blade", "검 +2,075 · 갑옷 +1,700", "검에 153만 6천 G를 투자했습니다."],
        ["plate", "검 +2,000 · 갑옷 +1,871", "갑옷에 153만 5,580 G를 투자했습니다."],
      ]
        .map(
          ([k, n, d]) =>
            `<article class="panel"><h3>${slots[k]}</h3><b>${n}</b><small>${d}</small><a class="link" href="?slot=${k}">이 장비로 플레이</a></article>`,
        )
        .join("") +
      "</div>";
    return;
  }
  let s,
    tab = slot === "journey" ? "forge" : "hunt",
    rank = slot === "journey" ? 1 : 30,
    selectedGear = "weapon",
    rite = "make",
    busy = false,
    auto = "",
    timer,
    toastTimer;
  function message(m) {
    status.textContent = m;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      status.textContent = "";
    }, 4500);
  }
  function stop() {
    auto = "";
    clearTimeout(timer);
  }
  function stats() {
    const sm = F.smith(s.xp);
    const wallet = host ? "" : `<span><b>${fmt(s.gold)}</b> G</span><span>사냥권 <b>${s.free}</b></span>`;
    return `<div class="stats"><span>대장장이 <b>Lv.${sm.level}</b></span>${wallet}<span>사냥 재료 <b>${fmt(s.bundles)}</b></span></div>`;
  }
  function affordable(g) {
    const cap = F.smith(s.xp).cap;
    let lo = g.n,
      hi = Math.min(F.ceiling(g), g.n < 9998 ? 9998 : 9999);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (F.cost(g.type, g.n, mid, cap) <= s.gold) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  function card(key) {
    const g = s[key],
      cap = F.smith(s.xp).cap,
      ceiling = F.ceiling(g),
      max = affordable(g);
    const switcher = key === "spare" ? "" : `<div class="gear-switch" aria-label="작업 장비">${["weapon", "armor"].map(k => `<button aria-pressed="${key === k}" data-act="gear" data-arg="${k}">${glyph(k === "weapon" ? "sword" : "shield")}${k === "weapon" ? "검" : "갑옷"}</button>`).join("")}</div>`;
    const head = `<div class="stage bench" aria-label="대장간 작업대"><div class="nameplate"><small>${F.grades[g.grade]} ${g.type === "armor" ? "갑옷" : "검"}${g.broken ? " · 파괴" : g.damage ? " · 손상" : ""}</small><h2>${esc(g.name)} <b>+${fmt(g.n)}</b></h2></div>${switcher}<div class="bench-item">${gearSprite(g)}</div></div>`;
    let controls = "";
    if (g.broken || g.damage)
      controls = `<p class="dangerline">${g.broken ? "파괴 · 사냥 시 보조 장비 또는 대여 장비 사용" : "손상 · 장비 성능 감소"}</p>${button("복원 · " + fmt(F.step(g.type, g.n) * (g.broken ? 2 : 1)) + " G", "mend", key, "primary")}`;
    else if (g.work.length < 3 && g.n >= F.stages[g.work.length]) {
      const i = g.work.length;
      controls = `<h3>${F.processNames(g)[i]}</h3><div class="actions">${F.workNames(g)
        [i].map((o, j) => button(o, "process", key + ":" + j, "primary"))
        .join("")}</div>`;
    } else if (g.grade < 3 && g.n >= F.thresholds[g.grade]) {
      const need = [0, 5, 15][g.grade],
        type = g.type === "armor" ? F.armorTraits : F.bladeTraits;
      controls = `<p>${need ? `${need}단계 우두머리 승리 기록 ${s.best >= need ? "✓" : "필요"}` : "세 공정을 끝낸 장비입니다."}</p>${g.grade === 1 ? `<label>새길 특성<select id="trait-${key}">${choices(type)}</select></label>` : ""}${button(F.grades[g.grade + 1] + " 승급", "promote", key, "primary", s.best < need)}`;
    } else if (g.n < F.limit) {
      const end = Math.min(ceiling, g.n < 9998 ? 9998 : 9999),
        goal = Math.min(end, Math.max(g.n + 1, Math.min(max, Math.max(g.n + 10, cap))));
      controls = `<div class="target-line"><label>목표 강화<input type="number" inputmode="numeric" id="goal-${key}" data-goal="${key}" min="${g.n + 1}" max="${end}" value="${goal}"></label>
      <div class="actions">${button("+1", "target", key + ":one")}${button("최대 +" + fmt(max), "target", key + ":max", "", max <= g.n)}</div></div>
      <div class="strike-actions"><b id="fee-${key}"></b><div class="actions">${button(g.n === 9998 ? "마지막 망치질" : g.n === 19 && g.grade === 0 ? F.workNames(g)[2][g.work[2]] + " 돌파" : "안전 재련", "forge", key, "primary")}${g.n < 9998 ? button("위험 제련", "bold", key, "risk") : ""}</div></div>
      <details><summary>성공 ${80 - F.risk(s, g)}% · 손상 20% · 파괴 ${F.risk(s, g)}%</summary><small>위험 제련 숙련 ${s.mastery[F.band(g)]}/5${s.protection ? " · 파괴 완화 준비됨" : ""}</small></details>`;
    } else controls = "<strong>마지막 망치질을 마쳤습니다.</strong>";
    if (!g.broken && !g.damage && cap > g.n && cap > ceiling)
      controls += button(
        "숙련 재련 +" + fmt(cap) + " · " + fmt(F.step(g.type, cap)) + " G",
        "catchup",
        key,
        "",
        s.gold < F.step(g.type, cap),
      );
    if (g.grade === 1 && g.n >= 200 && g.work.length === 3) {
      controls +=
        g.type === "armor"
          ? "<small>충격 분산은 강공 방어, 겹댄 안감은 연속 피격, 숨 고르기는 다음 조우 전 회복에 유리합니다.</small>"
          : "<small>받아치는 칼날은 반격, 마무리 날은 빈사 적, 끈질긴 검등은 내 체력이 낮을 때, 기세를 품은 홈은 강공에 유리합니다.</small>";
    }
    const trait = g.grade >= 2 ? (g.type === "armor" ? F.armorTraits : F.bladeTraits)[g.trait] : "";
    return `<article class="equipment">${head}<div class="panel controls"><div class="pills">${trait ? "<span>" + trait + "</span>" : ""}${g.scars ? "<span>은빛 이음선 ×" + g.scars + "</span>" : ""}</div>${controls}<details><summary>이름과 기록 · 이음선 ${g.scars}</summary><label>장비 이름<input id="name-${key}" maxlength="16" value="${esc(g.name)}"></label>${button("이름 새기기", "rename", key)}<ul>${g.history.map((h) => "<li>" + esc(h) + "</li>").join("")}</ul></details></div></article>`;
  }
  function workshop() {
    const sm = F.smith(s.xp);
    return `${card(selectedGear)}<details class="panel smith"><summary>${glyph("anvil")} 대장장이 Lv.${sm.level} · 즉시 제작 +${fmt(sm.cap)}</summary><p>경험치 ${fmt(s.xp)}${sm.level < 70 ? " / " + fmt(F.xpAt(sm.level + 1)) : ""} · 사냥 재료는 다음 성공 공정에서 묶음당 10 XP가 됩니다.</p>${s.active.includes(1) ? button("호흡 단조 준비 · 재료 1", "prepare", "", "", s.protection) : ""}</details>`;
  }
  function rites() {
    const sm = F.smith(s.xp),
      g = s.spare,
      i = s.arts.length;
    const list = (available, names, chosen, kind) =>
      available
        .map((n) =>
          button(
            (chosen.includes(n) ? "✓ " : "") + names[n],
            "toggle",
            kind + ":" + n,
            chosen.includes(n) ? "current" : "",
          ),
        )
        .join("");
    const artGuide =
      "<details><summary>보조 검에서 이어지는 기술</summary><ul><li>받아치는 칼날 → 돌진 받아치기 · 방어로 돌진 피해를 끊습니다.</li><li>마무리 날 → 몰아베기 · 강공이나 반격으로 처치하면 다음 조우 첫 타격이 강해집니다.</li><li>끈질긴 검등 → 버티는 검등 · 직전 행동이 방어였다면 조우당 한 번 체력 1로 버팁니다.</li><li>기세를 품은 홈 → 되받는 칼끝 · 반격 기회를 한 턴 보관하거나 강공에 싣습니다.</li></ul></details>";
    const stations = [["make", "anvil", "제작"], ["rebirth", "refresh-cw", "환생"], ["marks", "gem", "각인"], ["fuse", "sparkles", "초월"]];
    if (host) stations.push(["guild", "landmark", "길드"]);
    const altar = `<div class="stage altar"><div class="nameplate"><h2>전승의 화로</h2></div><div class="offering">${gearSprite(s.weapon)}<span>${esc(s.weapon.name)}</span></div><div class="offering secondary">${g ? gearSprite(g) : glyph("anvil")}<span>${g ? esc(g.name) : "빈 제물 자리"}</span></div></div>`;
    const stationsBar = `<nav class="stations" style="--count:${stations.length}" aria-label="전승 작업">${stations.map(([k,ic,n]) => `<button aria-pressed="${rite === k}" data-act="rite" data-arg="${k}">${glyph(ic)}${n}</button>`).join("")}</nav>`;
    let content;
    if (rite === "make") {
      content = g ? card("spare") + button("납품 · " + fmt(Math.floor(g.invested * 0.7)) + " G", "deliver") :
        `<section class="panel"><h3>보조 장비 제작</h3><label>종류<select id="kind"><option value="weapon">검</option><option value="armor">갑옷</option></select></label><label>시작 단계 · 최대 +${sm.cap}<input id="newlevel" type="number" min="0" max="${sm.cap}" value="${Math.min(sm.cap, s.weapon.n)}"></label><span id="newfee"></span>${button("보조 장비 제작", "make", "", "primary")}</section>`;
    } else if (rite === "rebirth") {
      content = `<section class="panel"><h3>환생</h3><p>대표 검 +200과 레어 보조 장비가 필요합니다. 보조 장비를 바치면 제작법과 각인이 남습니다.</p>${g ? `<label>전승할 공정<select id="recipe">${opts(g.work.map((c,j) => [j, F.workNames(g)[j][c]]), 0)}</select></label><label>배울 각인<select id="imprint">${choices(F.imprints)}</select></label>${button("환생 · " + fmt(25000 * (1 + s.recipes.length)) + " G", "rebirth", "", "primary", g.grade < 1 || s.weapon.n < 200)}` : button("보조 장비 제작으로", "rite", "make")}</section>`;
    } else if (rite === "marks") {
      content = `<section class="panel"><h3>대장장이 각인</h3><div class="actions">${list(s.known, F.imprints, s.active, "mark") || "첫 환생에서 각인을 배웁니다."}</div><details><summary>각인 효과와 전승 제작법</summary><p>사냥꾼의 몫 · 승리 골드 +8% / 호흡 단조 · 파괴 1회 완화 / 쌍타 · 위험 성공 추가 강화 / 전승 수련 · 신규 공정 XP +25%</p><small>${esc(s.recipes.join(" / "))}</small></details></section>`;
    } else {
      content = `<section class="panel"><h3>초월 · ${i}/4</h3>${i < 4 ? `<p>대표 전설 검 +${fmt(F.fusionLevels[i])}, 새로운 특성의 보조 전설 검 +1,000 이상 · 영혼 5 · 제련석 ${i + 1}</p><small>${i ? "성공 80% · 전체 시도의 5%에서 보조 검 소실" : "첫 시도 확정 성공"} · 성공하면 보조 검의 무늬가 남습니다. 제련석은 매 5단계 우두머리 첫 토벌 보상입니다.</small>${button("초월 · " + fmt(F.fusionFees[i]) + " G", "fuse", "", "primary", !g || g.grade < 3)}` : ""}${artGuide}<div class="actions">${list(s.arts, F.arts, s.equipped, "art")}</div></section>`;
    }
    return `${altar}${stationsBar}<div class="stats"><span>영혼 <b>${s.souls}</b></span><span>제련석 <b>${s.stones}</b></span><span>제작법 <b>${s.recipes.length}</b></span></div><div class="stack">${content}</div>`;
  }
  function forest() {
    const h = s.hunt;
    const zone = H.area(h ? h.rank : rank),
      region = HuntTrail.region(zone.rank);
    const rec = s.records.filter((r) => r.rank === zone.rank).slice(0, 20);
    const history = `<section class="panel"><h3>최근 ${rec.length}회 · ${zone.rank}단계</h3><p>${rec.length ? `${rec.filter((r) => r.won).length}승 · 권당 ${fmt(Math.round(rec.reduce((a, r) => a + r.gold, 0) / rec.length))} G · 승리 평균 ${((rec.filter((r) => r.won).reduce((a, r) => a + r.turns, 0) * 2) / (rec.filter((r) => r.won).length || 1)).toFixed(1)}초 (자동 기준)` : "아직 토벌 기록이 없습니다."}</p></section>`;
    const enemy = HuntTrail.enemy(zone.rank, h ? h.pack[h.wave] : HuntTrail.lineup(zone.rank)[0]);
    const moving = motionAllowed();
    const foe = ["boar","golem","dragon"].includes(enemy.sprite)
      ? `<span class="enemy-sheet" style="background-image:url(assets/${enemy.sprite}-sheet.png)"></span>`
      : `<img alt="" src="assets/hunt/${enemy.sprite === "moth" && moving ? "moth-wingbeat" : enemy.sprite}.webp">`;
    const equipped = H.kit(s, "weapon");
    const bar = (label, hp, max) => `<div class="life"><strong>${esc(label)}</strong><meter aria-label="${esc(label)} 체력" max="${max}" value="${hp}"></meter><small>${Math.ceil(hp)} / ${Math.ceil(max)}</small></div>`;
    const arena = `<div class="stage clearing" style="--scene:url(assets/hunt/${region.id}.webp)"><div class="nameplate"><small>${zone.rank}단계${h ? " · 조우 " + (h.wave + 1) + "/" + h.pack.length : ""}</small><h2>${zone.name}</h2></div>
      <div class="duel-side player">${h ? bar(equipped.name || "대여 검", h.hp, h.maxHp) : ""}<div class="actor">${gearSprite(equipped)}</div></div>
      <div class="duel-side opponent ${enemy.sprite === "moth" ? "airborne" : ""}">${h ? bar(enemy.name, h.enemyHp, h.enemyMax) : `<strong class="foe-name">${enemy.name}</strong>`}<div class="actor">${foe}</div></div>
      ${h && H.warning(h) ? `<strong class="warning">${glyph("shield")} 강공 예고</strong>` : ""}</div>`;
    let content;
    if (h) {
      content = `<p class="battle-line"><b>${h.turns}턴</b> ${esc(h.log)}</p>
      <div class="combat-actions">${["strike", "guard", "counter", "heavy"].map((k, j) => button(["공격", "방어", "반격", "강공"][j], "turn", k, "", k === "counter" && !h.riposte)).join("")}</div>
      <div class="actions">${auto ? button("자동 중지", "stop") : button("자동 진행", "auto", "once", "primary")}${button("퇴각", "retreat")}</div>`;
    } else {
      const upper = Math.min(60, s.best + 1);
      content = `<label>사냥터<select id="rank">${opts(
        Array.from({ length: upper }, (_, j) => [j + 1, j + 1 + "단계 · " + H.area(j + 1).name]),
        rank,
      )}</select></label><p>권장 검 +${fmt(zone.w)} · 갑옷 +${fmt(zone.a)} · 승리 ${fmt(zone.prize)} G</p><small>사냥권 1장 · 자동 행동 2초 간격 · 패배 0 G</small>
      <div class="actions">${auto === "repeat" ? button("반복 중지", "stop") : button("직접 사냥", "start", "manual") + button("자동 1회", "start", "once", "primary") + button("이 단계 반복", "start", "repeat")}</div>
      ${!auto && rank < upper ? button("다음 미완료 " + upper + "단계 도전", "start", "next") : ""}`;
    }
    return `<div class="stack"><section class="equipment">${arena}<div class="panel controls">${content}</div></section>${history}${!h ? `<section class="panel"><h3>여정 보급</h3><p>무료 사냥권은 10분에 1장, 최대 30장까지 충전됩니다.</p><div class="actions">${button("오늘의 보급 · 사냥권 +10", "daily")}${s.gold < 150 && !s.bundles ? button("공방 일손 돕기 · 150 G", "relief") : ""}</div></section>` : ""}</div>`;
  }
  function prices() {
    for (const inp of app.querySelectorAll("[data-goal]")) {
      const key = inp.dataset.goal,
        g = s[key],
        n = Number(inp.value),
        fee = F.cost(g.type, g.n, n, F.smith(s.xp).cap);
      const valid = Number.isInteger(n) && n >= Number(inp.min) && n <= Number(inp.max);
      root.querySelector("#fee-" + key).textContent = valid
        ? `재련비 ${fmt(fee)} G`
        : "목표 범위를 확인하세요.";
      for (const b of app.querySelectorAll(
        `[data-act="forge"][data-arg="${key}"],[data-act="bold"][data-arg="${key}"]`,
      ))
        b.disabled = !valid || fee > s.gold || (b.dataset.act === "bold" && n >= 9999);
    }
    if (root.querySelector("#newfee"))
      root.querySelector("#newfee").textContent =
        "제작비 " + fmt(F.step(val("kind"), Number(val("newlevel")))) + " G";
  }
  function render() {
    const tabs = [["forge", "anvil", "대장간"], ["hunt", "trees", "숲 사냥"], ["rites", "flame", "전승 화로"], ["log", "scroll-text", "장비 일지"]];
    app.innerHTML = `<nav class="tabs" aria-label="장비 여정">${tabs.map(([k, ic, label]) => `<button data-act="tab" data-arg="${k}" aria-current="${k === tab}" ${s.hunt && k !== "hunt" ? "disabled" : ""}>${glyph(ic)}${label}</button>`).join("")}</nav>` +
      (tab === "forge"
        ? workshop()
        : tab === "rites"
          ? rites()
          : tab === "hunt"
            ? forest()
            : `<section class="panel"><h2>${glyph("scroll-text")} 장비 일지</h2><ul>${s.journal.map((t) => "<li>" + esc(t) + "</li>").join("") || "<li>첫 여정이 시작되었습니다.</li>"}</ul></section>`);
    app.insertAdjacentHTML("beforeend", stats());
    prices();
  }
  function motionAllowed() {
    return host ? host.motionEnabled() : !matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function showImpact(action, before, key) {
    const stage = app.querySelector(turnIcons[action] ? ".clearing" : ".bench");
    if (!stage) return;
    if (motionAllowed()) stage.dataset.effect = action;
    const tag = (parent, label) => {
      const badge = document.createElement("strong");
      badge.className = "impact";
      badge.textContent = label;
      parent.append(badge);
    };
    if (turnIcons[action] && before.hunt) {
      const h = s.hunt;
      if (!h) {
        const result = s.records[0];
        tag(stage, result.won ? "승리 · +" + fmt(result.gold) + " G" : "패배");
      } else if (h.wave !== before.hunt.wave) {
        tag(stage, "다음 조우 · " + HuntTrail.enemy(h.rank, h.pack[h.wave]).name);
      } else {
        for (const [side, stat] of [["player","hp"], ["opponent","enemyHp"]]) {
          const loss = Math.ceil(before.hunt[stat]) - Math.ceil(h[stat]);
          if (loss > 0) tag(stage.querySelector("." + side), "−" + fmt(loss));
        }
      }
    } else if (["forge", "bold", "mend", "promote", "catchup", "process"].includes(action)) {
      const g = s[key];
      const label = g.broken ? "파괴" : g.damage ? "손상" : action === "mend" ? "복원" :
        action === "promote" ? F.grades[g.grade] + " 승급" : action === "process" ? "공정 완료" :
        "+" + fmt(before[key].n) + " → +" + fmt(g.n);
      tag(stage, label);
    }
  }
  async function mutate(fn, quiet = false) {
    if (busy) return false;
    busy = true;
    try {
      let result;
      s = await storage.update(slot, s.revision, (x) => {
        H.recharge(x, Date.now());
        result = fn(x);
      });
      render();
      if (!quiet && result) message(result);
      return true;
    } catch (e) {
      stop();
      message(e.message);
      try {
        s = await storage.update(slot, null);
        if (s.hunt) tab = "hunt";
        render();
      } catch {
        app.textContent = "저장소를 열 수 없습니다. 새로 고쳐 다시 시도하세요.";
      }
      return false;
    } finally {
      busy = false;
    }
  }
  function seed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  function schedule() {
    clearTimeout(timer);
    if (!auto || document.hidden) return;
    timer = setTimeout(async () => {
      if (!auto || document.hidden) return;
      if (s.hunt) {
        const before = s;
        const action = H.policy(s.hunt);
        if (await mutate((x) => H.turn(x, action), true)) showImpact(action, before);
      } else if (auto === "repeat" && s.free) {
        await mutate((x) => H.start(x, rank, seed()), true);
      } else {
        stop();
        render();
        return;
      }
      if (!s.hunt) {
        message(s.journal[0]);
        if (auto !== "repeat" || !s.free) {
          stop();
          render();
          return;
        }
      }
      schedule();
    }, H.turnMs);
  }
  app.addEventListener("input", prices);
  app.addEventListener("change", (e) => {
    if (e.target.id === "rank") {
      stop();
      rank = Number(val("rank"));
      render();
    } else prices();
  });
  app.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || busy) return;
    const action = b.dataset.act,
      arg = b.dataset.arg,
      [key, idx] = arg.split(":");
    if (action === "gear" || action === "rite") {
      if (action === "gear") selectedGear = arg;
      else if (host) return host.navigateRite(arg);
      else rite = arg;
      render();
      return;
    }
    if (action === "tab") {
      stop();
      if (host) return host.navigate(arg);
      tab = arg;
      render();
      return;
    }
    if (action === "stop") {
      stop();
      render();
      return;
    }
    if (action === "target") {
      root.querySelector("#goal-" + key).value = idx === "one" ? s[key].n + 1 : affordable(s[key]);
      prices();
      return;
    }
    if (action === "auto") {
      auto = arg;
      render();
      schedule();
      return;
    }
    if (action === "start") {
      stop();
      if (arg === "next") rank = Math.min(60, s.best + 1);
      if (await mutate((x) => H.start(x, rank, seed()))) {
        auto = arg === "manual" ? "" : arg;
        render();
        schedule();
      }
      return;
    }
    if (action === "daily" && host) return host.claim();
    if (action === "turn" || action === "retreat") stop();
    const actions = {
      forge: (x) => F.forge(x, key, Number(val("goal-" + key)), false),
      bold: (x) => F.forge(x, key, Number(val("goal-" + key)), true),
      process: (x) => F.process(x, key, Number(idx)),
      promote: (x) => F.promote(x, key, Number(root.querySelector("#trait-" + key)?.value || 0)),
      catchup: (x) => F.forge(x, key, F.smith(x.xp).cap, false),
      mend: (x) => F.mend(x, key),
      make: (x) => F.make(x, val("kind"), Number(val("newlevel"))),
      deliver: F.deliver,
      rebirth: (x) => F.rebirth(x, Number(val("recipe")), Number(val("imprint"))),
      fuse: (x) => F.fuse(x),
      toggle: (x) => F.toggle(x, key, Number(idx)),
      prepare: F.prepare,
      turn: (x) => H.turn(x, arg),
      retreat: (x) => H.retreat(x),
      rename: (x) => {
        const name = val("name-" + key).trim();
        F.check(name.length > 0 && name.length <= 16, "1~16자 이름을 입력하세요.");
        x[key].name = name;
        return F.note(x, name + " 이름 새김");
      },
      daily: (x) => {
        const day = new Date().toLocaleDateString("sv-SE");
        F.check(x.attendance !== day, "오늘 보급은 이미 받았습니다.");
        x.attendance = day;
        x.free += 10;
        return F.note(x, "출석 · 사냥권 +10");
      },
      relief: (x) => {
        F.check(x.gold < 150 && !x.bundles, "공방 지원 조건을 확인하세요.");
        x.gold += 150;
        return F.note(x, "공방 품삯 +150 G");
      },
    };
    const before = s;
    if (actions[action] && await mutate(actions[action])) showImpact(action === "turn" ? arg : action, before, key);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (s) {
      render();
    }
  });
  if (host)
    return {
      show(nextTab, view, station) {
        if (nextTab === "rites") rite = station;
        if (!s) rank = view.records[0]?.rank || Math.min(60, view.best + 1);
        if (tab !== nextTab) stop();
        tab = nextTab;
        s = view;
        if (s.hunt) rank = s.hunt.rank;
        render();
      },
      stop,
    };
  (async () => {
    try {
      s = await storage.update(slot, null);
      H.recharge(s, Date.now());
      if (s.hunt) {
        tab = "hunt";
        rank = s.hunt.rank;
      }
      render();
    } catch (e) {
      app.textContent = "여정을 열 수 없습니다. " + e.message;
    }
  })();
}
if (document.querySelector("#app")) createHeirloomScreen(document, null);
