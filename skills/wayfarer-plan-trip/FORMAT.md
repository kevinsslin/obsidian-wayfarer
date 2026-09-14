# Note format read by Wayfarer

```markdown
# Japan, autumn 2026

Before the trip: from Haneda take the Keikyu line straight to Asakusa.

## 2026-09-16 Wed Nikko town

Limited Express Revaty Kegon 47 at 19:19.

- [Tobu-Nikko Station](geo:36.7476,139.6189)
- 🏨 [Nikko Station Hotel Classic](geo:36.7469,139.6215)

## 2026-09-17 Thu Up to Senjogahara, sleep at Yumoto

1. 07:53 🚌 [Yudaki Falls](geo:36.7959,139.4285)
2. 🚶 [Akanuma](geo:36.7710,139.4558) boardwalk across the marsh
    Boardwalk sometimes closed after rain, check the park site
3. 12:52 🚌 [Chuzenji Lake](geo:36.7368,139.4769)
4. [Kegon Falls](geo:36.7380,139.5020) last elevator 17:00
5. back to ♨️ [Yumoto Onsen](geo:36.8068,139.4231)

## 2026-09-19 ~ 2026-09-26 Tokyo

Not planned day by day yet. Staying in the city over the long weekend.

- [Nezu Shrine](geo:35.7203,139.7610) festival from 9/26

## 2026-09-27 Sun Fukuoka

- [Nezu Shrine](geo:35.7203,139.7610) morning procession
- afternoon [Haneda](geo:35.5494,139.7798) flight to [Fukuoka Airport](geo:33.5859,130.4507)
- 🍢 [Nakasu food stalls](geo:33.5930,130.4062) lively only after ten ![[nakasu.jpg]]
- Coordinates not looked up yet, so the full link: https://www.google.com/maps/place/Senkoji+Temple/@34.4090,133.2050,17z

## Open questions

- [ ] Switch 9/22 to Karuizawa? Decide on the 9/14 forecast
- [ ] Sumo September tournament tickets
```

| Element | How the plugin reads it |
|---|---|
| `## 2026-09-17 Thu Theme` | A day. One heading per day, the full `YYYY-MM-DD` first, then anything. Only a full date counts as a date; a heading without one is a day with no weekday or hours checks. Level is a setting (default `##`). |
| `## Open questions` or any heading without a date | Once the note has dated headings, an undated section is notes: to-do checklists, research, candidate places, the reasoning behind the plan. Links in it stay in the text but do not appear on the map. Text before the first heading is treated the same way. Keep everything about the trip in the one note. |
| `## 2026-09-19 ~ 2026-09-26 Tokyo` | A range: several days kept as one block, for a stretch not yet planned day by day. Two full dates joined by `~`, `～`, `-`, `to` or `到`. One chip (`9/19~9/26`), no weekday checks. Split it into day headings once the days are decided. |
| `[Name](geo:lat,lng)` | A stop. Same format as the Map View plugin. |
| `07:53` at line start | The stop's time, local time at that place. |
| Transport emoji before the link | How you get there: 🚶 walk, 🚲 bike, 🚗 car, 🚕 taxi, 🚌 bus, 🚆 🚄 🚃 train, 🚇 metro, 🚊 tram, ⛴️ boat, ✈️ flight. Words are not read. Picking a transport on the arrow in the map pane writes this emoji before the link (replacing the one there). It is the only place the transport lives. |
| Indented lines under a stop | The stop's notes, shown verbatim on its card and popup. No format inside them is interpreted: a `geo:` link there is text, not another stop. |
| `- [ ] 07:53 [Name](geo:…)` | A task line is a stop like any other; the box is not shown in the note text. |
| `%% … %%` | An Obsidian comment. Links inside it are not stops. |
| Category emoji before the link | The pin's icon. Otherwise from the Google type or the name. Airports are 🛬 and ports ⚓ so they never read as a flight or boat leg. |
| Rest of the line | Shown as the remark in the stop's card. |
| `![[img.jpg]]` or image URL on the line or the next | Photo in the card. |
| `%%wf:{…}%%` after a link | Plugin metadata: Google details (rating, hours, address, photo, UTC offset) and the last routed leg. Written by the plugin, never by hand. Leave it as is. |
| Full Google Maps URL | Converted to a stop when pasted or via the convert command. Short `maps.app.goo.gl` links only on desktop. |
