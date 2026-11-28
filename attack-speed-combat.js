/* Forest blade combat on a rule clock, one attack event per call (docs/attack-speed-design.md §6,
   docs/attack-speed-as1-1-handover.md §2). New forest hunts run on it (`blade-as-v1`, diceVersion 3);
   the tower, the guild target and hunts started on the turn rules keep web/dice-combat.js. */
const AttackSpeedCombat = (() => {
  const af=typeof module!=="undefined"?require("./affix-combat.js"):AffixCombat;
  const node = typeof module !== "undefined";
  const dice = node ? require("./dice-combat.js") : DiceCombat;
  const trail = node ? require("./hunt-trail.js") : HuntTrail;
  const outfit = node ? require("./regional-gear.js") : RegionalGear;

  const id = "blade-as-v1", diceVersion = 3;
  const baseInterval = 2000;
  const kinds = Object.freeze({ dagger: 1500, sword: 2000, axe: 2400, mace: 2600 });
  const enemyInterval = 2000;
  const hasteCap = 25, minInterval = 1000;
  const encounterLimit = 80000, goblinEscape = 4000;
  // One shipped turn is 2,000 ms: heavy strike 3 turns (2 on the suffix proc, +1 ascended), counter 2 turns.
  const cooldown = Object.freeze({ heavyStrike: 6000, heavyStrikeShort: 4000, ascended: 2000, counter: 4000 });
  const rootBind = Object.freeze({ delay: 2000, min: 3000, max: 7000 });
  // The rules of design revision 3. skillHitScale "strike": a skill scales only the ordinary strike it takes the
  // place of. beatCorrection "nearer": a skill may come up to half a beat early (§6.4).
  // The other values stay for comparison runs: skillHitScale true (the whole skill, revision 1's V0) or false
  // (none, V1); beatCorrection "remainder" (revision 1, also `true`) or false.
  const defaults = Object.freeze({ skillHitScale: "strike", beatCorrection: "nearer" });

  const face20 = rng => Math.max(1, Math.min(20, 1 + Math.floor(rng() * 20)));
  function attackCheck(roll, defense, base, bonus = 0) {
    const target = base + defense;
    const outcome = roll === 1 ? "miss" : roll === 20 ? "critical" : roll + bonus >= target ? "hit" : "blocked";
    return { roll, defense, target, bonus, outcome };
  }
  const hits = check => check.outcome === "hit" || check.outcome === "critical";
  const remainder = (value, step) => ((value % step) + step) % step;

  // Interval and hit scale of a weapon kind with an attack-speed percentage (§6.6).
  // The hit scale follows the kind's base interval only, so the suffix raises ordinary damage per second.
  function timing(weaponKind = "sword", haste = 0) {
    const base = kinds[weaponKind];
    if (!base) throw Error("Unknown weapon kind");
    const percent = Math.max(0, Math.min(hasteCap, Number(haste) || 0));
    return { interval: Math.max(minInterval, Math.round(base * 100 / (100 + percent))), hitScale: base / baseInterval };
  }
  // The game binds the kind's hit scale with the other combat numbers (blade-rules), and the base interval
  // is that scale's: a running encounter keeps the kind values it started with even when the kind table of
  // a later build differs (hand-over §2.9). Without a bound scale the table above decides.
  const bound = h => {
    const scale = h.bladeCombat.hitScale;
    if (scale === undefined) return timing(h.blade?.weaponKind, h.bladeCombat.mods?.haste);
    const percent = Math.max(0, Math.min(hasteCap, Number(h.bladeCombat.mods?.haste) || 0));
    return { interval: Math.max(minInterval, Math.round(scale * baseInterval * 100 / (100 + percent))), hitScale: scale };
  };

  // Restart the encounter clock. The first own attack lands half an interval in (§6.1).
  function schedule(h, first) {
    h.clock = 0;
    h.events = 0;
    h.playerAt = first;
    h.enemyAt = h.enemyKind === "goblin" ? null : h.enemyInterval;
    h.lastMove = null;
    h.lastAttackAt = null;
    h.lastStrikes = { player: null, enemy: null };
    delete h.ended;
  }
  function scheduledInterval(h, hp = h.hp) {
    const st = h.bladeCombat;
    const lowHaste = st.affix?.applied.SN105;
    if (!lowHaste || hp > h.maxHp / 2) return h.interval;
    const percent = Math.min(hasteCap, (st.mods.haste || 0) + lowHaste);
    return Math.max(minInterval, Math.round((st.hitScale || 1) * baseInterval / (1 + percent / 100)));
  }
  // Put a freshly started forest hunt (HuntTrail.enter already ran for wave 0) on the rule clock.
  function begin(h, bind = bound(h)) {
    h.diceVersion = diceVersion;
    h.interval = bind.interval;
    h.enemyInterval = enemyInterval;
    h.bladeCombat = { ...h.bladeCombat, hitScale: bind.hitScale };
    const first = Math.round(scheduledInterval(h) / 2);
    h.skillReady = { heavyStrike: first, counter: first }; // no cooldown: ready at the first attack
    schedule(h, first);
    return h;
  }
  // Gear bound to the hunt changed (§6.6). Before the encounter's first event (a power hold resumed with
  // another weapon) the interval, hit scale and first attack are taken again and the ready times move with
  // the first attack. Later only the interval changes, from the attack after the one already scheduled.
  function rebind(h, bind = bound(h)) {
    if (h.events > 0) {
      // The kind cannot change inside an encounter (§6.6); a bind that says otherwise is a wiring error.
      if (bind.hitScale !== (h.bladeCombat.hitScale ?? 1)) throw Error("A running encounter keeps its weapon kind");
      h.interval = bind.interval;
      return h;
    }
    h.interval = bind.interval;
    h.bladeCombat = { ...h.bladeCombat, hitScale: bind.hitScale };
    const first = Math.round(scheduledInterval(h) / 2), shift = first - h.playerAt;
    h.skillReady = { heavyStrike: h.skillReady.heavyStrike + shift, counter: h.skillReady.counter + shift };
    h.playerAt = first;
    return h;
  }
  const hasNext = h => h.wave + 1 < trail.lineup(h.territoryRank || h.rank, h.bonusEncounter).length;
  // Next encounter (§6.7): the change counts as one beat of the player's own interval, so a ready time
  // lands on the new clock as if the first attack came one interval after the last one.
  function advance(h) {
    if ((h.ended !== "enemy" && h.ended !== "escape") || !hasNext(h)) throw Error("No encounter follows");
    const interval = scheduledInterval(h);
    const last = h.lastAttackAt, first = Math.round(interval / 2);
    const carry = ready => first + (ready - last - interval);
    trail.enter(h, h.wave + 1);
    h.skillReady = { heavyStrike: carry(h.skillReady.heavyStrike), counter: carry(h.skillReady.counter) };
    schedule(h, first);
    return h;
  }

  // Who acts next. At one instant: own attack, enemy attack, goblin escape, then the encounter limit.
  function upcoming(h) {
    if (h.ended) return null;
    const goblin = h.enemyKind === "goblin";
    const other = goblin ? goblinEscape : h.enemyAt;
    const at = Math.min(h.playerAt, other);
    if (at > encounterLimit) return { actor: "limit", at: encounterLimit };
    return { actor: h.playerAt === at ? "player" : goblin ? "escape" : "enemy", at };
  }

  // The own attack on which a skill's wait ends, for the screen (hand-over §2.6): the first scheduled attack
  // the "nearer beat" rule lets the skill fire on. `beats` 0 is the next attack; the skill's other conditions
  // (momentum, a prepared counter) are not looked at here.
  function fireAt(h, key) {
    const ready = h.skillReady[key], half = h.interval / 2;
    const beats = Math.max(0, Math.floor((ready - h.playerAt - half) / h.interval) + 1);
    return { beats, at: h.playerAt + beats * h.interval };
  }

  // Element resistance of the opponent against the worn kit: fixed for the whole encounter.
  const elementalOf = h => outfit.damageProfile(h);

  // The first half of the shipped d20 turn, in the same order and with the same random draws.
  function playerAttack(h, at, rng, rules, elemental = elementalOf(h)) {
    const st = h.bladeCombat, mods = st.mods, ascended = st.ascension === st.style;
    const proc = key => mods[key] > 0 && rng() * 100 < mods[key];
    const roll = face20(rng);
    const ready = { ...h.skillReady };
    let wounds = h.wounds || 0, momentum = h.momentum ?? 1, counter = !!h.counter, ruptured = !!h.ruptured;
    let skill = null, raw;
    const hitScale = st.hitScale ?? 1;
    // The hunt keeps wound marks as an integer. A mark weighs `woundGain` layers (the dagger's 0.75) and a
    // rupture needs `ruptureAt` marks (the dagger's 4, three layers): design §6.3, hand-over §2.7.
    const woundGain = st.woundGain ?? 1, ruptureAt = st.ruptureAt ?? 3;
    const layers = marks => Math.min(4, marks * woundGain);
    // §6.4. "nearer" (revision 2): a skill may come up to half a beat early, and its timetable stays where it
    // was when the wait was for the cooldown; waiting for momentum or a guard is not corrected.
    // "remainder" (revision 1, also `true`): time lost to the beat comes off the next cooldown. false: none.
    const beat = rules.beatCorrection === true ? "remainder" : rules.beatCorrection;
    const prev = h.lastAttackAt == null ? at - h.interval : h.lastAttackAt;
    const usable = key => (beat === "nearer" ? ready[key] - at < h.interval / 2 : ready[key] <= at);
    const rearm = (key, wait) => (beat === "nearer"
      ? (ready[key] - prev >= h.interval / 2 ? ready[key] : at) + wait
      : at + wait - (beat === "remainder" ? remainder(at - ready[key], h.interval) : 0));
    // A kind's own "deep wounds" chance joins the suffix chance in one roll (revision 2, §6.2).
    const woundChance = (mods.wounds || 0) + (st.deepWounds || 0);
    const extraWound = () => woundChance > 0 && rng() * 100 < woundChance;
    if (st.style === "counter" && counter && usable("counter")) {
      skill = "counter";
      raw = st.counter;
      ready.counter = rearm("counter", cooldown.counter);
      counter = false;
    } else if (st.style === "wound" && wounds >= ruptureAt) {
      skill = "rupture";
      raw = st.attack * (1+Math.min(120,st.affix?.live?.PN12||0)/100) + st.rupture * layers(wounds);
      if (ascended && !ruptured) raw *= .75;
    } else if (st.style === "heavy" && momentum >= 2 && usable("heavyStrike")) {
      skill = "heavyStrike";
      raw = st.heavy;
      ready.heavyStrike = rearm("heavyStrike", (proc("cooldown") ? cooldown.heavyStrikeShort : cooldown.heavyStrike) +
        (ascended ? cooldown.ascended : 0));
    } else raw = st.strike;
    const skillBase = skill ? raw : 0;
    if (h.firstHit !== false) raw *= 1 + st.opening / 100;
    if (h.enemyHp <= h.enemyMax * 0.3) raw *= 1 + st.finish / 100;
    if (skill === "heavyStrike") momentum = st.affix?.unique.includes("neck")?1:0;
    // Bleeding is settled for the time since the previous own attack; wounds are those before this attack.
    const elapsed = h.lastAttackAt == null ? h.interval : at - h.lastAttackAt;
    const bleed = st.style === "wound" ? Math.round(layers(h.wounds || 0) * (st.affix?.bleedPower ?? st.rupture) * 0.14 * (elapsed / baseInterval)) : 0;
    const pierces = skill === "rupture" || (ascended && skill === "heavyStrike");
    const check = attackCheck(roll, dice.face(rng), 2, pierces ? 2 : 0);
    const landed = hits(check);
    // A blocked hit passes through for the kind that has the trait (today: the mace's 40%).
    const partial = check.outcome === "blocked" && (st.passesBlocks ?? st.blockedDamagePercent === 40);
    if (!landed && !partial) raw = 0;
    if (landed) {
      if (skill === "rupture") {
        ruptured = true;
        wounds = ascended ? 1 : 0; // an ascended rupture leaves one mark
      } else if (st.style === "wound") wounds = Math.min(ruptureAt + 1, wounds + 1 + Number(extraWound()));
      if (skill !== "heavyStrike") {
        const chance=skill && st.affix ? st.affix.baseMomentum : (mods.momentum||0);
        momentum=Math.min(2,momentum+1+Number(chance>0 && rng()*100<chance));
      }
    }
    let critical = check.outcome === "critical";
    if (raw > 0 && st.minDamage !== undefined) {
      if (st.maxDamage > st.minDamage) {
        const rolled = st.minDamage + Math.min(st.maxDamage - st.minDamage, Math.floor(rng() * (st.maxDamage - st.minDamage + 1)));
        raw *= rolled / st.attack;
      }
      if (check.outcome === "hit") critical = rng() * 100 < af.critChance(h,skill);
    }
    raw *= af.attackFactor(h,skill);
    if (critical) {
      raw *= af.critMultiplier(h);
      if (landed && !skill && st.style==="wound" && st.affix?.live?.SN106 && rng()*100<Math.min(100,st.affix.live.SN106))
        wounds = Math.min(ruptureAt+1,wounds+1);
      check.outcome = "critical";
    }
    const blocked = partial ? (st.blockedDamagePercent ?? 25) / 100 : 1;
    // "strike": a skill adds the same amount over an ordinary strike for every kind (§6.2).
    const mode = rules.skillHitScale;
    const scale = !skill || mode === true || hitScale === 1 ? hitScale :
      mode === "strike" && skillBase > 0 ? (skillBase - st.strike + st.strike * hitScale) / skillBase : 1;
    const hit = af.directHit(raw,blocked*scale,landed,elemental,h.enemyHp);
    const damage = Math.min(h.enemyHp, hit.damage + bleed);
    const defeated = damage >= h.enemyHp;
    let recovery = af.hitRecovery(h,hit,landed);
    if (defeated) {
      let percent = mods.recovery || 0;
      if (st.armorAscension === "vitality") percent += h.hp <= h.maxHp / 2 ? 10 : 4;
      percent=af.cap(percent,af.killRecovery(h),12);
      recovery += h.maxHp * percent / 100;
    }
    const healed = af.heal(h,h.hp,recovery);
    const nextInterval = scheduledInterval(h, h.hp + healed);
    const fortified = !!h.fortified || (skill === "counter" && (!!mods.fortify || (ascended && st.style === "counter")));
    return {
      event: { actor: "player", at, move: skill || "strike", check, damage, bleed, partial, critical, taken: 0, healed,
        guarded: false, defeated: defeated ? "enemy" : null },
      patch: { enemyHp: h.enemyHp - damage, hp: h.hp + healed, wounds, ruptured, momentum, counter,
        ...(st.affix?.unique.includes("helm") || st.affix?.live?.PN103 ? {usedAffixSkill:!!(h.usedAffixSkill || skill)}:{}),
        firstHit: h.firstHit !== false && !landed && !partial, fortified, skillReady: ready,
        lastMove: skill || "strike", lastAttackAt: at, playerAt: at + nextInterval,
        ...(skill === "counter" ? { ripostes: (h.ripostes || 0) + 1 } : {}),
        ...(defeated && h.enemyKind === "goblin" ? { goblinCaught: true } : {}),
        ...(defeated ? { ended: "enemy" } : {}) },
    };
  }

  // The second half of the shipped d20 turn: the enemy's own attack against the player's defense target.
  function enemyAttack(h, at, rng) {
    const st = h.bladeCombat, mods = st.mods, ascended = st.ascension === st.style;
    const state = { ...h.enemySkillState, cooldown: Math.max(0, h.enemySkillState.cooldown - 1) };
    const skill = state.cooldown ? null : state.key;
    if (skill) state.cooldown = state.interval;
    const roll = face20(rng);
    const check = attackCheck(roll, dice.face(rng), dice.replyDefenseBase(st.style, skill));
    const guarded = check.outcome === "blocked", landed = hits(check);
    let momentum = h.momentum ?? 1, counter = !!h.counter;
    const ready = { ...h.skillReady };
    if (guarded) {
      counter = true;
      momentum = Math.min(2, momentum + 1);
    }
    if (landed && skill === "dust") momentum = Math.max(0, momentum - 1);
    // Root prison: two seconds later, but between three and seven seconds from this hit (§6.2).
    if (landed && skill === "bind")
      ready.heavyStrike = at + Math.min(rootBind.max, Math.max(rootBind.min, ready.heavyStrike - at + rootBind.delay));
    const amplified = (skill === "fang" && h.hp <= h.maxHp / 2) || (skill === "breath" && h.lastMove === "heavyStrike");
    const guard = landed ? 1 : guarded && skill === "crush" ? 0.5 * (1 - (st.guardBonus || 0) / 100) : 0;
    const incoming = h.enemyAttack * (skill ? state.power : 1) * (amplified ? 1.5 : 1) * (check.outcome === "critical" ? 1.5 : 1);
    const ironCounter = ascended && st.style === "counter";
    const fortified = !!h.fortified;
    const shield = fortified ? (1 - (mods.fortify || 0) / 100) * (ironCounter ? 0.65 : 1) : 1;
    const skillWard = skill ? (st.skillWard || 0) : 0;
    const lastWard = h.hp <= h.maxHp / 2 ? (st.lastWard || 0) : 0;
    const armorEffect = st.armorAscension;
    const wardFactor = armorEffect === "skillWard" ? (skill ? 0.7 : 1.08) : 1;
    const rating = st.armorRating || 0;
    const reduction = rating > 0 ? Math.min(.5, rating / (rating + 8 * incoming)) : 0;
    let hit = incoming * (1 - reduction) * guard * (1 - st.defense / 100) * shield * (1 - skillWard / 100) * (1 - lastWard / 100) * wardFactor;
    hit=af.incoming(h,skill,incoming,guard,wardFactor,fortified?(1-(st.affix?.baseFortify||0)/100)*(ironCounter?.65:1):1,hit);
    const absorbed = armorEffect === "plating" ? Math.max(0, hit - h.maxHp * 0.15) * 0.5 : 0;
    const taken = Math.min(h.hp, Math.max(0, Math.round(hit - absorbed)));
    let percent = guarded ? mods.guard || 0 : 0;
    if (armorEffect === "bracing" && guarded) percent += 6;
    if (guarded && skill) percent=af.cap(percent,st.affix?.guardHeal||0,8);
    const healed = af.heal(h,h.hp-taken,h.maxHp*percent/100);
    const hp = Math.max(0, h.hp - taken + healed);
    return {
      event: { actor: "enemy", at, move: skill || "attack", check, damage: 0, bleed: 0, partial: false,
        critical: check.outcome === "critical", taken, healed, guarded, amplified, defeated: hp ? null : "player" },
      patch: { hp, momentum, counter, fortified: fortified && !taken, skillReady: ready, enemySkillState: state,
        enemyAt: at + h.enemyInterval, ...(hp ? {} : { ended: "player" }) },
    };
  }

  // Resolve exactly one event and commit it to the hunt. The rule clock never reads the wall clock.
  // `sample` is the combat-power estimate's own call: the same event with the same draws, without the
  // records the screen and the save read (last strikes, forecast), and with the encounter's element
  // multiplier worked out once.
  function step(h, rng = Math.random, rules = defaults, sample = null) {
    const next = upcoming(h);
    if (!next) throw Error("The encounter is over");
    const seconds = Math.floor(next.at / 1000) - Math.floor(h.clock / 1000);
    const regen = af.heal(h,h.hp,seconds * (h.bladeCombat.affix?.live?.SN09 || 0));
    if (regen) h.hp += regen;
    const { event, patch } =
      next.actor === "player" ? playerAttack(h, next.at, rng, rules, sample ? sample.elemental : undefined) :
      next.actor === "enemy" ? enemyAttack(h, next.at, rng) :
      next.actor === "escape" ? { event: { actor: "escape", at: next.at, escaped: true, defeated: null }, patch: { ended: "escape" } } :
      { event: { actor: "limit", at: next.at, defeated: "player" }, patch: { hp: 0, ended: "player" } };
    if (regen) event.healed = (event.healed || 0) + regen;
    Object.assign(h, patch);
    h.clock = next.at;
    h.events++;
    if (sample) {
      h.turn++;
      return event;
    }
    event.seq = h.turn;
    event.wave = h.wave;
    h.turn++;
    if (event.actor === "player" || event.actor === "enemy")
      h.lastStrikes = { ...h.lastStrikes, [event.actor]: { at: event.at, move: event.move, check: event.check,
        damage: event.damage, bleed: event.bleed, partial: event.partial, critical: event.critical,
        taken: event.taken, guarded: event.guarded } };
    event.hp = h.hp;
    event.enemyHp = h.enemyHp;
    event.next = h.ended ? null : { playerAt: h.playerAt, enemyAt: h.enemyAt };
    // The enemy's skill is counted in its own attacks; the player's skills in rule time.
    event.forecast = h.ended ? null : {
      enemySkill: h.enemyAt === null ? null : { key: h.enemySkillState.key, attacks: Math.max(1, h.enemySkillState.cooldown),
        at: h.enemyAt + (Math.max(1, h.enemySkillState.cooldown) - 1) * h.enemyInterval },
      skillReady: { ...h.skillReady },
      escapeAt: h.enemyKind === "goblin" ? goblinEscape : null,
    };
    return event;
  }

  // Combat power on this resolver (design §7, version 2): the shipped sample streams and threshold.
  const powerVersion = 2, samples = 256;
  function sampleRng(index) {
    let seed = (0x6728ba7f + Math.imul(index, 0x9e3779b9)) >>> 0;
    return () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const unavailable = Object.freeze({ unavailable: true, blocked: true });
  let cachedKey, cachedResult;
  function estimate(start, rules = defaults) {
    const { hp, maxHp, enemyHp, enemyMax, enemyAttack } = start;
    if (![hp, maxHp, enemyHp, enemyMax, enemyAttack].every(n => Number.isFinite(n) && n > 0) ||
        start.events !== 0 || start.ended || !start.bladeCombat || !start.enemySkillState) return unavailable;
    const enemy = Math.max(1, Math.round(10 * Math.sqrt(enemyMax * enemyAttack)));
    if (!Number.isSafeInteger(enemy)) return unavailable;
    // The screen asks again on every repaint of the same waiting encounter.
    const key = JSON.stringify([start, rules]);
    if (key === cachedKey) return cachedResult;
    let wins = 0;
    // The samples start from the hunt as its save holds it (the key, read back). A hunt object the game has
    // edited in place (fields deleted at the start, then patched) is several times slower to read.
    const origin = JSON.parse(key)[0];
    const sample = { elemental: elementalOf(origin) }, finite = n => n == null || Number.isFinite(n);
    for (let i = 0; i < samples; i++) {
      const h = { ...origin }, rng = sampleRng(i); // step replaces nested state, it never edits it in place
      while (!h.ended) {
        const event = step(h, rng, rules, sample);
        if (!finite(event.damage) || !finite(event.taken) || !finite(event.healed)) return unavailable;
      }
      wins += Number(h.ended === "enemy");
    }
    const player = Math.floor(enemy * wins * 10 / (samples * 7));
    if (!Number.isSafeInteger(player)) return unavailable;
    cachedKey = key;
    return cachedResult = Object.freeze({ player, enemy, blocked: enemy > player, wins });
  }

  return { id, diceVersion, baseInterval, kinds, enemyInterval, hasteCap, minInterval, encounterLimit, goblinEscape,
    cooldown, rootBind, defaults, timing, bound, begin, rebind, hasNext, advance, upcoming, fireAt, step,
    powerVersion, samples, estimate };
})();
if (typeof module !== "undefined") module.exports = AttackSpeedCombat;
