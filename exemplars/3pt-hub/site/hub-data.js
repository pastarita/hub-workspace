/* hub-workspace exemplar · the Model — AUTHORED. One shared data layer every leaf reads.
   This instance renders the skill's own documents, so the Register is the skill's file list.
   Node-safe: defines globalThis.T and does no DOM work. Hot-leaf state prefix: `hw_`. */
(function(){
  var T = {};
  T.NS = 'hw_';
  T.PROGRAM = { name:'hub-workspace', long:'hub-workspace · the exemplar', repo:'https://github.com/pastarita/hub-workspace' };

  /* Cluster registry — phases of reading the pattern, never file types. */
  T.CLUSTERS = {
    orient:    { label:'Orient',    color:'var(--violet)', blurb:'What a hub workspace is and the contract every agent follows.' },
    reference: { label:'Reference', color:'var(--cyan)',   blurb:'The runbooks and templates the contract points to.' },
    demo:      { label:'Demo',      color:'var(--amber)',  blurb:'The Viewer and the diagram reader, exercised on real input.' },
    record:    { label:'Record',    color:'var(--slate)',  blurb:'Dated audits of real builds against the pattern.' }
  };

  /* The Register — one record per document, read through view.html?f= */
  T.DOCS = [
    { id:'R0', slug:'readme',        name:'README',                 verb:'Entering',   cluster:'orient',    temp:'warm', doc:'README.md',                          epigram:'Install, layout, the exemplar, the license.' },
    { id:'S0', slug:'skill',         name:'SKILL.md',               verb:'Contracting',cluster:'orient',    temp:'hot',  doc:'SKILL.md',                           epigram:'Vocabulary, the three moves, design discipline, provenance, the gate, re-entry, anti-patterns.' },
    { id:'T1', slug:'templates',     name:'Templates',              verb:'Copying',    cluster:'reference', temp:'warm', doc:'references/templates.md',            epigram:'Scaffold checklist and skeletons: leaf, Shell, gate, CI, re-entry set, provenance badge.' },
    { id:'T2', slug:'access',        name:'Access runbook',         verb:'Gating',     cluster:'reference', temp:'hot',  doc:'references/access-runbook.md',       epigram:'Cloudflare Access first, PIN always: the click path, the AUD, the failure table.' },
    { id:'T3', slug:'collaborators', name:'Collaborator access',    verb:'Admitting',  cluster:'reference', temp:'warm', doc:'references/collaborator-access.md',  epigram:'Three tiers, when to graduate, eleven rules for a self-service door.' },
    { id:'T4', slug:'viewer-ref',    name:'Polyglot viewer',        verb:'Rendering',  cluster:'reference', temp:'warm', doc:'references/polyglot-viewer.md',      epigram:'One Viewer for .md .csv .json .jsonl, and the bugs the first drafts shipped.' },
    { id:'T5', slug:'derived',       name:'Derived layer',          verb:'Verifying',  cluster:'reference', temp:'warm', doc:'references/derived-layer.md',        epigram:'Authored model, generated file, generator, verifier.' },
    { id:'T6', slug:'symbols',       name:'Symbolic system',        verb:'Naming',     cluster:'reference', temp:'warm', doc:'references/symbolic-system.md',      epigram:'Register, cluster registry, glyph minting, status glyphs, stable handles.' },
    { id:'T7', slug:'estate',        name:'Estate',                 verb:'Federating', cluster:'reference', temp:'cold', doc:'references/estate.md',               epigram:'The tier above one hub.' },
    { id:'D1', slug:'diagrams',      name:'Diagram reader demo',    verb:'Drawing',    cluster:'demo',      temp:'hot',  doc:'docs/diagrams.md',                   epigram:'Every diagram type the reader handles, rendered live from mermaid fences.' },
    { id:'D2', slug:'viewer-demo',   name:'Viewer demo',            verb:'Reading',    cluster:'demo',      temp:'warm', doc:'docs/viewer.md',                     epigram:'Tables, task lists, code, links that stay inside the Shell.' },
    { id:'V1', slug:'review',        name:'Build review 2026-09-02',verb:'Auditing',   cluster:'record',    temp:'cold', doc:'reviews/2026-09-02-first-build.md',  epigram:'A first build from the skill, and the defects it found in the skill.' }
  ];

  T.doc = function(id){ for (var i=0;i<T.DOCS.length;i++) if (T.DOCS[i].id===id||T.DOCS[i].slug===id) return T.DOCS[i]; return null; };
  T.load = function(key, fallback){ try{ var v=localStorage.getItem(T.NS+key); return v?JSON.parse(v):fallback; }catch(e){ return fallback; } };
  T.save = function(key, val){ try{ localStorage.setItem(T.NS+key, JSON.stringify(val)); }catch(e){} };
  T.esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
  (typeof globalThis!=='undefined'?globalThis:window).T = T;
})();
