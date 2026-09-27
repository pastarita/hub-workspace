# Diagram reader demo

Every diagram on this page is a plain mermaid fence in the markdown. The Viewer hands each one to
`site/diagram.js`, which reads the subset below and renders SVG in the site's tokens. There is no
mermaid library on this page. Colour comes from the class *name* (`:::hub`), never from the hex
in `classDef`, so the tokens keep one source. Flow kind is line style, never colour alone.

## Flowchart with subgraphs, six shapes, five edge styles

```mermaid
flowchart LR
  subgraph IN["inputs · what arrives"]
    direction TB
    A[document]:::data
    B[(records)]:::store
    C[/stream/]:::data
  end
  subgraph H["the hub"]
    direction TB
    Sh[Shell]:::hub --> M[Model]:::model --> L[leaf]:::leaf
    L ==>|state| M
  end
  subgraph OUT["outputs"]
    direction TB
    S([surface]):::surface
    F{{gate}}:::gate
    R((print)):::rails
  end
  A & B & C --> H
  H --> S & F
  L -.->|"cold leaves"| R
  IN -.- OUT
  classDef hub fill:#000
```

## A long chain wraps serpentine

```mermaid
flowchart LR
  N1[write the leaf] --- N2[register it] --- N3[card the hub] --- N4[make check] --- N5[preview] --- N6[open a PR] --- N7[preview URL] --- N8[review] --- N9[merge] --- N10[deploy]
```

## Sequence

```mermaid
sequenceDiagram
  autonumber
  participant A as agent
  participant V as Viewer
  participant D as diagram.js
  A->>V: view.html?f=docs/diagrams.md
  V->>V: md(text) finds a mermaid fence
  loop every fence
    V->>D: render(source)
    D-->>V: <svg …>
  end
  Note over V,D: a fence the reader cannot parse stays visible as source, with the reason
  V-->>A: the page
```

## Git graph

```mermaid
gitGraph
  commit id: "scaffold"
  commit id: "leaf · lanes" tag: "v0.1"
  branch preview
  checkout preview
  commit id: "leaf · explorer"
  commit id: "fix · nav lint" type: REVERSE
  checkout main
  merge preview id: "merge · explorer" tag: "v0.2"
  commit id: "access · PIN"
```

## State diagram

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Preview : open PR
  Preview --> Draft : changes requested
  Preview --> Live : merge to main
  state "gated" as G {
    Access
    OneTimePIN
  }
  Live --> G
  G --> [*]
```

## Class diagram

```mermaid
classDiagram
  class Leaf {
    <<html>>
    +nav.js
    +tokens
    +one file
  }
  class Shell {
    +GROUPS
    +ROUTE
    +GLYPH
    +href(slug)
  }
  class Model {
    +DOCS
    +CLUSTERS
    +load() save()
  }
  class Viewer
  class Reader
  Leaf --> Shell : includes
  Leaf --> Model : reads
  Viewer --|> Leaf
  Viewer ..> Reader : mermaid fences
  Shell ..> Model : keys must match
```
