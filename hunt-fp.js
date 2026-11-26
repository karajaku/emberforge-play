/* FP1 S2: the forest fight seen in the first person (docs/first-person-view-design.md §9.2, §11.1).
   Presentation only. This module places the one scene's parts: the enemy facing the player in the middle, its
   name plate above it, the own readout at the bottom left, the worn weapon in the right foreground with its grip
   behind the map button, and the hit marker beside the own readout. It never touches the rules, the save or the
   order and time of events. The pictures are the approved first-person outputs (art/generated/first-person). */
const HuntFP = (() => {
  // Canvas 384×512, grip 238,430 (61.98% · 83.98%). TIP: the point of the swing's aim, canvas px.
  const GRIP = {x: 238 / 384, y: 430 / 512};
  // User decision 14: the pictures are the forge's own sheets (first frame, every pixel a 3×3 block; tools/first-person-forge-weapons.lua).
  // Swords: the blade's tip. Dagger and mace: the ink's top-left corner, as before. Axe: the top of its head on the line
  // of its haft (its ink's corner is empty: the head stands upright in the forge's picture).
  const TIP = {blade: [141, 153], blade1: [141, 144], blade2: [162, 138], blade3: [141, 147], 'blade-axe': [162, 145], 'blade-dagger': [124, 189], 'blade-mace': [91, 150]};
  // User decision 13: the weapon at the liked prototype size, stood up clockwise about the grip at rest. The forge's
  // pictures stand more upright than the first set did, so the same rest direction takes a smaller turn (the axe leans a little left).
  const ROT = {blade: 16, blade1: 16, blade2: 16, blade3: 16, 'blade-axe': -2, 'blade-dagger': 12, 'blade-mace': 12};
  // The low scene (320): the axe stands 4° more upright, 4px or more from every boss there.
  const ROT_LOW = {'blade-axe': 2};
  // The forge's axe and mace fill more of their frame: shown a little smaller (the liked prototype did the same with its `weaponScale`).
  const SCALE = {'blade-axe': .8, 'blade-mace': .8};
  // A weapon shown smaller at rest comes to the others' size at the contact, and the short dagger a little past it:
  // each reaches the enemy without lifting its grip from behind the map button.
  const REACH = {'blade-axe': 1 / .8, 'blade-mace': 1 / .8, 'blade-dagger': 1.12};
  // Where across a boss the wide heads aim (the others .72): the forge's axe and mace carry their heads right of the aimed
  // point, so they aim nearer the middle and less of the head leaves the screen at the contact.
  const BOSS_AIM = {'blade-axe': .55, 'blade-mace': .64};
  const ART_W = 352, ART_W_LOW = 176, GRIP_IN = 20, GRIP_IN_LOW = 11;
  // The file names are the first set's: `v` keeps a browser from pairing a cached first-set picture with these numbers.
  const art = key => 'assets/hunt/fp-' + key + '.webp?v=2';
  const WIDE = new Set(['blade-axe', 'blade-mace', 'blade-dagger']);
  // Share of each enemy picture above its ink (alpha 128 and up; a sheet takes its tallest frame), and the boss pictures' proportions.
  const HEAD = {boar: .403, golem: .104, wolf: .301, moth: .164, tree: .086, goblin: .125, tusk: .005, alpha: .004, wyrm: .007, elder: 0};
  // The middle of each picture's ink (mirrored), as shares of its box: where the wide heads aim so that they always land on it.
  const INK = {boar: [.526, .675], golem: [.482, .525], wolf: [.551, .652], moth: [.482, .546], tree: [.472, .55], goblin: [.471, .548], tusk: [.496, .536], alpha: [.491, .539], wyrm: [.491, .551], elder: [.497, .561]};
  const RATIO = {tusk: 200 / 300, alpha: 239 / 300, wyrm: 280 / 282, elder: 280 / 285};
  const TOP_RESERVE = 48;   // the corner buttons of the low scene (44px) and their margin
  let skillRow = 21, coachWidth = 91, corners = null;
  const preloaded = new Map();
  // A failed load is tried once more after a moment before it is reported: a load cut short by the page closing is not a missing picture.
  const reported = new Set();
  const fail = (file, then) => setTimeout(() => { const again = new Image(); again.onload = () => {}; again.onerror = () => { if (!reported.has(file)) { reported.add(file); console.error('[FP1] 숲 1인칭 그림을 불러오지 못했습니다: ' + file + ' · 대체 그림 없이 그립니다'); } then?.(); }; again.src = file; }, 400);
  function preload(file) {
    if (preloaded.has(file)) return preloaded.get(file);
    const image = new Image();
    const entry = {image, failed: false};
    image.addEventListener('error', () => fail(file, () => { entry.failed = true; if (/fp-hurt/.test(file)) document.querySelectorAll('.watch-arena[data-fp]').forEach(a => a.setAttribute('data-fp-hurt-missing', '')); }), {once: true});
    image.src = file;
    preloaded.set(file, entry);
    return entry;
  }
  // §11.5: only the worn weapon is read, before the forest is opened (no empty weapon on the first forest screen).
  function prepare(s) {
    try {
      const item = Game.blades.current(s);
      if (item) preload(art(BladeView.sprite(item, Game.bladeStage({level: item.level, grade: 0}))));
    } catch {}
    preload('assets/hunt/fp-hurt.webp');
  }
  // The width of the two corner buttons of the low scene, whether they are on screen or not: the fixed plate sits between them.
  function cornerWidths(arena) {
    if (corners && corners.w === arena.clientWidth) return corners;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:600px;height:60px';
    probe.innerHTML = '<button class="watch-recent-loot watch-plan-link" tabindex="-1">' + icon('compass') + '사냥 구역</button>' +
      '<button class="watch-recent-loot" tabindex="-1">' + icon('backpack') + '최근 전리품</button>';
    probe.setAttribute('aria-hidden', 'true');
    arena.append(probe);
    const [plan, loot] = [...probe.children].map(n => n.offsetWidth);
    probe.remove();
    return corners = {w: arena.clientWidth, plan, loot};
  }
  const px = v => Math.round(v * 10) / 10 + 'px';
  // Rest geometry of the scene, arena padding-box coordinates. Also kept on the arena for the strike effects.
  // Reads come before writes where they can: each read after a write makes the browser lay the page out again, and this
  // runs on every drawing of the scene, just before a hunt's first strike (H7).
  function layout(arena) {
    if (!arena || !arena.hasAttribute('data-fp')) return null;
    const enemy = arena.querySelector('.watch-fighter.enemy'), actor = enemy?.querySelector('.watch-actor');
    const plate = enemy?.querySelector('.watch-readout'), band = arena.querySelector('.watch-fighter.player > .watch-readout');
    if (!actor || !plate || !band) return null;
    const readout = arena.querySelector('.watch-power-readout');
    if (readout) readout.style.cssText = '';
    // ── reads (one layout) ──
    const W = arena.clientWidth, H = arena.clientHeight, cw = W - 8, ch = H - 2, tight = H < 300;
    const a = arena.getBoundingClientRect();
    const start = document.querySelector('#screen .watch-start')?.getBoundingClientRect();
    const side = document.querySelector('#screen .watch-home-actions > .action:last-child')?.getBoundingClientRect();
    const coach = document.querySelector('#apprentice:not([hidden]) .lesson-locate');
    const c = coach?.getBoundingClientRect();
    if (c?.width) coachWidth = c.width;
    const hand = arena.querySelector('.watch-fighter.player .watch-actor'), key = hand?.dataset.weapon;
    const parent = hand?.offsetParent?.getBoundingClientRect() || a;
    const corner = tight ? cornerWidths(arena) : null;
    const kind = enemy.dataset.fpKind || 'boar', boss = enemy.hasAttribute('data-boss'), head = HEAD[kind] ?? .1;
    const ratio = boss ? RATIO[kind] || 2 / 3 : 1;
    // The own readout: the skill row above the name. Lessons remaining: it ends 6px before the next-goal coach (D29).
    const lessons = document.body.dataset.lesson === 'on' && !!start;
    const bandW = lessons ? Math.floor(start.left + start.width / 2 - coachWidth / 2 - a.left - 6 - 6) : Math.min(cw * .46, 190);
    // ── writes that change the readouts' size ──
    arena.toggleAttribute('data-fp-tight', tight);
    arena.toggleAttribute('data-fp-coach', lessons);
    arena.toggleAttribute('data-fp-side', tight && boss);
    arena.style.setProperty('--fp-band-w', bandW + 'px');
    let plateBox = null;
    if (tight) {
      const left = 4 + corner.plan + 4, right = W - 4 - corner.loot - 4;
      plateBox = {left: (left + right) / 2, width: Math.floor(right - left)};
      arena.style.setProperty('--fp-plate-x', px(plateBox.left)); arena.style.setProperty('--fp-plate-w', plateBox.width + 'px');
    }
    // ── reads (second layout): the readouts' sizes ──
    const skills = band.querySelector('.watch-skills');
    if (skills?.offsetHeight) skillRow = skills.offsetHeight + parseFloat(getComputedStyle(band).rowGap || 0);
    const bandH = band.offsetHeight, bandWidth = band.offsetWidth, fullBand = bandH + (skills?.offsetHeight ? 0 : skillRow);
    const readoutH = readout ? readout.offsetHeight : 0, plateW = plate.offsetWidth;
    // The enemy: the middle of the scene (46% of the content width, from the 4px padding), its feet on the ground. On the low
    // scene it stands at a fixed place right of the middle at the same size in every state of an encounter (D30 ⑦~⑪):
    // 101px, a boss 136px (the elder 4px left, 2px up).
    let foot, w, x;
    if (tight) {
      foot = H - 4 - fullBand - 2;
      w = boss ? 136 : 101; x = 4 + (boss ? kind === 'elder' ? 171 : 175 : 184);
      if (kind === 'elder') foot -= 2;
    } else {
      foot = ch * .68;
      // D31's boss widths (258·266) were measured with the wide tusk picture. A taller boss reaches the weapon's head (the axe
      // stands least upright): a wide one (the alpha) is at most 56% of the scene width tall, one as tall as it is wide (the wyrm,
      // the elder) 66%, so that it still stands larger than an ordinary enemy. All stay above today's size (H4).
      w = boss ? Math.min(cw * .76, (foot - 66) * 1.5, 310, Math.round(258 + (cw - 356) / 3), (ratio < .85 ? .56 : .66) * cw / ratio) : Math.min(cw * .62, (foot - 66) * 1.3, 250);
      // The elder's roots and the alpha's tail spread wide at the bottom right, where the axe rests: they stand 12px and 6px
      // left of the middle (as the elder on the low scene, D30 ⑨), 4px or more from the axe with their drop shadow.
      x = 4 + cw * .46 - (kind === 'elder' ? 12 : kind === 'alpha' ? 6 : 0);
    }
    w = Math.floor(w * 10) / 10;
    const h = w * ratio, foeLeft = x - w / 2, foeTop = foot - h;
    // The power check stopped before the first attack (§9.2 "전투력 비교"): ① no own skill row ② the plate keeps the name.
    // Only on the stopped screen: the comparison shown for a moment as a hunt starts leaves the readouts as they are.
    const compact = !!readout && arena.hasAttribute('data-power-held') && H - 4 - bandH - foot < readoutH + 8;
    // ── writes ──
    const set = (name, value) => arena.style.setProperty(name, value);
    arena.toggleAttribute('data-fp-compact', compact);
    set('--fp-foe-x', px(x)); set('--fp-foot', px(foot)); set('--fp-foe-w', px(w)); set('--fp-foe-h', px(h));
    set('--fp-head', String(head));
    set('--fp-band-h', bandH + 'px');
    set('--fp-zone-left', Math.round(6 + bandWidth + 6) + 'px');
    // The own result on the low scene: up to 6px before the standing enemy (its picture's left tenth is clear), folded at spaces (D34).
    if (tight) set('--fp-mine-max', Math.max(60, Math.floor(foeLeft + w * .1 - 6 - 6)) + 'px');
    // Below the side buttons' middle the weapon is cut off: it never shows again between the buttons and the menu.
    if (side) set('--fp-clip', Math.round(side.top + side.height / 2 - a.bottom) + 'px');
    // The weapon: its grip behind the map button (390·414 20px in from its right edge, 4px below its top; 320 11px, 6px).
    let grip = null;
    if (hand && side) {
      const ww = Math.round((tight ? ART_W_LOW : ART_W) * (SCALE[key] ?? 1)), wh = ww * 512 / 384, rot = (tight ? ROT_LOW[key] : undefined) ?? ROT[key] ?? 16;
      const gx = Math.round(side.right - (tight ? GRIP_IN_LOW : GRIP_IN)), gy = Math.round(side.top + (tight ? 6 : 4));
      hand.style.width = ww + 'px';
      hand.style.left = px(gx - parent.left - GRIP.x * ww);
      hand.style.top = px(gy - parent.top - GRIP.y * wh);
      hand.style.setProperty('--fp-rot', rot + 'deg');
      hand.dataset.grip = gx + ',' + gy;
      grip = {x: gx, y: gy, width: ww, height: wh, rot};
      const art = hand.querySelector('.fp-weapon-art');
      if (art && !art.dataset.watched) {
        art.dataset.watched = '1';
        const broken = () => fail(art.getAttribute('src'), () => art.remove());
        if (art.complete && !art.naturalWidth) broken(); else art.addEventListener('error', broken, {once: true});
      }
    }
    if (preload('assets/hunt/fp-hurt.webp').failed) arena.setAttribute('data-fp-hurt-missing', '');
    // A boss on the low scene: the plate keeps the name, level and health; the forecast (and on a defeat the estimate)
    // moves to the column left of the boss under the plan button (D30 ⑧). Nothing is left out. The plate's own box is
    // known without reading it again: centred over the enemy (320: between the corner buttons), its bottom 2px above the head.
    const plateLeft = tight ? plateBox.left - plateBox.width / 2 : x - plateW / 2;
    set('--fp-side-w', Math.floor(foeLeft - 4 - 4) + 'px');
    const columnW = Math.floor(Math.min(foeLeft, plateLeft) - 4 - 4);
    set('--fp-column-w', columnW + 'px');
    set('--fp-side-dx', px(4 - plateLeft));
    // The power readout (§9.2 "전투력 비교"): on the ground between the enemy's feet and the own readout; on the low scene
    // in the column left of the enemy, its two numbers kept whole (D30 ⑩), over a soft shade with no edge (PD, conditional).
    if (readout) {
      if (tight) Object.assign(readout.style, {left: '8px', top: TOP_RESERVE + 'px', width: columnW + 'px', maxWidth: columnW + 'px'});
      else readout.style.top = px((foot + (H - 2) - bandH - 8) / 2);
    }
    arena.toggleAttribute('data-fp-power-side', !!readout && tight);
    // ── reads (third layout): the plate's height, the left column, the defeat block, the motion control ──
    const plateH = plate.offsetHeight, plateTop = foeTop + h * head - 2 - plateH;
    // The low scene's left column, top to bottom: a boss's forecast, the encounter hint, the power comparison shown for a
    // moment as a hunt starts. Each starts below the one above. An ordinary enemy's forecast line is centred under the plate
    // and may be wider than it (the goblin's `줄행랑 4초에 도주`): when it reaches into the column, the column starts below it.
    let columnTop = TOP_RESERVE, hintTop = TOP_RESERVE;
    const hintNode = tight ? plate.querySelector(':scope > .fp-plate-hint') : null;
    if (tight) {
      let sideH = 0;
      for (const n of plate.children) {
        if (n === hintNode) continue;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (boss && n.matches('.watch-enemy-skill,.watch-estimate')) sideH = Math.max(sideH, r.height);
        else if (r.left - a.left < 4 + columnW + 4 && r.bottom - a.top > TOP_RESERVE) columnTop = Math.max(columnTop, Math.ceil(r.bottom - a.top) + 4);
      }
      if (sideH) columnTop = Math.max(columnTop, Math.ceil(TOP_RESERVE + sideH) + 4);
      hintTop = columnTop;
      if (hintNode) columnTop = Math.ceil(hintTop + hintNode.offsetHeight) + 4;
    }
    // A low scene shorter than 320×568's (a status bar's safe area, a browser's bars): the stopped check would reach the own
    // readout. It then rises, up to 4px under the plan button when that is shown (on the stopped check it is not).
    let heldTop = TOP_RESERVE;
    if (readout && tight && arena.hasAttribute('data-power-held')) {
      const tall = readout.offsetHeight, bandTop = band.getBoundingClientRect().top - a.top;
      const planNode = arena.querySelector('.watch-plan-link'), plan = planNode?.getClientRects().length ? planNode.getBoundingClientRect() : null;
      if (TOP_RESERVE + tall > bandTop - 2) heldTop = Math.max(plan ? Math.ceil(plan.bottom - a.top) + 4 : 4, Math.floor(bandTop - 2 - tall));
    }
    set('--fp-side-dy', px(TOP_RESERVE - plateTop));
    if (tight) set('--fp-hint-dy', px(hintTop - plateTop));
    // The stopped check keeps its place (its plate lines are folded away); the passing one stands below the column's lines.
    if (readout && tight) readout.style.top = (arena.hasAttribute('data-power-held') ? heldTop : Math.max(TOP_RESERVE, columnTop + 2)) + 'px';
    // The defeat block over the darkened enemy's body, between the plate and the own readout (§9.2 "패배").
    const reward = arena.querySelector('.watch-reward:has(.watch-defeat)');
    if (reward) {
      const plateBottom = Math.max(...[plate, ...plate.children].filter(n => n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).position !== 'absolute')
        .map(n => n.getBoundingClientRect().bottom)) - a.top;
      const block = reward.offsetHeight / 2, top = plateBottom + (tight ? 5 : 2) + block, bottom = H - 4 - bandH - 2 - block;
      const centre = (foeTop + h * head + foot) / 2;
      set('--fp-report-y', Math.round(top > bottom ? (top + bottom) / 2 : Math.min(bottom, Math.max(top, centre))) + 'px');
      const half = reward.offsetWidth / 2;
      set('--fp-report-x', Math.round(Math.min(W - 4 - half, Math.max(4 + half, x))) + 'px');
    }
    // `연출 켜기` (motion off): right of the own readout, the place the hit marker uses while motion plays. With the coach
    // shown: right of the coach, or above it at the right edge, the device-setting wording without its small line when even
    // that does not fit (D33; the small line stays in the accessible name). The resting weapon's guard lies under that opaque
    // button there (PD: not seen, accepted); the button covers no text or number.
    const hint = arena.querySelector(':scope > .watch-motion-hint'), hb = hint?.querySelector('button');
    if (hint && hb) {
      hint.style.left = hint.style.bottom = ''; delete hint.dataset.at; delete hint.dataset.compact;
      const small = hb.querySelector('small');
      if (small && !hb.getAttribute('aria-label')) hb.setAttribute('aria-label', small.textContent + ' · ' + hb.lastChild.textContent);
      if (c?.width) {
        const room = a.right - c.right - 6 - 4;
        if (hb.offsetWidth > room) hint.dataset.compact = '';
        if (hb.offsetWidth <= room) { hint.style.left = px(c.right - a.left + 6); hint.style.bottom = px(a.bottom - c.bottom); hint.dataset.at = 'right'; }
        else { hint.style.left = px(W - 4 - hb.offsetWidth); hint.style.bottom = px(a.bottom - c.top + 6); hint.dataset.at = 'above'; }
      }
    }
    // The arena's place on screen as laid out (the grip above is in the same viewport coordinates): the strikes use it
    // without laying the page out again (only the shake moves the scene, and it moves the weapon with it).
    const rest = {x: foeLeft, y: foeTop, w, h, head, boss, kind, tight, foot, grip, key, arena: [W, H], at: {left: a.left, top: a.top, bottom: a.bottom, height: a.height}};
    arena.fpRest = rest;
    return rest;
  }
  // The enemy picture's rest box in viewport coordinates.
  function foeBox(arena) {
    const r = arena.fpRest, a = r?.at;
    return r && {left: a.left + r.x, top: a.top + r.y, width: r.w, height: r.h, head: r.head};
  }
  // The aimed swing (S0b, H3·H3-2): at the contact (half of the 300ms swing) a point of the weapon lies on the enemy's body.
  // Swords put 98% of the blade (320: 112%) on the body's middle; the wide heads (axe, mace, dagger) aim at its lower right quarter.
  function swing(arena, event, body) {
    const r = arena.fpRest, g = r?.grip, tip = TIP[r?.key];
    if (!g || !tip || !body) return null;
    const k = g.width / 384, a0 = g.rot * Math.PI / 180, t0 = [tip[0] - 238, tip[1] - 430];
    const v = [(t0[0] * Math.cos(a0) - t0[1] * Math.sin(a0)) * k, (t0[0] * Math.sin(a0) + t0[1] * Math.cos(a0)) * k];
    const box = {x: body.left, y: body.top + body.height * body.head, w: body.width, h: body.height * (1 - body.head)};
    const wide = WIDE.has(r.key);
    // Swords: 98% of the blade (320: 112%) on the body's middle (S0b). The wide heads (axe, mace, dagger): on a boss the lower right
    // quarter of its body (the prototype's point); on the other enemies the middle of their ink, since that quarter can be empty
    // between the legs (H3 needs a touch every hit).
    const ink = INK[r.kind] || [.5, .6];
    // On the low scene a sword also aims the middle of an ordinary enemy's ink: the forge's blades are thin, and the middle
    // of the body's box can lie beside the ink there.
    const C = !wide ? (r.tight && !r.boss ? [body.left + body.width * ink[0], body.top + body.height * ink[1]] : [box.x + box.w * .5, box.y + box.h * .5]) : r.boss ? [box.x + box.w * (BOSS_AIM[r.key] ?? .72), box.y + box.h * .7] : [body.left + body.width * ink[0], body.top + body.height * ink[1]];
    // A boss as tall as it is wide is struck no higher than the wide tusk's middle: reaching higher lifts the grip out from
    // behind the map button for longer than 150ms a swing (H3, measured at 320 against the elder, the wyrm and the alpha).
    if (r.boss) C[1] = Math.max(C[1], body.top + body.height - body.width * (2 / 3) * (r.tight ? .34 : .5));
    // The other enemies: a wide head strikes the lower part of the ink (no higher than 28% of the picture above its feet, 390·414 36%).
    else if (wide) C[1] = Math.max(C[1], body.top + body.height * (1 - (r.tight ? .28 : .36)));
    const heavy = ['heavyStrike', 'rupture'].includes(event.move), miss = event.check?.outcome === 'miss' && !event.damage;
    const Z = (r.tight ? .9 : 1.15) * (REACH[r.key] ?? 1), z = heavy ? Z + (r.tight ? .05 : .15) : Z, deg = heavy ? -14 : -8, t = deg * Math.PI / 180;
    // The wide heads reach the ink's middle with their tip (390·414: 1.0, the prototype's .92 aimed at a lower point and covered more
    // than 25% once aimed at the ink's middle, H3-2 ②).
    const f = wide ? (r.tight ? (r.key === 'blade-axe' ? .97 : 1.02) : 1) : (r.tight ? 1.12 : .98);
    const rv = [Math.cos(t) * v[0] - Math.sin(t) * v[1], Math.sin(t) * v[0] + Math.cos(t) * v[1]];
    let T = [C[0] - g.x - z * f * rv[0], C[1] - g.y - z * f * rv[1]];
    // The forge's axe is short for its head: where the aim would lift its grip from behind the map button (the tall 414 scene,
    // the low scene) the grip stays there and the head lands that much lower on the enemy.
    if (r.key === 'blade-axe') T[1] = Math.max(T[1], r.tight ? -5 : -3);
    // A miss stops short in front of the enemy: the tip reaches 70% of the way.
    if (miss) { const at = [g.x + z * rv[0], g.y + z * rv[1]], aim = [g.x + (C[0] - g.x) * .7, g.y + (C[1] - g.y) * .7]; T = [aim[0] - at[0], aim[1] - at[1]]; }
    const pose = (dx, dy, deg, s) => 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + deg + 'deg) scale(' + s + ')';
    return [{transform: 'none', easing: 'ease-in'},
      {transform: 'translate(5%,8%) rotate(12deg) scale(.96)', offset: .3, easing: 'cubic-bezier(.15,.8,.2,1)'},
      {transform: pose(T[0], T[1], deg, z), offset: .5},
      {transform: pose(T[0] - 6, T[1] + 4, deg - 10, Math.round(z * .97 * 1000) / 1000), offset: .62, easing: 'ease-out'},
      {transform: 'none'}];
  }
  // The guard: the pivot moves off the right edge, the blade and guard come in flat across the lower scene, the grip stays off screen.
  function guard(arena) {
    const r = arena.fpRest, g = r?.grip;
    if (!g) return null;
    const a = r.at, toGuard = g.width * 30 / 128;
    const tx = innerWidth + toGuard * 1.05 - g.x, ty = a.bottom - a.height * .2 - g.y;
    return 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotate(-66deg) scale(1.05)';
  }
  // The enemy comes at the player: down and larger (a boss more); on the low scene in place from its feet (§9.2).
  function approach(arena, miss) {
    const r = arena.fpRest;
    const scale = r.tight ? 1.15 : r.boss ? 1.4 : 1.3;
    const near = 'translateY(' + (r.tight ? 0 : 6) + '%) scale(' + scale + ')';
    const pass = miss ? 'translate(14%,' + (r.tight ? 0 : 4) + '%) scale(' + Math.min(scale, 1.15) + ')' : near;
    return {origin: r.tight ? '50% 100%' : '25% ' + Math.round(r.head * 100 + 4) + '%', frames: [{transform: 'none', easing: 'ease-in'},
      {transform: 'translateY(-4%) scale(.94)', offset: .3, easing: 'cubic-bezier(.15,.8,.2,1)'},
      {transform: pass, offset: .5}, {transform: pass, offset: .6, easing: 'ease-out'}, {transform: 'none'}]};
  }
  // Where the enemy's result stands: the middle of its picture, at body height (not on the forecast line), the same
  // calculation running, stopped or restored (M2).
  function enemySpot(arena) {
    const r = arena.fpRest;
    return r && {x: r.x + r.w / 2, y: r.y + r.h - r.h * (1 - r.head) * .72};
  }
  return {layout, prepare, preload, art, foeBox, swing, guard, approach, enemySpot, rot: key => ROT[key] ?? 16};
})();
