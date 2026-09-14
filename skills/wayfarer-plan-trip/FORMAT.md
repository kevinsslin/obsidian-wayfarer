# Note format read by Wayfarer

```markdown
---
locations:
timezone: Asia/Tokyo
---
# 日本 2026 秋

行前：落地後直接搭京急到淺草。

## 2026-09-16 週三 日光市區

搭 19:19 的リバティけごん 47 號。

- [東武日光站](geo:36.7509,139.6187)
- 🏨 [日光ステーションホテルクラシック](geo:36.7512,139.6201)

## 2026-09-17 週四 上山，走戰場之原，睡湯元

1. 07:53 🚌 [湯滝](geo:36.7938,139.4316)
2. 🚶 [赤沼](geo:36.7754,139.4432) 走木道
    木道有時封閉，出發前看官網
3. 12:52 🚌 [中禪寺湖](geo:36.7345,139.4823)
4. [華嚴瀑布](geo:36.7383,139.5030) 最後上電梯 17:00
5. 回 ♨️ [湯元溫泉](geo:36.7955,139.4247)

## 2026-09-19 ~ 2026-09-26 東京

還沒排到每天。連假 9/19 到 9/23 不出城。

- [根津神社](geo:35.7203,139.7610) 9/26 起例大祭

## 2026-09-27 週日 福岡

- [根津神社](geo:35.7203,139.7610) 早上看宮神輿
- 下午 [羽田](geo:35.5494,139.7798) 飛 [福岡機場](geo:33.5859,130.4507)
- 🍢 [中洲屋台](geo:33.5930,130.4062) 晚上十點後才熱鬧 ![[nakasu.jpg]]
- 還沒查座標的就貼完整連結：https://www.google.com/maps/place/Senkoji+Temple/@34.4090,133.2050,17z

## 待確認

- [ ] 9/22 是否改去輕井澤，看 9/14 的預報
- [ ] 相撲 9 月場所票
```

| Element | How the plugin reads it |
|---|---|
| `## 2026-09-17 週四 主題` | A day. One heading per day, the full `YYYY-MM-DD` first, then anything. Only a full date counts as a date; a heading without one is a day with no weekday or hours checks. Level is a setting (default `##`). |
| `## 待辦` or any heading without a date | Once the note has dated headings, an undated section is notes: to-do checklists, research, candidate places. Links in it stay in the text but do not appear on the map. Text before the first heading is treated the same way. Keep everything about the trip in the one note. |
| `timezone: Asia/Tokyo` in the frontmatter | The zone written times are in. Needed for transit departure times when the note is written from another zone. |
| `## 2026-09-19 ~ 2026-09-26 東京` | A range: several days kept as one block, for a stretch not yet planned day by day. Two full dates joined by `~`, `～`, `-`, `to` or `到`. One chip (`9/19~9/26`), no weekday checks. Split it into day headings once the days are decided. |
| `[Name](geo:lat,lng)` | A stop. Same format as the Map View plugin. |
| `07:53` at line start | The stop's time. |
| Transport emoji before the link | How you get there: 🚶 walk, 🚲 bike, 🚗 car, 🚕 taxi, 🚌 bus, 🚆 🚄 🚃 train, 🚇 metro / MRT, 🚊 tram / light rail, ⛴️ boat, ✈️ flight. Words are not read. Picking a transport on the arrow in the map pane writes this emoji before the link (replacing the one there). It is the only place the transport lives. |
| `%%wf:{…}%%` after a link | Plugin metadata: Google details and the last routed leg (`leg`). Older notes may carry `via`; the emoji wins over it. Leave it as is; never author it by hand. |
| Indented lines under a stop | The stop's notes, shown verbatim on its card and popup. No format inside them is interpreted: a `geo:` link there is text, not another stop. |
| `- [ ] 07:53 [Name](geo:…)` | A task line is a stop like any other; the box is not shown in the note text. |
| `%% … %%` | An Obsidian comment. Links inside it are not stops. |
| Emoji before the link | The pin's icon. Otherwise from the Google type or the name. Airports are 🛬 and ports ⚓ so they never read as a flight or boat leg. |
| Rest of the line | Shown as the note in the stop's card. |
| `![[img.jpg]]` or image URL on the line or the next | Photo in the card. |
| `%%wf:{…}%%` | Written by the plugin (rating, hours, address). Do not write by hand. |
| Full Google Maps URL | Converted to a stop when pasted or via the convert command. Short `maps.app.goo.gl` links only on desktop. |
