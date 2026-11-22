"use strict";

function healthAmount(n) {
  if (n < 1000000) return fmt(n);
  const unit = n >= 100000000 ? 100000000 : 10000;
  return (Math.floor(n / unit * 10) / 10).toLocaleString("ko-KR") + (unit === 10000 ? "만" : "억");
}
function healthMeter(side, name, hp, max, level = "", item = null) {
  const scale = "scaleX(" + hp / max + ")";
  const label = escapeHtml(level ? name + " " + level : name);
  const title = item ? GearGradeView.colored(item,name) : escapeHtml(name);
  const identity = level
    ? '<span class="hp-identity" title="' + label + '"><span class="hp-title">' + title +
      '</span> <span class="hp-level">' + escapeHtml(level) + '</span></span>'
    : label;
  return '<div class="hp-meter" data-side="' + side + '" role="meter" aria-label="' + label +
    (item ? " · " + Game.blades.itemRarity(item).name : "") + ' HP" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + hp + '">' +
    '<div class="hp-name">' + icon(side === "player" ? "shield" : "sword") + identity +
    '<b class="hp-loss" aria-hidden="true"></b></div>' +
    '<div class="hp-track"><i class="hp-trail" style="transform:' + scale + '"></i>' +
    '<i class="hp-fill" style="transform:' + scale + '"></i></div>' +
    '<div class="hp-count"><small>HP</small> <strong>' + healthAmount(hp) + '</strong> / ' + healthAmount(max) + '</div></div>';
}

function combatHud(hp, max, enemyHp, enemyMax, enemy) {
  return '<div class="combat-hud">' + healthMeter("player", "나", hp, max) +
    healthMeter("enemy", enemy, enemyHp, enemyMax) + '</div>';
}

// A hunt rerenders its scene after each input. Start its trail at the HP immediately before that hit.
function updateHealthMeter(meter, hp, before, motion) {
  const max = Number(meter.getAttribute("aria-valuemax"));
  meter.setAttribute("aria-valuenow", hp);
  meter.querySelector(".hp-count strong").textContent = healthAmount(hp);
  const fill = meter.querySelector(".hp-fill"), trail = meter.querySelector(".hp-trail");
  const end = "scaleX(" + hp / max + ")";
  fill.style.transform = trail.style.transform = end;
  const lost = before - hp;
  if (lost <= 0) return;
  const badge = meter.querySelector(".hp-loss");
  badge.textContent = "−" + healthAmount(lost);
  if (!motion) return;
  const start = "scaleX(" + before / max + ")";
  for (const node of [fill, trail, badge]) for (const animation of node.getAnimations()) animation.cancel();
  fill.animate([{ transform: start }, { transform: end }], { duration: 140, easing: "ease-out" });
  trail.animate([{ transform: start, offset: 0 }, { transform: start, offset: 0.35 }, { transform: end }],
    { duration: 640, easing: "ease-out" });
  badge.animate([{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }],
    { duration: 960, fill: "forwards" });
}

function showHuntDamage(hud, hit, motion) {
  if (!hud) return;
  for (const [side, lost] of [["player", hit.taken], ["enemy", hit.damage]]) {
    if (!lost) continue;
    const meter = hud.querySelector('[data-side="' + side + '"]');
    const hp = Number(meter.getAttribute("aria-valuenow"));
    updateHealthMeter(meter, hp, hp + lost, motion);
  }
}

function drawTowerBattle(fight, now, motion) {
  const hud = document.querySelector("#modalBody .combat-hud");
  if (!hud) return;
  // The player attacks first. A winning final hit ends the turn before the enemy can reply.
  const hits = fight.turns * 2 - (fight.win ? 1 : 0);
  const interval = Math.min(460, 3600 / hits);
  const elapsed = now - fight.start - 180;
  const step = motion ? Math.max(0, Math.min(hits, Math.floor(elapsed / interval))) : hits;
  const finished = !motion || elapsed >= hits * interval + 450;
  if (Number(hud.dataset.step ?? -1) === step && hud.dataset.finished === String(finished)) return;
  hud.dataset.step = step;
  hud.dataset.finished = finished;
  const hp = Math.max(0, fight.hp - Math.floor(step / 2) * fight.enemyAtk);
  const enemyHp = Math.max(0, fight.enemyHp - Math.ceil(step / 2) * fight.attack);
  for (const [side, value] of [["player", hp], ["enemy", enemyHp]]) {
    const meter = hud.querySelector('[data-side="' + side + '"]');
    const before = Number(meter.getAttribute("aria-valuenow"));
    if (value !== before) updateHealthMeter(meter, value, before, motion);
  }
  if (step && motion && !finished) Impacts.play(document.querySelector("#modalBody .modal-scene"), step % 2 ? "slash" : "block");
  el("battleText").textContent = finished ? fight.message : step ?
    Math.ceil(step / 2) + (fight.tr ? " / 20턴 · " : "턴 · ") + (step % 2 ? "내 공격" : "적의 반격") : "전투 준비";
  el("battleEnd").hidden = !finished;
}
