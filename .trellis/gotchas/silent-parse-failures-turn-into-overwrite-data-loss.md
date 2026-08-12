---
id: silent-parse-failures-turn-into-overwrite-data-loss
type: gotcha
title: Silent parse failures turn into overwrite data loss
summary: A note with broken YAML or a BOM was invisible AND its filename
  clobberable by a same-slug create — two quiet bugs composing into destruction.
confidence: 0.8
tags:
  - vault
  - review-fleet
created: 2026-08-12T08:57:33.369Z
updated: 2026-08-12T08:57:33.369Z
last_confirmed: 2026-08-12T08:57:33.369Z
edges: []
---

Fix: warn loudly on unparseable frontmatter, strip BOM, reserve every seen .md filename in LoadedVault.files so nextId suffixes around them, and writeNode refuses to overwrite files the snapshot does not own.
