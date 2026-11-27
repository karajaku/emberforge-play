"use strict";
const AffixView = (() => {
  let receipt = null;
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
    "변화 없음 50% · 옵션 25% · 소켓 25% · 영구 타락",
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
    body += item.corrupted ? '<p class="affix-warning">잠김 · 타락 · 옵션 화폐 불가 · 재련·승급 가능</p>' : "";
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
  const entry = (s, id) => Game.affixList(s).find((x) => x.id === id);
  const link = (id, label = "옵션 제작", cls = "action") =>
    openBtn("affix:item:" + id, icon("anvil") + label, cls);
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
    if (!rows.length) rows.push(desc("옵션 수치 동일"));
    if (!before?.corrupted && after.corrupted) rows.push(desc("타락 확정 · 이후 옵션 변경 불가"));
    if (JSON.stringify(before?.sockets) !== JSON.stringify(after.sockets))
      rows.push(
        line("봉인 소켓", (before?.sockets?.length || 0) + " → " + (after.sockets?.length || 0) + "개"),
      );
    return rows.join("");
  }
  function modal(s, key) {
    if (key === "affix:result") {
      if (!receipt) return ["제작 결과", desc("다시 장비를 선택하세요.") + openBtn("affix:list", "장비 선택")];
      const r = receipt;
      const before = Game.blades.itemRarity(r.before || { mods: [] }).name;
      const after = r.item ? Game.blades.itemRarity(r.item).name : "소실";
      const summary = r.item
        ? before +
          " → " +
          after +
          " · " +
          (r.before?.mods?.length || 0) +
          " → " +
          (r.item.mods?.length || 0) +
          "옵션"
        : "실패 · 장비 영구 소실";
      return [
        "제작 결과",
        '<p class="affix-result" role="status">' +
          escapeHtml(r.message || "제작 완료") +
          "</p>" +
          line("변경", escapeHtml(summary)) +
          changes(r.before, r.item) +
          line("남은 재료", fmt(s.affixWallet?.counts?.[r.n - 1] || 0) + "개") +
          (r.item
            ? options(r.item)
            : '<p class="affix-warning">장비가 사라졌습니다. +0으로 돌아간 상태가 아닙니다.</p>') +
          (r.before
            ? "<details><summary>작업 전 옵션과 비교</summary>" + options(r.before) + "</details>"
            : "") +
          (entry(s, r.id) ? link(r.id, "장비 확인") : openBtn("affix:list", "다른 장비 선택")),
      ];
    }
    if (key === "affix:list")
      return [
        "제작할 장비",
        desc("현재 옵션과 빈자리를 보고 재료를 고르세요.") +
          Game.affixList(s)
            .map((x) =>
              row(
                escapeHtml(x.label),
                (x.item.mods?.length || 0) + "옵션 · " + Game.blades.itemRarity(x.item).name,
                link(x.id, "선택", "mini"),
              ),
            )
            .join(""),
      ];
    const rest = key.slice("affix:item:".length),
      split = rest.lastIndexOf("|"),
      id = split < 0 ? rest : rest.slice(0, split),
      n = split < 0 ? 0 : Number(rest.slice(split + 1));
    const x = entry(s, id);
    if (!x)
      return ["장비 확인", desc("이 장비는 보관 중이 아닙니다.") + openBtn("affix:list", "다른 장비 선택")];
    const identity =
      line("대상 장비", escapeHtml(x.label)) +
      line("현재 등급", Game.blades.itemRarity(x.item).name + " · " + (x.item.mods?.length || 0) + "옵션") +
      line("장비 베이스", Game.blades.baseGradeNames[x.item.grade] || Game.blades.baseGradeNames[0]);
    if (n) {
      const q = Game.affixQuote(s, id, n);
      return [
        Game.affixes.currency[n - 1] + " 사용",
        identity +
          options(x.item) +
          desc(effects[n - 1]) +
          line("소모 / 보유", "1개 / " + fmt(q.count) + "개") +
          (n >= 9
            ? '<p class="affix-warning">' +
              (n === 9
                ? "실패하면 이 장비가 영구히 사라집니다."
                : "성능이 나빠질 수 있습니다. 타락 뒤에는 옵션 화폐·각인·연마·전승으로 바꿀 수 없습니다. 재련·승급은 가능합니다.") +
              "</p>"
            : "") +
          (q.reason ? desc(escapeHtml(q.reason)) : "") +
          action("affixUse", { id, n, token: q.token }, "재료 1개 사용", !!q.reason || q.count < 1) +
          link(id, "취소 · 재료 다시 선택"),
      ];
    }
    const growth = Game.weaponGrowth?.(s, id);
    let body = identity + options(x.item);
    if (id.startsWith("j:")) body += go("forge/craft", "기존 제작 공정", "action");
    if (id.startsWith("j:") || id.startsWith("b"))
      body += action(
        "affixEquip",
        { id, token: Game.affixQuote(s, id, 1).token },
        (
          id.startsWith("j:")
            ? s.affixWallet?.journeyId === id
            : !s.affixWallet?.journeyId && Game.blades.current(s).id === id
        )
          ? "사냥에 착용 중"
          : "사냥에 착용",
        id.startsWith("j:")
          ? s.affixWallet?.journeyId === id
          : !s.affixWallet?.journeyId && Game.blades.current(s).id === id,
      );
    if (Game.affixes?.candidates) {
      const candidates = Game.affixes.candidates({ ...x.item, mods: [] });
      body +=
        '<details class="affix-rules"><summary>옵션 후보·10티어·추첨 확률</summary><p>T1이 가장 낮고 T10이 가장 높습니다. 옵션 종류 → 티어 → 값 순으로 무작위로 결정됩니다. 같은 종류는 중복되지 않고 접두·접미는 각각 3개까지입니다.</p>' +
        candidates
          .map(
            (key) =>
              "<details><summary>" +
              escapeHtml(Game.affixes.defs[key].name) +
              " · " +
              meanings[key] +
              "</summary>" +
              Array.from({ length: 10 }, (_, i) => {
                const [a, b, scale] = Game.affixes.bounds(key, i + 1);
                return line("T" + (i + 1), number(a / scale) + "~" + number(b / scale) + units(key));
              }).join("") +
              "</details>",
          )
          .join("") +
        "<p>최대 티어는 획득 단계 ÷ 6을 올림한 값입니다. 해금된 티어의 가중치는 T1부터 10·9·8·7·6·5·4·3·2·1이며, 각 티어 안 유효 값은 균등합니다. 옵션 선택은 가능한 종류 안에서 균등합니다.</p></details>";
    }
    if (growth) {
      const token = Game.affixQuote(s, id, 1).token;
      body +=
        '<section class="affix-growth"><h4>이 검 재련·승급</h4>' +
        line("재련 단계", "+" + fmt(growth.level)) +
        line("검 승급", growth.grade + "등급 · 옵션 ×" + number(1 + growth.grade / 10)) +
        (growth.canPromote
          ? promotion(s, id, growth)
          : growth.canForge
            ? line("다음 재련", fmt(growth.cost) + " G · 성공 " + pct(growth.success)) +
              desc(
                id.startsWith("j:")
                  ? "기존 재련 성장 적용 · 현재 검의 기록과 공정 유지"
                  : growth.grade >= 3
                    ? "최종 승급 완료 · 최고 단계 기록"
                    : "승급까지 +" +
                      fmt(growth.level) +
                      " / +" +
                      fmt(growth.threshold) +
                      " · 이번 재련의 전투 수치 변화 0",
              ) +
              action("affixForge", { id, token }, "재련 · " + fmt(growth.cost) + " G", s.gold < growth.cost)
            : growth.needsProcess && !id.startsWith("j:")
              ? processes(s, id, x.item)
              : desc("승급 조건과 제작 공정은 장비 상세에서 확인하세요.")) +
        "</section>";
    }
    body +=
      '<h4>사냥 재료 선택</h4><div class="affix-materials">' +
      Game.affixes.currency
        .map((name, i) => {
          const q = Game.affixQuote(s, id, i + 1);
          return (
            '<button class="action affix-material" data-open="affix:item:' +
            escapeHtml(id) +
            "|" +
            (i + 1) +
            '"><b>' +
            escapeHtml(name) +
            " <span>" +
            fmt(q.count) +
            "개</span></b><small>" +
            effects[i] +
            "</small><small>" +
            escapeHtml(q.reason || (q.count < 1 ? "재료 부족" : "사용 가능")) +
            "</small></button>"
          );
        })
        .join("") +
      "</div>" +
      openBtn("affix:list", "다른 장비 선택") +
      "<details><summary>사냥 재료 획득 확률</summary><p>일반 단계 승리 20%, 우두머리 승리 40%로 재료 1개를 얻습니다. 재료가 나왔을 때의 종류 확률입니다.</p>" +
      Game.affixes.currency
        .map((name, i) => line(escapeHtml(name), [22, 17, 8, 6, 25, 6, 1, 8, 1, 6][i] + "%"))
        .join("") +
      "<p>최초 1·2·3·5단계 승리에 첫불씨·겹불씨·금빛 도약석·별금 조각을 각각 한 번 받습니다. 3옵션 매직 장비는 장비 드롭의 9%입니다.</p></details><details><summary>옵션 추첨 안내</summary><p>시스템이 옵션 종류 → 티어 → 티어 안의 값을 순서대로 무작위 결정합니다. T1이 최저, T10이 최고입니다. 일반 0개 · 매직 1~3개 · 레어 4~6개이며 접두와 접미는 각각 최대 3개입니다.</p></details>";
    return ["옵션 제작", body];
  }
  function growthButton(s, id) {
    const g = Game.weaponGrowth(s, id),
      token = Game.affixQuote(s, id, 1).token;
    if (g.canPromote) return openBtn("affix:item:" + id, controlArt("hammer") + "승급", "primary");
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
  function processes(s, id, item) {
    if (Game.blades.current(s).id !== id)
      return desc("기존 제작 공정을 마쳐야 승급할 수 있습니다. 먼저 이 검을 사냥에 착용하세요.");
    return openBtn("bladeCraft", "기존 제작 공정 계속");
  }
  function result(r, arg) {
    receipt = { ...r, id: arg.id, n: arg.n };
  }
  return {
    modal,
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
  };
})();
