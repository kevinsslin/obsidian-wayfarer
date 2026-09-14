# Wayfarer

Trip planning inside Obsidian. The note is the plan; a pane beside it is the map.

- **Paste a Google Maps link** (including `maps.app.goo.gl` share links) and it becomes `[Name](geo:lat,lng)`.
- **Headings are days.** Every stop under `## 2026-09-17 週四 …` is that day's stop: same colour, numbered in order, joined by a line with an arrow.
- **The map follows your cursor.** Put the cursor on a stop and the map flies to it; move into another day and the map reframes that day, drawn at full strength with the rest dimmed. Drag the map and it stays put until you move to another line. The 📍 chip turns following off.
- **Every stop has a face.** Pins carry a category emoji (⛩️ 🍜 🏨 🚉 🏞️ …) from the place type or name, or the emoji you typed before the link. A `07:53` at the start of the line becomes the stop's time. Indented lines under a stop are its notes and show on the card and in the popup, verbatim.
- **A timeline beside the map.** The left column lists the active day's stops top to bottom (thumbnail, number, time, name, your remark), with an arrow between each pair carrying the leg. Click a card and the map flies there, the popup opens, and the editor cursor lands on that line. Drag the divider to resize the column, or fold it away with the handle on the divider.
- **You choose how you get there.** Click the `?` on an arrow to pick walk, bike, car, taxi, bus, train, metro, tram, boat or flight, or type a transport emoji (🚌 🚶 🚆 🚇 ✈️) before the link. Picking one writes that emoji before the link (replacing the one already there), so the text always says what the map says; nothing else on the line is touched and nothing is guessed.
- **Routes come from Google, or not at all.** With your Google key, a leg whose mode you chose is routed by Google Routes: real time and distance, the line drawn along the road or rail, transit line names, and the mode's emoji at the leg's midpoint. Without a key a leg is a straight line with its distance only. A routed leg that cannot fit between the two written times turns red with how many minutes late you would be.
- **Cards, not tooltips.** Click a pin for a card with the photo, rating, hours, your notes, address, and links: open in Google Maps, directions from the previous stop in the mode you chose, website, jump to the line.
- **Opening hours checked against the time you wrote.** When a stop has a time and Google hours, the card says 當天休, 10:00 才開 or 17:00 已關 for the weekday of that heading.
- **Reorder by dragging.** Drag a card in the timeline onto another; the stop's lines (including its notes) move in the note and everything recomputes.
- **Photos only when they are real.** An image you put on the stop's line or under it (vault file or URL) is shown first; with a Google key, Google's own place photo. Nothing is searched for.
- **Ratings and opening hours** ride along as a hidden `%%wf:{…}%%` comment and show as a small chip after the link, in both Live Preview and Reading view.

The stop format is the same inline geolink that [Map View](https://github.com/esm7/obsidian-map-view) reads, so its display rules, queries and Bases view work on the same notes.

## Writing a plan

You never type the link syntax by hand. Run **Insert day headings for a trip**, pick the first day and the length, and you get one heading per day. Then paste Google Maps links under each heading; each one turns into a stop. The result looks like this:

```markdown
---
locations:
---
## 2026-09-16 週三 日光市區
- [東武日光站](geo:36.7509,139.6187)
- 🏨 [日光ステーションホテル](geo:36.7512,139.6201)

## 2026-09-17 週四 上山
1. 07:53 🚌 [湯滝](geo:36.7938,139.4316)
2. 🚶 [赤沼](geo:36.7754,139.4432) 走木道
    木道有時封閉，出發前看官網
3. https://maps.app.goo.gl/...        <- paste, it converts itself
```

**One `##` heading per day, starting with the full date:** `## 2026-09-17 週四 上山`. After the date write whatever you like. The date is what makes the weekday, opening-hours and departure-time checks possible; in a note with no dates at all every heading is a day, with nothing checked. The pane shows the date as `9/17`. A stretch you have not planned day by day yet, or want to keep as one block, gets a range heading: `## 2026-09-19 ~ 2026-09-26 東京` (also `～`, `to` or `到`). It is one chip and one section, shown as `9/19~9/26`; since the day is not certain, nothing in it is checked against a weekday. Everything else about the trip lives in the same note: once there is at least one dated heading, undated `##` sections (to-do checklists, research, candidate places, alternatives) are plain notes and their links stay off the map, so the map shows only what is actually in the itinerary. Stops before the first heading form their own group; headings without stops are skipped; the heading level is a setting (default `##`).

## Sharing a plan

Send the `.md` file. Anyone with Obsidian and Wayfarer sees the same pins, order, times, notes, chosen transport and the routed times and distances, because all of it is in the file: when Google answers a route, its duration, distance and line names are saved on the destination stop's `%%wf:{…}%%` (tagged with the previous stop's coordinates, so a reordered stop drops the stale entry and refetches). Companions without a key see those numbers with a straight line; with a key they also get the road drawn and Google photos. Without the plugin, the note is a plain, readable itinerary: the `%%wf:{…}%%` comments are hidden by Obsidian in Reading view.

## Taking it to Google Maps

Run **Export to Google My Maps (KML)**. It writes `<note title>.kml` next to the note (`Japan 2026.kml` for a note called `Japan 2026`), one folder per day, one placemark per stop named `1. 07:53 🏞️ 湯滝` with your notes, hours, address and a Google Maps link in its description, pins in the day's colour. Then in [Google My Maps](https://mymaps.google.com): *Create a new map → Import → pick the file*. Each day becomes a layer you can switch on and off; the map appears in the Google Maps app under *Saved → Maps* and can be shared with companions.

There is no API for writing into a Google account's saved places, so this is one-way and there is no sync: the note is the plan, the My Maps copy is a snapshot. After changing the plan, export again and replace the old map (delete its layers, import the new file). The file is regenerated in full every time, so two exports of the same note are identical.

## Google Maps links

Wayfarer is built around Google Maps: you find the place there, tap *Share*, and paste the link. The link is the source of truth. Without a key the plugin reads the pin straight out of it: the exact `!3d…!4d…` coordinate when present, else the `@lat,lng` viewport centre, `?q=lat,lng`, or `/maps/search/lat,lng`. The place name comes from the `/maps/place/<name>/` segment. A link that carries only a search text and no coordinates is refused: share the place instead. The plugin never geocodes names through a third party.

Short links (`maps.app.goo.gl`, `goo.gl/maps`, `g.co`) are expanded on desktop by following the redirect with a non-browser User-Agent, because Google serves browsers an interstitial page instead of a `Location` header. On mobile, paste the full link.

With a key, Google adds the canonical name, rating, hours, address, website and photo: by place id when the link has one, otherwise by looking the name up near the link's pin. A result that lands elsewhere (more than 300 m from an exact pin, 3 km from a viewport centre) is a different place and is dropped, and an exact pin is never moved. A same-named branch elsewhere never replaces the place you shared.

## Getting a Google API key

Wayfarer uses your own key, so the free monthly allowance is yours and nothing goes through a third party. A trip's worth of lookups stays far inside the free tier (as of 2025: 10,000 Places Essentials calls and 10,000 Routes Essentials calls per month at no charge).

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in. Create a project (any name, e.g. "Wayfarer").
2. Enable billing on the project. Google requires a card on file even for the free tier; you can also set a budget alert at $1 so you are warned before anything is charged.
3. Go to **APIs & Services → Library** and enable two APIs: **Places API (New)** and **Routes API**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**. Copy the key (`AIza…`).
5. Click the key to edit it, and under **API restrictions** choose *Restrict key* and tick only Places API (New) and Routes API. Save. This way the key is useless for anything else if it ever leaks.
6. In Obsidian: **Settings → Wayfarer → Google API key**, paste it. Also set *Language for Google results* (default `zh-TW`) to the language you want place names and hours in.

Then press **Test key** next to the field. It makes one Places call and one Routes call and tells you the result. If Google refuses, the notice carries Google's own reason; the usual one is "Places API (New) has not been used in project … or it is disabled", which means step 3 was skipped for that API. The same notice appears once per session if a route request is refused while the map is open, so a key that does nothing is never silent.

**How many calls a trip costs.** Wayfarer is built to call Google as rarely as it can, and everything it learns is written into the note so nobody asks twice:

- Converting a pasted link is one Places call per stop, once. Rating, hours, address and photo reference are saved in the `%%wf%%` comment on the line.
- A routed leg is one Routes call per leg, once. Duration, distance and line names are saved on the destination stop; opening the note again, on any machine, reads them from the note and asks nothing. Only a leg with no saved result (new stop, reordered, transport changed) is asked.
- Photos are loaded from Google each time a card with a photo is drawn; Obsidian caches them like a browser.
- Opening the map, clicking around, switching days: zero calls.

A 60-stop trip therefore costs on the order of 100 to 150 calls in total, against the 10,000 per month of each free allowance.

The key is stored in this vault's `.obsidian/plugins/wayfarer/data.json`. It is never written into a note. If you sync or share the whole vault, everyone with the vault gets the key, so restrict it as in step 5.

## Commands

- **Open itinerary map** (also the ribbon icon)
- **Insert day headings for a trip**
- **Convert Google Maps link on this line to a stop**
- **Convert every Google Maps link in this note**
- **Export to Google My Maps (KML)**
- **Fetch Google details for stops without them**: for stops written as coordinates (by hand or by an assistant), asks Places once per stop for the place at that pin and saves rating, hours, address, website and photo. The pin never moves; a result more than 300 m away is not taken.

## Settings

Language (follows Obsidian by default; English or 繁體中文), paste conversion, category emoji on converted places, cursor follow, auto-open, Google API key and result language, day heading level, route lines, tile URL and attribution (OpenStreetMap by default).

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
