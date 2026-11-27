"use strict";
const AffixView = (() => {
  const effects = [
    "일반에 옵션 1개 추가 · 매직",
    "1옵션 매직에 1개 추가 · 2옵션",
    "3옵션 매직에 1개 추가 · 레어",
    "일반에 옵션 4/5/6개 · 60/30/10% · 레어",
    "4~5옵션 레어에 1개 추가",
    "레어의 무작위 옵션 1개를 다른 종류로 교체",
    "모든 옵션의 종류·티어 유지 · 값만 재굴림",
    "무작위 옵션 1개 제거 · 등급이 내려갈 수 있음",
    "유니크 10% · 실패 90%는 장비 소실",
    "변화 없음 40% · 옵션 재추첨 35% · 소켓 재추첨 25% · 영구 타락",
  ];
  const meanings = {
    P1: "공격력",
    P2: "일반 타격 피해",
    P3: "강공 피해",
    P4: "반격 피해",
    P5: "파열 피해",
    P6: "HP 30% 이하 적 피해",
    P7: "조우 첫 직접 피해",
    P8: "최대 HP",
    P9: "방어도",
    P10: "상시 피격 감소",
    P11: "적 기술 피격 감소",
    P12: "HP 절반 이하 피격 감소",
    S1: "공격속도",
    S2: "보통 적중 시 추가 치명",
    S3: "치명 피해 배율",
    S4: "적중 시 기세 1 추가 확률",
    S5: "강공 대기 2초 단축 확률",
    S6: "기술 방어 시 HP 회복",
    S7: "처치 시 HP 회복",
    S8: "반격 뒤 다음 피격 감소",
    S9: "적중 시 상처 1 추가 확률",
    S10: "적 화염 저항 감소",
    S11: "적 냉기 저항 감소",
    S12: "적 번개 저항 감소",
  };
  const uniqueEffects = [
    "조우 첫 직접 피해 +60%, 다음 일반 타격부터 −10%",
    "적 기술 피격 −20%, 일반 공격 피격 +10%",
    "조우 첫 스킬 피해 +50%, 이후 스킬 −10%",
    "반격 피해 +40%, 강공 −15%",
    "HP 절반 이하 피격 −15%, 초과 피격 +5%",
    "공격속도 +15%, 일반 타격 피해 −8%",
    "강공 뒤 기세 1 유지, 강공 피해 −20%",
    "파열 필요 상처 1개 감소(최소 2), 파열 피해 −15%",
    "처치 시 HP 8% 회복, 최대 HP −10%",
  ];
  const units = (key) =>
    ["P10", "S2", "S3", "S4", "S5", "S9", "S10", "S11", "S12", "plating"].includes(key) ? "%p" : "%";
  const number = (v) => Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  function compatibility(key) {
    const def = Game.affixes?.defs[key];
    if (!def)
      return (
        Game.blades.modDefs[key] || {
          name: key,
          side: "prefix",
          ranges: Array.from({ length: 10 }, () => [0, 0]),
        }
      );
    return {
      ...def,
      side: def.side === "P" ? "prefix" : "suffix",
      ranges: Array.from({ length: 10 }, (_, i) => {
        const [a, b, scale] = Game.affixes.bounds(key, i + 1);
        return [a / scale, b / scale];
      }),
    };
  }
  const optionDef = (m) =>
    Game.affixes?.defs[m.key] || Game.blades.modDefs[m.key] || { name: m.key, side: "prefix" };
  const modName = (m) =>
    m.ascended
      ? (Game.endgame.armorTransform[m.ascended] || Game.endgame.transform[m.ascended])?.name || "초월 옵션"
      : optionDef(m).name;
  const side = (m) =>
    Game.affixes?.sideOf ? Game.affixes.sideOf(m) : optionDef(m).side === "prefix" ? "P" : "S";
  function value(m, item) {
    const v = item && Game.affixes?.effectiveValue ? Game.affixes.effectiveValue(item, m) : m.value;
    return Number.isFinite(v) ? number(v) + units(m.key) : "—";
  }
  function options(item) {
    const mods = item.mods || [];
    let body = item.unique
      ? line(
          "고유 장비",
          escapeHtml(
            Game.affixes?.uniqueNames?.[Game.affixes.kinds.indexOf(Game.affixes.kindOf(item))] || "유니크",
          ),
        )
      : "";
    body += item.corrupted ? '<p class="affix-warning">잠김 · 타락 · 불씨 사용 불가 · 재련·승급 가능</p>' : "";
    for (const [key, title] of [
      ["P", "접두"],
      ["S", "접미"],
    ]) {
      const list = mods.filter((m) => side(m) === key);
      body +=
        '<section class="affix-options"><h4>' +
        title +
        " " +
        list.length +
        "/3</h4>" +
        list
          .map(
            (m) =>
              '<div class="affix-option"><span>' +
              escapeHtml(modName(m)) +
              (meanings[m.key] ? "<small>" + escapeHtml(meanings[m.key]) + "</small>" : "") +
              "<small>" +
              (Game.affixes?.defs[m.key] ? "T" + m.tier : "기존 T" + m.tier) +
              "</small></span><b>" +
              (item.promotionGrade > (m.migrationGrade || 0) && !m.ascended
                ? "<small>원값 " + value(m) + "</small>→ "
                : "") +
              value(m, item) +
              "</b></div>",
          )
          .join("") +
        (list.length < 3 ? "<small>빈자리 " + (3 - list.length) + "</small>" : "") +
        "</section>";
    }
    if (item.unique) body += desc(uniqueEffects[Game.affixes.kinds.indexOf(Game.affixes.kindOf(item))] || "");
    if (item.uniqueStats)
      body += line(
        "고유 효과",
        "공격력 +" +
          number(item.uniqueStats[0]) +
          "% · HP +" +
          number(item.uniqueStats[1]) +
          "% · 방어도 +" +
          number(item.uniqueStats[2]) +
          "%",
      );
    if (item.sockets?.length)
      body += line(
        "자동 활성 봉인 소켓",
        item.sockets
          .map((x) => {
            const key = typeof x === "string" ? x : x.type || x.key;
            return escapeHtml(
              { fire: "불꽃 · 공격력 +3%", life: "숨결 · HP +3%", iron: "철벽 · 방어도 +6%" }[key] ||
                key ||
                "룬",
            );
          })
          .join(" · "),
      );
    return body;
  }
  const link = (id, label = "세공", cls = "action") => openBtn("affix:item:" + id, icon("anvil") + label, cls);
  function action(name, arg, label, disabled = false) {
    return (
      '<button class="primary" data-affix-act="' +
      name +
      '" data-affix-arg="' +
      escapeHtml(JSON.stringify(arg)) +
      '"' +
      (disabled ? " disabled" : "") +
      ">" +
      label +
      "</button>"
    );
  }
  function changes(before, after) {
    if (!after) return "";
    const old = before?.mods || [],
      now = after.mods || [];
    const rows = [];
    for (const m of old)
      if (!now.some((n) => n.key === m.key && n.ascended === m.ascended))
        rows.push(line("제거", escapeHtml(modName(m)) + " " + value(m, before)));
    for (const m of now) {
      const was = old.find((n) => n.key === m.key && n.ascended === m.ascended);
      if (!was) rows.push(line("추가", escapeHtml(modName(m)) + " T" + m.tier + " · " + value(m, after)));
      else if (was.value !== m.value || was.tier !== m.tier)
        rows.push(
          line(
            m.value < was.value ? "하락" : m.value > was.value ? "상승" : "변경",
            escapeHtml(modName(m)) +
              " · T" +
              was.tier +
              " " +
              value(was, before) +
              " → T" +
              m.tier +
              " " +
              value(m, after),
          ),
        );
    }
    if (JSON.stringify(before?.uniqueStats) !== JSON.stringify(after.uniqueStats)) {
      ["공격력", "최대 HP", "방어도"].forEach((name, i) =>
        rows.push(
          line(
            "고유 " + name,
            number(before?.uniqueStats?.[i] || 0) + "% → " + number(after.uniqueStats?.[i] || 0) + "%",
          ),
        ),
      );
    }
    if (!rows.length && JSON.stringify(before?.sockets) === JSON.stringify(after.sockets))
      rows.push(desc("옵션 수치 동일"));
    if (!before?.corrupted && after.corrupted) rows.push(desc("타락 확정 · 이후 옵션 변경 불가"));
    if (JSON.stringify(before?.sockets) !== JSON.stringify(after.sockets))
      rows.push(
        line(
          "봉인 소켓",
          (before?.sockets || []).map((k) => ({ fire: "불꽃", life: "숨결", iron: "철벽" })[k] || k).join("·") +
            " → " +
            (after.sockets || []).map((k) => ({ fire: "불꽃", life: "숨결", iron: "철벽" })[k] || k).join("·") +
            " (" +
            (before?.sockets?.length || 0) +
            "→" +
            (after.sockets?.length || 0) +
            "개)",
        ),
      );
    return rows.join("");
  }
  function growthButton(s, id) {
    const g = Game.weaponGrowth(s, id),
      token = Game.affixQuote(s, id, 1).token;
    if (g.canPromote) return openBtn("affix:growth:" + id, controlArt("hammer") + "승급", "primary");
    if (g.canForge)
      return action(
        "affixForge",
        { id, token },
        controlArt("hammer") + "재련<small>" + fmt(g.cost) + " G</small>",
        s.gold < g.cost,
      );
    return openBtn(
      "affix:item:" + id,
      controlArt("hammer") + "제작 확인<small>공정·승급 조건</small>",
      "primary",
    );
  }
  function promotion(s, id, growth) {
    const token = Game.affixQuote(s, id, 1).token;
    return growth.grade === 1
      ? "<h4>승급 특성 선택</h4>" +
          Game.journeyTraits
            .map((name, trait) =>
              action(
                "affixPromote",
                { id, token, trait },
                escapeHtml(name) +
                  "<small>" +
                  ["반격 피해 약 +3%", "적 HP 30% 미만 피해 +10%", "내 HP 35% 미만 피격 −13%", "강공 피해 +8%"][
                    trait
                  ] +
                  "</small>",
              ),
            )
            .join("")
      : action("affixPromote", { id, token, trait: 0 }, "승급");
  }
  function result(r, arg) {
    EmberView.consume(r);
    EmberScene.result(r, arg);
  }
  return {
    options,
    link,
    modName,
    optionDef,
    value,
    result,
    compatibility,
    promotion,
    growthButton,
    effects,
    changes,
  };
})();
