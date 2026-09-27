/* hub-workspace reference · diagram.js — the mermaid reader and its typesetting system.
 *
 * WHY NOT MERMAID. The diagrams in docs/ are authored by us in a small, closed subset. Vendoring the
 * upstream renderer would buy generality we never use and cost the one thing we need: control of the
 * typesetting. This reads that subset and renders SVG in the hub's own tokens (hub.css), so a diagram
 * and the leaf around it read as one object. Colours come from the class NAME (:::hub → --c-orient),
 * never from the hex in classDef — tokens have one source. Flow kind is LINE STYLE, never colour.
 *
 * GRAMMAR READ (everything docs/ emits today, and nothing else)
 *   %%{init: …}%%                       ignored (theme directives belong to the tokens, not the doc)
 *   flowchart|graph LR|RL|TB|TD|BT
 *     subgraph ID["title"] … direction X … end     (nesting allowed)
 *     ID, ID[label], ID["label"], ID[(db)], ID([stadium]), ID((circle)), ID[/para/], ID{{hex}}, ID(round)
 *     :::class     class ID,ID name     classDef …   (classDef styles ignored; the name is the role)
 *     A --> B   A --- B   A -.-> B   A -.- B   A ==> B   A === B     with |label| or |"label"|
 *     A & B --> C & D   chains A --> B --> C   edges to/from a subgraph id   self-loops
 *     "\n" inside a label breaks the line
 *   sequenceDiagram
 *     autonumber · participant X as Label · actor X · A->>B: t · A-->>B: t · A->B: t · A-->B: t
 *     loop|alt|opt|par title … end · Note over A,B: t · Note left|right of A: t
 *   gitGraph
 *     commit id: "…" tag: "…" type: REVERSE · branch b · checkout b · merge b id: "…" tag: "…"
 *
 * LONG CHAINS WRAP SERPENTINE (boustrophedon): even rows L→R, odd rows R→L, so the row hop is a short
 * vertical drop and the chain stays legible on paper.
 *
 * Pure string building, no DOM, no dependency. Node-safe: exports globalThis.HUBDIAGRAM.
 */
(function () {
  'use strict';
  var G = (typeof globalThis !== 'undefined' ? globalThis : window);

  /* ================================================================ */
  /*  The typesetting system — edit this, never the layout            */
  /* ================================================================ */
  var STYLE = {
    font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fs: 12, lead: 15, edgeFs: 10.5, titleFs: 10.5, charW: 0.62,
    box: { padX: 12, padY: 9, minW: 64, r: 7, maxChars: 36 },
    gap: { rank: 64, cross: 14, band: 26, pad: 18, title: 22 },
    maxW: 820,
    ink: 'var(--ink)', muted: 'var(--soft)', faint: 'var(--faint)',
    line: 'var(--soft)', panel: 'var(--panel)', card: 'var(--card)',
    /* node roles — by class NAME. fill mixes the role hue into the card. */
    role: {
      /* the pattern's own vocabulary: a diagram about a hub colours its parts the way the hub does */
      hub:        { stroke: 'var(--c-orient)',    mix: 14 },
      leaf:       { stroke: 'var(--c-reference)', mix: 14 },
      model:      { stroke: 'var(--c-demo)',      mix: 14 },
      gate:       { stroke: 'var(--alert)',       mix: 10 },
      rails:      { stroke: 'var(--c-record)',    mix: 14 },
      surface:    { stroke: 'var(--c-record)',    mix: 18 },
      store:      { stroke: 'var(--soft)',        mix: 8 },
      data:       { stroke: 'var(--faint)',       mix: 6,  ink: 'var(--soft)' },
      flag:       { stroke: 'var(--flag)',        mix: 14 },
      _:          { stroke: 'var(--line-strong)', mix: 0 }
    },
    /* edge kinds — meaning by line style */
    edge: { solid: { dash: '', w: 1.5 }, dotted: { dash: '4 4', w: 1.5 }, thick: { dash: '', w: 3 } },
    cluster: { stroke: 'var(--line)', dash: '5 4', fill: 'color-mix(in srgb, var(--panel) 55%, transparent)' },
    seq: { colW: 150, rowH: 30, headH: 34, frameInset: 10, selfW: 34 },
    git: { stepX: 118, laneH: 52, r: 7, lanes: ['var(--c-orient)', 'var(--c-reference)', 'var(--c-demo)', 'var(--c-record)'] }
  };

  /* ================================================================ */
  /*  helpers                                                          */
  /* ================================================================ */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var strip = function (s) { s = String(s).trim(); if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') s = s.slice(1, -1); return s; };
  var lines = function (s) { return strip(s).replace(/<br\s*\/?>/gi, '\n').split(/\\n|\n/).map(function (l) { return l.replace(/<[^>]+>/g, '').trim(); }).filter(function (l, i, a) { return l || a.length === 1; }); };
  var tw = function (s, fs) { return Math.ceil(String(s).length * (fs || STYLE.fs) * STYLE.charW); };
  var wrap = function (ls, max) { var out = []; ls.forEach(function (l) { while (l.length > max) { var cut = l.lastIndexOf(' ', max); if (cut < max * 0.5) cut = max; out.push(l.slice(0, cut).trim()); l = l.slice(cut).trim(); } out.push(l); }); return out; };
  var clean = function (src) {
    return String(src).replace(/%%\{[\s\S]*?\}%%/g, '').split('\n').map(function (l) { return l.replace(/%%.*$/, '').replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
  };
  var fill = function (role) { return role.mix ? 'color-mix(in srgb, ' + role.stroke + ' ' + role.mix + '%, var(--card))' : 'var(--card)'; };
  var text = function (x, y, ls, opts) {
    opts = opts || {};
    var fs = opts.fs || STYLE.fs, lead = opts.lead || STYLE.lead, anchor = opts.anchor || 'middle';
    var y0 = y - ((ls.length - 1) * lead) / 2;
    return '<text x="' + x + '" y="' + y0 + '" text-anchor="' + anchor + '" dominant-baseline="central" font-family="' + STYLE.font + '" font-size="' + fs + '" fill="' + (opts.ink || STYLE.ink) + '"' + (opts.weight ? ' font-weight="' + opts.weight + '"' : '') + '>'
      + ls.map(function (l, i) { return '<tspan x="' + x + '" dy="' + (i ? lead : 0) + '">' + esc(l) + '</tspan>'; }).join('') + '</text>';
  };
  var label = function (x, y, s, ink) {
    if (!s) return '';
    var w = tw(s, STYLE.edgeFs) + 10, h = STYLE.edgeFs + 8;
    return '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="4" fill="' + STYLE.panel + '" stroke="var(--line)"/>' + text(x, y, [s], { fs: STYLE.edgeFs, ink: ink || STYLE.muted });
  };
  var open = function (w, h, cls) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" class="hub-diagram ' + (cls || '') + '" font-family="' + STYLE.font + '">'
      + '<defs><marker id="hub-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z" fill="' + STYLE.line + '"/></marker>'
      + '<marker id="hub-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 Z" fill="' + STYLE.panel + '" stroke="' + STYLE.line + '" stroke-width="1.2"/></marker></defs>';
  };

  /* ================================================================ */
  /*  FLOWCHART — parse                                               */
  /* ================================================================ */
  var OPENERS = [['[(', ')]', 'cyl'], ['((', '))', 'circle'], ['([', '])', 'stadium'], ['[/', '/]', 'para'], ['{{', '}}', 'hex'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond']];
  function readNode(s, i, g) {
    var m = /^\s*([A-Za-z0-9_.-]+)/.exec(s.slice(i)); if (!m) return null;
    i += m[0].length; var id = m[1], shape = null, lab = null;
    for (var k = 0; k < OPENERS.length; k++) {
      var o = OPENERS[k];
      if (s.slice(i, i + o[0].length) === o[0]) {
        var j = i + o[0].length, q = s.charAt(j) === '"' ? s.indexOf('"', j + 1) + 1 : -1;
        var close = s.indexOf(o[1], q > 0 ? q : j);
        if (close < 0) throw new Error('unclosed node label for ' + id);
        lab = s.slice(j, close); shape = o[2]; i = close + o[1].length; break;
      }
    }
    var c = /^:::([A-Za-z0-9_-]+)/.exec(s.slice(i)); var cls = null; if (c) { cls = c[1]; i += c[0].length; }
    var n = g.index[id];
    if (!n) { n = { id: id, label: lines(lab != null ? lab : id), shape: shape || 'rect', cls: cls, cluster: g.stack.length ? g.stack[g.stack.length - 1].id : null }; g.nodes.push(n); g.index[id] = n; }
    else { if (lab != null) { n.label = lines(lab); n.shape = shape; } if (cls) n.cls = cls; }
    return { i: i, id: id };
  }
  function readGroup(s, i, g) { var ids = []; for (;;) { var r = readNode(s, i, g); if (!r) break; ids.push(r.id); i = r.i; var amp = /^\s*&\s*/.exec(s.slice(i)); if (!amp) break; i += amp[0].length; } return { i: i, ids: ids }; }
  var EDGE = /^\s*(<?)(-\.->|-\.-|-->|---|==>|===)\s*(?:\|([^|]*)\|)?\s*/;
  function parseFlow(ls, dir) {
    var g = { type: 'flow', dir: dir, nodes: [], index: {}, edges: [], clusters: [], cindex: {}, stack: [] };
    ls.forEach(function (raw) {
      var s = raw.trim(), m;
      if (/^(flowchart|graph)\b/.test(s)) return;
      if ((m = /^subgraph\s+([A-Za-z0-9_-]+)\s*(?:\[\s*("?)([\s\S]*?)\2\s*\])?\s*$/.exec(s))) {
        var c = { id: m[1], title: m[3] != null ? m[3] : m[1], parent: g.stack.length ? g.stack[g.stack.length - 1].id : null, dir: null };
        g.clusters.push(c); g.cindex[c.id] = c; g.stack.push(c); return;
      }
      if (/^end\s*$/.test(s)) { g.stack.pop(); return; }
      if ((m = /^direction\s+(LR|RL|TB|TD|BT)/.exec(s))) { if (g.stack.length) g.stack[g.stack.length - 1].dir = m[1]; return; }
      if (/^classDef\b/.test(s) || /^style\b/.test(s) || /^linkStyle\b/.test(s)) return;
      if ((m = /^class\s+([^\s]+)\s+([A-Za-z0-9_-]+)/.exec(s))) { m[1].split(',').forEach(function (id) { if (g.index[id]) g.index[id].cls = m[2]; }); return; }
      var i = 0, left = readGroup(s, i, g); if (!left.ids.length) throw new Error('cannot read: ' + s);
      i = left.i;
      for (;;) {
        var e = EDGE.exec(s.slice(i)); if (!e) break; i += e[0].length;
        var right = readGroup(s, i, g); if (!right.ids.length) throw new Error('edge without target: ' + s); i = right.i;
        var op = e[2], kind = op.indexOf('.') >= 0 ? 'dotted' : op.indexOf('=') >= 0 ? 'thick' : 'solid', arrow = op.charAt(op.length - 1) === '>', bidir = e[1] === '<';
        left.ids.forEach(function (a) { right.ids.forEach(function (b) { g.edges.push({ from: a, to: b, kind: kind, arrow: arrow, bidir: bidir, label: e[3] != null ? strip(e[3]) : '' }); }); });
        left = right;
      }
      if (s.slice(i).trim()) throw new Error('trailing text: ' + s.slice(i));
    });
    /* a node "declared" only because it was a cluster id used as an endpoint is a cluster ref */
    g.nodes = g.nodes.filter(function (n) { if (g.cindex[n.id] && n.label.length === 1 && n.label[0] === n.id && n.shape === 'rect' && !n.cls) { delete g.index[n.id]; return false; } return true; });
    return g;
  }

  /* ================================================================ */
  /*  FLOWCHART — layout                                              */
  /* ================================================================ */
  function size(n) {
    if (n.shape === 'dot' || n.shape === 'bullseye') { n.lines = []; n.w = n.h = 18; return; }
    var boxy = n.shape === 'class' || n.shape === 'composite';
    var ls = wrap(n.label, boxy ? 52 : STYLE.box.maxChars); n.lines = ls;
    var w = Math.max(STYLE.box.minW, Math.max.apply(null, ls.map(function (l) { return tw(l); })) + 2 * STYLE.box.padX);
    var h = ls.length * STYLE.lead + 2 * STYLE.box.padY;
    if (n.shape === 'cyl') h += 10; if (n.shape === 'hex' || n.shape === 'para') w += 16; if (n.shape === 'circle') { w = h = Math.max(w, h); }
    if (boxy && ls.length > 1) h += 8;   /* the rule under the title */
    n.w = w; n.h = h;
  }
  function layoutFlow(g) {
    g.nodes.forEach(size);
    var horiz = g.dir === 'LR' || g.dir === 'RL', rev = g.dir === 'RL' || g.dir === 'BT';
    var isNode = function (id) { return !!g.index[id]; };
    /* ranks: longest path over node→node edges. Cycles are broken first: a DFS in declaration
       order marks every back edge, and back edges do not rank (they still draw, routed around). */
    var rank = {}; g.nodes.forEach(function (n) { rank[n.id] = 0; });
    var all = g.edges.filter(function (e) { return isNode(e.from) && isNode(e.to) && e.from !== e.to; });
    var outE = {}; all.forEach(function (e) { (outE[e.from] = outE[e.from] || []).push(e); });
    var state = {}, back = [];
    var dfs = function (id) { state[id] = 1; (outE[id] || []).forEach(function (e) { if (state[e.to] === 1) back.push(e); else if (!state[e.to]) dfs(e.to); }); state[id] = 2; };
    g.nodes.forEach(function (n) { if (!state[n.id]) dfs(n.id); });
    var ne = all.filter(function (e) { return back.indexOf(e) < 0; });
    for (var pass = 0; pass < g.nodes.length + 1; pass++) {
      var changed = false;
      ne.forEach(function (e) { if (rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; changed = true; } });
      if (!changed) break;
    }
    /* serpentine: a bare chain that would overflow wraps */
    var chain = !g.clusters.length && g.nodes.length > 3 && g.nodes.every(function (n) { return ne.filter(function (e) { return e.from === n.id; }).length <= 1 && ne.filter(function (e) { return e.to === n.id; }).length <= 1; }) && ne.length === g.nodes.length - 1;
    var out = { nodes: g.nodes, edges: g.edges, clusters: [], w: 0, h: 0, horiz: horiz };
    if (chain && horiz) {
      var order = g.nodes.slice().sort(function (a, b) { return rank[a.id] - rank[b.id]; });
      var total = order.reduce(function (a, n) { return a + n.w + STYLE.gap.rank; }, 0);
      if (total > STYLE.maxW) {
        var perRow = Math.max(2, Math.floor(STYLE.maxW / (total / order.length)));
        var rowH = Math.max.apply(null, order.map(function (n) { return n.h; })) + STYLE.gap.rank * 0.8;
        var rows = []; order.forEach(function (n, i) { var r = Math.floor(i / perRow); (rows[r] = rows[r] || []).push(n); });
        var maxRowW = 0;
        rows.forEach(function (row, r) {
          var x = STYLE.gap.pad; row.forEach(function (n) { n.x = x + n.w / 2; n.y = STYLE.gap.pad + r * rowH + rowH / 2; x += n.w + STYLE.gap.rank; });
          maxRowW = Math.max(maxRowW, x - STYLE.gap.rank + STYLE.gap.pad);
          if (r % 2 === 1) row.forEach(function (n) { n.x = maxRowW - n.x; });   /* odd rows read R→L */
        });
        out.w = maxRowW; out.h = STYLE.gap.pad * 2 + rows.length * rowH; out.serpentine = true;
        return out;
      }
    }
    /* bands: each cluster (innermost) gets a contiguous cross-axis band; root nodes get their own */
    var bandOf = function (n) { return n.cluster || ''; };
    var bandIds = []; g.clusters.forEach(function (c) { bandIds.push(c.id); }); bandIds.push('');
    var maxRank = 0; g.nodes.forEach(function (n) { maxRank = Math.max(maxRank, rank[n.id]); });
    var rankSize = []; for (var r = 0; r <= maxRank; r++) rankSize[r] = 0;
    g.nodes.forEach(function (n) { rankSize[rank[n.id]] = Math.max(rankSize[rank[n.id]], horiz ? n.w : n.h); });
    var rankPos = [], acc = STYLE.gap.pad; for (r = 0; r <= maxRank; r++) { rankPos[r] = acc; acc += rankSize[r] + STYLE.gap.rank; }
    var primaryExtent = acc - STYLE.gap.rank + STYLE.gap.pad;
    var cross = STYLE.gap.pad, bands = {};
    bandIds.forEach(function (b) {
      var members = g.nodes.filter(function (n) { return bandOf(n) === b; }); if (!members.length) return;
      var perRank = {}; members.forEach(function (n) { (perRank[rank[n.id]] = perRank[rank[n.id]] || []).push(n); });
      var slot = Math.max.apply(null, members.map(function (n) { return horiz ? n.h : n.w; })) + STYLE.gap.cross;
      var depth = Math.max.apply(null, Object.keys(perRank).map(function (k) { return perRank[k].length; }));
      var titled = b ? STYLE.gap.title : 0;
      var start = cross + (b ? STYLE.gap.pad * 0.6 : 0) + titled;
      Object.keys(perRank).forEach(function (k) {
        perRank[k].forEach(function (n, i) {
          var p = rankPos[rank[n.id]] + rankSize[rank[n.id]] / 2, c = start + i * slot + slot / 2 - STYLE.gap.cross / 2;
          if (horiz) { n.x = p; n.y = c; } else { n.x = c; n.y = p; }
        });
      });
      bands[b] = { start: cross, end: start + depth * slot - STYLE.gap.cross + (b ? STYLE.gap.pad * 0.6 : 0) };
      cross = bands[b].end + STYLE.gap.band;
    });
    var crossExtent = cross - STYLE.gap.band + STYLE.gap.pad;
    out.w = horiz ? primaryExtent : crossExtent; out.h = horiz ? crossExtent : primaryExtent;
    if (rev) g.nodes.forEach(function (n) { if (horiz) n.x = out.w - n.x; else n.y = out.h - n.y; });
    /* cluster boxes: bbox of all descendant nodes */
    var desc = function (cid) { return g.nodes.filter(function (n) { var c = n.cluster; while (c) { if (c === cid) return true; c = g.cindex[c] && g.cindex[c].parent; } return false; }); };
    g.clusters.forEach(function (c) {
      var ms = desc(c.id); if (!ms.length) return;
      var x0 = Math.min.apply(null, ms.map(function (n) { return n.x - n.w / 2; })) - STYLE.gap.pad * 0.6;
      var x1 = Math.max.apply(null, ms.map(function (n) { return n.x + n.w / 2; })) + STYLE.gap.pad * 0.6;
      var y0 = Math.min.apply(null, ms.map(function (n) { return n.y - n.h / 2; })) - STYLE.gap.pad * 0.6 - STYLE.gap.title;
      var y1 = Math.max.apply(null, ms.map(function (n) { return n.y + n.h / 2; })) + STYLE.gap.pad * 0.6;
      var t = tw(c.title, STYLE.titleFs) + 2 * STYLE.gap.pad;
      if (x1 - x0 < t) { var cx = (x0 + x1) / 2; x0 = cx - t / 2; x1 = cx + t / 2; }
      c.x0 = x0; c.y0 = y0; c.x1 = x1; c.y1 = y1; out.clusters.push(c);
      out.w = Math.max(out.w, x1 + STYLE.gap.pad); out.h = Math.max(out.h, y1 + STYLE.gap.pad);
    });
    /* nested clusters grow to hold their children */
    out.clusters.slice().reverse().forEach(function (c) { if (c.parent && g.cindex[c.parent] && g.cindex[c.parent].x0 != null) { var p = g.cindex[c.parent]; p.x0 = Math.min(p.x0, c.x0 - 8); p.y0 = Math.min(p.y0, c.y0 - STYLE.gap.title); p.x1 = Math.max(p.x1, c.x1 + 8); p.y1 = Math.max(p.y1, c.y1 + 8); } });
    /* shift everything if a cluster box went negative */
    var minX = 0, minY = 0; out.clusters.forEach(function (c) { minX = Math.min(minX, c.x0 - STYLE.gap.pad); minY = Math.min(minY, c.y0 - STYLE.gap.pad); });
    if (minX < 0 || minY < 0) { g.nodes.forEach(function (n) { n.x -= minX; n.y -= minY; }); out.clusters.forEach(function (c) { c.x0 -= minX; c.x1 -= minX; c.y0 -= minY; c.y1 -= minY; }); out.w -= minX; out.h -= minY; }
    return out;
  }

  /* ================================================================ */
  /*  FLOWCHART — render                                              */
  /* ================================================================ */
  function shapePath(n, role) {
    var x = n.x - n.w / 2, y = n.y - n.h / 2, w = n.w, h = n.h, r = STYLE.box.r, s = ' fill="' + fill(role) + '" stroke="' + role.stroke + '" stroke-width="1.5"';
    switch (n.shape) {
      case 'cyl': { var ry = 6; return '<path d="M' + x + ' ' + (y + ry) + ' a' + (w / 2) + ' ' + ry + ' 0 0 1 ' + w + ' 0 v' + (h - 2 * ry) + ' a' + (w / 2) + ' ' + ry + ' 0 0 1 -' + w + ' 0 Z"' + s + '/><path d="M' + x + ' ' + (y + ry) + ' a' + (w / 2) + ' ' + ry + ' 0 0 0 ' + w + ' 0" fill="none" stroke="' + role.stroke + '" stroke-width="1.5"/>'; }
      case 'stadium': return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) + '"' + s + '/>';
      case 'circle': return '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (w / 2) + '"' + s + '/>';
      case 'para': { var k = 10; return '<path d="M' + (x + k) + ' ' + y + ' H' + (x + w) + ' L' + (x + w - k) + ' ' + (y + h) + ' H' + x + ' Z"' + s + '/>'; }
      case 'hex': { var q = 10; return '<path d="M' + (x + q) + ' ' + y + ' H' + (x + w - q) + ' L' + (x + w) + ' ' + n.y + ' L' + (x + w - q) + ' ' + (y + h) + ' H' + (x + q) + ' L' + x + ' ' + n.y + ' Z"' + s + '/>'; }
      case 'diamond': return '<path d="M' + n.x + ' ' + y + ' L' + (x + w) + ' ' + n.y + ' L' + n.x + ' ' + (y + h) + ' L' + x + ' ' + n.y + ' Z"' + s + '/>';
      case 'round': return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r * 2) + '"' + s + '/>';
      case 'dot': return '<circle cx="' + n.x + '" cy="' + n.y + '" r="7" fill="' + STYLE.ink + '"/>';
      case 'bullseye': return '<circle cx="' + n.x + '" cy="' + n.y + '" r="8" fill="none" stroke="' + STYLE.ink + '" stroke-width="1.5"/><circle cx="' + n.x + '" cy="' + n.y + '" r="4" fill="' + STYLE.ink + '"/>';
      case 'class': case 'composite': {
        var ty = y + STYLE.box.padY + STYLE.lead + 4, dash = n.shape === 'composite' ? ' stroke-dasharray="5 4"' : '';
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"' + s + dash + '/>' + (n.lines.length > 1 ? '<path d="M' + x + ' ' + ty + ' H' + (x + w) + '" stroke="' + role.stroke + '" stroke-width="1"/>' : '');
      }
      default: return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"' + s + '/>';
    }
  }
  function box(g, id) { var n = g.index[id]; if (n) return { x: n.x, y: n.y, w: n.w, h: n.h }; var c = g.cindex[id]; if (c && c.x0 != null) return { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, w: c.x1 - c.x0, h: c.y1 - c.y0 }; return null; }
  function edgePath(a, b, horiz, serp) {
    /* forward along the primary axis → smooth S; otherwise route around */
    var dx = b.x - a.x, dy = b.y - a.y;
    if (serp) {
      if (Math.abs(dy) < 1) { var sx = dx > 0 ? a.x + a.w / 2 : a.x - a.w / 2, ex = dx > 0 ? b.x - b.w / 2 : b.x + b.w / 2; return { d: 'M' + sx + ' ' + a.y + ' L' + ex + ' ' + b.y, mx: (sx + ex) / 2, my: a.y }; }
      return { d: 'M' + a.x + ' ' + (a.y + a.h / 2) + ' L' + b.x + ' ' + (b.y - b.h / 2), mx: a.x, my: (a.y + b.y) / 2 };
    }
    var p, q, d;
    if (horiz) {
      if (dx > Math.abs(dy) * 0.3 + 4) { p = { x: a.x + a.w / 2, y: a.y }; q = { x: b.x - b.w / 2, y: b.y }; d = Math.max(20, (q.x - p.x) / 2); return { d: 'M' + p.x + ' ' + p.y + ' C' + (p.x + d) + ' ' + p.y + ' ' + (q.x - d) + ' ' + q.y + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
      if (dx < -(Math.abs(dy) * 0.3 + 4)) { p = { x: a.x - a.w / 2, y: a.y }; q = { x: b.x + b.w / 2, y: b.y }; d = Math.max(20, (p.x - q.x) / 2); return { d: 'M' + p.x + ' ' + p.y + ' C' + (p.x - d) + ' ' + p.y + ' ' + (q.x + d) + ' ' + q.y + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
      p = { x: a.x, y: dy > 0 ? a.y + a.h / 2 : a.y - a.h / 2 }; q = { x: b.x, y: dy > 0 ? b.y - b.h / 2 : b.y + b.h / 2 };
      return { d: 'M' + p.x + ' ' + p.y + ' C' + p.x + ' ' + ((p.y + q.y) / 2) + ' ' + q.x + ' ' + ((p.y + q.y) / 2) + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
    }
    if (dy > Math.abs(dx) * 0.3 + 4) { p = { x: a.x, y: a.y + a.h / 2 }; q = { x: b.x, y: b.y - b.h / 2 }; d = Math.max(20, (q.y - p.y) / 2); return { d: 'M' + p.x + ' ' + p.y + ' C' + p.x + ' ' + (p.y + d) + ' ' + q.x + ' ' + (q.y - d) + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
    if (dy < -(Math.abs(dx) * 0.3 + 4)) { p = { x: a.x, y: a.y - a.h / 2 }; q = { x: b.x, y: b.y + b.h / 2 }; d = Math.max(20, (p.y - q.y) / 2); return { d: 'M' + p.x + ' ' + p.y + ' C' + p.x + ' ' + (p.y - d) + ' ' + q.x + ' ' + (q.y + d) + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
    p = { x: dx > 0 ? a.x + a.w / 2 : a.x - a.w / 2, y: a.y }; q = { x: dx > 0 ? b.x - b.w / 2 : b.x + b.w / 2, y: b.y };
    return { d: 'M' + p.x + ' ' + p.y + ' C' + ((p.x + q.x) / 2) + ' ' + p.y + ' ' + ((p.x + q.x) / 2) + ' ' + q.y + ' ' + q.x + ' ' + q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
  }
  function renderFlow(g) {
    var L = layoutFlow(g), out = [open(L.w, L.h, 'flow')];
    L.clusters.forEach(function (c) {
      out.push('<rect x="' + c.x0 + '" y="' + c.y0 + '" width="' + (c.x1 - c.x0) + '" height="' + (c.y1 - c.y0) + '" rx="10" fill="' + STYLE.cluster.fill + '" stroke="' + STYLE.cluster.stroke + '" stroke-dasharray="' + STYLE.cluster.dash + '"/>');
      out.push(text(c.x0 + STYLE.gap.pad * 0.6, c.y0 + STYLE.gap.title * 0.6, [c.title], { fs: STYLE.titleFs, ink: STYLE.muted, anchor: 'start', weight: 700 }));
    });
    /* identical labels on a fan (same label, same target or same source) are drawn once, on the
       middle edge of the fan — mermaid repeats them and the pile-up is unreadable */
    var fans = {}; g.edges.forEach(function (e, i) { if (!e.label) return; var k = e.label + '|' + e.to; var k2 = e.label + '|' + e.from + '|s'; (fans[k] = fans[k] || []).push(i); (fans[k2] = fans[k2] || []).push(i); });
    var showLabel = {}; Object.keys(fans).forEach(function (k) { var idx = fans[k]; if (idx.length > 1) { var mid = idx[Math.floor(idx.length / 2)]; idx.forEach(function (i) { if (showLabel[i] == null) showLabel[i] = false; }); showLabel[mid] = true; } });
    g.edges.forEach(function (e, i) {
      var a = box(g, e.from), b = box(g, e.to); if (!a || !b) throw new Error('edge endpoint unknown: ' + e.from + ' → ' + e.to);
      var k = STYLE.edge[e.kind], d, mx, my;
      if (e.from === e.to) { var r = 18; d = 'M' + (a.x + a.w / 2 - 10) + ' ' + (a.y - a.h / 2) + ' c 0 -' + r + ' ' + (r + 10) + ' -' + r + ' ' + (r + 10) + ' 0 c 0 ' + (r / 2) + ' -' + r + ' ' + (r / 2) + ' -' + r + ' 0'; mx = a.x + a.w / 2 + 6; my = a.y - a.h / 2 - r - 4; }
      else { var p = edgePath(a, b, L.horiz, L.serpentine); d = p.d; mx = p.mx; my = p.my; }
      var head = e.head === 'tri' ? 'url(#hub-tri)' : 'url(#hub-arrow)';
      out.push('<path d="' + d + '" fill="none" stroke="' + STYLE.line + '" stroke-width="' + k.w + '"' + (k.dash ? ' stroke-dasharray="' + k.dash + '"' : '') + (e.arrow ? ' marker-end="' + head + '"' : '') + (e.bidir ? ' marker-start="' + head + '"' : '') + '/>');
      if (e.label && showLabel[i] !== false) {
        var lw = tw(e.label, STYLE.edgeFs) + 10;                                   /* keep the pill on the canvas */
        out.push(label(Math.min(Math.max(mx, lw / 2 + 4), L.w - lw / 2 - 4), Math.min(Math.max(my, 12), L.h - 12), e.label));
      }
    });
    g.nodes.forEach(function (n) {
      var role = STYLE.role[n.cls] || STYLE.role._;
      out.push(shapePath(n, role));
      if (n.shape === 'class' || n.shape === 'composite') {
        var lx = n.x - n.w / 2 + STYLE.box.padX, top = n.y - n.h / 2 + STYLE.box.padY + STYLE.lead / 2;
        out.push(text(lx, top, [n.lines[0]], { anchor: 'start', weight: 700, ink: role.ink || STYLE.ink }));
        if (n.lines.length > 1) out.push(text(lx, top + STYLE.lead + 8 + ((n.lines.length - 2) * STYLE.lead) / 2, n.lines.slice(1), { anchor: 'start', ink: STYLE.muted, fs: STYLE.fs - 0.5 }));
      } else if (n.lines.length) out.push(text(n.x, n.y + (n.shape === 'cyl' ? 3 : 0), n.lines, { ink: role.ink || STYLE.ink }));
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ================================================================ */
  /*  SEQUENCE                                                        */
  /* ================================================================ */
  function parseSeq(ls) {
    var g = { type: 'seq', parts: [], pindex: {}, items: [], auto: false }, stack = [], m;
    var part = function (id, lab) { if (!g.pindex[id]) { var p = { id: id, label: lab || id }; g.parts.push(p); g.pindex[id] = p; } return g.pindex[id]; };
    ls.forEach(function (raw) {
      var s = raw.trim();
      if (/^sequenceDiagram\b/.test(s)) return;
      if (/^autonumber\b/.test(s)) { g.auto = true; return; }
      if ((m = /^(?:participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/.exec(s))) { part(m[1], m[2] && strip(m[2])); return; }
      if ((m = /^(loop|alt|opt|par|critical|break)\s*(.*)$/.exec(s))) { var f = { kind: 'frame', op: m[1], title: m[2], items: [] }; (stack.length ? stack[stack.length - 1].items : g.items).push(f); stack.push(f); return; }
      if (/^(else|and)\b/.test(s)) return;
      if (/^end\s*$/.test(s)) { stack.pop(); return; }
      if ((m = /^Note\s+(over|left of|right of)\s+([A-Za-z0-9_, ]+):\s*(.*)$/i.exec(s))) { var ids = m[2].split(',').map(function (x) { return x.trim(); }); ids.forEach(function (id) { part(id); }); (stack.length ? stack[stack.length - 1].items : g.items).push({ kind: 'note', pos: m[1].toLowerCase(), ids: ids, text: m[3] }); return; }
      if ((m = /^([A-Za-z0-9_]+)\s*(-->>|->>|-->|->|-x|--x|-\)|--\))\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(s))) { part(m[1]); part(m[3]); (stack.length ? stack[stack.length - 1].items : g.items).push({ kind: 'msg', from: m[1], to: m[3], dashed: m[2].indexOf('--') === 0, arrow: /[>x)]$/.test(m[2]), text: m[4] }); return; }
      throw new Error('cannot read: ' + s);
    });
    return g;
  }
  function renderSeq(g) {
    var S = STYLE.seq, n = 0, out = [], x = STYLE.gap.pad;
    g.parts.forEach(function (p) { p.w = Math.max(S.colW - 30, tw(p.label) + 24); p.x = x + p.w / 2; x += p.w + 30; });
    var W = x - 30 + STYLE.gap.pad, y = STYLE.gap.pad + S.headH + 16, body = [], frames = [];
    var walk = function (items, depth) {
      items.forEach(function (it) {
        if (it.kind === 'frame') { var y0 = y; y += S.rowH * 0.9; walk(it.items, depth + 1); y += 8; frames.push({ f: it, y0: y0, y1: y, depth: depth }); return; }
        if (it.kind === 'note') {
          var xs = it.ids.map(function (id) { return g.pindex[id].x; }); var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
          var ls = wrap([it.text], 60), w = Math.max(x1 - x0 + 60, tw(ls[0]) + 24), h = ls.length * STYLE.lead + 12, cx = (x0 + x1) / 2;
          if (it.pos === 'right of') cx = x0 + 20 + w / 2; if (it.pos === 'left of') cx = x0 - 20 - w / 2;
          body.push('<rect x="' + (cx - w / 2) + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5" fill="' + fill(STYLE.role.data) + '" stroke="var(--line-strong)"/>' + text(cx, y + h / 2, ls, { fs: STYLE.edgeFs, ink: STYLE.muted }));
          y += h + 10; return;
        }
        var a = g.pindex[it.from], b = g.pindex[it.to], num = g.auto ? (++n) + '. ' : '', lab = num + it.text, dash = it.dashed ? ' stroke-dasharray="4 4"' : '';
        if (a === b) {
          body.push('<path d="M' + a.x + ' ' + y + ' h' + S.selfW + ' v' + (S.rowH * 0.6) + ' h-' + S.selfW + '" fill="none" stroke="' + STYLE.line + '" stroke-width="1.5"' + dash + (it.arrow ? ' marker-end="url(#hub-arrow)"' : '') + '/>');
          body.push(text(a.x + S.selfW + 8, y + S.rowH * 0.3, [lab], { fs: STYLE.edgeFs, anchor: 'start', ink: STYLE.ink }));
          y += S.rowH * 0.6 + 14; return;
        }
        body.push('<path d="M' + a.x + ' ' + y + ' L' + b.x + ' ' + y + '" fill="none" stroke="' + STYLE.line + '" stroke-width="1.5"' + dash + (it.arrow ? ' marker-end="url(#hub-arrow)"' : '') + '/>');
        body.push(text((a.x + b.x) / 2, y - 9, [lab], { fs: STYLE.edgeFs, ink: STYLE.ink }));
        y += S.rowH;
      });
    };
    walk(g.items, 0);
    var H = y + STYLE.gap.pad + 10;
    out.push(open(W, H, 'seq'));
    g.parts.forEach(function (p) { out.push('<path d="M' + p.x + ' ' + (STYLE.gap.pad + S.headH) + ' V' + (H - STYLE.gap.pad) + '" stroke="var(--line-strong)" stroke-dasharray="3 4"/>'); });
    frames.forEach(function (fr) {
      var ins = S.frameInset * (fr.depth + 1), fw = W - 2 * ins, ttl = fr.f.op + (fr.f.title ? ' · ' + fr.f.title : '');
      out.push('<rect x="' + ins + '" y="' + fr.y0 + '" width="' + fw + '" height="' + (fr.y1 - fr.y0) + '" rx="6" fill="none" stroke="var(--line-strong)" stroke-dasharray="5 4"/>');
      out.push('<rect x="' + ins + '" y="' + fr.y0 + '" width="' + (tw(ttl, STYLE.titleFs) + 16) + '" height="18" rx="4" fill="' + STYLE.panel + '" stroke="var(--line-strong)"/>' + text(ins + 8, fr.y0 + 9, [ttl], { fs: STYLE.titleFs, anchor: 'start', ink: STYLE.muted, weight: 700 }));
    });
    out.push(body.join(''));
    g.parts.forEach(function (p) { out.push('<rect x="' + (p.x - p.w / 2) + '" y="' + STYLE.gap.pad + '" width="' + p.w + '" height="' + S.headH + '" rx="7" fill="' + fill(STYLE.role.surface) + '" stroke="var(--c-record)" stroke-width="1.5"/>' + text(p.x, STYLE.gap.pad + S.headH / 2, [p.label], { weight: 600 })); });
    out.push('</svg>');
    return out.join('');
  }

  /* ================================================================ */
  /*  GIT GRAPH                                                       */
  /* ================================================================ */
  function parseGit(ls) {
    var g = { type: 'git', commits: [], lanes: ['main'], cur: 'main', m: null };
    var attr = function (s, k) { var m = new RegExp(k + ':\\s*"([^"]*)"').exec(s); return m ? m[1] : (m = new RegExp(k + ':\\s*([A-Za-z0-9_./<>-]+)').exec(s)) ? m[1] : null; };
    ls.forEach(function (raw) {
      var s = raw.trim(), m;
      if (/^gitGraph\b/.test(s)) return;
      if ((m = /^branch\s+([A-Za-z0-9_./-]+)/.exec(s))) { if (g.lanes.indexOf(m[1]) < 0) g.lanes.push(m[1]); g.branchFrom = g.branchFrom || {}; g.branchFrom[m[1]] = g.commits.filter(function (c) { return c.lane === g.cur; }).slice(-1)[0] || null; return; }
      if ((m = /^checkout\s+([A-Za-z0-9_./-]+)/.exec(s))) { g.cur = m[1]; return; }
      if ((m = /^merge\s+([A-Za-z0-9_./-]+)/.exec(s))) { var from = g.commits.filter(function (c) { return c.lane === m[1]; }).slice(-1)[0]; g.commits.push({ id: attr(s, 'id') || 'merge ' + m[1], tag: attr(s, 'tag'), lane: g.cur, merge: from || null, type: 'MERGE' }); return; }
      if (/^commit\b/.test(s)) { g.commits.push({ id: attr(s, 'id') || 'commit', tag: attr(s, 'tag'), lane: g.cur, type: attr(s, 'type') || 'NORMAL' }); return; }
      throw new Error('cannot read: ' + s);
    });
    return g;
  }
  function renderGit(g) {
    var S = STYLE.git, laneY = {}, out = [];
    g.lanes.forEach(function (l, i) { laneY[l] = STYLE.gap.pad + 30 + i * S.laneH; });
    g.commits.forEach(function (c, i) { c.x = STYLE.gap.pad + 60 + i * S.stepX; c.y = laneY[c.lane]; c.color = S.lanes[g.lanes.indexOf(c.lane) % S.lanes.length]; });
    var W = STYLE.gap.pad * 2 + 60 + g.commits.length * S.stepX, H = STYLE.gap.pad + 30 + g.lanes.length * S.laneH + 40;
    out.push(open(W, H, 'git'));
    g.lanes.forEach(function (l, i) { var cs = g.commits.filter(function (c) { return c.lane === l; }); if (!cs.length) return; out.push('<path d="M' + cs[0].x + ' ' + laneY[l] + ' H' + cs[cs.length - 1].x + '" stroke="' + S.lanes[i % S.lanes.length] + '" stroke-width="2.5"/>'); out.push(text(STYLE.gap.pad + 4, laneY[l], [l], { fs: STYLE.edgeFs, anchor: 'start', ink: S.lanes[i % S.lanes.length], weight: 700 })); });
    Object.keys(g.branchFrom || {}).forEach(function (b) { var p = g.branchFrom[b], first = g.commits.filter(function (c) { return c.lane === b; })[0]; if (p && first) out.push('<path d="M' + p.x + ' ' + p.y + ' C' + ((p.x + first.x) / 2) + ' ' + p.y + ' ' + ((p.x + first.x) / 2) + ' ' + first.y + ' ' + first.x + ' ' + first.y + '" fill="none" stroke="' + first.color + '" stroke-width="2"/>'); });
    g.commits.forEach(function (c) { if (c.merge) out.push('<path d="M' + c.merge.x + ' ' + c.merge.y + ' C' + ((c.merge.x + c.x) / 2) + ' ' + c.merge.y + ' ' + ((c.merge.x + c.x) / 2) + ' ' + c.y + ' ' + c.x + ' ' + c.y + '" fill="none" stroke="' + c.merge.color + '" stroke-width="2"/>'); });
    g.commits.forEach(function (c, i) {
      if (c.type === 'REVERSE') out.push('<rect x="' + (c.x - S.r) + '" y="' + (c.y - S.r) + '" width="' + (2 * S.r) + '" height="' + (2 * S.r) + '" fill="' + STYLE.panel + '" stroke="' + c.color + '" stroke-width="2.5"/><path d="M' + (c.x - 3) + ' ' + (c.y - 3) + ' l6 6 M' + (c.x + 3) + ' ' + (c.y - 3) + ' l-6 6" stroke="' + c.color + '" stroke-width="1.5"/>');
      else if (c.type === 'MERGE') out.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="' + S.r + '" fill="' + STYLE.panel + '" stroke="' + c.color + '" stroke-width="2.5"/><circle cx="' + c.x + '" cy="' + c.y + '" r="3" fill="' + c.color + '"/>');
      else out.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="' + S.r + '" fill="' + c.color + '"/>');
      var ls = wrap(c.id.split(' · '), 18), below = (i % 2 === 0) || c.lane !== 'main';
      out.push(text(c.x, c.y + (below ? 16 + (ls.length * STYLE.lead) / 2 : -14 - (ls.length * STYLE.lead) / 2), ls, { fs: STYLE.edgeFs, ink: STYLE.muted }));
      if (c.tag) { var w = tw(c.tag, STYLE.edgeFs) + 12; var ty = below ? c.y - 20 : c.y + 20; out.push('<rect x="' + (c.x - w / 2) + '" y="' + (ty - 9) + '" width="' + w + '" height="18" rx="9" fill="' + fill(STYLE.role.leaf) + '" stroke="var(--c-reference)"/>' + text(c.x, ty, [c.tag], { fs: STYLE.edgeFs, ink: STYLE.ink, weight: 600 })); }
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ================================================================ */
  /*  STATE (stateDiagram-v2) and CLASS — both become flow graphs     */
  /* ================================================================ */
  function flowGraph(dir) { return { type: 'flow', dir: dir, nodes: [], index: {}, edges: [], clusters: [], cindex: {}, stack: [] }; }
  function ensure(g, id, label, shape, cls) { var n = g.index[id]; if (!n) { n = { id: id, label: lines(label != null ? label : id), shape: shape || 'round', cls: cls || null, cluster: null }; g.nodes.push(n); g.index[id] = n; } return n; }
  function parseState(ls) {
    var g = flowGraph('TB'), comp = null, m;
    ls.forEach(function (raw) {
      var s = raw.trim();
      if (/^stateDiagram/.test(s)) return;
      if (comp) { if (/^\}/.test(s)) { comp = null; return; } comp.label.push(s.replace(/^state\s+/, '')); comp.lines = null; return; }
      if ((m = /^state\s+"([^"]*)"\s+as\s+([A-Za-z0-9_]+)\s*\{?$/.exec(s))) { var n = ensure(g, m[2], m[1], 'composite'); if (/\{$/.test(s)) comp = n; return; }
      if ((m = /^state\s+([A-Za-z0-9_]+)\s*\{$/.exec(s))) { comp = ensure(g, m[1], m[1], 'composite'); return; }
      if ((m = /^(\[\*\]|[A-Za-z0-9_]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_]+)\s*(?::\s*(.*))?$/.exec(s))) {
        var a = m[1] === '[*]' ? ensure(g, '__start', '', 'dot').id : ensure(g, m[1]).id;
        var b = m[2] === '[*]' ? ensure(g, '__end', '', 'bullseye').id : ensure(g, m[2]).id;
        g.edges.push({ from: a, to: b, kind: 'solid', arrow: true, label: m[3] ? m[3].trim() : '' }); return;
      }
      if (/^[A-Za-z0-9_]+$/.test(s)) { ensure(g, s); return; }
      throw new Error('cannot read: ' + s);
    });
    return g;
  }
  var CREL = /^([A-Za-z0-9_]+)\s*(<\|\.\.|<\|--|--\|>|\.\.\|>|\*--|o--|--\*|--o|\.\.>|-->|\.\.|--)\s*([A-Za-z0-9_]+)\s*(?::\s*(.*))?$/;
  function parseClass(ls) {
    var g = flowGraph('TB'), cur = null, m;
    ls.forEach(function (raw) {
      var s = raw.trim();
      if (/^classDiagram/.test(s)) return;
      if (cur) { if (/^\}/.test(s)) { cur = null; return; } if (/^<<.*>>$/.test(s)) { cur.label[0] = cur.label[0] + ' ' + s; return; } cur.label.push(s); return; }
      if ((m = /^class\s+([A-Za-z0-9_]+)\s*(\{)?$/.exec(s))) { var n = ensure(g, m[1], m[1], 'class'); if (m[2]) cur = n; return; }
      if ((m = CREL.exec(s))) {
        var op = m[2], A = ensure(g, m[1], m[1], 'class').id, B = ensure(g, m[3], m[3], 'class').id, lab = m[4] ? m[4].trim() : '';
        var dotted = op.indexOf('..') >= 0, toA = op.indexOf('<|') === 0 || op === '*--' || op === 'o--', tri = op.indexOf('<|') === 0 || /\|>$/.test(op);
        g.edges.push({ from: toA ? B : A, to: toA ? A : B, kind: dotted ? 'dotted' : 'solid', arrow: op !== '--' && op !== '..', head: tri ? 'tri' : 'arrow', label: lab }); return;
      }
      throw new Error('cannot read: ' + s);
    });
    return g;
  }

  /* ================================================================ */
  /*  API                                                             */
  /* ================================================================ */
  function parse(src) {
    var ls = clean(src); if (!ls.length) throw new Error('empty diagram');
    var head = ls[0].trim(), m;
    if ((m = /^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/.exec(head))) return parseFlow(ls, m[1] === 'TD' ? 'TB' : m[1]);
    if (/^sequenceDiagram\b/.test(head)) return parseSeq(ls);
    if (/^gitGraph\b/.test(head)) return parseGit(ls);
    if (/^stateDiagram/.test(head)) return parseState(ls);
    if (/^classDiagram\b/.test(head)) return parseClass(ls);
    throw new Error('unsupported diagram type: ' + head.slice(0, 30));
  }
  function layout(g) { return g.type === 'flow' ? layoutFlow(g) : null; }
  function render(src) { var g = typeof src === 'string' ? parse(src) : src; return g.type === 'flow' ? renderFlow(g) : g.type === 'seq' ? renderSeq(g) : renderGit(g); }
  G.HUBDIAGRAM = { parse: parse, layout: layout, render: render, STYLE: STYLE };
})();
