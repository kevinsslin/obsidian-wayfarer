# Wayfarer

Trip planning inside Obsidian. The note is the plan; a pane beside it is the map.

![The note on the left, the map and timeline on the right](docs/screenshots/hero.jpg)

Paste a Google Maps link and it becomes a stop. Write one heading per day and the map colours, numbers and connects that day's stops. Put the cursor on a stop and the map flies there. Pick how you get from one stop to the next and Google Routes draws the way with real times. Everything the plugin learns is written back into the note, so the file stays the single source of truth and works on any machine, with or without an API key.

## What you get

- **Stops are links.** `[Name](geo:lat,lng)`, the same inline format the [Map View](https://github.com/esm7/obsidian-map-view) plugin reads. You never type it: paste a Google Maps link (short `maps.app.goo.gl` links included) and it converts itself.
- **Headings are days.** `## 2026-09-17 Thu Up to Senjogahara` starts a day. A range like `## 2026-09-19 ~ 2026-09-26 Tokyo` keeps a stretch you have not planned yet as one block. Undated sections (research, to-dos, candidates) stay in the same note and off the map.
- **A timeline beside the map.** The active day's stops top to bottom with photo, time, name and your remark, an arrow between each pair carrying the leg. Click a card to fly there; drag a card to reorder the note.
- **You choose the transport.** Type a transport emoji before the link (🚶 🚲 🚗 🚕 🚌 🚆 🚇 🚊 ⛴️ ✈️) or pick it on the arrow. The pick writes the emoji into the text, so the note and the map never disagree. Nothing is guessed.
- **Routes from Google, once.** With your key, a leg with a chosen mode is routed by Google Routes: time, distance, transit line names, the line drawn along the road. The result is saved on the stop, so nobody asks twice and companions without a key see the same route.
- **Cards, not tooltips.** Click a pin for the photo, rating, today's opening hours, your notes, address, and links to Google Maps, directions and the line in the note.
- **Checks against what you wrote.** A time at the start of the line is the stop's time. A routed leg that cannot fit between two written times turns red. A stop with Google hours says "closed that day" or "opens 10:00" for that weekday.
- **Export to Google My Maps.** One KML per note, one layer per day, for the Google Maps app on the road.

![The timeline beside the map, and a stop card with photo, rating, notes, address and links](docs/screenshots/popup.jpg)

## Writing a plan

```markdown
---
timezone: Asia/Tokyo
---
## 2026-09-16 Wed Arrive in Nikko
- 15:40 🚆 [Tobu-Nikko Station](geo:36.7476,139.6189) Limited Express from Asakusa
- ⛩️ [Nikko Toshogu](geo:36.7580,139.5990) last entry 16:30
    Bring 1,600 yen cash for the ticket

## 2026-09-17 Thu Up to Senjogahara
1. 07:53 🚌 [Yudaki Falls](geo:36.7938,139.4316) buy the two-day bus pass
2. 🚶 [Akanuma](geo:36.7754,139.4432) boardwalk across the marsh
3. https://maps.app.goo.gl/...        <- paste, it converts itself

## Ideas for later
- [ ] Ryuzu Falls if there is time
```

Run **Insert day headings for a trip** to get the headings, then paste links under each. The full date on the heading is what makes weekday, opening-hours and departure checks possible. Indented lines under a stop are its notes. The `timezone` key makes written times local to the trip when you plan from elsewhere. The complete format is in [FORMAT.md](skills/wayfarer-plan-trip/FORMAT.md).

![Rating and hours chips after each link in Reading view](docs/screenshots/reading.jpg)

## Google API key

Optional. Without a key you get pins from the link's coordinates and straight-line distances. With a key you also get place details, photos and routed legs. The key is yours, stored in this vault's `.obsidian/plugins/wayfarer/data.json` and never written into a note; requests go only to Google's Places and Routes endpoints.

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable billing (Google requires a card even for the free tier; set a budget alert at $1).
2. Enable **Places API (New)** and **Routes API**.
3. Create an API key and restrict it to those two APIs.
4. Paste it in **Settings → Wayfarer → Google API key** and press **Test key**.

Wayfarer calls Google as rarely as it can: one Places call per stop when it is converted (or when you run **Fetch Google details for stops without them**), one Routes call per leg the first time it is routed, one photo download per stop per session. Results are saved in the note. A 60-stop trip costs about 60 Places calls once and one Routes call per leg once. Google's free monthly allowance covers 1,000 Places calls at the tier these fields use, 10,000 photo loads and 10,000 Routes calls.

## Installation

From the community plugin browser once listed, or manually: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/kevinsslin/obsidian-wayfarer/releases/latest) into `<vault>/.obsidian/plugins/wayfarer/` and enable it under **Settings → Community plugins**. [BRAT](https://github.com/TfTHacker/obsidian42-brat) with `kevinsslin/obsidian-wayfarer` also works.

Desktop only for now: short-link expansion follows the redirect with Node's https, which Obsidian does not offer on mobile.

## Commands

**Open itinerary map** · **Insert day headings for a trip** · **Convert Google Maps link on this line to a stop** · **Convert every Google Maps link in this note** · **Fetch Google details for stops without them** · **Export to Google My Maps (KML)**

## Planning with an AI assistant

`skills/wayfarer-plan-trip/` is a skill for Claude Code, Codex and similar agents: how to research a trip and exactly how to write the note so the plugin reads it. Copy the folder into your agent's skills directory (for Claude Code, `~/.claude/skills/`).

## Development

```bash
pnpm install
pnpm check   # lint, typecheck, tests, build, load smoke
pnpm dev     # esbuild watch
```

`src/core` has no Obsidian imports and is unit tested. To release: `pnpm bump 0.1.1`, commit, `git tag 0.1.1`, push the tag; the workflow builds and attaches the three files.

## Credits

Inspired by Ink and Switch's [Embark](https://www.inkandswitch.com/embark/) and by [Waypoint](https://github.com/jakelazaroff/waypoint). Map rendering by [Leaflet](https://leafletjs.com/), tiles from [OpenStreetMap](https://www.openstreetmap.org/copyright) by default. MIT license.
