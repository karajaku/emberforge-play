"use strict";
function grindSummary(passes) {
  return Swordcraft.grindZones.flatMap((z, i) => {
    const value = Swordcraft.grindBonus(passes, i);
    return value ? [z.effect + " " + z.sign + value + "%"] : [];
  }).join(" · ");
}
function craftSummary(g) {
  if (!g.marks?.length) return "";
  const parts = [];
  const attack = Swordcraft.count(g, "edge") * 10,
    income = Swordcraft.count(g, "yield") * 35;
  if (attack) parts.push("공격력 +" + attack + "%");
  if (income) parts.push("배치 수익 +" + income + "%");
  if (Swordcraft.count(g, "ward")) parts.push("보강 " + Swordcraft.wards(g) + "회 남음");
  if (g.grind?.length) parts.push(grindSummary(g.grind));
  return parts.join(" · ");
}
function recipeName(r) {
  return Swordcraft.stages[r.index].title + " · " + Swordcraft.traits[r.trait].name;
}
function patternView(s) {
  const options = Game.reforgeOptions(s);
  if (!options) return "";
  const { pattern: p, copyFee } = options;
  return (
    '<section class="legacy-card reforge-card"><h3>' +
    icon("book-open") +
    " 부러진 검의 초벌본</h3>" +
    desc(recipeName(p) + " × " + Game.imprints[p.seal][0]) +
    desc(
      "같은 수련과 주각인으로 재제작합니다. 새 검이 +" +
        p.level +
        " 미만일 때 한 번 쓸 수 있습니다.",
    ) +
    btn("reforge", "+" + p.level + "부터 새로 설계 · 무료", "blank", "action") +
    (p.mark
      ? btn(
          "reforge",
          "+9로 첫 연마 본뜨기 · " + Swordcraft.traits[p.mark].name + " · " + fmt(copyFee) + " G",
          "copy",
          "action",
          s.gold < copyFee,
        )
      : "") +
    "</section>"
  );
}
function legacyView(s) {
  const w = s.weapon,
    r = w.route,
    seal = w.seal,
    recipe = s.inheritedRecipe;
  if (!s.rebirths || w.level >= 20) return "";
  let path = "";
  if (r) {
    const task = Game.routeTask(s);
    if (task) {
      const objective =
        r.trait === "edge"
          ? "이끼숲 " + task.needed + "구역 이상 토벌"
          : r.trait === "ward"
            ? "정밀 담금질 " + r.progress + "/" + task.needed + "회"
            : "별의 파편 " + task.needed + "개 납품 · 보유 " + fmt(s.shards) + "개";
      const travel =
        r.trait === "edge"
          ? go("forest", "이끼숲으로")
          : r.trait === "ward"
            ? openBtn("temper", "담금질하기", "mini")
            : "";
      path =
        line(Game.journeys[r.trait].name, "목표 +" + task.target) +
        desc(objective) +
        (!task.open
          ? desc("검 +" + task.threshold + "부터 수련할 수 있습니다.")
          : task.ready || r.trait === "yield"
            ? btn("routeFinish", "수련 마감 · +" + task.target, task.target, "action", !task.ready)
            : travel);
      if (r.trait === "yield" && task.open) {
        path +=
          btn(
            "routeSupply",
            "배치 수익 " + fmt(task.supplyGold) + " G로 대납",
            task.target,
            "action",
            !task.canSupply,
          ) + desc("미수령 배치 수익 <span data-field-balance>" + fmt(s.unclaimed) + "</span> G");
      }
    }
  } else if (recipe && w.level < 15) {
    const pathDef = Game.journeys[recipe.trait];
    path =
      line(pathDef.name, Swordcraft.traits[recipe.trait].name) +
      desc(pathDef.task + "으로 +4, +7, +15 달성") +
      btn("beginPath", "이 검으로 수련 시작");
  }
  const saved = Game.breakPattern(w);
  if (saved && w.level >= 15)
    path += desc(
      "파괴 시 초벌본 +" +
        saved.level +
        (saved.mark ? " · 첫 연마 ‘" + Swordcraft.traits[saved.mark].name + "’ 기록" : ""),
    );
  let sealUI;
  if (!seal) {
    const unlocked = Object.keys(Game.techniques).filter((k) => s.imprints[k]);
    sealUI =
      desc("이 검에 새길 주각인 하나를 고르세요. +13부터 기술을 두 번 쓸 수 있습니다.") +
      unlocked
        .map((k) =>
          btn(
            "attune",
            Game.imprints[k][0] +
              " 새기기 · " +
              Game.techniques[k].name +
              "<small>" +
              Game.techniques[k].text +
              "</small>",
            k,
            "legacy-pick",
          ),
        )
        .join("") +
      go("growth", unlocked.length ? "다른 각인 해금" : "영혼 포인트로 각인 해금");
  } else {
    const k = seal.key,
      tech = Game.techniques[k],
      usable = Game.techniqueAvailable(s, k);
    sealUI = line(Game.imprints[k][0] + " · " + tech.name, 2 - seal.uses + "회 남음");
    if (seal.escort) sealUI += desc("수비대 호위 중 · 다음 하락·파괴를 한 번 막습니다.");
    if (seal.uses >= 2) return wrapLegacy(path + sealUI);
    sealUI += desc(tech.text);
    if (w.level >= 13) {
      if (k === "luck" && w.level <= 17)
        sealUI += btn(
          "doubleStrike",
          "쌍타 +" +
            w.level +
            " → +" +
            (w.level + 2) +
            " · " +
            pct(Game.odds(s, w)) +
            " · " +
            fmt(Game.enhancementCost(s, w)) +
            " G",
          "weapon",
        );
      if (k === "lung" && w.level < 19)
        sealUI += usable
          ? btn("breathForge", "호흡 단조 · +" + (w.level + 1) + " 완성")
          : openBtn("temper", "정밀 담금질 · 호흡 " + seal.beats + "/2", "action");
      if (k === "land" && !seal.escort)
        sealUI += btn(
          "hireEscort",
          "호위 요청 · 미수령 <span data-field-balance>" + fmt(s.unclaimed) + "</span> / 2,000 G",
          "",
          "action",
          !usable,
        );
    }
  }
  return wrapLegacy(path + sealUI);
}
function wrapLegacy(content) {
  return (
    '<section class="legacy-card"><h3>' + icon("flame") + " 전승 수련</h3>" + content + "</section>"
  );
}
function craftEntry(s) {
  const g = s.weapon;
  const i = Swordcraft.stageIndex(g),
    summary = craftSummary(g);
  if (i < 0) return summary ? '<small class="craft-summary">' + summary + "</small>" : "";
  const st = Swordcraft.stages[i];
  return (
    '<div class="craft-entry"><div><small>검 제작 · ' +
    (i + 1) +
    " / 3</small><b>" +
    st.title +
    "</b></div>" +
    btn("craftStart", icon(st.icon) + (g.work ? "작업 계속" : "공정 열기"), "", "mini active") +
    "<p>" +
    (g.level < st.target ? "완성하면 +" + st.target + " · " : "") +
    "검 특성 선택" +
    (summary ? " · " + summary : "") +
    "</p>" +
    (s.inheritedRecipe?.index === i
      ? btn(
          "craftInherit",
          "전승 제작 · " +
            Swordcraft.traits[s.inheritedRecipe.trait].name +
            " · " +
            fmt(Swordcraft.fee(g, Game.price, i)) +
            " G",
          "",
          "action",
        )
      : "") +
    "</div>"
  );
}
function inheritancePicker(s) {
  const marks = s.weapon.marks || [],
    r = s.inheritedRecipe;
  if (s.weapon.level !== 20 || !marks.length)
    return r
      ? line("유지할 제작법", recipeName(r))
      : s.weapon.level === 20
        ? desc(
            "전승할 특성이 없습니다. 대장간에서 제작 공정을 마치면 다음 검의 수련도 선택할 수 있습니다.",
          )
        : "";
  const options = marks
    .map(
      (trait, index) =>
        '<option value="' +
        index +
        '">' +
        recipeName({ index, trait }) +
        " · " +
        Game.journeys[trait].task +
        "</option>",
    )
    .join("");
  return (
    '<label class="inheritance">전승할 제작법<select id="inheritChoice">' +
    options +
    (r
      ? '<option value="keep" selected>현재 제작법 유지 · ' +
        recipeName(r) +
        " · " +
        Game.journeys[r.trait].task +
        "</option>"
      : "") +
    "</select></label>" +
    desc(
      "다음 검은 선택한 특성의 수련으로 +4, +7, +15에 도달할 수 있습니다. 선택한 공정에서는 마감 비용을 내고 특성을 즉시 새길 수 있습니다.",
    )
  );
}
function craftWorkshop(s) {
  const g = s.weapon,
    i = Swordcraft.stageIndex(g),
    w = g.work;
  if (i < 0 || !w || w.index !== i)
    return ["검 제작", desc("장착 무기가 바뀌었습니다. 대장간에서 진행할 공정을 확인하세요.")];
  const st = Swordcraft.stages[i],
    fee = Swordcraft.fee(g, Game.price, i);
  const title = i + 1 + " / 3 · " + st.title;
  const redesign = w.stock ? btn("craftMove", "새 방식으로 연마 배분하기 · 처음부터 3회", "redesign", "action") : "";
  const stageScene =
    '<div class="modal-scene craft-scene ' +
    (i === 1 ? "sparring" : "") +
    '"><canvas data-sprite="' +
    (i === 1 ? "sentinel" : "blade" + (Game.bladeStage(g) || "")) +
    '" width="' +
    (i === 1 ? 144 : 128) +
    '" height="144"></canvas></div>';
  if (w.ready) {
    const at = Math.max(g.level, st.target);
    const choice = Object.entries(Swordcraft.traits)
      .map(([key, v]) => {
        const example = { ...g, grind: w.passes || g.grind, level: at, marks: [...(g.marks || []), key] };
        const amount =
          key === "edge"
            ? "완성 공격력 " + fmt(Game.stats({ ...s, weapon: example }).attack)
            : key === "ward"
              ? "보호 " + Swordcraft.wards(example) + "회"
              : "+" +
                Math.max(13, at) +
                " 배치 시 " +
                fmt(Game.perMinute({ ...example, level: Math.max(13, at) })) +
                " G/분";
        return btn(
          "craftFinish",
          icon(v.icon) +
            "<span><b>" +
            v.name +
            "</b><small>" +
            v.text +
            " · +19 " +
            Breakthrough.methods[key].name +
            " · " +
            amount +
            "</small></span>",
          key,
          "craft-choice",
          s.gold < fee,
        );
      })
      .join("");
    return [
      title,
      stageScene +
        '<div class="craft-body">' +
        (w.passes ? line("연마 효과", grindSummary(w.passes)) + btn("craftMove", "마지막 연마 되돌리기", "undo", "mini") : "") +
        redesign + '<h3>이 검에 남길 특성</h3>' +
        desc("한 가지를 고르면 +" + at + " 검이 완성됩니다. 같은 특성은 누적됩니다.") +
        line("마감 비용", fmt(fee) + " G") +
        (s.gold < fee
          ? desc(
              "골드가 " +
                fmt(fee - s.gold) +
                " G 부족합니다. 창을 닫고 돌아와도 작업은 보존됩니다.",
            )
          : "") +
        choice +
        "</div>",
    ];
  }
  if (w.failed)
    return [
      title,
      stageScene +
        desc((i === 1 ? "시검 패배 · " : "") + w.note) +
        desc("검과 골드는 그대로입니다. 다시 시도할 수 있습니다.") +
        (redesign || btn("craftStart", "다시 연습하기", "", "primary")),
    ];
  let controls = "";
  if (i === 0 && w.passes) {
    controls = line("남은 연마", (3 - w.passes.length) + "회") +
      '<div class="grind-options">' + Swordcraft.grindZones.map((z, j) => {
        const current = Swordcraft.grindBonus(w.passes, j);
        const next = Swordcraft.grindBonus([...w.passes, j], j);
        return btn("craftMove", icon(z.icon) + "<span><b>" + z.name + "</b><small>" + z.effect +
          "</small></span><strong>" + (current ? z.sign : "") + current + "% → " + z.sign + next + "%</strong>", j, "grind-zone");
      }).join("") + "</div>" +
      (w.passes.length ? btn("craftMove", "마지막 연마 되돌리기", "undo", "mini") : "");
  } else if (i === 0) {
    controls =
      metrics(
        ...w.stock.map((n, j) =>
          metric(
            ["밑날", "중앙", "칼끝"][j],
            '<span class="burrs">' + "◆".repeat(n) + (n ? "" : "✓") + "</span>",
          ),
        ),
      ) +
      desc(
        "짧게 갈면 한 면, 길게 갈면 이웃한 두 면의 돌기가 각각 하나 줄어듭니다. 평평한 면까지 갈면 다시 시작합니다.",
      ) +
      line("남은 연마", w.left + "회") +
      '<div class="craft-moves">' +
      Swordcraft.cuts.map((c, j) => btn("craftMove", c.label, j)).join("") +
      "</div>";
  } else if (i === 1) {
    controls =
      metrics(
        gaugeMetric("내 자세", w.health, 7, "mint"),
        gaugeMetric("수문장 자세", w.enemy, 10, "red"),
        gaugeMetric("내 기력", w.stamina, 3, "gold"),
      ) +
      line("다음 공격", Swordcraft.heavy(w) ? "강타 · 피해 4" : "견제 · 피해 1") +
      desc(
        "속공은 피해 2와 기력 +1, 찌르기는 기력 2를 써서 피해 5입니다. 강타를 받아치면 피해 3과 기력 +1, 견제를 잘못 받아치면 내 자세가 2 줄어듭니다.",
      ) +
      '<div class="craft-moves">' +
      btn("craftMove", "속공", "quick") +
      btn("craftMove", "찌르기", "lunge", "action", w.stamina < 2) +
      btn("craftMove", "받아치기", "parry") +
      "</div>";
  } else {
    const b = Swordcraft.baths[w.dips];
    controls =
      line(b.name, w.dips + 1 + " / 2") +
      '<div class="tempo"><span class="target" style="left:' +
      b.low * 100 +
      "%;width:" +
      (b.high - b.low) * 100 +
      '%"></span><i id="bathNeedle"></i></div>' +
      btn("craftMove", "지금 담그기", "dip", "primary");
  }
  return [
    title,
    stageScene +
      '<div class="craft-body">' +
      redesign +
      desc(w.stock ? "세 번 안에 남은 돌기를 모두 갈아내세요." : st.detail) +
      controls +
      (w.note ? '<p role="status">' + w.note + "</p>" : "") +
      line("완성 시 마감 비용", fmt(fee) + " G") +
      "</div>",
  ];
}
