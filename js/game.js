/* Badminton - offline web edition
   Game logic written from scratch around the original art/sound/animation assets. */
(function () {
  'use strict';

  /* ================= constants ================= */
  var W = 1136, H = 640;
  var NET_X = W / 2, NET_H = 135;
  var SCALE = 0.5;               // spine unit -> px
  var G = 1100, DRAG = 0.0012;   // shuttle physics (px/s^2, quadratic drag)
  var COURT_L = 70, COURT_R = W - 70;
  var HIT_R = 74;                // racket reach radius (px)
  var BASE_X = { p: 330, c: W - 330 };

  var ARENAS = {
    arena1:   { name: 'Green',    img: 'assets/img/arena1.png',   ground: 0.755 },
    arena2:   { name: 'Clay',     img: 'assets/img/arena2.png',   ground: 0.755 },
    arena3:   { name: 'Stadium',  img: 'assets/img/arena3.png',   ground: 0.755 },
    arena7:   { name: 'Night',    img: 'assets/img/arena7.png',   ground: 0.755 },
    training: { name: 'Training', img: 'assets/img/training.png', ground: 0.80 },
    outdoor:  { name: 'Outdoor',  img: 'assets/img/outdoor.png',  ground: 0.80 }
  };
  var LEVELS = [
    { name: 'Rookie',  speed: 215, react: 0.42, err: 70, mis: 0.20, smash: 0.10, sd: 62 },
    { name: 'Amateur', speed: 255, react: 0.32, err: 50, mis: 0.13, smash: 0.18, sd: 46 },
    { name: 'Pro',     speed: 300, react: 0.22, err: 32, mis: 0.08, smash: 0.28, sd: 32 },
    { name: 'Expert',  speed: 345, react: 0.14, err: 18, mis: 0.045, smash: 0.38, sd: 20 },
    { name: 'Legend',  speed: 395, react: 0.07, err: 8,  mis: 0.015, smash: 0.5, sd: 10 }
  ];
  // swing candidates: contact time (s) after swing start; tip offsets are measured from the skeleton
  var CANDS = [
    { n: 'strike_down_1',           th: 0.10 },
    { n: 'strike_middlehit',        th: 0.13 },
    { n: 'strike_counterclockwise', th: 0.13 },
    { n: 'strike_clockwise',        th: 0.15 },
    { n: 'strike_smash3',           th: 0.12 }
  ];
  var SERVE_ANIM = { short: { n: 'service_middlehit', th: 0.13 }, long: { n: 'service_longhit', th: 0.13 } };

  /* ================= helpers ================= */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function randn() { var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function store(k, v) {
    try { if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { }
    return null;
  }

  var settings = { level: 2, arena: 'arena3', points: 11, sfx: true, music: true, touch: 'auto' };
  (function () { var s = store('bm_settings'); if (s) for (var k in s) if (k in settings) settings[k] = s[k]; })();
  function saveSettings() { store('bm_settings', settings); }

  /* ================= assets ================= */
  var IMG = {}, SND = {}, music = null, unlocked = false;
  var IMG_LIST = {
    body: 'assets/img/body.png', birdie: 'assets/img/Birdie.png', shadow: 'assets/img/Shadow.png',
    netBack: 'assets/ui/Net_Back.png', netMid: 'assets/ui/Net_MiddleNet.png', netFront: 'assets/ui/Net_Front.png', netShadow: 'assets/ui/Net_Shadow.png',
    gBg: 'assets/ui/Gauge_Bar_Background.png', gMid: 'assets/ui/Gauge_Bar_Middle.png', gFront: 'assets/ui/Gauge_Bar_Front_Border.png',
    skillOn: 'assets/ui/Skill-Smash.png', skillOff: 'assets/ui/SkillOFF-Smash.png'
  };
  Object.keys(ARENAS).forEach(function (k) { IMG_LIST[k] = ARENAS[k].img; });
  var SND_LIST = {
    hitL: 'HitL.mp3', hitM: 'HitM.mp3', hitH: 'HitH.mp3', smash: 'Smash.mp3', strong: 'Strong_Smash.mp3', air: 'Hitair.mp3',
    out: 'Out.mp3', cheer: 'Crowd-Cheering.mp3', boo: 'Crowd-Boo.mp3', gamepoint: 'game_point.mp3', fail: 'fail.mp3',
    stepL: 'footstepL.mp3', stepR: 'footstepR.mp3', ready: 'SkillReady.mp3', skill: 'SkillUse.mp3', button: 'button.mp3',
    win: 'victory.mp3', lose: 'lose.mp3', count: 'count.mp3'
  };

  function loadAll(done, progress) {
    var keys = Object.keys(IMG_LIST), total = keys.length, n = 0;
    keys.forEach(function (k) {
      var im = new Image();
      im.onload = im.onerror = function () { n++; progress && progress(n / total); if (n === total) done(); };
      im.src = IMG_LIST[k]; IMG[k] = im;
    });
    Object.keys(SND_LIST).forEach(function (k) {
      var a = new Audio(); a.preload = 'auto'; a.src = 'assets/snd/' + SND_LIST[k]; SND[k] = a;
    });
    music = new Audio('assets/snd/MainMusic1.mp3'); music.loop = true; music.volume = 0.3; music.preload = 'auto';
  }
  function sfx(name, vol) {
    if (!settings.sfx || !SND[name]) return;
    try { var a = SND[name].cloneNode(); a.volume = vol === undefined ? 0.8 : vol; var p = a.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
  }
  function updateMusic() {
    if (!music) return;
    try { if (settings.music && unlocked) { var p = music.play(); if (p && p.catch) p.catch(function () { }); } else music.pause(); } catch (e) { }
  }
  function unlockAudio() { if (unlocked) return; unlocked = true; updateMusic(); }
  window.addEventListener('pointerdown', unlockAudio, { once: false });
  window.addEventListener('keydown', unlockAudio);

  /* ================= canvas / view ================= */
  var canvas = $('game'), ctx = canvas.getContext('2d'), K = 1;
  function resize() {
    var fit = Math.min(window.innerWidth / W, window.innerHeight / H);
    K = clamp(fit * (window.devicePixelRatio || 1), 1, 2);
    canvas.width = Math.round(W * K); canvas.height = Math.round(H * K);
    canvas.style.width = Math.round(W * fit) + 'px'; canvas.style.height = Math.round(H * fit) + 'px';
  }
  window.addEventListener('resize', resize);

  /* ================= skeleton / actors ================= */
  var regions = null, tintCPU = null, candTips = {};
  function setupSkeletons() {
    regions = Spine.buildRegions(window.BODY_ATLAS, IMG.body, true);
    var probe = new Spine.Skeleton(window.BODY_JSON, regions);
    CANDS.concat([SERVE_ANIM.short, SERVE_ANIM.long]).forEach(function (c) {
      probe.setupPose(); probe.apply(c.n, c.th, false); probe.updateWorld();
      var r = probe.boneMap.racket, ro = probe.boneMap.root, L = r.length * 0.85;
      candTips[c.n] = { dx: (r.wx + r.a * L - ro.wx) * SCALE, dy: (r.wy + r.c * L - ro.wy) * SCALE };
    });
    IMG.gMidO = Spine.tintCanvas(IMG.gMid, '#ff9a1f'); IMG.gMidR = Spine.tintCanvas(IMG.gMid, '#ffe14a');
    tintCPU = {};
    var skin = probe.atts;
    var shirt = skin.body_shirt && skin.body_shirt.body_shirt;
    if (shirt) tintCPU.body_shirt = Spine.tintCanvas(regions[shirt.path], '#ff6a5e');
  }
  function newSkeleton() { return new Spine.Skeleton(window.BODY_JSON, regions); }

  function mkActor(id) {
    return {
      id: id, dir: id === 'p' ? 1 : -1, x: BASE_X[id], vx: 0, sk: newSkeleton(),
      anim: 'stand_prepare', t: 0, loop: true, sw: null, stepT: 0, homeX: BASE_X[id],
      ai: { since: 0, plan: null, wait: 0 }, hideSkirt: true, tint: id === 'c' ? tintCPU : null
    };
  }
  function setAnim(a, name, loop) { if (a.anim !== name) { a.anim = name; a.t = 0; } a.loop = loop; }
  function poseActor(a) {
    var sk = a.sk; sk.setupPose(); sk.apply(a.anim, a.t, a.loop);
    if (a.id === 'c') { var s = sk.slotMap.body_female_skirt; if (s) s.attachment = null; }
    sk.updateWorld();
  }
  function tipOf(a) {
    var sk = a.sk, r = sk.boneMap.racket, ro = sk.boneMap.root, L = r.length * 0.85;
    return { x: a.x + a.dir * (r.wx + r.a * L - ro.wx) * SCALE, y: (r.wy + r.c * L - ro.wy) * SCALE };
  }
  function heldPos(a) {
    var b = a.sk.boneMap.Birdie, ro = a.sk.boneMap.root;
    return { x: a.x + a.dir * (b.wx - ro.wx) * SCALE, y: (b.wy - ro.wy) * SCALE };
  }

  /* ================= ball physics ================= */
  function step(b, dt) {
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy), d = DRAG * sp;
    b.vx -= b.vx * d * dt; b.vy -= (b.vy * d + G) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  function flight(hx, hy, v, th, dir) {
    var b = { x: hx, y: hy, vx: dir * v * Math.cos(th), vy: v * Math.sin(th) }, ok = true, t = 0;
    for (var i = 0; i < 720; i++) {
      var px = b.x; step(b, 1 / 120); t += 1 / 120;
      if ((px - NET_X) * (b.x - NET_X) <= 0 && px !== b.x && b.y < NET_H + 12) ok = false;
      if (b.y <= 0) break;
    }
    return { x: b.x, t: t, ok: ok };
  }
  function solveV(hx, hy, th, dir, tx) {
    var lo = 80, hi = 5000, want = (tx - hx) * dir;
    for (var i = 0; i < 26; i++) {
      var m = (lo + hi) / 2, f = flight(hx, hy, m, th, dir);
      if ((f.x - hx) * dir < want) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }
  // returns {vx,vy} for a shot of given type
  function makeShot(type, hx, hy, dir, dist, power) {
    var angles;
    if (type === 'clear') angles = [44, 50, 56, 62, 68];
    else if (type === 'drop') angles = [18, 26, 34, 42, 52, 62];
    else if (type === 'lift') angles = [60, 66, 72];
    else if (type === 'smash') angles = power ? [-52, -46, -40, -32, -24, -14, -4, 8] : [-44, -38, -30, -22, -14, -6, 4, 14];
    else angles = [4, 10, 16, 24, 32]; // drive
    var best = null;
    for (var i = 0; i < angles.length; i++) {
      var th = angles[i] * Math.PI / 180, tx = NET_X + dir * dist;
      var v = solveV(hx, hy, th, dir, tx), f = flight(hx, hy, v, th, dir);
      best = { vx: dir * v * Math.cos(th), vy: v * Math.sin(th), t: f.t };
      if (f.ok) break;
    }
    return best;
  }
  function predict(b, tau) {
    var c = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }, t = 0;
    while (t < tau && c.y > 0) { step(c, 1 / 120); t += 1 / 120; }
    return c;
  }
  function planContact(b, hy) {
    var c = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }, t = 0;
    while (t < 4) {
      var pv = c.vy; step(c, 1 / 120); t += 1 / 120;
      if (c.y <= hy && c.vy < 0) break;
      if (c.y <= 0) break;
    }
    return { x: c.x, y: Math.max(0, c.y), t: t };
  }

  /* ================= match state ================= */
  var M = null;
  var keys = {};
  var touchHeld = { left: false, right: false };

  function newMatch() {
    var lvl = LEVELS[settings.level - 1];
    M = {
      lvl: lvl, target: settings.points, score: { p: 0, c: 0 }, server: Math.random() < 0.5 ? 'p' : 'c',
      phase: 'serve', phaseT: 0, serveT: 0, paused: false, over: false, msg: null, msgT: 0, rally: 0, bestRally: 0,
      gauge: 0, ball: { x: 0, y: 0, vx: 0, vy: 0, state: 'held', last: null, trail: [], power: false },
      p: mkActor('p'), c: mkActor('c'), shake: 0, time: 0, gpPlayed: false, stats: { winners: 0, smashes: 0 }
    };
    startPoint();
  }

  function startPoint() {
    M.phase = 'serve'; M.phaseT = 0; M.serveT = 0; M.rally = 0;
    M.ball.state = 'held'; M.ball.last = null; M.ball.trail.length = 0; M.ball.power = false;
    [M.p, M.c].forEach(function (a) { a.sw = null; a.ai.plan = null; a.ai.since = 0; a.ai.wait = 0; });
    M.p.homeX = BASE_X.p; M.c.homeX = BASE_X.c;
    M.server === 'p' ? (M.p.homeX = BASE_X.p - 20) : (M.c.homeX = BASE_X.c + 20);
    var srv = M.server === 'p' ? M.p : M.c, rcv = M.server === 'p' ? M.c : M.p;
    setAnim(srv, 'service_position', true); setAnim(rcv, 'stand_prepare', true);
    if (M.server === 'c') M.serveT = 0;
  }

  function showMsg(t, s) { M.msg = t; M.msgT = s || 1.2; }

  function serve(a, kind) {
    if (M.phase !== 'serve' || (M.server !== a.id)) return;
    var sa = SERVE_ANIM[kind];
    a.sw = { cand: sa, t: 0, hit: false, serve: kind, dur: 0.45 };
    setAnim(a, sa.n, false);
    M.phase = 'serving'; M.phaseT = 0;
  }

  function chooseCand(a, pr, shot) {
    var best = null, bd = 1e9;
    for (var i = 0; i < CANDS.length; i++) {
      var c = CANDS[i], tp = candTips[c.n];
      var dx = (pr.x - a.x) * a.dir - tp.dx, dy = pr.y - tp.dy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (shot === 'smash' && tp.dy < 90) d += 25;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function swing(a, shot, opts) {
    if (a.sw || M.phase === 'point' || M.over) return false;
    if (M.phase === 'serve' || M.phase === 'serving') {
      if (M.server === a.id && M.phase === 'serve') serve(a, shot === 'long' || shot === 'smash' ? 'long' : 'short');
      return true;
    }
    var b = M.ball, pr = (b.state === 'fly') ? predict(b, 0.13) : { x: b.x, y: b.y };
    var cand = chooseCand(a, pr, shot);
    a.sw = { cand: cand, t: 0, hit: false, shot: shot, dur: cand.th + 0.26, opts: opts || {} };
    setAnim(a, cand.n, false);
    return true;
  }

  function tryHit(a) {
    var s = a.sw, b = M.ball;
    if (s.hit || s.serve) return;
    if (M.phase !== 'rally' || b.state !== 'fly' || b.last === a.id) return;
    if (s.t < s.cand.th - 0.06 || s.t > s.cand.th + 0.08) return;
    var tp = tipOf(a), d = Math.hypot(b.x - tp.x, b.y - tp.y);
    if ((b.x - NET_X) * a.dir > 40) return; // ball must be on own side
    if (d > HIT_R) return;
    s.hit = true;
    doHit(a, d);
  }

  function doHit(a, dist) {
    var b = M.ball, s = a.sw, shot = s.shot, q = 1 - dist / HIT_R;
    var hx = b.x, hy = Math.max(25, b.y), dir = a.dir, human = a.id === 'p';
    var power = false, d;
    if (shot === 'smash' && hy < 85) shot = 'drive';
    if (shot === 'smash' && human && M.gauge >= 1) { power = true; M.gauge = 0; sfx('skill', 0.8); }
    if (shot === 'smash' && !human && M.lvl.smash >= 0.5 && Math.random() < 0.15) power = true;
    var other = a.id === 'p' ? M.c : M.p;
    var err = randn() * (1 - q) * (human ? 85 : M.lvl.sd * 1.4);
    if (human && q < 0.3) err += randn() * 40;
    var oppSide = (other.x - NET_X) * dir; // distance of opponent from net (positive = on far side)
    if (shot === 'clear') d = rnd(390, 470) + err;
    else if (shot === 'lift') d = rnd(380, 460) + err;
    else if (shot === 'drop') d = rnd(60, 150) + err * 0.5;
    else if (shot === 'smash') d = (power ? rnd(150, 320) : rnd(190, 430)) + err * 0.8;
    else d = rnd(260, 430) + err;
    if (!human) { // aim away from the player
      var px = (other.x - NET_X) * dir; // other is on far side: px>0 means distance behind net
      if (shot === 'drop') d = px > 180 ? rnd(60, 110) + err * .5 : rnd(110, 170) + err * .5;
      else if (shot === 'smash' || shot === 'drive') d = px > 200 ? rnd(180, 270) + err : rnd(320, 440) + err;
    }
    d = Math.max(45, d);
    var sh = makeShot(shot, hx, hy, dir, d, power);
    b.x = hx; b.y = hy; b.vx = sh.vx; b.vy = sh.vy; b.state = 'fly'; b.last = a.id; b.power = power; b.shotType = shot;
    M.rally++; if (M.rally > M.bestRally) M.bestRally = M.rally;
    other.ai.plan = null; other.ai.since = 0; other.ai.wait = 0;
    // sound
    if (shot === 'smash' || shot === 'drive') { if (shot === 'smash') M.stats.smashes += human ? 1 : 0; sfx(power ? 'strong' : 'smash', 0.9); if (power) { M.shake = 0.3; showMsg('POWER SMASH!', 0.9); } }
    else if (hy > 150) sfx('hitH'); else if (hy > 80) sfx('hitM'); else sfx('hitL');
    if (human && !power && shot !== 'drop') {
      var before = M.gauge; M.gauge = Math.min(1, M.gauge + (shot === 'smash' ? 0.15 : 0.1) + q * 0.06);
      if (before < 1 && M.gauge >= 1) sfx('ready', 0.8);
    } else if (human && shot === 'drop') { M.gauge = Math.min(1, M.gauge + 0.06); }
  }

  function award(winner, why) {
    if (M.phase === 'point' || M.over) return;
    M.score[winner]++; M.phase = 'point'; M.phaseT = 0; M.server = winner;
    var human = winner === 'p';
    var t = M.target, sp = M.score.p, sc = M.score.c;
    var done = (sp >= t || sc >= t) && Math.abs(sp - sc) >= 2 || sp >= t + 9 || sc >= t + 9;
    if (why) showMsg(why, 1.4);
    var w = human ? M.p : M.c, l = human ? M.c : M.p;
    setAnim(w, human ? 'emoji_win' : 'emoji_laugh', false); setAnim(l, human ? 'emoji_lose' : 'emoji_angry_1', false);
    w.sw = null; l.sw = null;
    sfx(human ? 'cheer' : 'boo', 0.7);
    if (human) M.stats.winners++;
    if (done) { M.over = true; M.phaseT = 0; M.winner = winner; }
    else if (Math.max(sp, sc) >= t - 1 && sp !== sc) {
      var mm = M; setTimeout(function () { if (M === mm && !M.over) sfx('gamepoint', 0.8); }, 1000);
    }
  }

  /* ================= update ================= */
  function moveActor(a, dt, want, maxV) {
    var acc = 2600;
    var tv = want * maxV;
    if (a.vx < tv) a.vx = Math.min(tv, a.vx + acc * dt); else if (a.vx > tv) a.vx = Math.max(tv, a.vx - acc * dt);
    var lo = a.id === 'p' ? 40 : NET_X + 50, hi = a.id === 'p' ? NET_X - 50 : W - 40;
    a.x = clamp(a.x + a.vx * dt, lo, hi);
    if ((a.x <= lo && a.vx < 0) || (a.x >= hi && a.vx > 0)) a.vx = 0;
  }

  function actorAnim(a, dt) {
    if (a.sw) {
      a.sw.t += dt; tryHit(a);
      // serve release
      if (a.sw.serve && !a.sw.hit && a.sw.t >= a.sw.cand.th) {
        a.sw.hit = true;
        var tp = tipOf(a), b = M.ball, kind = a.sw.serve;
        var hx = tp.x, hy = Math.max(60, tp.y);
        var sh = kind === 'long' ? makeShot('clear', hx, hy, a.dir, rnd(360, 430), false) : makeShot('drop', hx, hy, a.dir, rnd(70, 140), false);
        b.x = hx; b.y = hy; b.vx = sh.vx; b.vy = sh.vy; b.state = 'fly'; b.last = a.id; b.shotType = kind;
        M.phase = 'rally'; M.phaseT = 0; M.rally = 1;
        sfx(kind === 'long' ? 'hitH' : 'hitM', 0.8);
        (a.id === 'p' ? M.c : M.p).ai.since = 0;
      }
      if (a.sw.t >= a.sw.dur) {
        if (!a.sw.hit && !a.sw.serve) { /* whiff */ }
        a.sw = null; setAnim(a, 'stand_prepare', true);
      } else { a.t += dt; }
    } else if (M.phase === 'point' || M.over) {
      a.t += dt;
      if (a.anim.indexOf('emoji') === 0 && a.t > a.sk.duration(a.anim)) setAnim(a, 'stand_prepare', true);
    } else {
      var moving = Math.abs(a.vx) > 25;
      if (a.anim === 'service_position' && !moving) { a.t += dt; }
      else if (moving) {
        var fwd = a.vx * a.dir > 0;
        setAnim(a, fwd ? 'move_forward' : 'move_backward', true); a.t += dt * clamp(Math.abs(a.vx) / 260, 0.6, 1.5);
      } else { setAnim(a, M.phase === 'serve' && M.server === a.id ? 'service_position' : 'stand_prepare', true); a.t += dt; }
    }
    poseActor(a);
  }

  function aiThink(dt) {
    var c = M.c, b = M.ball, L = M.lvl, want = 0, tgt = c.homeX;
    if (M.phase === 'serve' && M.server === 'c') {
      M.serveT += dt;
      if (M.serveT > 1.0) serve(c, Math.random() < 0.55 ? 'short' : 'long');
    }
    if (M.phase === 'rally' && b.state === 'fly' && b.last === 'p') {
      c.ai.since += dt;
      if (c.ai.since >= L.react * (b.power ? 1.8 : 1)) {
        if (!c.ai.plan) {
          var pl = planContact(b, 120);
          c.ai.plan = { x: pl.x + randn() * L.err, y: pl.y, t: pl.t };
          c.ai.skip = b.power && Math.random() < 0.55; // sometimes cannot reach power smashes
        }
        tgt = c.ai.plan.x + 80; // keep the ball in front of the racket
        if (!c.ai.skip && !c.sw && b.x > NET_X - 20) {
          var shot = aiShot(c, b);
          var pr = predict(b, 0.13), cand = chooseCand(c, pr, shot), tp = candTips[cand.n];
          var dx = (pr.x - c.x) * c.dir - tp.dx, dy = pr.y - tp.dy;
          if (Math.hypot(dx, dy) < 52 && (b.x - NET_X) * c.dir < 40) {
            if (c.ai.wait <= 0 && Math.random() < L.mis) c.ai.wait = rnd(0.08, 0.2);
            if (c.ai.wait > 0) c.ai.wait -= dt; else swing(c, shot);
          }
        }
      }
      var dist = tgt - c.x;
      want = clamp(dist / 28, -1, 1);
      if (Math.abs(dist) < 6) want = 0;
    } else {
      var d2 = tgt - c.x; want = Math.abs(d2) < 8 ? 0 : clamp(d2 / 60, -0.7, 0.7);
      if (M.phase === 'serving') want = 0;
    }
    if (c.sw) want = 0;
    moveActor(c, dt, want, L.speed);
  }

  function aiShot(c, b) {
    var L = M.lvl, p = M.p, hy = b.y, r = Math.random();
    var far = p.x < NET_X - 280, near = p.x > NET_X - 190;
    if (hy > 105 && r < L.smash) return 'smash';
    if (far && r < 0.55) return 'drop';
    if (near && r < 0.6) return 'clear';
    return r < 0.5 ? 'clear' : (r < 0.8 ? 'drop' : 'drive');
  }

  function humanInput(dt) {
    var p = M.p, want = 0;
    if (keys.ArrowLeft || keys.a || touchHeld.left) want -= 1;
    if (keys.ArrowRight || keys.d || touchHeld.right) want += 1;
    if (M.phase === 'point') { var dx = p.homeX - p.x; want = Math.abs(dx) < 8 ? 0 : clamp(dx / 60, -0.7, 0.7); }
    else if (p.sw || M.phase === 'serving') want *= 0.2;
    moveActor(p, dt, want, 310);
    if (Math.abs(p.vx) > 40 && !p.sw && M.phase !== 'point') {
      p.stepT -= dt; if (p.stepT <= 0) { sfx(Math.random() < 0.5 ? 'stepL' : 'stepR', 0.35); p.stepT = 0.26; }
    }
  }

  function updateBall(dt) {
    var b = M.ball;
    if (b.state === 'held') {
      var hp = heldPos(M.server === 'p' ? M.p : M.c); b.x = hp.x; b.y = hp.y; b.vx = b.vy = 0;
      return;
    }
    if (b.state === 'ground') return;
    var n = Math.ceil(dt / (1 / 120));
    for (var i = 0; i < n; i++) {
      var h = dt / n, px = b.x; step(b, h);
      if (b.state === 'fly' && !b.net && (px - NET_X) * (b.x - NET_X) < 0 && b.y < NET_H + 8) {
        b.net = true; b.vx *= -0.15; b.vy = Math.min(b.vy, 0) * 0.3; b.x = NET_X + (px < NET_X ? -6 : 6);
        sfx('air', 0.6);
        award(b.last === 'p' ? 'c' : 'p', 'NET!');
      }
      if (b.y <= 0) {
        b.y = 0; b.state = 'ground'; b.vx = b.vy = 0;
        if (M.phase === 'rally' || M.phase === 'serving') {
          var side = (b.x - NET_X) * (b.last === 'p' ? 1 : -1); // >0 -> landed on opponent half of the hitter
          var inb = b.x >= COURT_L && b.x <= COURT_R && side > 0;
          if (inb) { sfx('hitL', 0.4); award(b.last, b.rally > 6 ? 'GREAT RALLY!' : (b.last === 'p' ? 'GOOD SHOT!' : null)); }
          else { sfx('out', 0.9); award(b.last === 'p' ? 'c' : 'p', 'OUT!'); }
        }
        break;
      }
      if (b.x < -60 || b.x > W + 60) { b.state = 'ground'; b.y = 0; sfx('out', 0.9); award(b.last === 'p' ? 'c' : 'p', 'OUT!'); break; }
    }
    b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 9) b.trail.shift();
  }

  function update(dt) {
    if (!M || M.paused) return;
    dt = Math.min(dt, 1 / 30);
    M.time += dt; M.phaseT += dt;
    if (M.msgT > 0) { M.msgT -= dt; if (M.msgT <= 0) M.msg = null; }
    if (M.shake > 0) M.shake -= dt;
    humanInput(dt);
    aiThink(dt);
    actorAnim(M.p, dt); actorAnim(M.c, dt);
    updateBall(dt);
    if (M.phase === 'point' && !M.over && M.phaseT > 2.0) startPoint();
    if (M.over && M.phaseT > 1.6 && !M.resultShown) { M.resultShown = true; showResult(); }
    if (M.phase === 'serve') {
      // keep the server holding position
      var s = M.server === 'p' ? M.p : M.c; s.homeX = s.homeX;
    }
    // ball trail sync with held
    if (M.ball.state !== 'fly' && M.ball.trail.length) M.ball.trail.shift();
    if (M.phase === 'point' && M.phaseT > 0.6) { M.p.vx *= 0.9; }
  }

  /* ================= drawing ================= */
  function drawBg() {
    var a = ARENAS[settings.arena], im = IMG[settings.arena];
    var s = Math.max(W / im.width, H / im.height);
    var gh = a.ground * im.height * s;                    // ground in scaled image px
    var oy = clamp(GROUND_Y - gh, H - im.height * s, 0);   // keep feet on the ground line
    var par = M ? (M.ball.x - W / 2) * -0.03 : 0;
    var ox = clamp((W - im.width * s) / 2 + par, W - im.width * s, 0);
    ctx.drawImage(im, ox, oy, im.width * s, im.height * s);
  }
  var GROUND_Y = 478;

  function drawShadow(x, w, a) {
    ctx.globalAlpha = a === undefined ? 0.45 : a;
    ctx.drawImage(IMG.shadow, x - w / 2, GROUND_Y - 5, w, w * 20 / 113);
    ctx.globalAlpha = 1;
  }

  function drawNet(layer) {
    var x = NET_X;
    if (layer === 'back') {
      ctx.drawImage(IMG.netBack, x - 4, GROUND_Y + 6 - 137, 8, 137);
      ctx.drawImage(IMG.netMid, x - 12.5, GROUND_Y + 6 - 133, 25, 133);
    } else {
      ctx.drawImage(IMG.netFront, x - 6.5, GROUND_Y + 12 - 178, 13, 178);
    }
  }

  function drawActor(a) {
    drawShadow(a.x, 120, 0.4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    a.sk.draw(ctx, a.x * K, GROUND_Y * K, SCALE * K, a.dir < 0, a.tint);
    ctx.setTransform(K, 0, 0, K, 0, 0);
  }

  function drawBall() {
    var b = M.ball; if (b.state === 'held' && M.phase !== 'serve' && M.phase !== 'serving') return;
    var sx = b.x, sy = GROUND_Y - b.y;
    // trail
    if (b.state === 'fly' && b.trail.length > 2) {
      var spd = Math.hypot(b.vx, b.vy);
      if (spd > 900) {
        ctx.save(); ctx.lineCap = 'round';
        for (var i = 1; i < b.trail.length; i++) {
          var p0 = b.trail[i - 1], p1 = b.trail[i];
          ctx.strokeStyle = b.power ? 'rgba(255,180,60,' + (i / b.trail.length * 0.7) + ')' : 'rgba(255,255,255,' + (i / b.trail.length * 0.45) + ')';
          ctx.lineWidth = 2 + i * 0.5; ctx.beginPath(); ctx.moveTo(p0.x, GROUND_Y - p0.y); ctx.lineTo(p1.x, GROUND_Y - p1.y); ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (b.y > 0) drawShadow(b.x, 30 * clamp(1 - b.y / 700, 0.35, 1), 0.35 * clamp(1 - b.y / 700, 0.3, 1));
    var ang = (b.state === 'fly' || b.state === 'ground') ? Math.atan2(-b.vx, -b.vy) : 0;
    if (b.state === 'ground') ang = b.lastAng || 0.6; else if (b.state === 'fly') b.lastAng = ang;
    if (b.state === 'held') ang = 0.5 * (M.server === 'p' ? 1 : -1);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.drawImage(IMG.birdie, -12, -14, 24, 29); ctx.restore();
  }

  function txt(s, x, y, size, color, align, stroke) {
    ctx.font = size + 'px Title, Impact, sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (stroke !== false) { ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawHUD() {
    // scoreboard
    ctx.fillStyle = 'rgba(8,12,24,.72)'; rrect(W / 2 - 190, 10, 380, 58, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.stroke();
    txt('YOU', W / 2 - 150, 29, 17, '#9fe3ff', 'center', false);
    txt('CPU', W / 2 + 150, 29, 17, '#ff9a8c', 'center', false);
    txt(String(M.score.p), W / 2 - 62, 40, 46, '#fff', 'center', false);
    txt('-', W / 2, 38, 34, 'rgba(255,255,255,.5)', 'center', false);
    txt(String(M.score.c), W / 2 + 62, 40, 46, '#fff', 'center', false);
    ctx.fillStyle = M.server === 'p' ? '#ffd23f' : 'rgba(255,255,255,0)';
    ctx.beginPath(); ctx.arc(W / 2 - 108, 52, 5, 0, 7); ctx.fill();
    ctx.fillStyle = M.server === 'c' ? '#ffd23f' : 'rgba(255,255,255,0)';
    ctx.beginPath(); ctx.arc(W / 2 + 108, 52, 5, 0, 7); ctx.fill();
    txt('FIRST TO ' + M.target + '  |  ' + LEVELS[settings.level - 1].name.toUpperCase(), W / 2, 82, 13, 'rgba(255,255,255,.75)', 'center');
    // smash gauge
    var gx = 22, gy = 20, gs = 0.62, gw = 372 * gs, gh = 52 * gs;
    ctx.drawImage(IMG.gBg, gx, gy, gw, gh);
    var fw = 358 * gs * clamp(M.gauge, 0, 1);
    if (fw > 0) ctx.drawImage(M.gauge >= 1 ? IMG.gMidR : IMG.gMidO, 0, 0, 358 * clamp(M.gauge, 0, 1), 43, gx + 7 * gs, gy + 4.5 * gs, fw, 43 * gs);
    ctx.drawImage(IMG.gFront, gx - 2 * gs, gy - 2 * gs, 376 * gs, 56 * gs);
    var ready = M.gauge >= 1;
    ctx.globalAlpha = ready ? 1 : 0.8;
    ctx.drawImage(ready ? IMG.skillOn : IMG.skillOff, gx + gw + 6, gy - 12, 52, 52); ctx.globalAlpha = 1;
    txt(ready ? 'POWER SMASH READY' : 'SMASH GAUGE', gx + gw / 2, gy + gh + 14, 12, ready ? '#ffd23f' : 'rgba(255,255,255,.7)', 'center');
    if (M.rally >= 4 && M.phase === 'rally') txt('RALLY ' + M.rally, W - 90, 40, 22, '#ffd23f', 'center');
    // messages
    if (M.msg) {
      var al = clamp(M.msgT / 0.3, 0, 1), sc = 1 + (1 - clamp((1.2 - M.msgT) / 0.2, 0, 1)) * 0.5;
      ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2, 190); ctx.scale(sc, sc); txt(M.msg, 0, 0, 56, '#ffd23f'); ctx.restore();
    }
    if (M.phase === 'serve' && M.server === 'p') {
      var isTouch = document.body.classList.contains('touch');
      txt(isTouch ? 'TAP SHORT or LONG to serve' : 'Press J (short) or K (long) to serve', W / 2, 150, 22, '#fff');
    }
  }

  function draw() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (M && M.shake > 0) ctx.translate(rnd(-5, 5), rnd(-5, 5));
    drawBg();
    if (M) {
      drawNet('back');
      var order = [M.p, M.c];
      order.forEach(drawActor);
      drawBall();
      drawNet('front');
    }
    ctx.restore();
    if (M) drawHUD();
  }

  /* ================= loop ================= */
  var last = 0, running = false;
  function frame(ts) {
    var dt = (ts - last) / 1000; last = ts;
    if (!(dt >= 0) || dt > 0.5) dt = 1 / 60;
    if (running) { update(dt); }
    draw();
    requestAnimationFrame(frame);
  }

  /* ================= UI flow ================= */
  function show(id, on) { var e = $(id); if (e) e.classList[on ? 'remove' : 'add']('hidden'); }
  function showMenu() {
    running = false; if (M) M.paused = true;
    show('menu', true); show('pause', false); show('result', false); show('hud-btns', false); show('touch', false);
    M = null; refreshMenu();
  }
  function startGame() {
    unlockAudio(); sfx('button');
    show('menu', false); show('result', false); show('pause', false); show('hud-btns', true);
    newMatch(); running = true; updateTouchVisibility(); updateMusic();
  }
  function showResult() {
    var win = M.winner === 'p';
    $('result-title').textContent = win ? 'YOU WIN!' : 'YOU LOSE';
    $('result-title').className = win ? 'win' : 'lose';
    $('result-score').textContent = M.score.p + ' - ' + M.score.c;
    $('result-stats').textContent = 'Longest rally: ' + M.bestRally + '   |   Smashes: ' + M.stats.smashes;
    sfx(win ? 'win' : 'lose', 0.8);
    show('result', true); show('touch', false); show('hud-btns', false);
  }
  function setPause(p) {
    if (!M || M.over || !running) return;
    M.paused = p; show('pause', p); show('touch', !p && touchWanted());
  }
  function touchWanted() {
    if (settings.touch === 'on') return true; if (settings.touch === 'off') return false;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  }
  function updateTouchVisibility() {
    var on = touchWanted(); document.body.classList.toggle('touch', on);
    show('touch', on && running && M && !M.over && !M.paused);
  }

  function refreshMenu() {
    var lv = $('opt-level'); lv.innerHTML = '';
    LEVELS.forEach(function (l, i) {
      var b = document.createElement('button'); b.className = 'chip' + (settings.level === i + 1 ? ' on' : ''); b.textContent = l.name;
      b.onclick = function () { settings.level = i + 1; saveSettings(); sfx('button', .5); refreshMenu(); }; lv.appendChild(b);
    });
    var ar = $('opt-arena'); ar.innerHTML = '';
    Object.keys(ARENAS).forEach(function (k) {
      var b = document.createElement('button'); b.className = 'arena' + (settings.arena === k ? ' on' : '');
      b.style.backgroundImage = 'url(' + ARENAS[k].img + ')'; b.innerHTML = '<span>' + ARENAS[k].name + '</span>';
      b.onclick = function () { settings.arena = k; saveSettings(); sfx('button', .5); refreshMenu(); }; ar.appendChild(b);
    });
    var pt = $('opt-points'); pt.innerHTML = '';
    [7, 11, 15, 21].forEach(function (n) {
      var b = document.createElement('button'); b.className = 'chip' + (settings.points === n ? ' on' : ''); b.textContent = n;
      b.onclick = function () { settings.points = n; saveSettings(); sfx('button', .5); refreshMenu(); }; pt.appendChild(b);
    });
    $('opt-sfx').className = 'chip' + (settings.sfx ? ' on' : ''); $('opt-sfx').textContent = 'Sound ' + (settings.sfx ? 'ON' : 'OFF');
    $('opt-music').className = 'chip' + (settings.music ? ' on' : ''); $('opt-music').textContent = 'Music ' + (settings.music ? 'ON' : 'OFF');
    var tc = $('opt-touch'); tc.className = 'chip' + (settings.touch === 'on' ? ' on' : ''); tc.textContent = 'Touch buttons: ' + settings.touch.toUpperCase();
  }

  /* ================= input ================= */
  var KEYMAP = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', a: 'a', A: 'a', d: 'd', D: 'd' };
  window.addEventListener('keydown', function (e) {
    if (e.repeat && !KEYMAP[e.key]) return;
    var k = KEYMAP[e.key]; if (k) { keys[k] = true; if (e.key.indexOf('Arrow') === 0) e.preventDefault(); }
    if (!M || !running) { if (e.key === 'Enter' && !$('menu').classList.contains('hidden')) startGame(); return; }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setPause(!M.paused); return; }
    if (M.paused || M.over) return;
    var key = e.key.toLowerCase();
    if (key === 'j' || key === 'z' || e.key === 'ArrowDown') { swing(M.p, 'drop'); e.preventDefault(); }
    else if (key === 'k' || key === 'x' || e.key === 'ArrowUp') { swing(M.p, 'clear'); e.preventDefault(); }
    else if (key === 'l' || key === 'c' || e.key === ' ') { swing(M.p, 'smash'); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; touchHeld.left = touchHeld.right = false; if (M && running && !M.over && !M.paused) setPause(true); });

  function bindBtn(id, down, up) {
    var el = $(id); if (!el) return;
    var on = function (e) { e.preventDefault(); el.classList.add('down'); down(); };
    var off = function (e) { e.preventDefault(); el.classList.remove('down'); up && up(); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ================= boot ================= */
  function boot() {
    resize();
    loadAll(function () {
      setupSkeletons();
      show('loading', false); show('menu', true); refreshMenu();
      requestAnimationFrame(frame);
    }, function (p) { var b = $('loading-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; });

    $('btn-play').onclick = startGame;
    $('btn-again').onclick = startGame;
    $('btn-menu').onclick = function () { sfx('button'); showMenu(); };
    $('btn-resume').onclick = function () { sfx('button'); setPause(false); };
    $('btn-quit').onclick = function () { sfx('button'); showMenu(); };
    $('btn-pause').onclick = function () { setPause(true); };
    $('opt-sfx').onclick = function () { settings.sfx = !settings.sfx; saveSettings(); sfx('button'); refreshMenu(); };
    $('opt-music').onclick = function () { settings.music = !settings.music; saveSettings(); updateMusic(); refreshMenu(); };
    $('opt-touch').onclick = function () {
      settings.touch = settings.touch === 'auto' ? 'on' : (settings.touch === 'on' ? 'off' : 'auto'); saveSettings(); refreshMenu(); updateTouchVisibility();
    };
    bindBtn('t-left', function () { touchHeld.left = true; }, function () { touchHeld.left = false; });
    bindBtn('t-right', function () { touchHeld.right = true; }, function () { touchHeld.right = false; });
    bindBtn('t-short', function () { if (M && !M.paused) swing(M.p, 'drop'); });
    bindBtn('t-long', function () { if (M && !M.paused) swing(M.p, 'clear'); });
    bindBtn('t-smash', function () { if (M && !M.paused) swing(M.p, 'smash'); });
    window.addEventListener('resize', updateTouchVisibility);
    document.addEventListener('visibilitychange', function () { if (document.hidden && M && running && !M.over) setPause(true); });
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
    updateTouchVisibility();
  }

  // test hooks (used by automated checks)
  window.__bm = {
    get M() { return M; }, update: update, draw: draw, swing: swing, start: startGame, settings: settings,
    simulateBot: function (secs) { // auto-play the human side for quick headless testing
      var n = Math.round(secs * 60);
      for (var i = 0; i < n && M && !M.over; i++) {
        var b = M.ball, p = M.p;
        if (M.phase === 'serve' && M.server === 'p') swing(p, Math.random() < 0.5 ? 'drop' : 'clear');
        if (M.phase === 'rally' && b.state === 'fly' && b.last === 'c') {
          var pl = planContact(b, 110), tx = pl.x - 90, d = tx - p.x;
          keys.ArrowLeft = d < -6; keys.ArrowRight = d > 6;
          var pr = predict(b, 0.13);
          if (!p.sw && Math.abs((pr.x - p.x) - 90) < 50 && pr.y < 200) swing(p, ['clear', 'drop', 'smash'][Math.floor(Math.random() * 3)]);
        } else { keys.ArrowLeft = keys.ArrowRight = false; }
        update(1 / 60);
      }
      keys = {};
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
