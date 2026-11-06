/* Minimal Spine 3.4 (JSON) runtime for Canvas2D.
   Supports: bones, region + mesh (weighted) attachments, rotate/translate/scale/shear,
   attachment/color/drawOrder/deform timelines, two-bone IK. No dependencies. */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;

  /* ---------- Atlas ---------- */
  function parseAtlas(text) {
    var lines = text.split(/\r?\n/), i = 0, regions = {}, cur = null;
    while (i < lines.length && !lines[i].trim()) i++;
    i++; // page file name
    while (i < lines.length && lines[i].indexOf(':') >= 0) i++; // page attributes
    for (; i < lines.length; i++) {
      var l = lines[i];
      if (!l.trim()) continue;
      if (l.indexOf(':') < 0) { cur = { name: l.trim() }; regions[cur.name] = cur; continue; }
      if (!cur) continue;
      var p = l.split(':'), k = p[0].trim(), v = p[1].trim(), n = v.split(',').map(Number);
      if (k === 'rotate') cur.rotate = v === 'true';
      else if (k === 'xy') { cur.x = n[0]; cur.y = n[1]; }
      else if (k === 'size') { cur.w = n[0]; cur.h = n[1]; }
      else if (k === 'orig') { cur.ow = n[0]; cur.oh = n[1]; }
      else if (k === 'offset') { cur.ox = n[0]; cur.oy = n[1]; }
    }
    return regions;
  }

  // Cuts every atlas region out into its own (un-rotated) canvas.
  function buildRegions(atlasText, img, rotateCW) {
    var regs = parseAtlas(atlasText), out = {};
    Object.keys(regs).forEach(function (name) {
      var r = regs[name], c = document.createElement('canvas');
      c.width = r.w; c.height = r.h;
      var x = c.getContext('2d');
      if (!r.rotate) {
        x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      } else if (rotateCW) {
        // packed image is the logical image rotated 90deg CW -> rotate back CCW
        x.translate(0, r.h); x.rotate(-Math.PI / 2);
        x.drawImage(img, r.x, r.y, r.h, r.w, 0, 0, r.h, r.w);
      } else {
        x.translate(r.w, 0); x.rotate(Math.PI / 2);
        x.drawImage(img, r.x, r.y, r.h, r.w, 0, 0, r.h, r.w);
      }
      out[name] = c;
    });
    return out;
  }

  // Multiply-tint a region canvas (used to give the CPU a different outfit)
  function tintCanvas(src, hex) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = hex; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(src, 0, 0);
    return c;
  }

  /* ---------- Curves ---------- */
  function bezierY(cv, p) {
    var cx1 = cv[0], cy1 = cv[1], cx2 = cv[2], cy2 = cv[3];
    var lo = 0, hi = 1, t = p;
    for (var i = 0; i < 12; i++) {
      t = (lo + hi) / 2;
      var u = 1 - t, bx = 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t;
      if (bx < p) lo = t; else hi = t;
    }
    var u2 = 1 - t;
    return 3 * u2 * u2 * t * cy1 + 3 * u2 * t * t * cy2 + t * t * t;
  }
  function curvePct(f, p) {
    var c = f.curve;
    if (c === undefined || c === null) return p;
    if (c === 'stepped') return 0;
    if (Array.isArray(c)) return bezierY(c, p);
    if (typeof c === 'number') return bezierY([c, f.c2 || 0, f.c3 === undefined ? 1 : f.c3, f.c4 === undefined ? 1 : f.c4], p);
    return p;
  }
  // index of the frame whose time <= t (or -1)
  function findFrame(frames, t) {
    var lo = 0, hi = frames.length - 1, r = -1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (frames[m].time <= t) { r = m; lo = m + 1; } else hi = m - 1;
    }
    return r;
  }
  function hexColor(h) {
    if (!h) return [1, 1, 1, 1];
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255,
      parseInt(h.substr(4, 2), 16) / 255, h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1];
  }
  function wrap180(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

  /* ---------- Skeleton ---------- */
  function Skeleton(data, regions) {
    this.data = data; this.regions = regions;
    this.bones = []; this.boneMap = {};
    var self = this;
    data.bones.forEach(function (bd) {
      var b = {
        name: bd.name, parent: bd.parent ? self.boneMap[bd.parent] : null,
        length: bd.length || 0,
        sx: bd.x || 0, sy: bd.y || 0, sr: bd.rotation || 0,
        ssx: bd.scaleX === undefined ? 1 : bd.scaleX, ssy: bd.scaleY === undefined ? 1 : bd.scaleY,
        shx: bd.shearX || 0, shy: bd.shearY || 0,
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0,
        a: 1, b: 0, c: 0, d: 1, wx: 0, wy: 0
      };
      self.bones.push(b); self.boneMap[b.name] = b;
    });
    this.slots = data.slots.map(function (sd, i) {
      return { name: sd.name, index: i, bone: self.boneMap[sd.bone], sAtt: sd.attachment || null,
        sColor: hexColor(sd.color), attachment: null, color: [1, 1, 1, 1], deform: null };
    });
    this.slotMap = {}; this.slots.forEach(function (s) { self.slotMap[s.name] = s; });
    this.drawOrder = this.slots.slice();
    this.ik = (data.ik || []).map(function (k) {
      return { bones: k.bones.map(function (n) { return self.boneMap[n]; }), target: self.boneMap[k.target],
        bend: k.bendPositive === false ? -1 : 1, mix: k.mix === undefined ? 1 : k.mix };
    });
    // attachments
    this.atts = {};
    var skin = data.skins['default'] || data.skins[Object.keys(data.skins)[0]];
    Object.keys(skin).forEach(function (slotName) {
      self.atts[slotName] = {};
      Object.keys(skin[slotName]).forEach(function (an) {
        var a = skin[slotName][an], o = { name: an, path: a.name || an, type: a.type || 'region',
          x: a.x || 0, y: a.y || 0, rotation: a.rotation || 0,
          scaleX: a.scaleX === undefined ? 1 : a.scaleX, scaleY: a.scaleY === undefined ? 1 : a.scaleY,
          width: a.width, height: a.height };
        if (o.type === 'mesh' || o.type === 'weightedmesh' || o.type === 'skinnedmesh') {
          o.type = 'mesh'; o.uvs = a.uvs; o.tris = a.triangles;
          var nv = a.uvs.length / 2;
          if (a.vertices.length === a.uvs.length) {
            o.weighted = false; o.verts = a.vertices;
          } else {
            o.weighted = true; o.infl = []; var i = 0, vs = a.vertices, total = 0;
            for (var v = 0; v < nv; v++) {
              var cnt = vs[i++], list = [];
              for (var k = 0; k < cnt; k++) { list.push({ bone: self.bones[vs[i]], x: vs[i + 1], y: vs[i + 2], w: vs[i + 3] }); i += 4; }
              o.infl.push(list); total += cnt;
            }
            o.deformLen = total * 2;
          }
          var rc = regions[o.path];
          o.region = rc; // uv -> pixel mapping uses canvas size
        }
        self.atts[slotName][an] = o;
      });
    });
    // animations
    this.anims = {};
    Object.keys(data.animations).forEach(function (name) {
      var an = data.animations[name], dur = 0;
      var scan = function (o) { if (Array.isArray(o)) o.forEach(function (f) { if (f && f.time > dur) dur = f.time; }); else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { scan(o[k]); }); };
      scan(an);
      self.anims[name] = { name: name, data: an, duration: dur };
    });
    this.setupPose();
  }

  Skeleton.prototype.duration = function (name) { return this.anims[name] ? this.anims[name].duration : 0; };

  Skeleton.prototype.setupPose = function () {
    this.bones.forEach(function (b) {
      b.x = b.sx; b.y = b.sy; b.rotation = b.sr; b.scaleX = b.ssx; b.scaleY = b.ssy; b.shearX = b.shx; b.shearY = b.shy;
    });
    this.slots.forEach(function (s) { s.attachment = s.sAtt; s.color = s.sColor.slice(); s.deform = null; });
    this.drawOrder = this.slots.slice();
  };

  Skeleton.prototype.apply = function (animName, time, loop) {
    var an = this.anims[animName]; if (!an) return;
    var t = time;
    if (loop && an.duration > 0) t = time % an.duration; else if (t > an.duration) t = an.duration;
    var d = an.data, self = this;
    if (d.bones) Object.keys(d.bones).forEach(function (bn) {
      var b = self.boneMap[bn], tl = d.bones[bn]; if (!b) return;
      var f, i, n, p, amt;
      if (tl.rotate && tl.rotate.length) {
        f = tl.rotate; i = findFrame(f, t);
        if (i >= 0) {
          if (i === f.length - 1) amt = f[i].angle || 0;
          else { n = f[i + 1]; p = curvePct(f[i], (t - f[i].time) / (n.time - f[i].time)); amt = (f[i].angle || 0) + wrap180((n.angle || 0) - (f[i].angle || 0)) * p; }
          b.rotation = b.sr + amt;
        }
      }
      if (tl.translate && tl.translate.length) {
        f = tl.translate; i = findFrame(f, t);
        if (i >= 0) {
          if (i === f.length - 1) { b.x = b.sx + (f[i].x || 0); b.y = b.sy + (f[i].y || 0); }
          else { n = f[i + 1]; p = curvePct(f[i], (t - f[i].time) / (n.time - f[i].time));
            b.x = b.sx + (f[i].x || 0) + ((n.x || 0) - (f[i].x || 0)) * p; b.y = b.sy + (f[i].y || 0) + ((n.y || 0) - (f[i].y || 0)) * p; }
        }
      }
      if (tl.scale && tl.scale.length) {
        f = tl.scale; i = findFrame(f, t);
        var g = function (v) { return v === undefined ? 1 : v; };
        if (i >= 0) {
          if (i === f.length - 1) { b.scaleX = b.ssx * g(f[i].x); b.scaleY = b.ssy * g(f[i].y); }
          else { n = f[i + 1]; p = curvePct(f[i], (t - f[i].time) / (n.time - f[i].time));
            b.scaleX = b.ssx * (g(f[i].x) + (g(n.x) - g(f[i].x)) * p); b.scaleY = b.ssy * (g(f[i].y) + (g(n.y) - g(f[i].y)) * p); }
        }
      }
      if (tl.shear && tl.shear.length) {
        f = tl.shear; i = findFrame(f, t);
        if (i >= 0) {
          if (i === f.length - 1) { b.shearX = b.shx + (f[i].x || 0); b.shearY = b.shy + (f[i].y || 0); }
          else { n = f[i + 1]; p = curvePct(f[i], (t - f[i].time) / (n.time - f[i].time));
            b.shearX = b.shx + (f[i].x || 0) + ((n.x || 0) - (f[i].x || 0)) * p; b.shearY = b.shy + (f[i].y || 0) + ((n.y || 0) - (f[i].y || 0)) * p; }
        }
      }
    });
    if (d.slots) Object.keys(d.slots).forEach(function (sn) {
      var s = self.slotMap[sn], tl = d.slots[sn]; if (!s) return;
      if (tl.attachment && tl.attachment.length) {
        var i = findFrame(tl.attachment, t);
        if (i >= 0) s.attachment = tl.attachment[i].name || null;
      }
      if (tl.color && tl.color.length) {
        var f = tl.color, j = findFrame(f, t);
        if (j >= 0) {
          var c0 = hexColor(f[j].color);
          if (j === f.length - 1) s.color = c0;
          else { var c1 = hexColor(f[j + 1].color), pp = curvePct(f[j], (t - f[j].time) / (f[j + 1].time - f[j].time));
            s.color = [0, 1, 2, 3].map(function (k) { return c0[k] + (c1[k] - c0[k]) * pp; }); }
        }
      }
    });
    if (d.drawOrder && d.drawOrder.length) {
      var di = findFrame(d.drawOrder, t);
      if (di >= 0) {
        var offs = (d.drawOrder[di].offsets || []).map(function (o) { return { idx: self.slotMap[o.slot].index, off: o.offset }; })
          .sort(function (a, b) { return a.idx - b.idx; });
        var cnt = this.slots.length, order = new Array(cnt), un = [], oi = 0, ui = 0, k;
        for (k = 0; k < cnt; k++) order[k] = -1;
        offs.forEach(function (o) {
          while (oi !== o.idx) un[ui++] = oi++;
          order[oi + o.off] = oi++;
        });
        while (oi < cnt) un[ui++] = oi++;
        for (k = cnt - 1; k >= 0; k--) if (order[k] === -1) order[k] = un[--ui];
        this.drawOrder = order.map(function (ix) { return self.slots[ix]; });
      }
    }
    if (d.deform) {
      var dsk = d.deform['default'] || d.deform[Object.keys(d.deform)[0]];
      if (dsk) Object.keys(dsk).forEach(function (sn) {
        var s = self.slotMap[sn]; if (!s || !s.attachment) return;
        var frames = dsk[sn][s.attachment]; if (!frames || !frames.length) return;
        var att = self.atts[sn] && self.atts[sn][s.attachment]; if (!att || att.type !== 'mesh') return;
        var len = att.weighted ? att.deformLen : att.verts.length;
        var i = findFrame(frames, t); if (i < 0) return;
        var expand = function (fr) {
          var arr = new Array(len); for (var q = 0; q < len; q++) arr[q] = 0;
          var off = fr.offset || 0, vv = fr.vertices || [];
          for (q = 0; q < vv.length && off + q < len; q++) arr[off + q] = vv[q];
          return arr;
        };
        var a0 = expand(frames[i]);
        if (i === frames.length - 1) { s.deform = a0; return; }
        var a1 = expand(frames[i + 1]), pp = curvePct(frames[i], (t - frames[i].time) / (frames[i + 1].time - frames[i].time));
        for (var z = 0; z < len; z++) a0[z] += (a1[z] - a0[z]) * pp;
        s.deform = a0;
      });
    }
  };

  function updateBone(b) {
    var rotY = b.rotation + 90 + b.shearY;
    var la = Math.cos((b.rotation + b.shearX) * DEG) * b.scaleX, lb = Math.cos(rotY * DEG) * b.scaleY;
    var lc = Math.sin((b.rotation + b.shearX) * DEG) * b.scaleX, ld = Math.sin(rotY * DEG) * b.scaleY;
    var p = b.parent;
    if (!p) { b.a = la; b.b = lb; b.c = lc; b.d = ld; b.wx = b.x; b.wy = b.y; return; }
    b.wx = p.a * b.x + p.b * b.y + p.wx; b.wy = p.c * b.x + p.d * b.y + p.wy;
    b.a = p.a * la + p.b * lc; b.b = p.a * lb + p.b * ld;
    b.c = p.c * la + p.d * lc; b.d = p.c * lb + p.d * ld;
  }

  function applyIK2(ik) {
    var parent = ik.bones[0], child = ik.bones[1], tg = ik.target;
    var px = parent.wx, py = parent.wy, cx = child.wx, cy = child.wy;
    var l1 = Math.hypot(cx - px, cy - py);
    var l2 = child.length * Math.hypot(child.a, child.c);
    if (l1 < 1e-4 || l2 < 1e-4) return;
    var dx = tg.wx - px, dy = tg.wy - py, d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    var base = Math.atan2(dy, dx), dd = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    var cosA = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), A = Math.acos(Math.max(-1, Math.min(1, cosA)));
    var jointAng = base - ik.bend * A;
    var jx = px + Math.cos(jointAng) * l1, jy = py + Math.sin(jointAng) * l1;
    var tipx = tg.wx, tipy = tg.wy;
    if (d > l1 + l2) { var k = (l1 + l2) / d; tipx = px + dx * k; tipy = py + dy * k; }
    var childAng = Math.atan2(tipy - jy, tipx - jx);
    // convert world angles to local rotations
    var pp = parent.parent, ppAng = pp ? Math.atan2(pp.c, pp.a) : 0;
    var offLocal = Math.atan2(child.y, child.x); // direction of child origin inside parent's frame
    var newP = (jointAng - offLocal - ppAng) / DEG - parent.shearX;
    parent.rotation = parent.rotation + (ik.mix >= 1 ? wrap180(newP - parent.rotation) : wrap180(newP - parent.rotation) * ik.mix);
    updateBone(parent);
    var pAng = Math.atan2(parent.c, parent.a);
    var newC = (childAng - pAng) / DEG - child.shearX;
    child.rotation = child.rotation + (ik.mix >= 1 ? wrap180(newC - child.rotation) : wrap180(newC - child.rotation) * ik.mix);
  }

  Skeleton.prototype.updateWorld = function () {
    var i, bs = this.bones;
    for (i = 0; i < bs.length; i++) updateBone(bs[i]);
    for (var k = 0; k < this.ik.length; k++) {
      var ik = this.ik[k];
      if (ik.bones.length === 2) applyIK2(ik);
      for (i = 0; i < bs.length; i++) updateBone(bs[i]);
    }
  };

  // Draw with a view matrix: screen = [vx, vy, ox, oy] -> x' = ox + vx*X, y' = oy - vy*Y (Y up)
  Skeleton.prototype.draw = function (ctx, ox, oy, scale, flip, tintMap) {
    var sx = scale * (flip ? -1 : 1), sy = -scale, self = this;
    var order = this.drawOrder;
    for (var si = 0; si < order.length; si++) {
      var s = order[si]; if (!s.attachment) continue;
      var att = this.atts[s.name] && this.atts[s.name][s.attachment]; if (!att) continue;
      var rc = (tintMap && tintMap[s.name]) || this.regions[att.path]; if (!rc) continue;
      var b = s.bone, alpha = s.color[3];
      ctx.globalAlpha = alpha;
      if (att.type === 'region') {
        var w = att.width || rc.width, h = att.height || rc.height;
        var cr = Math.cos(att.rotation * DEG), sr = Math.sin(att.rotation * DEG);
        // local attachment matrix
        var la = cr * att.scaleX, lc = sr * att.scaleX, lb = -sr * att.scaleY, ld = cr * att.scaleY;
        var ma = b.a * la + b.b * lc, mc = b.c * la + b.d * lc, mb = b.a * lb + b.b * ld, md = b.c * lb + b.d * ld;
        var mx = b.a * att.x + b.b * att.y + b.wx, my = b.c * att.x + b.d * att.y + b.wy;
        ctx.setTransform(sx * ma, sy * mc, sx * mb, sy * md, ox + sx * mx, oy + sy * my);
        ctx.scale(w / rc.width, -h / rc.height);
        ctx.drawImage(rc, -rc.width / 2, -rc.height / 2);
      } else {
        this.drawMesh(ctx, s, att, rc, ox, oy, sx, sy);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  var vbuf = [];
  Skeleton.prototype.drawMesh = function (ctx, slot, att, rc, ox, oy, sx, sy) {
    var nv = att.uvs.length / 2, b = slot.bone, dfm = slot.deform, i, j;
    if (dfm && dfm.length !== (att.weighted ? att.deformLen : att.verts.length)) dfm = null;
    vbuf.length = nv * 2;
    if (!att.weighted) {
      for (i = 0; i < nv; i++) {
        var lx = att.verts[i * 2] + (dfm ? dfm[i * 2] : 0), ly = att.verts[i * 2 + 1] + (dfm ? dfm[i * 2 + 1] : 0);
        vbuf[i * 2] = b.a * lx + b.b * ly + b.wx; vbuf[i * 2 + 1] = b.c * lx + b.d * ly + b.wy;
      }
    } else {
      var di = 0;
      for (i = 0; i < nv; i++) {
        var wxs = 0, wys = 0, list = att.infl[i];
        for (j = 0; j < list.length; j++) {
          var f = list[j], bb = f.bone, fx = f.x + (dfm ? dfm[di] : 0), fy = f.y + (dfm ? dfm[di + 1] : 0); di += 2;
          wxs += (bb.a * fx + bb.b * fy + bb.wx) * f.w; wys += (bb.c * fx + bb.d * fy + bb.wy) * f.w;
        }
        vbuf[i * 2] = wxs; vbuf[i * 2 + 1] = wys;
      }
    }
    var W = rc.width, H = rc.height, tr = att.tris;
    for (i = 0; i < tr.length; i += 3) {
      var i0 = tr[i], i1 = tr[i + 1], i2 = tr[i + 2];
      var x0 = ox + sx * vbuf[i0 * 2], y0 = oy + sy * vbuf[i0 * 2 + 1];
      var x1 = ox + sx * vbuf[i1 * 2], y1 = oy + sy * vbuf[i1 * 2 + 1];
      var x2 = ox + sx * vbuf[i2 * 2], y2 = oy + sy * vbuf[i2 * 2 + 1];
      var u0 = att.uvs[i0 * 2] * W, v0 = att.uvs[i0 * 2 + 1] * H;
      var u1 = att.uvs[i1 * 2] * W, v1 = att.uvs[i1 * 2 + 1] * H;
      var u2 = att.uvs[i2 * 2] * W, v2 = att.uvs[i2 * 2 + 1] * H;
      var den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      if (Math.abs(den) < 1e-6) continue;
      var A = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den;
      var B = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den;
      var C = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / den;
      var D = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den;
      var E = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den;
      var F = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / den;
      // slightly expand the clip triangle to hide seams
      var cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, e = 0.6;
      var ex = function (x, c) { var d = x - c; return x + (d > 0 ? e : d < 0 ? -e : 0); };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex(x0, cx), ex(y0, cy)); ctx.lineTo(ex(x1, cx), ex(y1, cy)); ctx.lineTo(ex(x2, cx), ex(y2, cy));
      ctx.closePath(); ctx.clip();
      ctx.setTransform(A, D, B, E, C, F);
      ctx.drawImage(rc, 0, 0);
      ctx.restore();
    }
  };

  root.Spine = { Skeleton: Skeleton, buildRegions: buildRegions, tintCanvas: tintCanvas };
})(window);
