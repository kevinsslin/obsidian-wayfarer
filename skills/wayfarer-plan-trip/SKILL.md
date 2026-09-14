---
name: wayfarer-plan-trip
description: Research and write a complete day-by-day trip plan as an Obsidian note that the Wayfarer plugin renders as a map, with stops, times, transport, and the planning notes behind them. Use when the user asks to plan a trip, add or move stops or days, compare options for a stretch, or turn research (places, hours, transport, bookings) into an itinerary note.
---

# Plan a trip in Obsidian

The user keeps trips as Markdown notes. The Wayfarer plugin shows a map beside the note: headings are days, `[Name](geo:lat,lng)` links are stops, the line carries a time, a transport emoji and a remark. Your job is the whole plan, not just the list of stops: the research, the day structure, the reasoning and the fallbacks, written into one note the plugin reads. Read [FORMAT.md](FORMAT.md) before writing; consult [EXAMPLE.md](EXAMPLE.md) when a complete example would help.

## 1. Intake

Find in the conversation, or ask once, briefly:

- Dates, arrival and departure times, and where each night is spent (or whether that is still open).
- Who is going and the pace they tolerate: stops per day, early starts or not, walking limits, children, mobility.
- Fixed things: flights, trains, tickets and reservations already bought. Never invent a booking or a price.
- Must-sees, must-avoids, food priorities, budget ceiling.
- Season and weather risk (typhoon, snow closures, rainy season, heat), and what the user does if the weather turns.

Do not stall on missing answers. Plan on stated assumptions and list them in the open questions.

## 2. Research before placing anything

For every candidate place:

- **Coordinates.** From the place's Google Maps page (the `!3d…!4d…` pair in the URL, or the pin), 4 to 6 decimals. When not certain, keep the full Google Maps place URL for the user to convert with **Convert every map link in this note** on desktop. Never guess numbers; never write a search URL (`?q=name`), it has no pin.
- **Opening days and hours, last entry, seasonal closure.** The single most common planning error is a museum, temple hall, shop or restaurant closed on the planned weekday. Check the weekday of every visit.
- **Getting there and back.** Which bus or train, how often it runs, first and last departures that matter (last bus down the mountain, last ferry), whether a pass covers it, how long it takes.
- **Time needed on site**, and the cost of tickets.
- **What is nearby**, so a day can be walked or covered by one ride.

Prefer official sites and current timetables; note the source in the planning notes when it matters (a timetable, a closure notice).

## 3. Structure the days

- Cluster by geography and by opening hours. A day's stops should be walkable or one transit ride apart.
- Anchor each day on its fixed-time items (a departure, a reservation, a last entry) and fill around them, moving outward in the morning and back toward the night's hotel.
- Give each day a theme in its heading (`## 2026-09-17 Thu Up to Senjogahara, sleep at Yumoto`) and make the night's hotel its last stop.
- Four to six stops is a full day for most people. Leave slack after long transfers and before fixed times.
- A stretch the user has not decided yet stays one range heading (`## 2026-09-19 ~ 2026-09-26 Tokyo`) with a line saying what is undecided. Do not invent a per-day schedule to fill it.
- For any stretch with a real choice (this base or that one, mountain or coast, day trip or not), decide, and keep the runner-up as a written backup with the trigger that would switch to it (weather, a closure, a sold-out train).

## 4. Write the note

Two parts, one note. The plugin reads the first; the second is why the first looks the way it does.

**The itinerary**: one heading per day in date order, full `YYYY-MM-DD` first, then weekday and theme. Under it, the stops as a list in visiting order (numbered when the sequence is fixed, bullets when loose). Each stop line:

```
- 07:53 🚌 [Yudaki Falls](geo:36.7959,139.4285) bus from Tobu-Nikko, buy the two-day pass
    Falls are at the bus stop; the trail down to the lake starts left of the tea house
```

- Time first, only when the stop has a fixed time (departure, entry slot, last entry).
- A transport emoji before the link only when the user said how they get there or it follows from the plan (🚶 🚲 🚗 🚕 🚌 🚆 🚇 🚊 ⛴️ ✈️). With a Google API key and a supported mode, the plugin can fetch a route; otherwise it shows a straight-line connection. Do not guess a mode; leave it out and the user picks it on the map.
- A category emoji before the link when the name does not say what it is (🍜 food, ☕ cafe, 🏨 stay, ⛩️ shrine, 🛕 temple, 🖼️ museum, 🏞️ nature, ♨️ onsen, 🛍️ shop, 🚉 station, 🛬 airport, ⚓ port, 🔭 view, 🏯 castle, 🎭 event).
- The rest of the line is the one-line remark: why go, what to order, the catch (`last entry 16:30`, `closed Mondays`, `cash only`). Longer notes go on indented lines directly below; the plugin shows them verbatim on the stop's card.
- Names in the script the user will see on signs, optionally followed by a familiar name.

**The planning notes**: undated `##` sections after the last day. Their links stay off the map. Use the sections that apply, in this order:

- `## Hard constraints`: dates, arrival and departure times, budget, mobility, anything non-negotiable.
- `## Bookings`: two lists, confirmed and still to book, each with date, time, price if known, and where to book. Confirmed only when the user said so.
- One section per stretch that needed a decision (`## Sep 16 to 18: escaping the Tokyo heat`): the decision in one line, the reasoning, the costs (money, time, energy), the backup with its switch trigger, and the sources you relied on.
- `## Open questions`: a checklist of what still needs the user or a later check (a forecast date, a ticket release, a place whose hours you could not confirm).

Use the user's requested language; when revising, preserve the note's language unless asked to translate. For a new note, follow the user's language and fall back to English when no preference is apparent. Translate prose and heading labels, but preserve full ISO dates, coordinates, links and plugin metadata. Keep local place names useful for reading signs. Keep sentences short and concrete; the user reads this on a phone at a bus stop.

## 5. Hand back

Keep the handback brief. Open the note with the Wayfarer map beside it; on desktop run **Convert every map link in this note** for any URLs you left. With a Google API key, **Fetch Google details for stops without them** adds hours and photos. Choose transport on the desktop timeline arrows or via **Change transport** in a stop’s details on mobile. Point out red legs (two written times too close for the leg between them), "closed that day" chips and remaining open questions.

## Rules

- Never fabricate or edit `%%wf:{…}%%` metadata; the plugin owns it. Preserve existing comments with their stop when moving or editing text.
- No frontmatter is required. Preserve existing user properties. A written time is local to that place; transit departure queries use saved UTC offsets when available and otherwise estimate from longitude. The red-leg timing check does not adjust for time zones, so verify cross-zone transfers explicitly.
- Never write ` · 🚶 34 min · 2.5 km` trailers by hand; the plugin computes legs.
- Do not pad days with filler stops, and do not move or delete stops the user placed without saying so.
- Everything you were unsure about goes into the open questions, not into a day as fact.

Before handing back, check date order, weekdays, stop order and transfer feasibility. Confirm that only scheduled stops sit under dated headings, reservations are marked confirmed only with evidence, and source links or open questions support uncertain hours and timetables. When revising, inspect the diff for unintended changes to properties, metadata and attached notes.

## Revising an existing note

Read the whole note first, including the planning notes. Keep the user's headings, order and wording. Add stops on new lines in the form above. When reordering a day, move whole lines (a stop's indented notes travel with it). When a place turns out closed or wrong, explain it and propose a replacement. If removing it from the schedule is authorized, move the original stop block with its notes and metadata into an undated planning section with the reason; strikethrough alone does not remove a geo link from the map. Update the affected planning-notes section and the open questions in the same edit.
