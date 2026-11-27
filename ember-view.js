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
  function equipment(item) {
    return item.kind && item.kind !== "weapon" && item.kind !== "armor"
      ? OutfitView.art(item.kind)
      : BladeView.artwork(item);
  }
  function scene(item, n, result = null) {
    const outcome = result?.outcome || (result && !result.item ? "destroyed" : "");
    const source = item || result?.before;
    if (!source) return "";
    const p = (source.mods || []).filter((m) => Game.affixes.sideOf(m) === "P").length;
    return (
      '<figure class="ember-workbench' +
      (result ? " ember-workbench-result" : "") +
      '" data-ember-outcome="' +
      escapeHtml(outcome) +
      '"' +
      (result?.operationId ? ' data-ember-operation="' + escapeHtml(result.operationId) + '"' : "") +
      '><div class="ember-target">' +
      equipment(source) +
      "</div>" +
      (n ? '<div class="ember-supply">' + art(n) + "</div>" : "") +
      "<figcaption>" +
      (result
        ? outcome === "destroyed"
          ? "장비 영구 소실"
          : outcome === "corrupted"
            ? "타락 확정 · 옵션 변경 잠김"
            : "세공 완료"
        : n
          ? escapeHtml(Game.affixes.currency[n - 1])
          : "세공할 불씨를 고르세요") +
      '</figcaption><span class="ember-slot-count">접두 ' +
      p +
      "/3 · 접미 " +
      ((source.mods?.length || 0) - p) +
      "/3</span></figure>"
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
    const result = document.querySelector("#shade:not([hidden]) [data-ember-operation]");
    if (result && result.dataset.emberOperation === pendingCraft && !consumed.has(pendingCraft)) {
      remember(consumed, pendingCraft);
      pendingCraft = "";
      if (motionEnabled()) result.classList.add("ember-craft-live");
    }
    const loot = document.querySelector("#screen [data-ember-receipt]");
    if (loot && loot.dataset.emberReceipt === pendingLoot && !arrivals.has(pendingLoot)) {
      remember(arrivals, pendingLoot);
      pendingLoot = "";
      if (motionEnabled()) loot.classList.add("ember-arrival");
    }
  }
  return { art, scene, loot, observe, consume, afterRender, group };
})();
