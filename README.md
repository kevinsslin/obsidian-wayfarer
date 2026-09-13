# Wayfarer

Trip planning inside Obsidian. The note is the plan; a pane beside it is the map.

- **Paste a Google Maps link** (including `maps.app.goo.gl` share links) and it becomes `[Name](geo:lat,lng)`.
- **Headings are days.** Every stop under `## 9/17 ...` is that day's stop: same colour, numbered in order, joined by a line.
- **The map follows your cursor.** Put the cursor on a stop and the map flies to it; move into another day and the map reframes that day, drawn at full strength with the rest dimmed. Drag the map and it stays put until you move to another line. The 📍 chip turns following off.
- **Every stop has a face.** Pins carry a category emoji (⛩️ 🍜 🏨 🚉 🏞️ ...) from the place type or name, or the emoji you typed before the link. A `07:53` at the start of the line becomes the stop's time. Indented lines under a stop are its notes and show on the card and in the popup, verbatim.
- **A timeline beside the map.** The left column lists the active day's stops top to bottom (thumbnail, number, time, name, your remark), with an arrow between each pair carrying the leg: `🚶 34 min · 2.5 km`. Click a card and the map flies there, the popup opens, and the editor cursor lands on that line. Drag the divider to resize the column.
- **You choose how you get there.** Click the `?` on an arrow to pick walk, bike, car, taxi, bus, train, metro, tram, boat or flight, or type a transport emoji (🚌 🚶 🚆 🚇 ✈️) before the link. The choice is saved into the note's hidden `%%wf:{}%%` metadata for that line; the plugin never guesses and never edits your text.
- **Photos without pasting any.** Every stop gets a picture from Wikipedia (an article titled like the stop, or for landmarks the nearest article with an image) or the nearest Wikimedia Commons photo. No key, no setup. With a Google key, Google's own place photo is used. An image you put on the line always wins. Thumbnails show in the strip, the full picture in the card, with a credit.
- **Cards, not tooltips.** Click a pin for a card with photo, rating, today's hours, your own note from that line, address, and links: open in Google Maps, directions from the previous stop, website, jump to the line. Photos come from Wikipedia, Commons, Google, or an image you put on the line.
- **Legs between stops are real or absent.** Once a mode is chosen, walking, cycling and driving legs are routed on OpenStreetMap (OSRM) and drawn along the road; train and bus legs use Google Routes when a key is set (line names included). Until then a leg is a dashed straight line with its distance only. Hover a line for the numbers. A routed leg that cannot fit between the two written times turns red with how many minutes late you would be.
- **Opening hours checked against the time you wrote.** When a stop has a time and Google hours, the card says 當天休, 10:00 才開 or 17:00 已關 for the weekday of that heading. A leg between two written times that cannot be made turns red with the minutes you are short.
- **Reorder by dragging.** Drag a card in the strip onto another; the lines move in the note and everything recomputes.
- **Hand the day to Google Maps.** The legend shows a "Google Maps 路線" button for the day you are on: one tap opens that day's stops, in order, as transit directions on your phone or browser. Every pin popup also has an "Open in Google Maps" link.
- **Ratings and opening hours** ride along as a hidden `%%wf:{...}%%` comment and show as a small chip after the link, in both Live Preview and Reading view.

The stop format is the same inline geolink that [Map View](https://github.com/esm7/obsidian-map-view) reads, so its display rules, routing, queries and Bases view all work on the same notes.

## Writing a plan

You never type the link syntax by hand. Run **Insert day headings for a trip**, pick the first day and the length, and you get one heading per day. Then paste Google Maps links under each heading; each one turns into a stop. The result looks like this:

```markdown
---
locations:
---
## 9/16 週三 日光市區
- [東武日光站](geo:36.7509,139.6187)
- [日光ステーションホテル](geo:36.7512,139.6201) tag:stay

## 9/17 週四 上山
1. 07:53 巴士到 [湯滝](geo:36.7938,139.4316)
2. 走木道到 [赤沼](geo:36.7754,139.4432)
3. https://maps.app.goo.gl/...        <- paste, it converts itself
```

Stops before the first heading form their own group. The heading level that starts a day is a setting (default `##`). Headings without stops are skipped.

## Google Maps links

Without any API key the plugin reads coordinates straight out of the link: the exact `!3d…!4d…` pin when present, else the `@lat,lng` viewport centre, `?q=lat,lng`, or `/maps/search/lat,lng`. The place name comes from the `/maps/place/<name>/` segment. Links that only carry text (`?q=Ichiran+Shibuya`) are geocoded with OpenStreetMap Nominatim.

Short links (`maps.app.goo.gl`, `goo.gl/maps`, `g.co`) are expanded on desktop by following the redirect with a non-browser User-Agent, because Google serves browsers an interstitial page instead of a `Location` header. On mobile, paste the full link.

With a **Google Places (New) API key** in settings, links are resolved through the API instead: exact pin, canonical name in your chosen language, rating, opening hours, address and website. Place Details and Text Search each have a free monthly allowance (10,000 Essentials calls as of 2025), which a trip will not come near. The key is stored in the vault's plugin data, never in a note.

## Commands

- **Open itinerary map** (also the ribbon icon)
- **Insert day headings for a trip**
- **Convert Google Maps link on this line to a stop**
- **Convert every Google Maps link in this note**

## Settings

Language (follows Obsidian by default; English or 繁體中文), paste conversion on/off, day heading level, route lines, auto-open, Google API key and language, tile URL and attribution (OpenStreetMap by default).

## Planning with an AI assistant

`skills/wayfarer-plan-trip/` is a skill for Claude Code, Codex and similar agents: how to research, what to check (closed weekdays, real coordinates), and exactly how to write the note so the plugin reads it. Install by copying the folder:

```bash
cp -r skills/wayfarer-plan-trip ~/.claude/skills/
```

Then ask the assistant to plan a trip into a note in your vault. The same folder documents the note format for people in `FORMAT.md`.

## Development

```bash
npm install
npm run check        # lint, typecheck, unit tests, production build, load smoke
npm run dev          # esbuild watch
```

`src/core` has no Obsidian imports and is unit tested (URL parsing, note parsing, resolver). `scripts/expand-check.mjs` hits the network to confirm the short-link strategy still works. `scripts/cdp.mjs` drives a running Obsidian started with `--remote-debugging-port=9222` for end-to-end checks; `test-vault/` is the fixture vault, with the plugin symlinked into `.obsidian/plugins/`.

## Why

Inspired by Ink and Switch's [Embark](https://www.inkandswitch.com/embark/), which is not public, and by [Waypoint](https://github.com/jakelazaroff/waypoint). Both put places in the text and a map beside it. This does the same inside Obsidian, reusing Map View's data format instead of inventing one.

## License

MIT
