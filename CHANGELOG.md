# Changelog

## [0.1.0] - 2026-09-14

First release.

- Desktop only for now: short-link expansion uses Node's https, and Obsidian's submission rules require `isDesktopOnly` for any Node use. The map follows a note opened in the same pane, not only a change of pane. A long card scrolls its text under a fixed photo and stays clear of the chip bar.

- Second audit pass, performance: zooming moves only the arrowheads instead of rebuilding every pin, line and card; legs are computed once per draw; the tile layer is only replaced when its URL changes; a route arriving no longer forces a parse and draw per leg; editor chips compare raw text and skip cursor moves within a line; tooltips are built when shown; a failed photo is not asked for again on every redraw and the photo cache is bounded. Bugs: a route for a place that appears twice in the note (the hotel every evening) goes to the right line; a timeline card dropped on the editor no longer types its line number; the pinned day follows its heading when days are added or removed; "Go to line" on a hovered card goes to that card's stop; a pasted link keeps its trailing full stop out of the URL; the new-trip date defaults to the local day; a heading inserted mid-line starts on its own line; opening hours running past midnight count for the small hours of the next day; `[label](maps url)` and `$` in names survive conversion and messages; four-backtick fences and commented-out headings are ignored.
- Pre-release audit: a `%%wf:{}%%` comment is written to the stop it belongs to when a line holds several stops; a route that arrives after the note changed or the pane moved to another note is dropped, not written to the wrong line or file; a leg Google has no route for, or a refused key, is not asked again on every redraw; Google photos are downloaded once per session and shared by cards and popups; a `timezone:` frontmatter key makes transit departures local to the trip; a time is read after an emoji with a variation selector or a task box; headings inside code fences and links inside `%%` comments are not part of the plan; indented geo links under a stop are notes, as documented; hand-edited metadata of the wrong type is ignored instead of breaking the editor chips; changing a setting redraws the pane; Japanese opening hours pick the right weekday; bike legs open bicycling directions; "Convert every link" handles several links per line and counts only the converted ones; converting a link inside `[label](url)` keeps the label.

- Google Maps link conversion on paste and by command, including `maps.app.goo.gl` short links on desktop. With a Google key, exact pins with rating, opening hours, address, website and photo; a text lookup is only accepted when it lands where the link points.
- Timeline cards show one summary line; the chosen card unfolds its notes and folds again when another is chosen. The camera and popups centre on the part of the map not covered by the floating timeline. "All" is the first chip.
- A refused Google request (API not enabled, key restricted) is reported once with Google's message; a **Test key** button in settings makes one Places and one Routes call. A leg whose result is already saved on the stop is never asked again.
- Command **Fetch Google details for stops without them** enriches hand-written stops (rating, hours, address, photo) one Places call each, pin unchanged.
- Writes from the pane (transport, routed legs, drag reorder) go to the file when the note is in Reading view; before, they landed in the hidden editor and were never saved.
- Undated sections in a note that has dated days are notes, not days: to-dos, research and candidates live in the same note and stay off the map. Straight legs are dashed, routed ones solid; the route shape is saved with the leg so the road is drawn without asking again. Hovering a pin shows its card; choosing a card in the timeline shows the same card on the map. Chips switch on the first click.
- Range headings (`## 2026-09-19 ~ 2026-09-26 東京`) keep several days as one block for a stretch not yet planned day by day: one chip, one section, no weekday checks.
- Map pane beside the note: pins coloured and numbered per day heading, category emoji on pins, lines with arrowheads between a day's stops, click a pin for a card.
- Cursor follow: the map flies to the stop under the cursor and reframes the day; pauses while you drag.
- Timeline column: the day's stops top to bottom with thumbnails, times and notes; a transport picker on each arrow; drag to reorder (the stop's notes move with it); resizable and collapsible.
- Transport is the emoji before the link, written by you or by picking on the arrow in the pane (the pick replaces the emoji in the text, so note and map never disagree). Nothing is guessed.
- Routes between stops from Google Routes when a key is set (walk, bike, drive, transit with line names), drawn along the way with the mode's emoji at the midpoint; distance only otherwise. Late warning when a routed leg cannot fit between two written times.
- Opening-hours check against the written time for the heading's weekday.
- Indented lines under a stop are its notes, shown verbatim.
- Routed times, distances and line names are saved on the stop so companions without a key see them; stale after a reorder, then refetched.
- "Export to Google My Maps (KML)": one folder per day, named after the note, regenerated in full each time.
- `%%wf:{…}%%` metadata shown as a small chip in Live Preview and Reading view.
- "Insert day headings for a trip" command writing `## YYYY-MM-DD 週X` headings.
- Interface in English or Traditional Chinese, following Obsidian by default.
- `skills/wayfarer-plan-trip` skill for AI assistants, with the note format reference.
