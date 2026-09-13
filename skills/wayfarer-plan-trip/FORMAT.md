# Note format read by Wayfarer

```markdown
---
locations:
---
# 日本 2026 秋

行前：[羽田機場](geo:35.5494,139.7798) 落地後直接搭京急到淺草。

## 9/16 週三 日光市區

搭 19:19 的リバティけごん 47 號。

- [東武日光站](geo:36.7509,139.6187)
- 🏨 [日光ステーションホテルクラシック](geo:36.7512,139.6201) tag:stay

## 9/17 週四 上山，走戰場之原，睡湯元

1. 07:53 巴士到 [湯滝](geo:36.7938,139.4316)
2. 走木道到 [赤沼](geo:36.7754,139.4432)，約 1h45
3. 12:52 巴士到 [中禪寺湖](geo:36.7345,139.4823)
4. [華嚴瀑布](geo:36.7383,139.5030) 最後上電梯 17:00
5. 回 ♨️ [湯元溫泉](geo:36.7955,139.4247) tag:stay

## 9/27 週日 福岡

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
| `## 9/17 …` | A day. Date formats: `9/17`, `2026-09-17`, `9月17日`, `Sep 17`, `Day 3`. Level is a setting (default `##`; `#` also counts). |
| `[Name](geo:lat,lng)` | A stop. Same format as the Map View plugin. |
| `07:53` at line start | The stop's time. |
| ` · 🚶 34 分 · 2.5 km` at line end | Written by the plugin's write-back command. Do not author by hand. |
| Words before the link | Transport: 巴士/バス/bus, 走/步行/walk, 電車/新幹線/JR/地鐵/train, 計程車/taxi/開車, 飛/flight, 船/ferry, 自転車/bike. |
| Emoji before the link | The pin's icon. Otherwise guessed from `tag:`, Google type, or name. |
| `tag:x` | Optional, for Map View compatibility only. |
| Rest of the line | Shown as the note in the stop's card. |
| `![[img.jpg]]` or image URL on the line or the next | Photo in the card. |
| `%%wf:{…}%%` | Written by the plugin (rating, hours, address). Do not write by hand. |
| Full Google Maps URL | Converted to a stop when pasted or via the convert command. Short `maps.app.goo.gl` links only on desktop. |
