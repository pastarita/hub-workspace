# Viewer demo

The Viewer is one leaf, `view.html`, that renders the workspace's non-HTML artifacts inside the
Shell with the same tokens and the same print path. This document exercises the markdown subset
it reads. Links resolve against this document's own directory, so [the README](../README.md) and
[the Access runbook](../references/access-runbook.md) stay inside the Shell, and
[the hub](../index.html) is a leaf link.

## A table

| Surface | Temperature | What it is |
|---|---|---|
| Hub | hot | grouped index, cards only, live tallies |
| Leaf | hot / warm / cold | one self-contained HTML file |
| Viewer | plumbing | renders `.md` `.csv` `.json` `.jsonl` |
| Gate | edge | Access + PIN, Basic auth beside it |

## A task list

- [x] write the leaf
- [x] register it in the Shell
- [ ] card it on the hub
- [ ] `make check`

## Hard-wrapped prose stays one paragraph

This paragraph is wrapped at eighty columns in the source, the way agents and editors
produce markdown, and the Viewer joins the lines into one paragraph instead of emitting one
paragraph per line. An indented continuation under a list item
  continues that item.

## Fenced code keeps its bare numbers

```sh
make check      # 4 lints, about 0.3 s
make deploy     # about 6 s to Cloudflare Pages
```

We ordered 5 units and 12 crates: the fence sentinel must not eat those digits.

> A blockquote, with `inline code` and **bold**.
