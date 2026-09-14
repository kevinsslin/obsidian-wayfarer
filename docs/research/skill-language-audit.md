# Skill and language audit

Checked against the repository on 2026-09-14 and the [Agent Skills specification](https://agentskills.io/specification) / [creator best practices](https://agentskills.io/skill-creation/best-practices).

## Skill assessment

The skill has the required name and description, a matching folder name, clear task triggers, and a short entrypoint with separate format and example references. It is portable Markdown and does not bind the workflow to one agent's tool names. The separate `FORMAT.md` and `EXAMPLE.md` files are valid; a `references/` folder is optional. Its strengths are the concrete itinerary format, scheduled-versus-research boundary, official-source research, and uncertainty handling.

Corrections made in this audit:

- Preserve existing frontmatter and plugin-owned metadata when revising notes. “No frontmatter required” does not mean “remove frontmatter.”
- Make language precedence explicit: requested language, existing note language, user's language for new notes, English fallback.
- Explain that unsupported routing modes or no Google key mean straight-line connections. Update mobile transport instructions to the stop-details action.
- Avoid claiming full timezone correctness. Transit query departure times use saved offsets or longitude estimates; the red-leg calculation compares written clock times without timezone adjustment.
- Move cancelled stops into undated notes only when authorized. Strikethrough alone does not stop the parser from mapping a geo link.
- Add a final check for day/stop ordering, transfer feasibility, booking evidence and preservation of the existing note.
- Remove a blanket punctuation rule that was a writing preference, not a format requirement.
- Correct inconsistent arrival times within the illustrative example; its travel facts are still examples, not current verified advice.

The local skill validator checks metadata and structure. Passing it is not a certification of planning quality. Further useful evaluation would be real planning/revision tasks in English, Traditional Chinese and Japanese, including a closed attraction, preserved metadata and a cross-zone flight. This audit did not run a multilingual model benchmark.

## Language behavior

| Layer | Current implementation | Implication |
|---|---|---|
| Map UI | `uiLanguage: "auto"`; `localeFor()` maps `zh*` to `zh-TW`, everything else to `en` | English is the fallback, not a forced default for all users. Only English and Traditional Chinese UI dictionaries exist. |
| Settings and commands | Several labels and notices are hardcoded English | The entire plugin is not localized end to end. |
| Google content | `languageCode: "zh-TW"` by default, configurable independently | A fresh English user can still receive Chinese names/hours. Changing the code affects future requests; saved metadata is not translated. |
| Opening-hour interpretation | Recognizes selected English, Chinese and Japanese weekday/status patterns | Google's ability to return another language does not imply complete hours-check support in that language. |
| Generated note | English skill instructions; output-language rules above | Multilingual writing depends on the host model; note syntax is language-independent. |
| Map tiles | Provider-supplied labels | Changing the plugin UI language does not translate labels embedded in tiles. |

Evidence: [settings](../../src/settings.ts), [locale selection](../../src/main.ts), [UI dictionary](../../src/core/i18n.ts), [hours parser](../../src/core/schedule.ts), [leg timing](../../src/core/legs.ts), [transit departure](../../src/routing.ts), [skill](../../skills/wayfarer-plan-trip/SKILL.md).

## Recommended product follow-up

Keep the map UI following Obsidian, with English fallback. For a global launch, change the **new-install Google result default** to English (or derive it from the supported UI locale), preserving all explicitly saved preferences. That behavior change was not included in this documentation/screenshot update. Next, bring settings and commands into the existing dictionary; add another UI language when there is an actual translation and review path. Do not advertise “all languages supported.”
