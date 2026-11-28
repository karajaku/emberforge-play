"use strict";
const EmberScene = (() => {
  let host = null,
    active = false,
    currentKey = "",
    selectedId = "",
    selectedN = 0,
    detail = "",
    receipt = null,
    timing = null,
    timingFrame = 0,
    sending = false,
    marks = [],
    homeN = 0,
    windowBlurred = false;
  const related = (key) => /^(blade(?:Armor)?(?:Work|Final|Lining)|soul:|craft$|final$)/.test(key);
  function isRoute(key) {
    return key.startsWith("affix:") || (active && related(key));
  }
  function route(s, key) {
    if (/^inventory-affix-\d+$/.test(key)) return "affix:list|" + Number(key.split("-").at(-1));
    if (key === "bladeCraft" || key === "bladeArmorCraft")
      return (
        "affix:item:" + (key === "bladeArmorCraft" ? Game.blades.currentArmor(s).id : Game.blades.current(s).id)
      );
    return key;
  }
  function ensure() {
    if (host) return host;
    host = document.createElement("section");
    host.id = "emberStage";
    host.hidden = true;
    host.setAttribute("role", "region");

    host.setAttribute("aria-label", "불씨 세공 작업장");
    document.body.append(host);
    return host;
  }
  function equipment(item, idle = false) {
    if (idle && (!item.kind || ["weapon", "armor"].includes(item.kind)))
      return (
        '<canvas width="128" height="144" data-sprite="' +
        BladeView.sprite(item.kind === "armor" ? { ...item, type: "armor" } : item) +
        '" aria-label="선택한 장비"></canvas>'
      );

    return item.kind && !["weapon", "armor"].includes(item.kind)
      ? OutfitView.art(item.kind)
      : BladeView.artwork(item);
  }
  function button(attr, label, cls = "") {
    return '<button type="button" class="ember-game-button ' + cls + '" ' + attr + ">" + label + "</button>";
  }
  function action(name, arg, label, disabled = false, cls = "ember-main-action") {
    return button(
      'data-affix-act="' +
        name +
        '" data-affix-arg="' +
        escapeHtml(JSON.stringify(arg)) +
        '"' +
        (disabled ? " disabled" : ""),
      label,
      cls,
    );
  }
  function parse(s, key) {
    const choosing = key.startsWith("affix:list"),
      growth = key.startsWith("affix:growth:"),
      result = key === "affix:result";
    if (currentKey !== key) {
      detail = "";
      if (choosing) selectedN = Number(key.split("|")[1]) || 0;
      else if (growth) {
        selectedId = key.slice("affix:growth:".length);
        detail = "growth";
      } else if (key.startsWith("affix:item:")) {
        const raw = key.slice(11),
          split = raw.lastIndexOf("|");
        selectedId = split < 0 ? raw : raw.slice(0, split);
        selectedN = split < 0 ? 0 : Number(raw.slice(split + 1));
      } else if (result && receipt) {
        selectedId = receipt.id;
        selectedN = receipt.n;
      } else if (related(key)) detail = "legacy";
      currentKey = key;
    }
    const all = Game.affixList(s);
    if (choosing && !all.some((x) => x.id === selectedId))
      selectedId = all.find((x) => x.id === ForgeItemView.shown?.id)?.id || all[0]?.id || "";
    return { choosing, growth, result, all, entry: all.find((x) => x.id === selectedId) };
  }
  function process(s, item, id) {
    if (id.startsWith("j:")) {
      if (id !== "j:" + s.weapon.recordId)
        return (
          desc("선택한 보관 검을 먼저 착용해야 이 검의 공정을 진행할 수 있습니다.") +
          action("affixEquip", { id, token: Game.affixQuote(s, id, 1).token }, "선택한 검 착용")
        );
      return craftEntry(s) || desc("현재 기록 검의 제작 공정을 모두 마쳤습니다.");
    }
    if (item.kind && !["weapon", "armor"].includes(item.kind))
      return (
        desc("이 부위에는 검 제작 공정이 없습니다.") +
        button('data-forge-item="' + escapeHtml(id) + '"', "이 장비 대장간에서 재련")
      );
    const armor = item.type === "armor",
      worn = armor ? Game.blades.currentArmor(s).id === id : Game.blades.current(s).id === id;
    if (!worn)
      return (
        desc("선택한 장비를 먼저 착용해야 이 장비의 공정을 진행할 수 있습니다.") +
        (armor
          ? btn("bladeArmorEquip", "선택한 흉갑 착용", id, "action")
          : action("affixEquip", { id, token: Game.affixQuote(s, id, 1).token }, "선택한 검 착용"))
      );
    return (
      (armor ? openBtn("bladeArmorLining", "숲 방호 안감") : "") +
        BladeView.processes(s, item) +
        BladeView.soulActions(s, item) || desc("진행할 공정이 없습니다.")
    );
  }
  function detailBody(s, entry, key) {
    const item = entry?.item || (key === "affix:result" ? receipt?.item || receipt?.before : null);
    if (detail === "legacy") {
      if (key.startsWith("soul:")) return SoulView.modal(s, key)[1];
      if (key === "craft") return craftWorkshop(s);
      if (key === "final") return finalWorkshop(s);
      return BladeView.modal(s, key)[1];
    }
    if (!item) return desc("선택한 장비가 없습니다.");
    if (detail === "process") return "<h2>기존 공정·영혼 제작</h2>" + process(s, item, selectedId);
    if (detail === "growth") {
      const g = Game.weaponGrowth(s, selectedId);
      if (!g) return desc("이 부위는 대장간의 기존 재련을 따릅니다.");
      const token = Game.affixQuote(s, selectedId, 1).token;
      return (
        "<h2>같은 검 재련·승급</h2>" +
        line("대상", escapeHtml(entry.label)) +
        line("재련 단계", "+" + fmt(g.level)) +
        line("검 승급", g.grade + "등급 · 옵션 ×" + (1 + g.grade / 10).toFixed(2)) +
        (g.canPromote
          ? AffixView.promotion(s, selectedId, g)
          : g.canForge
            ? line("다음 재련", fmt(g.cost) + " G · 성공 " + pct(g.success)) +
              desc(
                selectedId.startsWith("j:")
                  ? "기존 기록 검의 재련 성장입니다."
                  : g.grade >= 3
                    ? "최종 승급 완료 · 최고 단계 기록"
                    : "승급까지 +" + g.level + " / +" + g.threshold + " · 이번 재련의 전투 수치 변화 0",
              ) +
              action("affixForge", { id: selectedId, token }, "재련 · " + fmt(g.cost) + " G", s.gold < g.cost)
            : process(s, item, selectedId))
      );
    }
    if (detail === "currency") {
      const keys = [...Game.affixes.pool(item)].sort(
        (a, b) => Number(!!Game.affixes.defs[b].exclusiveSlot) - Number(!!Game.affixes.defs[a].exclusiveSlot),
      );
      return (
        "<h2>불씨·티어 안내</h2><p>일반 단계 승리 20%, 우두머리 승리 40%로 불씨 1개를 발견합니다. 최초 1·2·3·5단계에서는 첫불씨·겹불씨·도약 불씨·별금 불씨를 한 번 받습니다.</p><p>시스템이 옵션 종류 → 티어 → 값을 무작위 결정합니다. T1이 최저, T10이 최고이며 해금된 티어 가중치는 10·9·8·7·6·5·4·3·2·1입니다.</p>" +
        Game.affixes.currency
          .map(
            (name, i) =>
              "<details><summary>" +
              EmberView.art(i + 1, 32) +
              escapeHtml(name) +
              "</summary><p>" +
              AffixView.effects[i] +
              "</p><p>사냥에서 불씨 발견 시 " +
              [22, 17, 8, 6, 25, 6, 1, 8, 1, 6][i] +
              "%</p></details>",
          )
          .join("") +
        "<h3>이 부위 옵션 후보·티어 범위</h3>" +
        keys
          .map(
            (k) =>
              "<details><summary>" +
              escapeHtml(
                Game.affixes.defs[k].name +
                  (Game.affixes.defs[k].kind ? " · " + Game.affixes.defs[k].kind : "") +
                  (Game.affixes.defs[k].exclusiveSlot ? " · 이 부위 전용" : ""),
              ) +
              "</summary>" +
              desc(Game.affixes.defs[k].description || "") +
              Array.from({ length: 10 }, (_, i) => {
                const [a, b, scale] = Game.affixes.bounds(k, i + 1);
                return line(
                  "T" + (i + 1),
                  "+" + a / scale + AffixView.units(k) + "~" + b / scale + AffixView.units(k),
                );
              }).join("") +
              "</details>",
          )
          .join("")
      );
    }
    return (
      "<h2>현재 장비 옵션</h2>" +
      line("장비", escapeHtml(entry?.label || receipt?.displayLabel || "선택한 장비")) +
      line("등급", Game.blades.itemRarity(item).name) +
      AffixView.options(item) +
      (receipt?.id === selectedId && currentKey === "affix:result"
        ? "<h3>이번 변화</h3>" + AffixView.changes(receipt.before, receipt.item)
        : "")
    );
  }
  function display(s, key) {
    ensure();
    if (timing && key !== currentKey) cancelTiming();
    active = true;
    host.hidden = false;
    if (!timing) host.removeAttribute("data-timing");
    el("screen").inert = true;
    document.body.dataset.emberScene = "on";
    document.body.append(el("noticeSlot"));
    const p = parse(s, key),
      item = p.result ? receipt?.item || receipt?.before : p.entry?.item;
    const name = p.result
      ? (receipt?.displayLabel || p.entry?.label || "선택한 장비") + (receipt?.item ? "" : " · 영구 소실")
      : p.entry?.label || "장비가 없습니다";
    const q =
      !p.choosing && !p.result && selectedN && p.entry ? Game.affixQuote(s, selectedId, selectedN) : null;
    const risk = detail === "risk";
    host.dataset.emberResult = String(p.result);
    host.dataset.emberRisk = String(risk);
    const mods = item?.mods || [],
      prefix = mods.filter((m) => Game.affixes.sideOf(m) === "P").length;
    const status = item
      ? Game.blades.itemRarity(item).name +
        " · +" +
        (item.growthLevel ?? item.level) +
        " · 접두 " +
        prefix +
        "/3 · 접미 " +
        (mods.length - prefix) +
        "/3" +
        (item.corrupted ? " · 타락" : "")
      : "사냥에서 장비를 얻으세요";
    const graphic = item ? '<div class="ember-scene-gear">' + equipment(item, true) + "</div>" : "";
    const delta =
      receipt?.item && receipt?.before
        ? (() => {
            let up = 0,
              down = 0;
            for (const m of receipt.item.mods || []) {
              const before = (receipt.before.mods || []).find((x) => x.key === m.key);
              if (before) {
                if (m.value > before.value) up++;
                if (m.value < before.value) down++;
              }
            }
            return up || down
              ? "상승 " + up + "줄 · 하락 " + down + "줄"
              : "옵션 " + (receipt.before.mods?.length || 0) + " → " + (receipt.item.mods?.length || 0) + "개";
          })()
        : "장비 영구 소실 · 복구되지 않음";
    const info = p.result
      ? escapeHtml(receipt?.message || "세공 결과") +
        "<small>" +
        escapeHtml(delta) +
        " · 남은 불씨 " +
        fmt(s.affixWallet?.counts?.[selectedN - 1] || 0) +
        "개</small>"
      : p.choosing
        ? "세공할 장비를 고르세요"
        : q
          ? "<b>" +
            escapeHtml(Game.affixes.currency[selectedN - 1]) +
            "</b> · " +
            escapeHtml(AffixView.effects[selectedN - 1]) +
            "<small>보유 " +
            fmt(q.count || 0) +
            "개 · 소모 1개" +
            (q.reason ? " · " + escapeHtml(q.reason) : "") +
            "</small>"
          : "불씨 그림을 눌러 효과와 수량을 확인하세요";
    const tray = risk
      ? '<div class="ember-risk-copy"><strong>' +
        (selectedN === 9 ? "실패 90% · 장비 영구 소실" : "영구 타락 · 이후 불씨 사용 불가") +
        "</strong><span>" +
        (selectedN === 9
          ? "검의 재련·승급·옵션도 함께 사라집니다."
          : "성능이 나빠질 수 있음 · 재련·승급은 가능") +
        "</span><small>소모 1개 · 보유 " +
        fmt(q?.count || 0) +
        "개</small></div>"
      : p.result
        ? ""
        : p.choosing
          ? p.all
              .map((x) =>
                button(
                  'data-ember-equipment-id="' +
                    escapeHtml(x.id) +
                    '" aria-pressed="' +
                    (x.id === selectedId) +
                    '"',
                  equipment(x.item) +
                    "<b>" +
                    escapeHtml(x.label) +
                    "</b><small>" +
                    Game.blades.itemRarity(x.item).name +
                    " · " +
                    (x.item.mods?.length || 0) +
                    "옵션</small>",
                  "ember-tray-item",
                ),
              )
              .join("")
          : Game.affixes.currency
              .map((label, i) =>
                button(
                  'data-ember-currency="' +
                    (i + 1) +
                    '" aria-pressed="' +
                    (selectedN === i + 1) +
                    '" aria-label="' +
                    escapeHtml(label) +
                    " " +
                    fmt(s.affixWallet?.counts?.[i] || 0) +
                    '개"',
                  EmberView.art(i + 1, 48) +
                    "<b>" +
                    escapeHtml(label) +
                    "</b><small>×" +
                    fmt(s.affixWallet?.counts?.[i] || 0) +
                    "</small>",
                  "ember-tray-item",
                ),
              )
              .join("");
    let primary;
    if (p.result)
      primary = button(
        'data-open="' + (p.entry ? "affix:item:" + selectedId : "affix:list") + '"',
        controlArt("hammer") + "<b>다른 불씨</b>",
        "ember-main-action",
      );
    else if (p.choosing)
      primary = button(
        "data-ember-choose-equipment" + (!item ? " disabled" : ""),
        controlArt("hammer") + "<b>이 장비에 세공</b>",
        "ember-main-action",
      );
    else if (!selectedN)
      primary = button("disabled", controlArt("hammer") + "<b>불씨 선택</b>", "ember-main-action");
    else if (selectedN >= 9)
      primary = button(
        "data-ember-review-risk" + (!p.entry || !q || q.reason ? " disabled" : ""),
        EmberView.art(selectedN, 32) +
          "<b>위험 확인</b><small>불씨 1개 · 보유 " +
          fmt(q?.count || 0) +
          "</small>",
        "ember-main-action",
      );
    else
      primary = action(
        "affixUse",
        { id: selectedId, n: selectedN, token: q?.token },
        controlArt("hammer") + "<b>세공</b><small>불씨 1개 · 보유 " + fmt(q?.count || 0) + "</small>",
        !p.entry || !q || !!q.reason,
      );
    const footer = risk
      ? action(
          "affixUse",
          { id: selectedId, n: selectedN, token: q?.token },
          EmberView.art(selectedN, 32) + "<b>확인하고 세공</b>",
          !q || !!q.reason,
        ) + button("data-ember-close-detail", "취소 · 장비 유지", "ember-main-action")
      : button(
          'data-open="affix:list' + (selectedN ? "|" + selectedN : "") + '"',
          controlArt("bag") + "<span>장비</span>",
        ) +
        primary +
        button('data-ember-detail="currency"', icon("scroll-text") + "<span>도감</span>");
    host.innerHTML =
      '<div class="ember-scene-message"></div><header class="ember-scene-header"><span>' +
      icon("coins") +
      fmt(s.gold) +
      " G</span><b>불씨 세공대</b>" +
      button('data-close aria-label="세공대 닫기"', icon("x")) +
      '</header><div class="ember-scene-name"><strong>' +
      escapeHtml(name) +
      "</strong><span>" +
      status +
      '</span></div><div class="ember-scene-centre"' +
      (p.result && receipt?.operationId
        ? ' data-ember-operation="' + escapeHtml(receipt.operationId) + '"'
        : "") +
      ' data-ember-outcome="' +
      (p.result ? escapeHtml(receipt?.outcome || "") : "") +
      '">' +
      graphic +
      (selectedN
        ? '<div class="ember-scene-supply ember-supply">' + EmberView.art(selectedN, 96) + "</div>"
        : "") +
      '<div class="ember-scene-tools">' +
      button('data-ember-detail="options"', icon("circle-help") + "옵션") +
      button('data-ember-detail="growth"', controlArt("hammer") + "승급") +
      button('data-ember-detail="process"', icon("anvil") + "공정") +
      (p.entry && (selectedId.startsWith("j:") || selectedId.startsWith("b"))
        ? action(
            "affixEquip",
            { id: selectedId, token: Game.affixQuote(s, selectedId, 1).token },
            controlArt("equip") + '<span class="grade-access">사냥에 </span><span>착용</span>',
            false,
            "ember-scene-equip",
          )
        : "") +
      '</div></div><div class="ember-scene-info" role="status">' +
      info +
      '</div><div class="ember-scene-tray" aria-label="' +
      (p.choosing ? "장비 트레이" : "불씨 트레이") +
      '">' +
      tray +
      '</div><footer class="ember-scene-footer">' +
      footer +
      "</footer>" +
      (detail && !risk
        ? '<div class="ember-game-overlay"><section class="ember-game-detail" aria-label="세공 상세">' +
          button('data-ember-close-detail aria-label="상세 닫기"', icon("x"), "ember-detail-close") +
          detailBody(s, p.entry, key) +
          "</section></div>"
        : "");
    if (p.result && receipt?.outcome === "destroyed") host.classList.add("ember-result-destroyed");
    else host.classList.remove("ember-result-destroyed");
    const selected = host.querySelector('.ember-scene-tray [aria-pressed="true"]');
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (p.result && receipt?.timingMarks?.length) {
      host
        .querySelector(".ember-scene-info")
        ?.insertAdjacentHTML(
          "beforeend",
          '<small class="ember-final-marks">' +
            receipt.timingMarks.map((hit, i) => i + 1 + "타 " + (hit ? "명중" : "비껴감")).join(" · ") +
            "</small>",
        );
    }
    if (timing) paintTiming();
    EmberView.afterRender();
    placeToast();
  }
  function hide() {
    cancelTiming();
    if (host) host.hidden = true;
    el("screen").inert = false;
    active = false;
    currentKey = "";
    detail = "";
    delete document.body.dataset.emberScene;
  }
  function closeDetail() {
    if (!active || !detail) return false;
    detail = "";
    if (related(modal)) modal = "affix:item:" + selectedId;
    display(state, modal);
    host.querySelector('[data-ember-detail="options"]')?.focus({ preventScroll: true });
    return true;
  }
  function result(r, arg) {
    receipt = { ...r, id: arg.id, n: arg.n, timingMarks: [...marks] };
  }
  function focus() {
    (
      host?.querySelector(".ember-game-detail button:not(:disabled)") ||
      host?.querySelector(".ember-main-action:not(:disabled)") ||
      host?.querySelector("button")
    )?.focus({ preventScroll: true });
  }
  function home(s, layout) {
    const q = archiveBlade
      ? gear === "weapon"
        ? Game.affixList(s).find((x) => x.id === "j:" + s.weapon.recordId)
        : null
      : ForgeItemView.shown;
    if (!q) return;
    layout.classList.add("forge-bench-home");
    const strip = document.createElement("section");
    strip.className = "ember-home";
    strip.setAttribute("aria-label", "불씨 세공대");
    strip.innerHTML =
      "<b>불씨 세공대 " +
      "<small>불씨를 눌러 설명 보기</small>" +
      '</b><div class="ember-home-tray">' +
      Game.affixes.currency
        .map((name, i) =>
          button(
            'data-home-ember="' +
              (i + 1) +
              '" aria-pressed="' +
              (homeN === i + 1) +
              '" aria-label="' +
              escapeHtml(name) +
              " · 보유 " +
              fmt(s.affixWallet?.counts?.[i] || 0) +
              '개"',
            EmberView.art(i + 1, 32) + "<small>" + fmt(s.affixWallet?.counts?.[i] || 0) + "</small>",
            "ember-home-item",
          ),
        )
        .join("") +
      "</div>";
    layout.querySelector(".forge-console").before(strip);
    const quote = homeN ? Game.affixQuote(s, q.id, homeN) : null,
      arg = homeN ? { id: q.id, n: homeN, token: quote.token } : null;
    if (homeN) {
      const info =
        "<b>" +
        escapeHtml(Game.affixes.currency[homeN - 1]) +
        "</b> · " +
        escapeHtml(AffixView.effects[homeN - 1]) +
        "<small>보유 " +
        fmt(quote.count || 0) +
        "개 · 소모1개" +
        (quote.reason ? " · " + escapeHtml(quote.reason) : "") +
        "</small>";
      const summary = layout.querySelector(".forge-item-summary");
      if (summary) {
        summary.className = "forge-item-summary ember-home-info";
        summary.innerHTML = info;
      }
    }
    const previous = layout.querySelector(".forge-strike");
    if (previous) {
      const main = document.createElement("template");
      main.innerHTML = homeN
        ? button(
            (homeN >= 9 ? "data-home-risk" : 'data-affix-act="affixUse"') +
              ' data-affix-arg="' +
              escapeHtml(JSON.stringify(arg)) +
              '"' +
              (quote.reason ? " disabled" : ""),
            EmberView.art(homeN, 36) + "<b>세공</b><small>세 번 멈춤</small>",
            "ember-home-start",
          )
        : button(
            "data-home-pick",
            controlArt("hammer") + "<b>불씨 선택</b><small>세공 준비</small>",
            "ember-home-start",
          );
      previous.before(main.content);
      previous.classList.add("ember-home-forge");
      previous.dataset.homeForge = "";
    }
  }

  function cancelTiming() {
    timing?.cancel();
    timing = null;
    cancelAnimationFrame(timingFrame);
    timingFrame = 0;
    host?.removeAttribute("data-timing");
  }
  function startTiming(arg) {
    if (timing || sending) return;
    const quote = Game.affixQuote(state, arg.id, arg.n);
    if (quote.reason || quote.token !== arg.token) {
      notify(quote.reason || "장비 정보가 바뀌었습니다. 다시 선택해주세요.");
      return;
    }
    if (!active) showModal("affix:item:" + arg.id + "|" + arg.n);
    marks = [];
    detail = "";
    timing = EmberTiming.create({ ...arg }, performance.now());
    syncTimingPause();
    display(state, modal);
    host.querySelector("[data-ember-stop]")?.focus({ preventScroll: true });
  }
  function paintTiming() {
    host.dataset.timing = "on";
    host.querySelector(".ember-scene-info").innerHTML =
      "<b>" +
      escapeHtml(Game.affixes.currency[selectedN - 1]) +
      "</b> · 중앙에서 세 번 멈추세요<small>타이밍은 타격 연출에만 반영 · 결과 확률은 동일</small>";
    host.querySelector(".ember-scene-tray").innerHTML =
      '<div class="ember-timing"><strong data-ember-round aria-live="polite">' +
      timing.round +
      ' / 3</strong><div data-ember-meter role="img" aria-label="좌우로 이동하는 표식과 중앙 목표"><i class="ember-timing-target"></i><i data-ember-marker></i></div><span class="ember-timing-marks">' +
      marks.map((hit, i) => "<b>" + (i + 1) + "타 " + (hit ? "명중" : "비껴감") + "</b>").join(" · ") +
      "</span></div>";
    host.querySelector(".ember-scene-footer").innerHTML =
      button("data-ember-cancel", "취소 · 소모 없음") +
      button("data-ember-stop", controlArt("hammer") + "<b>멈춤</b>", "ember-main-action");
    host.querySelectorAll(".ember-scene-tools button").forEach((b) => (b.disabled = true));
    cancelAnimationFrame(timingFrame);
    tickTiming();
  }
  function tickTiming() {
    if (!timing || !active) return;
    const marker = host.querySelector("[data-ember-marker]");
    if (marker) marker.style.left = timing.position(performance.now()) * 100 + "%";
    const stop = host.querySelector("[data-ember-stop]");
    if (stop) stop.disabled = timing.paused;
    host.dataset.timingPaused = String(timing.paused);
    timingFrame = requestAnimationFrame(tickTiming);
  }
  function stopTiming() {
    if (!timing || sending) return;
    const result = timing.stop(performance.now());
    if (!result) return;
    marks = result.marks;
    const canvas = host.querySelector(".ember-scene-gear canvas");
    if (canvas) canvas.dataset.emberStrikeAt = String(performance.now());
    if (motionEnabled()) {
      host
        .querySelector(".ember-scene-gear")
        ?.animate(
          [{ transform: "translateY(0)" }, { transform: "translateY(5px)" }, { transform: "translateY(0)" }],
          { duration: 180 },
        );
    }
    if (result.complete) {
      const request = result.request;
      cancelTiming();
      sending = true;
      host.dataset.timing = "sending";
      host.querySelectorAll("button").forEach((b) => (b.disabled = true));
      Promise.resolve(act("affixUse", request)).finally(() => (sending = false));
    } else {
      paintTiming();
      const meter = host.querySelector("[data-ember-meter]");
      meter?.insertAdjacentHTML(
        "beforeend",
        '<i class="ember-stop-pin" style="left:' + result.position * 100 + '%"></i>',
      );
      host.querySelector("[data-ember-stop]")?.focus({ preventScroll: true });
    }
  }
  function syncTimingPause() {
    if (!timing) return;
    if (windowBlurred || document.hidden) timing.pause(performance.now());
    else timing.resume(performance.now());
  }
  window.addEventListener("blur", () => {
    windowBlurred = true;
    syncTimingPause();
  });
  window.addEventListener("focus", () => {
    windowBlurred = false;
    syncTimingPause();
  });
  document.addEventListener("visibilitychange", syncTimingPause);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat && timing && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (timing && !("emberStop" in d || "emberCancel" in d || d.go || "close" in d)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (d.homeEmber) {
        const scroll = b.parentElement.scrollLeft;
        homeN = Number(d.homeEmber);
        render();
        const tray = document.querySelector(".ember-home-tray");
        if (tray) tray.scrollLeft = scroll;
        document.querySelector('[data-home-ember="' + homeN + '"]')?.focus({ preventScroll: true });
      } else if ("homeClear" in d) {
        homeN = 0;
        render();
      } else if ("homePick" in d) {
        document.querySelector("[data-home-ember]")?.focus();
      } else if ("homeRisk" in d) {
        const arg = JSON.parse(d.affixArg);
        showModal("affix:item:" + arg.id + "|" + arg.n);
        detail = "risk";
        display(state, modal);
        focus();
      } else if (d.affixAct === "affixUse") {
        startTiming(JSON.parse(d.affixArg));
      } else if ("emberStop" in d) {
        stopTiming();
      } else if ("emberCancel" in d) {
        cancelTiming();
        display(state, modal);
        focus();
      } else if (timing) {
        if (d.go || "close" in d) cancelTiming();
        else {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#emberStage button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.emberEquipmentId) {
      selectedId = d.emberEquipmentId;
      if (!selectedId.startsWith("j:")) ForgeItemView.selectItem(state, selectedId);
      display(state, modal);
    } else if ("emberChooseEquipment" in d)
      showModal("affix:item:" + selectedId + (selectedN ? "|" + selectedN : ""), b);
    else if (d.emberCurrency) showModal("affix:item:" + selectedId + "|" + d.emberCurrency, b);
    else if (d.emberDetail) {
      detail = d.emberDetail;
      display(state, modal);
      focus();
    } else if ("emberCloseDetail" in d) {
      closeDetail();
    } else if ("emberReviewRisk" in d) {
      detail = "risk";
      display(state, modal);
      focus();
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  });
  return {
    isRoute,
    home,
    cancelTiming,
    startTiming,
    route,
    display,
    hide,
    closeDetail,
    result,
    focus,
    get visible() {
      return active;
    },
    get host() {
      return host;
    },
    get selectedId() {
      return selectedId;
    },
  };
})();
