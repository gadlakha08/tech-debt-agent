---
name: techdebt-grill-implement
description: Grill the user on edge cases for a tech-debt ticket, record the amended plan, then implement. Use when the user runs /techdebt-grill-implement <KEY>.
---

<!-- Person B, D2-3. -->
1. Load everything techdebt-implement loads.
2. Grill the user in rounds on callers, config, backwards compatibility and tests.
3. Post the amended plan as `[techdebt-plan v(N+1)]` after the user confirms.
4. Hand off to techdebt-implement.
