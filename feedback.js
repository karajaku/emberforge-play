"use strict";
const Feedback = (() => {
  const strikeMs = 180, chestMs = 360;
  let node, timer;
  function clear() { clearTimeout(timer); node?.remove(); node = null; }
  // Resolve the applied result, including protection, rather than the generic win/loss tone.
  function forgeOutcome(before, after, destroyed, kind) {
    if (destroyed) return "destroy";
    if (after > before) return "success";
    if (after < before) return "drop";
    return kind === "win" ? "success" : "hold";
  }
  function play(kind, host, label = "", outcome = "win") {
    clear();
    const bounds = document.body.getBoundingClientRect();
    const rect = host?.getBoundingClientRect();
    const visible = rect && rect.bottom > 100 && rect.top < innerHeight - 100;
    const x = visible ? rect.left + rect.width / 2 : bounds.left + bounds.width / 2;
    const y = visible ? rect.top + rect.height / 2 : innerHeight * .36;
    node = document.createElement("div");
    node.className = "feedback feedback-" + kind;
    node.dataset.outcome = outcome;
    node.setAttribute("aria-hidden", "true");
    node.style.left = Math.max(bounds.left + 120, Math.min(bounds.right - 120, x)) + "px";
    node.style.top = Math.max(105, Math.min(innerHeight - 130, y)) + "px";
    node.style.setProperty("--hit-delay", (kind === "forge" ? strikeMs : kind === "chest" ? chestMs : 0) + "ms");
    if (kind === "forge") node.innerHTML = '<i class="forge-hammer"><i></i></i><i class="forge-anvil"></i>';
    const ring = document.createElement("i");
    ring.className = "feedback-ring";
    node.append(ring);
    const coins = kind === "chest" || kind === "coins";
    const count = kind === "chest" ? 26 : kind === "forge" ?
      ({ success: 18, hold: 6, drop: 10, destroy: 24 }[outcome] || 14) : 16;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("i");
      bit.className = coins ? "feedback-coin" : "feedback-spark";
      const angle = (i / count) * Math.PI * 2;
      const radius = 48 + (i % 5) * 17;
      bit.style.setProperty("--x", Math.cos(angle) * radius + "px");
      bit.style.setProperty("--y", -40 + Math.sin(angle) * radius * .75 + "px");
      bit.style.setProperty("--fall", 65 + (i % 4) * 18 + "px");
      bit.style.setProperty("--spin", (i % 2 ? 540 : -540) + "deg");
      bit.style.setProperty("--delay", (i % 4) * 18 + "ms");
      node.append(bit);
    }
    if (label) { const text = document.createElement("b"); text.textContent = label; node.append(text); }
    document.body.append(node);
    timer = setTimeout(clear, 1550);
  }
  return { play, clear, forgeOutcome, strikeMs, chestMs };
})();
