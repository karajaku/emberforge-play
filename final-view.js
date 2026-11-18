"use strict";
function finalWorkshop(s) {
  const w = s.weapon,
    f = w.finalTrial;
  if (w.level !== 19) return ["마지막 돌파", desc("+19 검을 장착하세요.")];
  if (!f) {
    const choices = Breakthrough.choices(w, Game.price)
      .map((o) => {
        const m = Breakthrough.methods[o.key],
          trait = Swordcraft.traits[o.key];
        const rule = Breakthrough.rules(o.count);
        const advantage =
          o.key === "edge"
            ? "깊게 베기 판정 폭 " + Math.round(rule.core * 200) + "%"
            : o.key === "ward"
              ? "압력 한계 " + rule.limit
              : "필요 납품량 " + rule.goal + "점";
        return (
          '<section class="final-option"><h3>' +
          icon(trait.icon) +
          m.name +
          "</h3>" +
          desc(trait.name + " ×" + o.count + " · " + advantage) +
          desc(m.description) +
          btn(
            "finalStart",
            o.fee ? "도전 · " + fmt(o.fee) + " G" : "재료 배합하기",
            o.key,
            "action",
            s.gold < o.fee,
          ) +
          "</section>"
        );
      })
      .join("");
    return [
      "+20 돌파 방식 선택",
      desc(
        "검에 새긴 특성으로 도전합니다. 가호·보강·호위는 적용되지 않으며, 실패 결과는 방식마다 다릅니다.",
      ) + choices,
    ];
  }
  const title = Breakthrough.methods[f.key].name;
  const button = (action, label, style = "action", disabled = false) =>
    btn("finalMove", label, [f.key, f.id || 0, f.revision, action].join(":"), style, disabled);
  const scene =
    '<div class="modal-scene final-scene"><canvas width="128" height="144" data-sprite="blade3"></canvas></div>';
  let controls = "";
  if (f.key === "edge") {
    const band = Breakthrough.cutWindow(f);
    const zone = (cls, r) =>
      '<span class="' +
      cls +
      '" style="left:' +
      (band.center - r) * 100 +
      "%;width:" +
      r * 200 +
      '%"></span>';
    controls =
      metrics(gaugeMetric("봉인 피해", f.score, 4, "gold"), metric("남은 베기", 3 - f.turn + "회")) +
      desc("초록 범위에서 짧게 베면 1점, 금빛 중심에서 깊게 베면 2점입니다.") +
      '<div class="tempo">' +
      zone("target", band.wide) +
      zone("target final-core", band.core) +
      '<i id="finalNeedle"></i></div>' +
      '<div class="actions">' +
      button("quick", "짧게 베기 · 1점") +
      button("deep", "깊게 베기 · 2점") +
      "</div>" +
      (f.score === 3 ? desc("봉인이 1점 남았습니다. 짧게 베기도 명중하면 완성됩니다.") : "");
  } else if (f.key === "ward") {
    const hard = Breakthrough.press(f, true),
      cool = Breakthrough.press(f, false);
    controls =
      metrics(gaugeMetric("압력", f.pressure, hard.limit, "red"), gaugeMetric("결속", f.score, 6, "mint")) +
      line("남은 망치질", 4 - f.turn + "회") +
      line("이번 타격에 더해질 압력", "+" + hard.pulse) +
      desc(
        "강타는 결속 2점, 풀림질은 1점입니다. 압력이 한계에 닿을 때 풀림질하면 1만큼 더 식힙니다. 타격 뒤 한계를 넘으면 실패합니다.",
      ) +
      '<div class="actions">' +
      button("press", "강타 · 압력 " + hard.pressure) +
      button("vent", "풀림질 · 압력 " + cool.pressure) +
      "</div>";
  } else {
    const bill = Breakthrough.invoice(w, Game.price),
      c = bill.costs;
    controls =
      metrics(
        gaugeMetric("납품량", bill.points, bill.goal, "gold"),
        gaugeMetric("채운 칸", f.loads.length, 3, "mint"),
      ) +
      desc(
        "재료를 고른 뒤 한 번에 지불합니다. 금고의 골드와 미수령 배치 수익은 따로 계산합니다.",
      ) +
      line("배합", f.loads.map((k) => Breakthrough.materials[k].name).join(" · ") || "빈 칸") +
      Object.entries(Breakthrough.materials)
        .map(([k, m]) =>
          button(
            k,
            m.name +
              " +" +
              m.points +
              "점 · " +
              (k === "shards" ? "파편 1개" : fmt(bill.unit) + " G"),
            "action",
            f.loads.length >= 3,
          ),
        )
        .join("") +
      line("필요 / 보유 골드", fmt(c.gold) + " / " + fmt(s.gold) + " G") +
      line("필요 / 보유 파편", c.shards + " / " + s.shards + "개") +
      line(
        "필요 / 배치 수익",
        fmt(c.unclaimed) + " / <span data-field-balance>" + fmt(s.unclaimed) + "</span> G",
      ) +
      button("undo", "마지막 재료 빼기", "mini", !f.loads.length) +
      button("deliver", "납품하고 +20 완성", "primary", !Breakthrough.canDeliver(s, bill));
  }
  return [
    title,
    scene +
      '<div class="craft-body">' +
      controls +
      (f.note ? desc(f.note) : "") +
      desc("창을 닫으면 진행이 저장됩니다.") +
      button(
        "surrender",
        f.key === "edge"
          ? "시험 포기 · +18로 하락"
          : f.key === "ward"
            ? "제련 포기 · 비용 소모"
            : "배합 취소",
        "mini",
      ) +
      "</div>",
  ];
}
