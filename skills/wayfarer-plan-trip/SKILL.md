---
name: wayfarer-plan-trip
description: Write or revise a day-by-day travel itinerary as an Obsidian note that the Wayfarer plugin renders as a map. Use when the user asks to plan a trip, add stops or days, reorder a day, or turn research (places, opening hours, transport) into an itinerary note.
---

# Plan a trip in Obsidian

The user keeps trips as Markdown notes. The Wayfarer plugin reads a note and shows a map beside it: headings are days, `[Name](geo:lat,lng)` links are stops, the line's own words carry time, transport and notes. Your job is to write that note well. Read `FORMAT.md` in this folder once before writing.

## Before writing

1. Ask, or find in the conversation: dates, where the nights are spent, pace (how many stops per day the user tolerates), must-sees, and hard bookings (flights, trains, tickets). Do not invent bookings.
2. Look each place up before placing it. You need coordinates and, ideally, opening hours and the closed weekday. Museums and restaurants closed on the planned day are the most common planning error, so check the weekday of every visit.
3. Group stops by geography and by opening hours. A day's stops should be walkable or one transit ride apart. Put fixed-time items first, then fill around them.

## Writing rules

- One `##` heading per day, in date order: `## 9/17 週四 上山，走戰場之原，睡湯元`. Date first, weekday second, a short theme last. The plugin reads the date from the heading.
- Stops go under the heading as a list, in the order the user will visit them. Numbered lists for a fixed sequence, bullets for a loose one.
- Every stop is `[Name](geo:lat,lng)` with 4 to 6 decimals. Use the name the user will see on signs (local script), optionally followed by a familiar name: `[湯滝](geo:36.7938,139.4316)`.
- When you are not sure of coordinates, paste the full Google Maps URL of the place instead of guessing; the plugin converts it when the user opens the note on desktop. Never write a `geo:` link with made-up numbers.
- Write times on stops that have a fixed departure or entry (buses, trains, reservations, last entry). The plugin computes each leg's duration and flags a red leg when the next written time cannot be reached, so real times on the anchors matter more than a time on every line.
- Add a stay length after the link where it is not obvious: `[赤沼](geo:…) ~1h45`, `~45m`. The plugin infers every other time from the anchors and the stays, so a day needs only two or three real times plus stays on the long stops.
- Start the line with the time when it matters: `07:53 巴士到 [湯滝](geo:…)`. Say how the user gets there in plain words before the link (巴士, 走, 新幹線, 地鐵, 計程車, 飛, 船); the plugin reads those to style the route.
- Put a category emoji before the link when the category is not obvious from the name (🍜 food, ☕ cafe, 🏨 stay, ⛩️ shrine, 🛕 temple, 🖼️ museum, 🏞️ nature, ♨️ onsen, 🛍️ shop, 🚉 station, ✈️ airport, 🔭 view, 🏯 castle, 🎭 event). Names that already say 神社, 寺, 駅, ホテル, 美術館 do not need one.
- The rest of the line is the user's note: why go, what to order, the catch (`最後入場 16:30`, `週一休`, `要脫鞋`). Keep it to one line. Longer notes go on an indented line below.
- The night's hotel is the last stop of the day with `tag:stay`.
- An image for a stop goes on the same line or the next: `![[photo.jpg]]` or a URL. Do not add images the user did not provide.
- Everything you were unsure about goes in a final `## 待確認` section as a checklist, not into the day plans as fact.

## What not to do

- Do not write ` · 🚶 34 分 · 2.5 km · ≈08:47 到` trailers by hand; the user generates them with a command once the routes are in.
- Do not write `%%wf:{…}%%` comments; the plugin writes those itself when it has place details.
- Do not add frontmatter beyond `locations:` (empty), which the Map View plugin uses.
- Do not use em dashes or en dashes anywhere. Use commas, full stops, or parentheses.
- Do not pad days with filler stops. Four to six stops a day is a full day for most people; leave room.
- Do not move or delete stops the user placed without saying so.

## Revising an existing note

Read the whole note first. Keep the user's headings, order and wording. Add stops in the form above, on new lines. When reordering a day, move whole lines. When a place turns out closed, keep the line and add the reason after it rather than silently swapping the place.

## Checklist before handing back

- Every day heading has a date the plugin can read (9/17, 2026-09-17, 9月17日, Sep 17, or Day 3).
- Every stop has real coordinates or a full Google Maps URL.
- Times are in 24-hour `HH:MM`.
- Closed days checked for every museum, shop and restaurant.
- A `## 待確認` section lists what still needs the user's decision.
