"use strict";
const Impacts = (() => {
  // Rows in the Aseprite atlas, each with eight 75 ms frames.
  const rows = ["slash", "counter", "block", "parry", "forge", "fracture"];
  let mounted = [],
    timer;
  function clear() {
    clearTimeout(timer);
    for (const node of mounted) node.remove();
    mounted = [];
  }
  function play(host, kind, label = "", finalBoar = false) {
    clear();
    if (!host || !rows.includes(kind)) return;
    if (finalBoar && !host.querySelector("[data-sprite=boar]")) {
      const boar = document.createElement("canvas");
      boar.dataset.sprite = "boar";
      boar.width = boar.height = 144;
      boar.setAttribute("aria-hidden", "true");
      host.prepend(boar);
      mounted.push(boar);
    }
    const burst = document.createElement("div");
    burst.className = "impact";
    burst.dataset.impact = kind;
    burst.setAttribute("aria-hidden", "true");
    burst.style.setProperty("--atlas-row", rows.indexOf(kind) * 20 + "%");
    const art = document.createElement("i");
    burst.append(art);
    if (label) {
      const number = document.createElement("b");
      number.textContent = label;
      burst.append(number);
    }
    host.append(burst);
    mounted.push(burst);
    const rect = burst.getBoundingClientRect();
    if (rect.top + rect.height * 0.55 < 0 || rect.top + rect.height * 0.45 > innerHeight) {
      const closeup = burst.cloneNode(true);
      closeup.classList.add("impact-closeup");
      document.body.append(closeup);
      mounted.push(closeup);
    }
    timer = setTimeout(clear, 600);
  }
  return { play, clear };
})();
