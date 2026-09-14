# Public screenshots and 0.1.8 verification

Captured on 2026-09-14/15 in the real Obsidian test-vault renderer. The English set uses [Nikko demo.md](../../test-vault/Nikko%20demo.md); the Traditional Chinese regression set uses the existing Japan 2026 fixture. Runtime preferences, original note content and manual progress were preserved. The demo's saved walking routes were fetched by the plugin; transport times are illustrative, not a verified travel timetable.

## Captures

- [Desktop](../screenshots/mobile-en/desktop.png)
- [Map](../screenshots/mobile-en/iphone-floating-map.png)
- [Current / previous / next](../screenshots/mobile-en/iphone-floating-progress.png)
- [List](../screenshots/mobile-en/iphone-floating-list.png)
- [320px with larger text](../screenshots/mobile-en/phone-large-text-progress.png)

Phone captures use emulated pane dimensions and reconstructed mobile host chrome styled with Obsidian's CSS. They are not screenshots from an iOS/Android device. English UI does not translate map labels embedded in the tile provider's images.

## Regression found and fixed

English Previous / Navigate / Next stop labels overflowed the card at 320px with enlarged text. On narrow panes, action buttons now share available columns and wrap their text. Columns adapt to the number of available actions, including the start and completed states. Desktop styling is unchanged.

## Checks

- `pnpm check`: lint, CSS lint, typecheck, 102 tests in 11 files, production build and plugin-load smoke passed.
- `node scripts/journey-smoke.mjs <output> en`: passed on the final CSS, real renderer and English sample.
- `node scripts/journey-smoke.mjs <output> zh-TW`: passed with the existing Chinese fixture after adding label wrapping. The final CSS refinement makes columns adapt to the number of actions; the English suite was rerun after that refinement.
- Host scenarios include floating/hidden/docked navigation, an overlapping header, 390/320px panes and large text. Assertions cover control collisions, scroll reachability, popup bounds, manual progress, previous/next across days, reload persistence and navigation URL semantics. Navigation was intercepted rather than launching directions externally.
- The skill metadata validator passed. Both the bundled example and public sample parse into two days and nine stops, with planning sections excluded from the map.

[English receipts](public-screenshots-en.json) · [Traditional Chinese receipts](public-screenshots-zh.json) · [Skill/language audit](../research/skill-language-audit.md) · [Community launch draft](../launch/community-launch.md).

These checks do not establish real-device touch behavior or complete multilingual planning quality.
