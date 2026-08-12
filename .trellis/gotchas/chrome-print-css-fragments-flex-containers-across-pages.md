---
id: chrome-print-css-fragments-flex-containers-across-pages
type: gotcha
title: Chrome print CSS fragments flex containers across pages
summary: Headless-Chrome PDF rendering strands half-empty pages when page
  content sits in flex columns; use display:block + margins.
confidence: 0.8
tags:
  - pdf
  - css
created: 2026-08-12T08:34:10.310Z
updated: 2026-08-12T08:34:10.310Z
last_confirmed: 2026-08-12T08:34:10.310Z
edges: []
---

Hit while rendering the roadmap PDF. Also: grid card containers need break-inside: avoid or their gap-color paints a stray band at the page break, and section eyebrows need break-inside/break-after: avoid to not orphan.
