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
  const button = (label, action, arg = "", style = "", off = false) =>
    `<button data-act="${action}" data-arg="${esc(arg)}" class="${style}" ${off ? "disabled" : ""}>${label}</button>`;
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
    const head = `<div class="gearhead"><span class="fighter ${g.scars ? "mended" : ""}" style="background-image:url(assets/${g.type === "armor" ? "cuirass" : g.grade ? "blade" + g.grade : "blade"}-sheet.png)"></span><div><small>${F.grades[g.grade]} ${g.type === "armor" ? "갑옷" : "검"}</small><h2>${esc(g.name)} <b>+${fmt(g.n)}</b></h2></div></div>`;
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
      controls = `<label>목표 강화 수치<input type="number" inputmode="numeric" id="goal-${key}" data-goal="${key}" min="${g.n + 1}" max="${end}" value="${goal}"></label>
      <div class="actions">${button("+1", "target", key + ":one")}${button("보유 골드 최대 +" + fmt(max), "target", key + ":max", "", max <= g.n)}</div>
      <span id="fee-${key}"></span><div class="actions">${button(g.n === 9998 ? "마지막 망치질" : g.n === 19 && g.grade === 0 ? F.workNames(g)[2][g.work[2]] + " 돌파" : "안전 재련", "forge", key, "primary")}${g.n < 9998 ? button("위험 제련", "bold", key, "risk") : ""}</div>
      <small>위험 제련 · 성공 ${80 - F.risk(s, g)}% · 손상 20% · 파괴 ${F.risk(s, g)}% · 숙련 ${s.mastery[F.band(g)]}/5${s.protection ? " · 파괴 완화 준비됨" : ""}</small>`;
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
    return `<article class="panel">${head}<div class="pills">${trait ? "<span>" + trait + "</span>" : ""}${g.scars ? "<span>은빛 이음선 ×" + g.scars + "</span>" : ""}</div>${controls}<details><summary>이름과 기록 · 이음선 ${g.scars}</summary><label>장비 이름<input id="name-${key}" maxlength="16" value="${esc(g.name)}"></label>${button("이름 새기기", "rename", key)}<ul>${g.history.map((h) => "<li>" + esc(h) + "</li>").join("")}</ul></details></article>`;
  }
  function workshop() {
    const sm = F.smith(s.xp);
    return `<div class="grid">${card("weapon")}${card("armor")}</div><section class="panel"><h3>대장장이 Lv.${sm.level} · 즉시 제작 +${fmt(sm.cap)}</h3><p>경험치 ${fmt(s.xp)}${sm.level < 70 ? " / " + fmt(F.xpAt(sm.level + 1)) : ""} · 사냥 재료는 다음 성공 공정에서 묶음당 10 XP가 됩니다.</p>${s.active.includes(1) ? button("호흡 단조 준비 · 재료 1", "prepare", "", "", s.protection) : ""}</section>`;
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
    return `<div class="stack"><section class="panel"><h2>보조 장비 공방</h2><p>영혼 ${s.souls} · 제련석 ${s.stones} · 전승 제작법 ${s.recipes.length}개</p>${g ? "" : `<label>종류<select id="kind"><option value="weapon">검</option><option value="armor">갑옷</option></select></label><label>시작 단계 · 최대 +${sm.cap}<input id="newlevel" type="number" min="0" max="${sm.cap}" value="${Math.min(sm.cap, s.weapon.n)}"></label><span id="newfee"></span>${button("보조 장비 제작", "make", "", "primary")}`}</section>${g ? card("spare") : ""}
      ${
        g
          ? `<section class="panel"><h3>납품과 환생</h3>${button("납품 · " + fmt(Math.floor(g.invested * 0.7)) + " G", "deliver")}<p>잔불 +200과 레어 보조 장비가 필요합니다. 선택한 제작법을 남기고 보조 장비를 화로에 바칩니다.</p><label>전승할 공정<select id="recipe">${opts(
              g.work.map((c, j) => [j, F.workNames(g)[j][c]]),
              0,
            )}</select></label><label>배울 각인<select id="imprint">${choices(F.imprints)}</select></label>${button("환생 · " + fmt(25000 * (1 + s.recipes.length)) + " G", "rebirth", "", "", g.grade < 1 || s.weapon.n < 200)}</section>`
          : ""
      }
      <section class="panel"><h3>대장장이 각인</h3><p>사냥꾼의 몫 · 승리 골드 +8% / 호흡 단조 · 파괴 1회 완화 / 쌍타 · 위험 성공 추가 강화 / 전승 수련 · 신규 공정 XP +25%</p><div class="actions">${list(s.known, F.imprints, s.active, "mark") || "첫 환생에서 각인을 배웁니다."}</div><small>${esc(s.recipes.join(" / "))}</small></section>
      <section class="panel"><h3>초월 · ${i}/4</h3>${artGuide}${i < 4 ? `<p>대표 전설 검 +${fmt(F.fusionLevels[i])}, 새로운 특성의 보조 전설 검 +1,000 이상 · 영혼 5 · 제련석 ${i + 1}. 제련석은 각 5단계 우두머리 첫 토벌로 획득합니다.</p><small>${i ? "성공 80% · 전체 시도의 5%에서 보조 검 소실" : "첫 시도 확정 성공"} · 성공하면 보조 검의 무늬가 잔불에 남습니다.</small>${button("초월 · " + fmt(F.fusionFees[i]) + " G", "fuse", "", "primary", !g || g.grade < 3)}` : ""}<div class="actions">${list(s.arts, F.arts, s.equipped, "art")}</div></section></div>`;
  }
  function forest() {
    const h = s.hunt;
    const zone = H.area(h ? h.rank : rank),
      region = HuntTrail.region(zone.rank);
    const rec = s.records.filter((r) => r.rank === zone.rank).slice(0, 20);
    const history = `<section class="panel"><h3>최근 ${rec.length}회 · ${zone.rank}단계</h3><p>${rec.length ? `${rec.filter((r) => r.won).length}승 · 권당 ${fmt(Math.round(rec.reduce((a, r) => a + r.gold, 0) / rec.length))} G · 승리 평균 ${((rec.filter((r) => r.won).reduce((a, r) => a + r.turns, 0) * 2) / (rec.filter((r) => r.won).length || 1)).toFixed(1)}초 (자동 기준)` : "아직 토벌 기록이 없습니다."}</p></section>`;
    let content;
    if (h) {
      const e = HuntTrail.enemy(h.rank, h.pack[h.wave]),
        img = ["boar", "golem", "dragon"].includes(e.sprite)
          ? `<span class="fighter" style="background-image:url(assets/${e.sprite}-sheet.png)"></span>`
          : `<img class="enemy" alt="" src="assets/hunt/${e.sprite}.webp">`;
      content = `<div class="gearhead">${img}<div><small>${h.wave + 1}/${h.pack.length}번째 조우 · ${h.turns}턴</small><h2>${e.name}</h2></div></div>
      <div class="hp">적 체력<meter max="${h.enemyMax}" value="${h.enemyHp}"></meter>${Math.ceil(h.enemyHp)}</div><div class="hp">내 체력<meter max="${h.maxHp}" value="${h.hp}"></meter>${Math.ceil(h.hp)} / ${h.maxHp}</div>
      <p class="dangerline">${H.warning(h) ? "강한 공격 예고 · 방어 후 반격 기회" : "틈이 보입니다."}</p><p>${esc(h.log)}</p>
      <div class="actions">${["strike", "guard", "counter", "heavy"].map((k, j) => button(["공격", "방어", "반격", "강공"][j], "turn", k, "", k === "counter" && !h.riposte)).join("")}</div>
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
    return `<div class="stack"><section class="panel arena" style="--arena:url(assets/hunt/${region.id}.webp)">${content}</section>${history}${!h ? `<section class="panel"><h3>여정 보급</h3><p>무료 사냥권은 10분에 1장, 최대 30장까지 충전됩니다.</p><div class="actions">${button("오늘의 보급 · 사냥권 +10", "daily")}${s.gold < 150 && !s.bundles ? button("공방 일손 돕기 · 150 G", "relief") : ""}</div></section>` : ""}</div>`;
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
    const titles = {
      forge: ["대장간", "잔불과 갑옷을 벼리고 공정의 흔적을 남기세요."],
      hunt: [
        "숲 사냥",
        s.hunt ? "진행 중인 사냥은 자동 저장됩니다." : "사냥권 한 장으로 선택한 구역을 토벌합니다.",
      ],
      rites: ["전승의 화로", "보조 장비의 제작법과 무늬를 남기세요."],
      log: ["장비 일지", "최근 공방 작업과 토벌 결과입니다."],
    };
    const scene =
      tab === "hunt"
        ? "assets/hunt/" + HuntTrail.region(s.hunt?.rank || rank).id + ".webp"
        : tab === "rites"
          ? "assets/altar.png"
          : "assets/forge.png";
    app.innerHTML =
      hero(titles[tab][0], titles[tab][1], host ? "잿불 대장간" : slots[slot], scene) +
      stats() +
      `<nav class="tabs">${Object.entries(titles)
        .map(
          ([k, v]) =>
            `<button data-act="tab" data-arg="${k}" aria-current="${k === tab}" ${s.hunt && k !== "hunt" ? "disabled" : ""}>${v[0]}</button>`,
        )
        .join("")}</nav>` +
      (tab === "forge"
        ? workshop()
        : tab === "rites"
          ? rites()
          : tab === "hunt"
            ? forest()
            : `<section class="panel"><ul>${s.journal.map((t) => "<li>" + esc(t) + "</li>").join("") || "<li>첫 여정이 시작되었습니다.</li>"}</ul></section>`);
    prices();
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
        await mutate((x) => H.turn(x, H.policy(x.hunt)), true);
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
    if (actions[action]) await mutate(actions[action]);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (s) {
      render();
    }
  });
  if (host)
    return {
      show(nextTab, view) {
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
