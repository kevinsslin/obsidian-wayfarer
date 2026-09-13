# Changelog

## [0.1.0] - 2026-09-13

First release.

- Google Maps link conversion on paste and by command, including `maps.app.goo.gl` short links on desktop.
- Map pane: stops coloured and numbered per heading, route line per day, legend chips, click a pin to jump to its line.
- Cursor tracking: the day under the cursor is emphasised.
- Rating and opening-hours chip from `%%wf:{...}%%` metadata in Live Preview and Reading view.
- "Insert day headings for a trip" command, and a per-day "Google Maps 路線" button that opens the day's stops as transit directions.
- Category emoji on pins and converted stops, time and transport parsed from the line, transport-styled route segments.
- Day strip under the map, popup cards with photo (vault image, URL or Google photo), note, hours, rating and directions from the previous stop.
- Cursor follow: the map flies to the stop under the cursor and pauses while you drag.
- `skills/wayfarer-plan-trip` skill for AI assistants, with the note format reference.
- Routed legs between stops (OSRM for walking, cycling and driving, Google Routes for transit) once the mode is chosen; timeline arrows with a transport picker; late warnings from written times. Nothing is estimated or guessed, and the plugin never edits note text.
- Indented lines under a stop are its notes, shown verbatim.
- Opening-hours check against written times, write-back command for legs, drag to reorder stops.
- Automatic photos from Wikipedia and Wikimedia Commons (no key), cached in plugin data; thumbnails in the strip.
- Timeline column beside the map with a resizable divider; transport is chosen by clicking and saved to the line; the note title heading is no longer a day.
- Vertical timeline with a resizable divider, arrows between cards carrying the leg, no more labels on the map. Interface in English, Traditional Chinese or Japanese, following Obsidian by default.
- Optional Google Places (New) resolution; Nominatim fallback for text-only links.
