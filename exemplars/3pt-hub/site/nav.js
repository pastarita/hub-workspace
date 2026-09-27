/* hub-workspace exemplar · shared nav shell — the single source of IA.
   Desktop (>900px): fixed left rail grouped by phase, custom SVG glyph per leaf, collapsible
   (persisted as hw_nav). Mobile (≤900px): sticky header + hamburger. Hidden on print.
   Adding a page = ONE entry in GROUPS below (+ a glyph, + a hub card).
   Hrefs ALWAYS carry .html and NEVER branch on the page's own location (see SKILL.md → Link resolution).
   Node-safe: exports globalThis.TPTNAV and returns before any DOM work when `document` is absent,
   so tools/check-nav.mjs can import it.

   NOTICE: this public demo runs with the gate OFF so the link works for everyone. A real
   deployment of this pattern sits behind Cloudflare Access (One-time PIN) with the Basic-auth
   door beside it — see references/access-runbook.md. The band below says so, once, per browser. */
(function(){
  var G = (typeof globalThis!=='undefined'?globalThis:window);
  if (G.TPTNAV) return;

  var NOTICE = 'Public demo: the Cloudflare Access gate is switched off here so this link works for everyone. A real deployment of this pattern sits behind Access with One-time PIN, and the middleware verifies the assertion.';

  function g(d){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';}
  var GLYPH = {
    'index':         g('<path d="M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z"/>'),
    'readme':        g('<path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v4h4"/><path d="M9 11h7M9 14.5h7M9 18h4"/>'),
    'skill':         g('<path d="M6 3h12v18H6Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/><path d="M15.5 14.5l1.5 1.5 3-3"/>'),
    'templates':     g('<path d="M4 5h16v14H4Z"/><path d="M4 10h16M10 10v9"/>'),
    'access':        g('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/>'),
    'collaborators': g('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-4 3-6 6-6s5.5 2 6 6"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15 18.5c.3-2.5 1.4-4 3.5-4 1.2 0 2.1.5 2.7 1.3"/>'),
    'viewer-ref':    g('<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.6"/>'),
    'derived':       g('<path d="M4 20V10M9 20V5M14 20v-8M19 20V7"/><path d="M2.5 20h19"/>'),
    'symbols':       g('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="18" r="1.5"/>'),
    'estate':        g('<path d="M3 10l9-5 9 5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 18h18"/>'),
    'diagrams':      g('<path d="M4 6h5v5H4ZM15 6h5v5h-5ZM9.5 15h5v5h-5Z"/><path d="M9 8.5h6M6.5 11v2.5a1.5 1.5 0 0 0 1.5 1.5h1.5M17.5 11v2.5a1.5 1.5 0 0 1-1.5 1.5h-1.5"/>'),
    'viewer-demo':   g('<path d="M5 4h10l4 4v12H5Z"/><path d="M15 4v4h4"/><path d="M8 12h8M8 15.5h8"/>'),
    'review':        g('<path d="M4 4h16v16H4Z"/><path d="M8 9h8M8 12.5h8M8 16h5"/><path d="M12 2v4"/>'),
    'view':          g('<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.6"/>')
  };
  var CLUSTERS = {
    orient:    { label:'Orient',    color:'#8b7cf6' },
    reference: { label:'Reference', color:'#3aa6d9' },
    demo:      { label:'Demo',      color:'#e0a33a' },
    record:    { label:'Record',    color:'#7d8a99' }
  };
  var GROUPS = [
    ['',          [['index','Hub']]],
    ['orient',    [['readme','README','R0'], ['skill','SKILL.md','S0']]],
    ['reference', [['templates','Templates','T1'], ['access','Access runbook','T2'], ['collaborators','Collaborator access','T3'], ['viewer-ref','Polyglot viewer','T4'], ['derived','Derived layer','T5'], ['symbols','Symbolic system','T6'], ['estate','Estate','T7']]],
    ['demo',      [['diagrams','Diagram reader','D1'], ['viewer-demo','Viewer','D2']]],
    ['record',    [['review','Build review','V1']]]
  ];
  var ROUTE = {
    'readme':        'view.html?f=README.md',
    'skill':         'view.html?f=SKILL.md',
    'templates':     'view.html?f=references/templates.md',
    'access':        'view.html?f=references/access-runbook.md',
    'collaborators': 'view.html?f=references/collaborator-access.md',
    'viewer-ref':    'view.html?f=references/polyglot-viewer.md',
    'derived':       'view.html?f=references/derived-layer.md',
    'symbols':       'view.html?f=references/symbolic-system.md',
    'estate':        'view.html?f=references/estate.md',
    'diagrams':      'view.html?f=docs/diagrams.md',
    'viewer-demo':   'view.html?f=docs/viewer.md',
    'review':        'view.html?f=reviews/2026-09-02-first-build.md'
  };
  var PATH = {};
  var FRESH = { 'diagrams':1, 'access':1 };

  function href(s){ if (ROUTE[s]) return './'+ROUTE[s]; var d = PATH[s]||''; return /\/$/.test(d) ? './'+d+'index.html' : './'+d+s+'.html'; }

  G.TPTNAV = { GROUPS:GROUPS, GLYPH:GLYPH, CLUSTERS:CLUSTERS, ROUTE:ROUTE, PATH:PATH, FRESH:FRESH, NOTICE:NOTICE, href:href };
  if (typeof document === 'undefined') return;

  var file = (location.pathname.split('/').pop()||'index.html');
  var cur = file.replace(/\.html$/,'')||'index';
  if (cur==='view') { var q = new URLSearchParams(location.search).get('f')||''; for (var k in ROUTE) if (ROUTE[k]==='view.html?f='+q) cur = k; }
  var TITLE = {}; GROUPS.forEach(function(gr){ gr[1].forEach(function(p){ TITLE[p[0]]=p[1]; }); });

  var css =
    "#tptnav{position:fixed;left:0;top:0;bottom:0;width:206px;transition:width .15s;background:#0b0e12;border-right:1px solid #1e252e;z-index:100000;display:flex;flex-direction:column;font:600 12.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;overflow-y:auto}"
   +"body{margin-left:206px!important;transition:margin-left .15s}"
   +"html.navmin #tptnav{width:52px}html.navmin body{margin-left:52px!important}"
   +"html.navmin #tptnav .nv-b,html.navmin #tptnav .nv-sub,html.navmin #tptnav .nv-g,html.navmin #tptnav .nv-links a span,html.navmin #tptnav .nv-ft{display:none}"
   +"html.navmin #tptnav .nv-links a{justify-content:center;padding:11px 0}"
   +"#tptnav .nv-b{color:#ff6b4a;font-weight:800;font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:16px 16px 3px;white-space:nowrap}"
   +"#tptnav .nv-sub{color:#6b7684;font-weight:700;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:0 16px 13px;border-bottom:1px solid #1e252e;margin-bottom:4px;white-space:nowrap}"
   +"#tptnav .nv-g{font-weight:800;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;padding:14px 16px 5px;white-space:nowrap;opacity:.95}"
   +"#tptnav .nv-links{display:flex;flex-direction:column}"
   +"#tptnav .nv-links a{color:#a3adbb;text-decoration:none;padding:8px 16px;display:flex;align-items:center;gap:10px;white-space:nowrap;border:0;border-bottom:0;background:transparent;font:600 12.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}"
   +"#tptnav .nv-links a svg{width:17px;height:17px;flex:none;opacity:.9}"
   +"#tptnav .nv-links a .id{font:700 9px/1 ui-monospace,Menlo,monospace;color:#6b7684;letter-spacing:.06em;min-width:16px}"
   +"#tptnav .nv-links a:hover{background:rgba(255,255,255,.06);color:#fff}"
   +"#tptnav .nv-links a.on{color:#fff;background:rgba(255,255,255,.08);box-shadow:inset 3px 0 0 #ff6b4a}"
   +"#tptnav .nv-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#ff6b4a;vertical-align:middle;margin-left:6px}"
   +"#tptnav .nv-sp{flex:1;min-height:10px}"
   +"#tptnav .nv-min{border:none;background:none;color:#6b7684;cursor:pointer;font:800 13px/1 inherit;padding:10px 16px;text-align:left}"
   +"#tptnav .nv-min:hover{color:#fff}html.navmin #tptnav .nv-min{text-align:center;padding:10px 0}"
   +"#tptnav .nv-ft{font-size:9.5px;color:#4c5663;padding:12px 16px;border-top:1px solid #1e252e;letter-spacing:.08em;text-transform:uppercase}"
   +"#tptnav .nv-burger,#tptnav .nv-cur{display:none}"
   +"#hw-notice{position:sticky;top:0;z-index:99999;background:#1f262f;color:#e6e9ee;border-bottom:1px solid #3a4552;font:500 12.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:9px 44px 9px 16px}"
   +"#hw-notice b{color:#ff6b4a;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:10.5px;margin-right:8px}"
   +"#hw-notice button{position:absolute;right:10px;top:6px;border:0;background:none;color:#a3adbb;font-size:16px;cursor:pointer;padding:2px 6px}#hw-notice button:hover{color:#fff}"
   +"@media(max-width:900px){"
   +"#tptnav{position:sticky;top:0;bottom:auto;width:auto;height:48px;flex-direction:row;align-items:center;padding:0 4px 0 14px;overflow:visible;border-right:0;border-bottom:1px solid #1e252e}"
   +"body{margin-left:0!important}"
   +"#tptnav .nv-b{padding:0;font-size:10.5px}#tptnav .nv-sub,#tptnav .nv-min,#tptnav .nv-ft{display:none}"
   +"#tptnav .nv-g{padding:12px 18px 4px}"
   +"#tptnav .nv-cur{display:block;color:#fff;font-weight:800;font-size:13px;margin-left:10px;padding-left:10px;border-left:1px solid rgba(255,255,255,.18);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
   +"#tptnav .nv-burger{display:flex;align-items:center;justify-content:center;margin-left:auto;width:48px;height:48px;border:none;background:none;color:#eef4ee;font-size:20px;cursor:pointer}"
   +"#tptnav .nv-wrap{position:absolute;top:48px;left:0;right:0;background:#0b0e12;box-shadow:0 10px 24px rgba(0,0,0,.5);display:none;padding:0 0 12px;z-index:100001;max-height:calc(100vh - 48px);overflow-y:auto}"
   +"#tptnav.open .nv-wrap{display:block}#tptnav .nv-links a{padding:13px 18px;font-size:14px}"
   +"}"
   +"@media print{#tptnav,#hw-notice{display:none!important}body{margin-left:0!important}}";

  function run(){
    if (document.getElementById('tptnav')) return;
    var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
    var nav=document.createElement('nav'); nav.id='tptnav';
    var links='';
    GROUPS.forEach(function(gr){
      var c=CLUSTERS[gr[0]]||{};
      if (gr[0]) links+='<div class="nv-g" style="color:'+(c.color||'#6b7684')+'">'+(c.label||gr[0])+'</div>';
      links+='<div class="nv-links">';
      gr[1].forEach(function(p){ links+='<a class="'+(p[0]===cur?'on':'')+'" href="'+href(p[0])+'">'+(GLYPH[p[0]]||'')+(p[2]?'<span class="id">'+p[2]+'</span>':'')+'<span>'+p[1]+(FRESH[p[0]]?'<i class="nv-dot"></i>':'')+'</span></a>'; });
      links+='</div>';
    });
    nav.innerHTML='<div class="nv-b">hub-workspace</div><div class="nv-sub">the exemplar</div>'
      +'<span class="nv-cur">'+(TITLE[cur]||cur)+'</span>'
      +'<button class="nv-burger" aria-label="Menu" aria-expanded="false">☰</button>'
      +'<div class="nv-wrap">'+links+'</div><div class="nv-sp"></div>'
      +'<button class="nv-min" title="Collapse / expand sidebar">⇤⇥</button>'
      +'<div class="nv-ft">MIT · pastarita</div>';
    document.body.insertBefore(nav, document.body.firstChild);
    /* the demo notice — dismissible, remembered per browser */
    var dismissed=false; try{ dismissed = localStorage.getItem('hw_notice')==='x'; }catch(e){}
    if (NOTICE && !dismissed) {
      var band=document.createElement('div'); band.id='hw-notice';
      band.innerHTML='<b>Demo</b>'+NOTICE+'<button aria-label="Dismiss" title="Dismiss">✕</button>';
      document.body.insertBefore(band, nav.nextSibling);
      band.querySelector('button').onclick=function(){ band.remove(); try{ localStorage.setItem('hw_notice','x'); }catch(e){} };
    }
    try{ if (localStorage.getItem('hw_nav')==='min') document.documentElement.classList.add('navmin'); }catch(e){}
    nav.querySelector('.nv-min').addEventListener('click',function(){ var m=document.documentElement.classList.toggle('navmin'); try{ m?localStorage.setItem('hw_nav','min'):localStorage.removeItem('hw_nav'); }catch(e){} });
    var burger=nav.querySelector('.nv-burger');
    burger.addEventListener('click',function(e){ e.stopPropagation(); var o=nav.classList.toggle('open'); burger.setAttribute('aria-expanded',o); burger.textContent=o?'✕':'☰'; });
    document.addEventListener('click',function(e){ if(nav.classList.contains('open')&&!nav.contains(e.target)){ nav.classList.remove('open'); burger.textContent='☰'; burger.setAttribute('aria-expanded','false'); } });
  }
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',run) : run();
})();
