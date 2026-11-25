/* Screen text of forest attack events. Pure functions shared by the hunt scene, the weapon screens and
   the tests: nothing here reads the page or the save (docs/attack-speed-as1-1-handover.md §7.3–§7.5, R12). */
const HuntStrikes = (() => {
  const fmt = n => Math.floor(n).toLocaleString("ko-KR");
  // Same abbreviations as the health readout (web/combat-hud.js) and the damage number this replaces.
  function amount(n) {
    if (n < 1000000) return fmt(n);
    const unit = n >= 100000000 ? 100000000 : 10000;
    return (Math.floor(n / unit * 10) / 10).toLocaleString("ko-KR") + (unit === 10000 ? "만" : "억");
  }
  function damageLabel(damage, bleedOnly = false) {
    const limit = bleedOnly ? 10000 : 100000;
    if (damage >= 1000000 && damage < 100000000) return "−" + fmt(damage / 10000) + "만";
    if (damage >= limit && damage < 1000000) return "−" + (Math.floor(damage / 1000) / 10).toLocaleString("ko-KR") + "만";
    return "−" + amount(damage);
  }

  // One event's result at the side that was hit (§7.3). `tag` stands before a number, `word` stands alone.
  // `say` is the accessible name and always keeps the verdict, also when the screen shows only the bleed (M9).
  // context: { elite, skillName (the enemy skill of this event), moveName (the player's skill of this event) }
  function result(event, context = {}) {
    if (!event || (event.actor !== "player" && event.actor !== "enemy")) return null;
    const outcome = event.check?.outcome;
    const make = (side, parts) => ({ side, tag: "", word: "", amount: 0, bleedOnly: false, critical: false, tone: "",
      ...parts, text: (parts.tag ? parts.tag + " " : "") + (parts.word || damageLabel(parts.amount || 0, !!parts.bleedOnly)) });
    if (event.actor === "player") {
      const who = "내 " + (context.moveName || "공격"), damage = event.damage || 0;
      // A defensive face of the old D6 fights: no attack was made, only the bleeding ticked.
      if (outcome === "guard") return make("enemy", { tag: "출혈", amount: damage, bleedOnly: true, say: "내 방어 태세, 출혈 피해 " + fmt(damage) });
      if (outcome === "miss" || outcome === "blocked") {
        const verdict = outcome === "miss" ? "빗나감" : "막힘";
        if (damage > 0 && outcome === "blocked" && event.partial)
          return make("enemy", { tag: "막힘", amount: damage, tone: "blocked", say: who + " 막힘, 피해 " + fmt(damage) });
        if (damage > 0)
          return make("enemy", { tag: "출혈", amount: damage, bleedOnly: true, tone: outcome, say: who + " " + verdict + ", 출혈 피해 " + fmt(damage) });
        return make("enemy", { word: verdict, tone: outcome, say: who + " " + verdict });
      }
      if (outcome === "critical") return make("enemy", { tag: "치명", amount: damage, critical: true, say: who + " 치명, 피해 " + fmt(damage) });
      return make("enemy", { amount: damage, say: who + " 명중, 피해 " + fmt(damage) });
    }
    const who = "적 " + (context.skillName || "공격"), taken = event.taken || 0;
    if (outcome === "miss") return make("player", { word: "빗나감", tone: "miss", say: who + " 빗나감" });
    if (outcome === "blocked") {
      if (taken > 0) return make("player", { tag: "방어", amount: taken, tone: "blocked", say: who + " 방어, 피해 " + fmt(taken) });
      if (context.skillName && context.elite)
        return make("player", { word: context.skillName + " 막아냄", tone: "blocked", guardedSkill: true, say: "적 " + context.skillName + " 막아냄" });
      return make("player", { word: "방어", tone: "blocked", say: who + " 방어" });
    }
    if (outcome === "critical") return make("player", { tag: "치명", amount: taken, critical: true, say: who + " 치명, 피해 " + fmt(taken) });
    return make("player", { amount: taken, say: who + " 명중, 피해 " + fmt(taken) });
  }

  // One saved turn of an older fight as its two events: the own attack, then the enemy's reply one second
  // later (§7.1). Nothing is rolled or changed; the turn's numbers are only told apart.
  // context: { passesBlocks (the old mace trait), enemyDown (the enemy fell on this turn) }
  const turnMs = 2000, replyMs = 1000;
  function fromRoll(roll, context = {}) {
    if (!roll) return [];
    const events = [];
    if (roll.attackCheck) { // d20 turn (blade-d20-v1)
      const outcome = roll.attackCheck.outcome, damage = roll.damage || 0;
      events.push({ actor: "player", at: 0, move: roll.skill || "strike", check: { roll: roll.playerFace, ...roll.attackCheck },
        damage, bleed: 0, partial: outcome === "blocked" && damage > 0 && !!context.passesBlocks,
        critical: outcome === "critical", taken: 0, guarded: false });
      if (roll.replyCheck) {
        const reply = roll.replyCheck.outcome;
        events.push({ actor: "enemy", at: replyMs, move: roll.enemySkill || "attack", check: { roll: roll.enemyFace, ...roll.replyCheck },
          damage: 0, bleed: 0, partial: false, critical: reply === "critical", taken: roll.taken || 0, guarded: reply === "blocked" });
      } else if (roll.enemySkill === "escape") events.push({ actor: "escape", at: replyMs });
      return events;
    }
    // D6 turn (dice-v1, the journey and the first blade fights): each side rolled attack, defense or heavy.
    const damage = roll.damage || 0, taken = roll.taken || 0, guards = roll.player === "block", enemyGuards = roll.enemy === "block";
    if (!guards || damage > 0)
      events.push({ actor: "player", at: 0, move: guards ? "block" : roll.skill || (roll.player === "heavyStrike" ? "heavy" : "strike"),
        check: { roll: roll.playerFace, outcome: guards ? "guard" : enemyGuards ? "blocked" : roll.critical ? "critical" : "hit" },
        damage, bleed: guards ? damage : 0, partial: !guards && enemyGuards && damage > 0, critical: !guards && !enemyGuards && !!roll.critical,
        taken: 0, guarded: false });
    if (roll.enemySkill === "escape") events.push({ actor: "escape", at: replyMs });
    else if (!context.enemyDown && !enemyGuards)
      events.push({ actor: "enemy", at: replyMs, move: roll.enemySkill || (roll.enemy === "heavyStrike" ? "heavy" : "attack"),
        check: { roll: roll.enemyFace, outcome: guards ? "blocked" : "hit" }, damage: 0, bleed: 0, partial: false, critical: false,
        taken, guarded: guards });
    return events;
  }

  // Seconds of an attack interval: two decimals, trailing zeros dropped (§7.5): 2초, 1.5초, 1.39초.
  const seconds = ms => String(Math.round(ms / 10) / 100);
  const interval = ms => seconds(ms) + "초";
  // The comparison row's change against the worn weapon, without a good or bad colour.
  function intervalChange(ms, wornMs) {
    const diff = Math.round(ms / 10) - Math.round(wornMs / 10);
    return diff ? " (" + (diff < 0 ? "−" : "+") + String(Math.abs(diff) / 100) + "초)" : "";
  }
  // A result's rule time in tenths of a second, a trailing zero dropped (§3): 13초, 18.5초, 12,038 ms → 12초.
  const duration = ms => String(Math.round(ms / 100) / 10) + "초";
  // The wait until the own attack a skill fires on (§2.6): whole seconds, rounded up, never below one.
  const wait = (fireAt, clock) => Math.max(1, Math.ceil((fireAt - clock) / 1000)) + "초 뒤";
  // The enemy skill is counted in the enemy's own attacks.
  const forecast = attacks => attacks <= 1 ? "다음 공격" : attacks + "번 뒤";
  const goblinEscape = clock => clock >= 3000 ? "곧 도주" : "4초에 도주";

  // One hit of a weapon (§7.5): the item's two-second numbers times the kind's hit scale.
  const hitRange = (min, max, scale = 1) => [Math.round(min * scale), Math.round(max * scale)];
  // One hit of each move for the comparison rows: a skill adds the same amount over an ordinary strike for
  // every kind, so only the ordinary strike inside it is scaled. Values are not rounded here (U5).
  function hitValues(build, scale = 1) {
    const extra = (scale - 1) * build.strike;
    return { strike: build.strike * scale, heavy: build.heavy + extra, counter: build.counter + extra,
      rupture: build.attack + 3 * build.rupture + extra };
  }

  return { amount, damageLabel, result, fromRoll, turnMs, replyMs, seconds, interval, intervalChange, duration, wait, forecast,
    goblinEscape, hitRange, hitValues };
})();
if (typeof module !== "undefined") module.exports = HuntStrikes;
