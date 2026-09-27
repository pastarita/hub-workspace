/* hub-workspace reference · Viewer renderers (markdown subset + CSV + JSON/JSONL). Shared by view.html and
   tools/check-view.mjs so the regression checks run against the shipped code. Node-safe:
   exports globalThis.HUBVIEW. The fence sentinel is built from String.fromCharCode(0) at runtime
   so this source never carries a NUL byte (a literal NUL makes git treat the file as binary). */
(function(){
  var esc = function(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
  var NUL = String.fromCharCode(0);
  var TOK = function(i){ return NUL + 'F' + i + NUL; };
  var TOK_LINE = new RegExp('^' + NUL + 'F\\d+' + NUL + '$');
  var TOK_ALL  = new RegExp(NUL + 'F(\\d+)' + NUL, 'g');

  /* Provenance segment markers (docs/09-provenance.md): <!-- s1.12 PY ... --> becomes an anchored chip so
     view.html?f=brainstorming.md#s1.12 lands on the segment. Every other HTML comment renders as nothing. */
  var SEG_BLOCK = /^<!--[ \t]*(s\d+\.\d{2})(?:[ \t]+([PYX?]+))?[^\n]*?(?:-->[ \t]*$|\n([\s\S]*?)^-->[ \t]*$)/gm;
  function segChip(id, who, body){
    var n = (body||'').split('\n').filter(function(l){ return /^\s*(idea|grow|pivot|drop)\s/.test(l); }).length;
    return '<a class="seg" id="'+id+'" href="timeline.html#'+id+'" title="open in the timeline">'+id+(who?' · '+who:'')+(n?' · '+n+' idea'+(n===1?'':'s'):'')+'</a>';
  }
  /* join a link target to the directory of the document being viewed ('' for the root) */
  function rel(base, h){
    if (!base || h.charAt(0)==='/') return h.replace(/^\//,'');
    var parts = (base + h).split('/'), out = [];
    parts.forEach(function(p){ if (p==='..') out.pop(); else if (p!=='.' && p!=='') out.push(p); });
    return out.join('/');
  }
  function md(src, base){
    var fences = [];
    src = src.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, body){
      /* ```mermaid → the hub's own reader (diagram.js), typeset in the tokens. A fence the reader
         cannot parse stays visible as source with the reason, never silently blank. */
      var D = (typeof globalThis!=='undefined'?globalThis:window).HUBDIAGRAM;
      if (lang === 'mermaid' && D) {
        try { return TOK(fences.push('<figure class="diagram">'+D.render(body)+'</figure>') - 1); }
        catch (e) { return TOK(fences.push('<pre class="diagram-error"><code data-lang="mermaid">'+esc(body)+'</code></pre><p class="cnt">diagram not rendered: '+esc(e.message)+'</p>') - 1); }
      }
      return TOK(fences.push('<pre><code data-lang="'+lang+'">'+esc(body)+'</code></pre>') - 1);
    });
    src = src.replace(SEG_BLOCK, function(_, id, who, body){ return TOK(fences.push(segChip(id, who, body)) - 1); });
    src = src.replace(/<!--[\s\S]*?-->/g, '');
    var inline = function(s){
      return esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\W)\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, t, h){
          /* .html targets are leaves: resolve them against the document's directory too, so a doc in
             docs/ links a root leaf as ../leaf.html and the same file reads correctly on GitHub. */
          var href = /^https?:|^#|^mailto:/.test(h) ? h : (/\.html(\?|#|$)/.test(h) ? rel(base, h) : 'view.html?f=' + rel(base, h));
          return '<a href="'+href+'">'+t+'</a>';
        });
    };
    /* Hard-wrapped prose: consecutive text lines join into ONE paragraph, and an indented
       line under an open list item continues that item. */
    var lines = src.split('\n'), html = [], list = null, para = [], m;
    var flushPara = function(){ if (para.length) { html.push('<p>'+inline(para.join(' '))+'</p>'); para = []; } };
    var closeList = function(){ flushPara(); if (list) { html.push('</'+list+'>'); list = null; } };
    var isBlock = function(L){ return /^(#{1,6})\s/.test(L) || /^\s*(---|\*\*\*|___)\s*$/.test(L) || /^>/.test(L) || /^\s*[-*+]\s/.test(L) || /^\s*\d+\.\s/.test(L) || L.trim().charAt(0)==='|'; };
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^\s*$/.test(L)) { closeList(); continue; }
      if (TOK_LINE.test(L.trim())) { closeList(); html.push(L.trim()); continue; }
      if (list && /^\s+\S/.test(L) && !isBlock(L)) {   /* list-item continuation line */
        var last = html.length - 1; html[last] = html[last].replace(/<\/li>$/, ' ' + inline(L.trim()) + '</li>'); continue;
      }
      if (!isBlock(L)) { if (list) closeList(); para.push(L.trim()); continue; }
      flushPara();
      if ((m = L.match(/^(#{1,6})\s+(.*)/))) { closeList(); html.push('<h'+m[1].length+'>'+inline(m[2])+'</h'+m[1].length+'>'); continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(L)) { closeList(); html.push('<hr>'); continue; }
      if ((m = L.match(/^>\s?(.*)/))) { closeList(); html.push('<blockquote>'+inline(m[1])+'</blockquote>'); continue; }
      if (L.trim().charAt(0)==='|' && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]||'')) {
        closeList();
        var cells = function(r){ return r.trim().replace(/^\||\|$/g,'').split('|').map(function(c){ return c.trim(); }); };
        var head = cells(L); i++;
        var rows = [];
        while (i+1 < lines.length && lines[i+1].trim().charAt(0)==='|') rows.push(cells(lines[++i]));
        html.push('<div class="tbl-wrap"><table><thead><tr>'+head.map(function(c){ return '<th>'+inline(c)+'</th>'; }).join('')
          +'</tr></thead><tbody>'+rows.map(function(r){ return '<tr>'+r.map(function(c){ return '<td>'+inline(c)+'</td>'; }).join('')+'</tr>'; }).join('')
          +'</tbody></table></div>');
        continue;
      }
      if ((m = L.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)/))) {
        if (list !== 'ul') { closeList(); html.push('<ul class="tasks">'); list = 'ul'; }
        html.push('<li class="'+(m[1]===' '?'todo':'done')+'"><span class="box">'+(m[1]===' '?'☐':'☑')+'</span> '+inline(m[2])+'</li>'); continue;
      }
      if ((m = L.match(/^\s*[-*+]\s+(.*)/))) {
        if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
        html.push('<li>'+inline(m[1])+'</li>'); continue;
      }
      if ((m = L.match(/^\s*\d+\.\s+(.*)/))) {
        if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
        html.push('<li>'+inline(m[1])+'</li>'); continue;
      }
      closeList(); para.push(L.trim());
    }
    closeList();
    return html.join('\n').replace(TOK_ALL, function(_, n){ return fences[+n]; });
  }

  function csv(src){
    var pre = [];
    while (/^\s*#/.test(src)) {
      var nl = src.indexOf('\n');
      if (nl < 0) { pre.push(src.replace(/^\s*#\s?/, '')); src = ''; break; }
      pre.push(src.slice(0, nl).replace(/^\s*#\s?/, '')); src = src.slice(nl+1);
    }
    var banner = pre.join('\n').trim();
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (q) { if (c==='"' && src[i+1]==='"') { cell += '"'; i++; } else if (c==='"') q = false; else cell += c; }
      else if (c==='"') q = true;
      else if (c===',') { row.push(cell); cell=''; }
      else if (c==='\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
      else if (c!=='\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    var clean = rows.filter(function(r){ return r.some(function(c){ return c.trim(); }); });
    if (!clean.length) return '<p>Empty file.</p>';
    var num = function(s){ return s.trim()!=='' && !isNaN(s.replace(/[$,%]/g,'')); };
    return (banner ? '<pre class="banner">'+esc(banner)+'</pre>' : '')
      + '<div class="tbl-wrap"><table><thead><tr>'+clean[0].map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('')
      + '</tr></thead><tbody>'+clean.slice(1).map(function(r){ return '<tr>'+r.map(function(c){ return '<td'+(num(c)?' style="font-family:var(--mono);text-align:right"':'')+'>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')
      + '</tbody></table></div><p class="cnt">'+(clean.length-1)+' rows · '+clean[0].length+' columns</p>';
  }

  var JSON_CAP = 200000, JSONL_CAP = 300;
  function json(text){
    var pretty = JSON.stringify(JSON.parse(text), null, 2);
    var cut = pretty.length > JSON_CAP;
    return '<pre><code>'+esc(cut ? pretty.slice(0, JSON_CAP) : pretty)+'</code></pre>'
      + (cut ? '<p class="cnt">truncated at '+JSON_CAP+' bytes of '+pretty.length+'</p>' : '');
  }
  function jsonl(text){
    var lines = text.split('\n').filter(function(l){ return l.trim(); });
    var out = lines.slice(0, JSONL_CAP).map(function(l, i){
      var label = 'record '+(i+1);
      try { var o = JSON.parse(l); label += (o.t||o.event||o.type) ? ' · '+(o.t||o.event||o.type) : ''; } catch(e){ label += ' · (unparsable)'; }
      return '<details><summary>'+esc(label)+'</summary><pre><code>'+esc(l)+'</code></pre></details>';
    }).join('');
    return out + (lines.length > JSONL_CAP ? '<p class="cnt">showing '+JSONL_CAP+' of '+lines.length+' records</p>' : '<p class="cnt">'+lines.length+' records</p>');
  }

  var KIND = { md:'markdown', markdown:'markdown', csv:'csv', json:'json', jsonl:'jsonl',
    js:'source', mjs:'source', css:'source', txt:'source', svg:'source', geojson:'json', py:'source', yml:'source', yaml:'source', sh:'source', jsonc:'source' };
  function resolve(f){ var ext = (f.split('.').pop()||'').toLowerCase(); return KIND[ext] || 'source'; }
  (typeof globalThis!=='undefined'?globalThis:window).HUBVIEW = { md:md, csv:csv, json:json, jsonl:jsonl, resolve:resolve, esc:esc, rel:rel };
})();
