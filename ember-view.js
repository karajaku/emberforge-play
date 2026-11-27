"use strict";
const EmberView = (() => {
  const consumed = new Set(),
    arrivals = new Set();
  let pendingCraft = "",
    pendingLoot = "";
  const remember = (set, id) => {
    set.add(id);
    if (set.size > 32) set.delete(set.values().next().value);
  };
  function art(n, size = 64) {
    const index = Number(n) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= 10) return "";
    return (
      '<span class="ember-art" aria-hidden="true" data-ember="' +
      n +
      '" style="--ember-x:' +
      (index % 5) * 25 +
      "%;--ember-y:" +
      Math.floor(index / 5) * 100 +
      "%;--ember-size:" +
      size +
      'px"></span>'
    );
  }
  function group(drops) {
    const groups = new Map();
    for (const drop of drops || []) {
      if (!Number.isInteger(drop.n) || drop.n < 1 || drop.n > 10 || !(drop.count > 0)) continue;
      if (!groups.has(drop.n))
        groups.set(drop.n, { n: drop.n, count: 0, sources: new Set(), sourceCounts: {} });
      const row = groups.get(drop.n);
      row.count += drop.count;
      row.sources.add(drop.source);
      row.sourceCounts[drop.source] = (row.sourceCounts[drop.source] || 0) + drop.count;
    }
    return [...groups.values()];
  }
  function loot(receipt, detailed = false) {
    const drops = group(receipt.result?.emberDrops);
    if (!drops.length) return "";
    return (
      '<section class="ember-loot' +
      (detailed ? " ember-loot-history" : "") +
      '"' +
      (!detailed ? ' data-ember-receipt="' + escapeHtml(receipt.chest.id) + '"' : "") +
      ' aria-label="획득한 불씨"><strong class="ember-loot-title">불씨 획득</strong><div class="ember-loot-items">' +
      drops
        .map(
          (drop) =>
            '<button type="button" class="ember-loot-item" data-open="affix:list|' +
            drop.n +
            '" aria-label="' +
            escapeHtml(Game.affixes.currency[drop.n - 1]) +
            " " +
            fmt(drop.count) +
            '개 획득 · 세공할 장비 선택">' +
            art(drop.n, detailed || drops.length > 1 ? 64 : 96) +
            "<span><b>" +
            escapeHtml(Game.affixes.currency[drop.n - 1]) +
            "</b><strong>×" +
            fmt(drop.count) +
            "</strong>" +
            (detailed
              ? "<small>" +
                [...drop.sources]
                  .map(
                    (source) =>
                      (source === "milestone" ? "첫 토벌 지급 " : "사냥 발견 ") +
                      fmt(drop.sourceCounts[source]) +
                      "개",
                  )
                  .join(" · ") +
                "</small>"
              : "") +
            "</span></button>",
        )
        .join("") +
      "</div></section>"
    );
  }
  function observe(s, result) {
    if (!result?.ok || !result.emberDrops?.length || !result.receiptId) return;
    pendingLoot = result.receiptId;
  }
  function consume(result) {
    if (result.operationId) pendingCraft = result.operationId;
  }
  function afterRender() {
    const result = document.querySelector("#emberStage:not([hidden]) [data-ember-operation]");
    if (result && result.dataset.emberOperation === pendingCraft && !consumed.has(pendingCraft)) {
      remember(consumed, pendingCraft);
      pendingCraft = "";
      if (motionEnabled()) {
        const from = result.querySelector(".ember-supply")?.getBoundingClientRect();
        const target = result.querySelector(".ember-scene-gear > *")?.getBoundingClientRect();
        if (from && target) {
          result.style.setProperty("--ember-dx", target.x + target.width / 2 - from.x - from.width / 2 + "px");
          result.style.setProperty(
            "--ember-dy",
            target.y + target.height / 2 - from.y - from.height / 2 + "px",
          );
        }
        result.classList.add("ember-craft-live");
      }
    }
    const loot = document.querySelector("#screen [data-ember-receipt]");
    if (loot && loot.dataset.emberReceipt === pendingLoot && !arrivals.has(pendingLoot)) {
      remember(arrivals, pendingLoot);
      pendingLoot = "";
      if (motionEnabled()) loot.classList.add("ember-arrival");
    }
  }
  return { art, loot, observe, consume, afterRender, group };
})();
