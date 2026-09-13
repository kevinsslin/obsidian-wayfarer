/**
 * Stop categories. A category picks the emoji shown on the pin and in the
 * day strip. It comes, in order, from an emoji the user wrote before the
 * link, a `tag:` token, the Google primary type saved in the metadata, or
 * keywords in the name.
 */

export type Category =
  | "stay" | "food" | "cafe" | "bar" | "nightlife" | "shrine" | "temple" | "museum" | "park" | "nature"
  | "onsen" | "shop" | "market" | "station" | "airport" | "port" | "view" | "castle" | "event" | "place";

export const CATEGORY_EMOJI: Record<Category, string> = {
  stay: "🏨", food: "🍜", cafe: "☕", bar: "🍶", nightlife: "🎧", shrine: "⛩️", temple: "🛕", museum: "🖼️",
  park: "🌳", nature: "🏞️", onsen: "♨️", shop: "🛍️", market: "🧺", station: "🚉", airport: "✈️", port: "⛴️",
  view: "🔭", castle: "🏯", event: "🎭", place: "📍",
};

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u;

/** First emoji in a piece of text, or null. Digits and `#` are not emoji here. */
export function firstEmoji(text: string): string | null {
  const m = EMOJI_RE.exec(text);
  return m ? m[0] : null;
}

const TAG_MAP: Record<string, Category> = {
  stay: "stay", hotel: "stay", sleep: "stay", food: "food", eat: "food", lunch: "food", dinner: "food", breakfast: "food",
  cafe: "cafe", coffee: "cafe", bar: "bar", drink: "bar", club: "nightlife", shrine: "shrine", temple: "temple",
  museum: "museum", art: "museum", park: "park", nature: "nature", hike: "nature", onsen: "onsen", shop: "shop",
  market: "market", station: "station", train: "station", airport: "airport", flight: "airport", port: "port",
  view: "view", castle: "castle", event: "event", show: "event",
};

export function categoryFromTags(tags: string[]): Category | null {
  for (const t of tags) {
    const c = TAG_MAP[t.toLowerCase()];
    if (c) return c;
  }
  return null;
}

/** Maps a Google Places (New) primaryType to a category. */
export function categoryFromGoogleType(type: string | undefined): Category | null {
  if (!type) return null;
  const t = type.toLowerCase();
  const rules: Array<[RegExp, Category]> = [
    [/lodging|hotel|hostel|ryokan|guest_house|inn|resort|motel|campground/, "stay"],
    [/coffee|cafe|bakery|tea_house|dessert|ice_cream/, "cafe"],
    [/night_club|karaoke|dance/, "nightlife"],
    [/\bbar\b|pub|izakaya|wine|brewery|sake/, "bar"],
    [/restaurant|food|ramen|sushi|meal|diner|noodle|steak|pizza|deli/, "food"],
    [/shinto|shrine/, "shrine"],
    [/temple|church|mosque|worship|monastery|synagogue|hindu/, "temple"],
    [/museum|art_gallery|aquarium|planetarium|zoo/, "museum"],
    [/hiking|national_park|waterfall|beach|lake|mountain|natural_feature|wetland|forest|trail/, "nature"],
    [/park|garden|botanical/, "park"],
    [/spa|public_bath|sauna|hot_spring|onsen|bath/, "onsen"],
    [/market/, "market"],
    [/store|shop|mall|boutique|department/, "shop"],
    [/train|subway|transit|bus_station|light_rail|rail/, "station"],
    [/airport|airstrip|heliport/, "airport"],
    [/ferry|marina|port|harbor|harbour/, "port"],
    [/observation|viewpoint|scenic|tower|lookout/, "view"],
    [/castle|historical|monument|landmark|palace/, "castle"],
    [/stadium|arena|theater|theatre|concert|performing|amusement|event|cinema|movie/, "event"],
  ];
  for (const [re, c] of rules) if (re.test(t)) return c;
  return null;
}

/** Guesses from Japanese, Chinese and English words in the name. */
export function categoryFromName(name: string): Category | null {
  const n = name.toLowerCase();
  const rules: Array<[RegExp, Category]> = [
    [/(湖|滝|沼|瀑布|湿原|濕原|高原|渓谷|溪谷|海岸|山|岳|島|岬)$/, "nature"],
    [/ホテル|hotel|旅館|民宿|hostel|\binn\b|ゲストハウス|ホステル|酒店|飯店/, "stay"],
    [/セブン|ファミマ|ファミリーマート|ローソン|7-?eleven|コンビニ|便利商店|全家|超商|ドラッグ|マツキヨ|ドンキ|don quijote/, "shop"],
    [/空港|機場|机场|airport/, "airport"],
    [/駅|車站|车站|站$|\bstation\b|バスターミナル|バス停|轉運站/, "station"],
    [/港|ferry|フェリー|碼頭|码头|桟橋/, "port"],
    [/神社|神宮|稲荷|大社|八幡|天満宮|shrine|jingu|jinja/, "shrine"],
    [/寺|temple|観音|不動|大仏|佛|禪/, "temple"],
    [/美術館|博物館|museum|gallery|ギャラリー|記念館|文学館|科学館|水族館/, "museum"],
    [/温泉|溫泉|onsen|銭湯|湯$|の湯|spa|サウナ|sauna/, "onsen"],
    [/滝|瀑布|湖|沼|湿原|濕原|峠|高原|渓谷|溪谷|falls|lake|mount|\b山$|岳|海岸|浜|海灘|beach|森|林道|trail/, "nature"],
    [/公園|park|庭園|庭院|garden|植物園/, "park"],
    [/城$|城跡|城址|castle|宮殿|palace|御所/, "castle"],
    [/展望|観覧|tower|タワー|sky|天空|夜景|viewpoint/, "view"],
    [/市場|market|マーケット|商店街|朝市/, "market"],
    [/カフェ|cafe|café|coffee|珈琲|喫茶|茶房|甜點|パフェ|bakery|ベーカリー|パン/, "cafe"],
    [/クラブ|\bclub\b|contact|womb|vent|zouk|ageha/, "nightlife"],
    [/居酒屋|バー|\bbar\b|酒場|酒吧|立ち飲み|スタンド|sake|ワイン|brew/, "bar"],
    [/ラーメン|ramen|sushi|udon|soba|tempura|yakitori|yakiniku|tonkatsu|gyoza|拉麵|拉面|寿司|壽司|そば|蕎麦|うどん|食堂|restaurant|料理|燒肉|焼肉|焼き鳥|天ぷら|とんかつ|カレー|定食|屋台|餐廳|飯|丼|鰻|うなぎ|牛|豚|鶏|ステーキ|ピザ|イタリアン|フレンチ|中華|dining|kitchen|grill|bistro/, "food"],
    [/百貨|デパート|mall|モール|store|shop|ショップ|書店|本屋|雑貨|無印|ユニクロ|ドンキ|outlet|アウトレット/, "shop"],
    [/劇場|theater|theatre|ホール|hall|arena|アリーナ|stadium|スタジアム|国技館|歌舞伎座|能楽堂|live|ライブ|ドーム|dome/, "event"],
  ];
  for (const [re, c] of rules) if (re.test(n)) return c;
  return null;
}

export function pickCategory(input: { tags: string[]; googleType?: string; name: string }): Category {
  return categoryFromTags(input.tags) ?? categoryFromGoogleType(input.googleType) ?? categoryFromName(input.name) ?? "place";
}

export type Transport = "walk" | "train" | "bus" | "car" | "flight" | "boat" | "bike";

const TRANSPORT_RULES: Array<[RegExp, Transport]> = [
  [/✈|飛|フライト|flight|fly|航班/, "flight"],
  [/⛴|🚢|船|フェリー|ferry|boat|渡輪/, "boat"],
  [/🚲|自転車|腳踏車|单车|bike|cycle|レンタサイクル/, "bike"],
  [/🚌|巴士|バス|\bbus\b|公車/, "bus"],
  [/🚕|🚗|タクシー|計程車|taxi|車で|開車|drive|レンタカー|uber/, "car"],
  [/🚃|🚄|🚆|🚇|電車|新幹線|特急|地鐵|地下鉄|メトロ|metro|train|jr|スペーシア|ロマンスカー|線|line\b|搭車|轉乘/, "train"],
  [/🚶|走|步行|徒步|歩|walk|散策|散步/, "walk"],
];

/** Detects how one gets to a stop from the words before its link on the same line. */
export function transportFrom(text: string): Transport | null {
  const t = text.toLowerCase();
  for (const [re, m] of TRANSPORT_RULES) if (re.test(t)) return m;
  return null;
}

export const TRANSPORT_EMOJI: Record<Transport, string> = { walk: "🚶", train: "🚃", bus: "🚌", car: "🚕", flight: "✈️", boat: "⛴️", bike: "🚲" };
