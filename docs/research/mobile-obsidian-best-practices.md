# Wayfarer 手機體驗與 Obsidian 最佳實務研究

Wayfarer 下一步最值得做的是把手機的主要用途定為「旅途中查看已規劃行程」。地圖填滿外掛分頁、日期用單選選單、地圖與清單用二段切換、地點詳情從底部展開，能直接改善現有的小地圖與遮擋問題。這套設計能沿用 Obsidian 的 ItemView、主題變數、命令與筆記資料模型，不需要另建一個旅行 App。

研究核對日期為 2026-09-14，程式基準為本機 `648d0ae`、Wayfarer 0.1.5，manifest 最低 Obsidian 版本為 1.11.4。證據包含目前原始碼、repo 既有手機截圖、Obsidian 官方開發文件、W3C 無障礙規範及 Leaflet 文件。既有截圖可作為版面證據，但無法證明它來自目前 commit；本研究沒有完成 iPhone／Android 真機測試。概念稿是待實作的提案。

> **實作更新（0.1.6）**：目前採局部改善，保留原本的桌面日期標籤、浮動時間軸與玻璃樣式。窄螢幕使用浮動單選日期與地圖／清單切換；新增預設收合的目前／下一站卡片、手動進度與導航入口。進度存於裝置本機，瀏覽與導航不推進進度。也修正內容區內距、相機遮擋計算、手機點選跳回筆記、隱藏清單取照片與營業時間日期問題，運具選擇改用 Obsidian 原生 Menu。下方研究中的完整版面重整、route context 重構、離線底圖與 GPS 仍是提案，未包含於此版。尺寸模擬已檢查 390×844、320×640；尚無 iOS／Android 真機驗證。

## 1. 三個核心問題的答案

### 電腦規劃、手機查看，應該有不同的預設行為

相同的 Markdown、日期、停靠點和路線可以共用，但手機不必把桌面的游標跟隨、拖曳排序、運具編輯和側欄拖拉都放在第一層。旅途中先要回答「今天去哪裡、下一段怎麼走、現在看的地點有什麼注意事項」。規劃操作仍保留在筆記、命令與明確的編輯入口。

目前已經做對一部分：`openMap()` 在手機開獨立 tab，在桌面開右側 leaf；手機也不會因為開啟行程筆記就自動搶開地圖。[C1] 建議延續這些行為，加入手機查看預設，而不是再加一個需要使用者理解的「旅行模式」總開關。

手機點選 pin 應只更新選取地點與詳情。只有明確按「開啟筆記」才切換到 Markdown。現有 `jumpTo()` 在找不到來源 Markdown leaf 時會以 `getLeaf(false)` 開檔，這在地圖是目前分頁時有取代地圖的風險；需用來源檔綁定與明確導覽動作處理，不能只調整 CSS。[C7]

### 日期用單選選單；地圖／清單用 segmented control；固定是獨立語意

「一次只能選一個」非常適合單選操作，但不同選項數量適合不同容器：

| 操作 | 建議元件 | 行為 |
|---|---|---|
| 選一天或整趟 | 顯示當前日期的選單按鈕，點開單選列表 | 第一項為「整趟行程」，其後按日期排序；選完收起 |
| 地圖與清單 | `[地圖] [清單]` 二段切換 | 永遠只有一個啟用，切換保留日期與選取地點 |
| 固定目前日期 | 可選的獨立 pin／鎖定控制 | 只代表不跟隨桌面筆記游標，不代表切換到地圖 |
| 綁定目前行程檔案 | 明確的來源檔狀態 | 與固定日期分開，避免切筆記時地圖跟錯行程 |

目前日期 chip 的點擊同時負責選日期與取消固定；再按同一天會回到全部，並非單純重新選取。右上角的 `📍` 實際切換 `followCursor`，不是 GPS 定位。手機使用者很容易誤解。[C3]

建議同一天再次點擊保持選取，取消固定由獨立控制完成。「整趟行程」也應是一個可維持的選取狀態，不應因為隱藏 editor 的游標事件悄悄改回某一天。手機本來就不應跟隨隱藏游標，因而可以省略常駐固定日期按鈕；桌面需要時再呈現「跟隨筆記／固定日期」。

如果 List／Pin 是指兩種顯示方式，文字用「清單／地圖」比「List／Pin」清楚；pin 留給真正固定狀態。Obsidian 本身也有 leaf pin API，外掛不應把日期固定與原生分頁固定混為一談。

單選群組有明確的語意與鍵盤模式，WAI-ARIA APG 提供 radio group 的規範。日期選擇可以用原生 select 或 Obsidian Modal／選擇器；二段切換可用原生 radio 控制外觀，或完整實作 tabs。不要只用顏色表示選取，也不要把兩個獨立開關做成互斥模式。[^2][^5]

### 地圖應填滿外掛內容區，控制可以懸浮

同意滿版方向。這裡的滿版是「Wayfarer ItemView 的可用內容區」，不是隱藏整個 Obsidian 的返回、分頁與系統導覽。官方允許外掛用自訂 ItemView 呈現內容，沒有要求把地圖做成小卡，也沒有指定 bottom sheet；滿版與底部詳情是本研究的產品建議。[^3]

現有 `.wf-map` 已經 absolute 填滿 `.wf-body`，真正吃掉空間的是：日期 legend 位在 body 前、`flex-wrap: wrap` 會增加高度；清單開啟後在左側覆蓋；固定寬度 popup 再覆蓋一次。[C2][C4][C5] 因此不是再加 `height: 100%` 就會解決。

建議讓 map 成為整個內容區的底層，上方只有單列日期選擇與必要動作，底部放地圖／清單切換及短詳情。地圖模式平時沒有完整行程欄；點選地點後只出現一張簡短詳情卡，需要時才展開。清單模式則提供真正足夠寬度的行程閱讀空間。

## 2. 現況證據與影響

| 已觀察到的實作 | 對手機的影響 | 判斷強度 |
|---|---|---|
| legend 可換行，與 map 是上下排列 | 天數越多，地圖上方被占用越多 | 原始碼確認；實際高度受主題／字體影響 |
| 小於 560px 沿用左側清單 overlay；預設關閉 | 打開後遮住地圖，列表自身仍偏窄 | 原始碼確認，既有截圖可見同類問題 |
| 清單開關 22×26px，運具控制最小 22×22px | 觸控有效區值得優先放大 | CSS 宣告確認，真實 computed size 待裝置測量 |
| 手機清單開啟時 `leftInset()` 仍回傳 0 | 選中的 marker／popup 可能位在覆蓋區 | 幾何邏輯確認，具體遮擋需真機重現 |
| popup 固定 280px；有圖時圖片高 140px | 小螢幕上長筆記與可用地圖互相擠壓 | 原始碼確認 |
| 多日圖層全部繪製，非當日只變淡 | 切一天仍有其他日的標記與路線干擾 | 原始碼確認 |
| `drawStrip()` 在隱藏時仍建構卡片並取照片 | 沒開清單也可能觸發照片網路工作 | 呼叫鏈確認，未量測流量／耗電 |
| 日期、焦點、相機存在 view instance，無自訂 getState／setState | 分頁重建與重新啟動後缺少可靠的恢復機制 | 原始碼確認，實際 workspace 恢復流程待測 |
| pin 點擊與列表點擊會操作來源 editor cursor | 查看與編輯耦合；來源 leaf 不在時可能跳頁 | 原始碼確認，手機鍵盤是否彈出未測 |

既有的手機截圖 [phone.jpg](https://github.com/kevinsslin/wayfarer/blob/648d0ae/docs/screenshots/phone.jpg) 顯示：左側長清單覆蓋大半地圖，站名仍被截斷，底部 Obsidian 浮動工具列與內容重疊。不能因為地圖 DOM 很大，就把它視為可用地圖面積足夠。

還有一處目前版面與相機邏輯不同步：legend 在 map 容器之外，`topInset()` 卻把它當作覆蓋 map 的高度加進 popup padding。這可能額外縮小 popup 的有效空間。改成懸浮 legend 後應重新統一遮擋計算，不能在舊 padding 上繼續疊加。[C6]

## 3. 建議的手機互動規格

### 地圖模式

預設打開上次正在看的行程與日期。首次開啟且沒有恢復資料時，若行程含明確日期、目的地日期可判定，優先當天；旅程尚未開始則顯示第一天。日期範圍、缺少年份或目的地時區不明時，保留標題原意並讓使用者選擇，不猜成今天，也不要求所有筆記新增時區屬性。

上方的日期按鈕顯示「9/16 週三 · 日光」，單行必要截斷，展開後可以看到完整名稱。選單第一項保留「整趟行程」，並以勾選標記表達目前選項。14 或 30 天都不應把全部 chips 常駐於地圖上方。

底部的「地圖／清單」切換是常駐且可被拇指操作的主要入口。地圖模式只顯示目前日的 marker 和路線；整趟模式才載入全部視覺元素。相同位置的 marker 要能透過清單存取，避免為了辨識重疊 pin 必須反覆放大。

點選地點後顯示名稱、日期／時間、一句重要備註、上一站到這站的交通摘要與導航入口。預設不放大型照片。沒有合適圖片就留文字；以使用者提供的 vault 圖片為優先。點另一站替換詳情，按關閉或點地圖空白處收起，不能依賴 hover 或 mouseleave 作為手機的主要關閉方式。

手機底部詳情可有「收起／簡短／展開」三個狀態，但第一版先用可點擊的展開／收起按鈕。拖曳 sheet 可以後續加，避免第一版同時處理地圖拖曳、頁面滾動與 sheet 拖曳。詳情展開時不再同時開 Leaflet popup，以免重複顯示與互相推動地圖。

### 清單模式

日期與選取地點和地圖完全共用。清單佔滿可閱讀寬度，顯示時間、站名、備註及站與站之間的交通資訊。站名至少允許兩行，長備註只在選取該項時展開；切到別項即收回原項，延續現有「一次只展開選取項」的方向。

在清單點項目先展開詳情；「在地圖顯示」才切回地圖並定位。這讓讀清單時不會每點一次就被拉離，且可保留清單 scroll position。地圖切清單時也應定位到目前選取項。

手機查看預設移除卡片 `draggable=true` 與常駐運具修改入口。需要更改時用清楚標示的編輯動作，提供「上移／下移」等可點操作，並保留筆記 Undo。不能把拖曳排序當作手機唯一操作方式。

### 導航與返回

「導航到這裡」與「查看上一站到此的路線」需要不同標籤。前者的起點可以由外部 Google Maps 決定，後者使用行程中的上一站；否則旅途中偏離規劃後，使用者會誤以為畫面上的交通段是從自己現在的位置出發。既有程式已能產生外部 Google Maps URLs，可沿用。[C5]

第一版不需要背景定位、即時導航引擎或自動宣稱使用者已到站。「下一站」可以是使用者選定的下一項；只有行程時間不足以證明人到了哪裡。

返回／關閉的優先順序應讓使用者可預測：先關開啟的選單或詳情，然後由 Obsidian 處理分頁與筆記歷史。實際 Android Back 與 iOS 邊緣手勢必須在宿主中驗證，不能假設瀏覽器中的自訂 back handler 可以安全接管所有動作。

## 4. 哪些是 Obsidian 最佳實務

| 類別 | 官方來源支持的方向 | Wayfarer 對應做法 |
|---|---|---|
| View 與 workspace | 使用 registerView／ItemView；不要自行假設 view 只建一次 | 地圖維持自己的 leaf，處理重建與來源檔綁定 |
| 主題 | 使用 Obsidian CSS variables，避免硬編碼樣式阻礙主題 | 延用 font、background、text、border、interactive tokens |
| 手機相容 | 手機沒有 Node／Electron APIs；提供模擬與真機除錯方法 | 平台能力檢查和容器寬度檢查分開；iOS／Android 都測 |
| 原生操作 | 官方提供 Menu、Modal、命令、Lucide 圖示 API | 更多選單、日期選擇、運具選擇優先用這些 primitives |
| 筆記寫入 | 活躍 editor 用 Editor API；背景檔案用 Vault.process | 保留既有 rewriteLine 的方向，強化來源檔與內容核對 |
| 資源生命週期 | 清理事件與資源；卸載不要自行 detach leaves | 保留 map.remove／ResizeObserver 清理；補 pending callbacks 驗證 |
| 命令 | 不預設搶佔快捷鍵，使用正確 callback | 可新增「今天」「切換清單」「返回來源筆記」供手機工具列配置 |

以上由官方文件支持。[^1][^2][^3][^4][^6][^7] 「滿版地圖」「二段切換」「底部詳情」「查看時不編輯」則是根據使用情境做出的設計建議；官方沒有規定只能用這些佈局。Obsidian 的原生 toggle switch 適合 on/off，不等同於這裡建議的兩種 view 單選切換。

外掛使用 `Menu`／`Modal` 並不自動保證日期選單就是理想的底部抽屜。要在最低支援版與目前版、iOS／Android 實際確認位置、焦點與關閉行為。第一版用標準 `select` 或既有選擇器也比自製缺少焦點管理的 popover 更穩妥。

既有程式已大量使用 Obsidian 變數與 `createEl`，不需要換框架。應調整尚未對齊的部分：操作圖示用 `setIcon`，emoji 留給旅遊地點／運具內容；警告色抽成可覆寫語意變數；目前引用的 Leaflet 通用 `.leaflet-*` CSS 可評估建置時限縮到 Wayfarer root，避免與其他地圖外掛不同版本互相覆寫。後者是有依據的整合風險，尚未重現衝突。

目前 plugin 用 `Set<WayfarerView>` 管理 instance，雖然有 attach／detach／unload 清理，仍與官方「避免自行管理 custom view references」建議不同。可改由 workspace 葉節點查詢；若保留 Set，必須用多視窗、reload 與關閉測試證明生命週期正確，不能直接宣稱已有記憶體洩漏。[C1][^2][^3]

## 5. 手機與桌面的狀態應如何分開

建議把狀態分成三層，避免所有 UI 點擊都寫進會同步的 plugin settings：

| 層級 | 內容 | 儲存方向 |
|---|---|---|
| 行程內容 | 日期標題、站名、順序、備註、選定交通、必要的路線 metadata | 繼續以 Markdown 為來源 |
| 外掛偏好 | 語言、圖磚來源、開圖偏好等 | loadData／saveData |
| 每個 view 的狀態 | source file、day selection、selected stop、map/list、相機與清單位置 | getState／setState 與 workspace 恢復流程 |

Obsidian 提供 `View.getState()`／`setState()`，適合承接 view 的序列化與恢復。[^8] 但 API 存在不等於狀態自動不跨裝置；需核對 workspace 儲存與同步策略。不要承諾把東西放進 view state 就一定是 device-local。

日期不能只靠 heading line number 識別：在前面插入幾行會讓它改變。先採完整日期／標題與出現次序，加上保守 fallback；停靠點用 block ID（如果已有）或地點、座標與同日次序組合，不能只靠名字，因為同一天可能兩次回同一家飯店。不要為了 UI 恢復就強制改寫整份筆記。

建議明確建模 `daySelection = all | day | follow-editor`，另有 `selectedStop` 與 `presentation = map | list`。固定日期不是第四個 view；跟隨筆記是桌面的選擇策略。手機預設 `day`／`all`，切換模式不應重設日期或觸發行程寫入。

## 6. 滿版地圖需要同時修好的細節

**可見區域。** Leaflet 已提供 `paddingTopLeft`／`paddingBottomRight`，可避開 overlay。[^9] 建議統一計算 `top/right/bottom/left` 可見區域偏移量，供 fit、fly、popup 與目前日範圍共用。手機 sheet 的底部遮擋、桌面左側清單與上方日期列不能各自用不同假設。

**宿主工具列與 safe area。** 以實際 ItemView content box 作 layout 容器，避免 `position: fixed` 或直接用 `100vh` 跨出宿主。若 viewport inset 已由 Obsidian 消化，就不應再無條件加一次 `env(safe-area-inset-bottom)`；應測量實際遮擋。圖磚 attribution 也須保留可讀位置，不能被詳情或工具列蓋掉。[^10]

**觸控有效區。** 第一版以約 44×44 CSS px 作重要控制的目標，圖示本身可以更小。W3C 2.5.8 AA 的最小要求是 24×24 並有間距等例外，2.5.5 AAA 提出 44×44；44 不是 Obsidian 官方硬性門檻，也不是所有 WCAG 情境的最低值。[^11][^12] 小按鈕附近有空間，不等於可點區已變大，需測量真正 hitbox。

**焦點與螢幕閱讀器。** 增加選取／展開狀態的語意、可見 focus ring、明確關閉按鈕。運具目前是無 href 的 `<a>`，應使用 button。單選不只變顏色，並以日期與站序文字輔助辨識。詳情更新可用適量 `aria-live`，但地圖移動不要每幀播報。

**手勢。** 用 pointer capability 決定 hover enhancement，基本行為永遠由 tap 完成。拖 map、滾清單與 sheet 的手勢區域要分開；overlay 的點擊／滾輪避免傳到 map，Leaflet 提供對應的事件阻擋工具。[^9] 地圖容器需要的 touch 行為應限縮在容器，不要全域禁止頁面捲動與縮放。

**動畫。** 目前 flyTo 0.6 秒、pan 0.4 秒及 smooth scroll 沒有看到 reduced-motion 分支。[C6] 尊重 `prefers-reduced-motion`，且避免每次選卡都強制長距離飛行。站已位於可見區時只更新選取與必要的微調。

## 7. 旅途中可靠性比裝飾更優先

### 交通快取應辨識出發時間

目前 `legKey()` 只包含 mode 與兩端座標；已存 metadata 沒有出發日期／時間。`bareLeg()` 接受 saved route 時只比對上一站座標與 mode，router 有 geometry 就直接沿用。[C8] 因此同樣站點由週三早上改到週日晚間，仍可能顯示舊班次摘要與時間。這是原始碼可推導的正確性風險，尚未用真實供應商重跑證明。

建議加入 departure context、查詢時間、目的地 identity 與 version；時間敏感的 transit 按出發時間失效，手動「更新這段交通」可重新查詢。舊 note 的 route 仍可顯示為「已儲存規劃」，不要宣稱即時班次。閱讀模式不因開圖就自動重查整趟；準備新行程時才做必要更新。

### 營業時間需要區分「今天」與「行程當天」

目前警告用 day date 算，popup 的一般營業時間文字卻呼叫 `todayHours()`，使用裝置的目前星期。[C5] 在查看未來日期時，使用者可能同時看到依行程日計算的警告與依今天計算的時段。建議主顯示明確標成「9/16 營業時間」；若提供今天狀態，要另外標示。

`regularOpeningHours` 也不代表節慶例外時段或即時營業保證。資料沒有更新時間時應承認只是已存資訊；有重要訂位／閉館限制時，使用者寫下的備註應比星等與照片更醒目。

### 離線分層，不要把同步筆記當成完整離線地圖

| 資料 | 目前來源 | 建議離線體驗 |
|---|---|---|
| 停靠點／時間／備註 | Markdown | 即使網路失效仍可讀清單與詳情 |
| 已存交通摘要／geometry | note metadata | 顯示已儲存規劃，讓使用者知道時效 |
| 使用者附件圖 | vault | 已同步附件可讀；缺附件時不留大空洞 |
| Google 照片 | resource name＋本人的 key；session 下載 | 無 key 或離線就省略，不承諾同行者都有照片 |
| 底圖 | 預設 OSM 網路圖磚 | 缺圖時提供可操作的清單入口與狀態提示 |

Google photo 目前只保存 resource name，實際圖片需有 key 才載入；這與 README「大家都有完整照片」的廣義描述需要區分。[C9] 第一版應改善描述與失敗降級，不直接增加大量持久化下載。

OSM 官方公共 tile server 明確禁止預抓／批次離線下載，並要求可見 attribution。[^10] 如果未來要做「下載此行程地圖」，必須先選有相應授權與支援的來源，不能直接替預設 endpoint 加 prefetch。這是離線功能選型的實際約束。

### 先延後非必要工作，再測量效能

現有小型 session cache、inflight 去重、250ms editor debounce 與相同 signature 跳過 rebuild 都值得保留。[C1][C8][C9] 但 `draw()` 仍清空重建全部日圖層與清單，隱藏的清單也走 `photoFor()`。[C4]

先做目前日優先、隱藏清單不取照片、只有可見或選中卡片需要圖片、每次更新只改受影響的 marker／row。Routing 的 Promise.all 可改有上限的 queue，避免首開多日未處理行程時同時大量發請求。這些是減少非必要工作的合理方向；本研究沒有以檔案大小或 LOC 宣稱速度提升，需量測首次可操作時間、切日時間、請求數與記憶體峰值。

手機短 Google Maps URL 展開目前明確不支援：`expandShortUrl()` 的桌面 guard 後才進 Node。[C10] 這個保護符合手機 API 邊界，但錯誤文案要清楚。針對電腦先規劃的主情境，可先維持桌面解析、手機查看；手機隨手新增地點可列為後續工作。

## 8. 建議交付順序

| 優先級 | 可獨立驗收的改動 | 主要價值 | 相對範圍 |
|---|---|---|---|
| P0 | 容器滿版 map＋單選日期＋地圖／清單切換 | 直接解決畫面壓縮與清單遮擋 | 中 |
| P0 | 手機短詳情 sheet＋統一可見區 padding | 地點與導航可以看見、點到 | 中 |
| P0 | 查看點選不操作 hidden editor；綁定來源檔 | 避免看圖時跳頁與跟錯筆記 | 中 |
| P0 | 交通出發時間失效＋行程日營業時間 | 改善旅途中資訊可信度 | 中 |
| P1 | 日期／view／選取與 scroll 恢復 | 從 Google Maps 切回來能接著看 | 中 |
| P1 | 44px 觸控目標、語意、focus、reduced motion、原生選單 | 單手、鍵盤與輔助科技都能操作 | 中 |
| P1 | 隱藏工作延後、當日優先、網路失敗降級 | 手機弱網環境下仍可用 | 中 |
| P1 | 手機常用命令、更多動作與文案整理 | 核心畫面保持簡潔 | 小 |
| P2 | 合適來源的離線底圖、手機短連結匯入 | 擴展旅途中新增與離線需求 | 中至大 |
| P2 | 特定條件才需要的 clustering、進階拖曳 sheet | 大型行程與互動細節 | 先量測再決定 |

相對範圍是拆工判斷，不是交付天數估計。建議先完成一個實際手機旅程：開同一份 note → 選一天 → 點地點 → 外部導航 → 回來保持地點 → 切清單 → 看完整備註。做到這條流程順，再增加新功能。

第一批不建議加入背景 GPS、AI 重新排行程、多人即時協作、第二份行程資料庫或大量常駐照片。這些功能與目前的地圖可用面積問題沒有直接關係，也會增加電力、網路與同步負擔。

## 9. 實作邊界與驗收

`src/ui/map-view.ts` 可保留 ItemView 與 Leaflet 整合，從中分出 view state、controls、stop list/detail 與 camera geometry；純資料／選擇邏輯留在 core，不需要因 UI 重排引入新的框架。手機與桌面共用行程與 selection，使用不同布局。不要只因檔案長就拆，而要沿著狀態、資料與渲染責任拆。

### 必要測試矩陣

| 場景 | 驗收結果 |
|---|---|
| 320、390、430px，直向與橫向 | 不產生頁面橫向溢出；主要控制可點；地圖內容區填滿 |
| 1、7、14、30 天 | 收合日期選擇維持單列；完整標題能在選單讀到 |
| 開詳情、清單、返回 map、縮放／旋轉 | 選中地點位在未遮擋區；不被 sheet／宿主工具列蓋住 |
| 點已選日期、選整趟、切 view | 日期不被取消或游標事件意外覆寫 |
| 地圖分頁獨立存在、來源 note tab 已關 | 點 pin 保持地圖；明確開 note 才導覽 |
| 改 note、同 pane 換 note、多個 Markdown tab | 地圖依綁定／跟隨策略更新，不錯配來源 |
| 前方加段落、同名地點、重複飯店、日期被刪除 | 恢復策略保守，不選到另一個站點 |
| App 重啟／外部 Google Maps 返回 | 原行程、日期與所選地點可恢復；缺來源檔有可操作提示 |
| transit 改日期／出發時間／目的地 | 舊結果失效或標明待更新；不當成新時間的結果 |
| 查看未來／範圍日期、跨時區 | 營業時間有明確日期語意；不猜不確定資料 |
| 開飛航、斷圖磚、無 API key、缺附件 | 清單仍可讀；錯誤不重複轟炸；無大圖空洞 |
| 淺／深色、預設與常用社群主題、大字級 | 字與底色可讀；選取不只靠顏色；按鈕不擠在一起 |
| VoiceOver／TalkBack、鍵盤、reduce motion | 日期與 view 狀態可知；詳情能關閉；動畫可減少 |
| 關閉 view、reload 外掛、pop-out 視窗 | 事件與延後回調不作用到已銷毀 view；沒有重複 leaf |

先用官方 `app.emulateMobile(true)` 檢查宿主佈局，再透過 iOS Web Inspector／Android USB debugging 驗證觸控、返回與鍵盤；桌面 Chromium 窄視窗不能替代真機。[^1] 邏輯測試優先覆蓋狀態轉移、route key／metadata migration、來源檔安全；視覺幾何與手勢用宿主驗收。

本次僅新增研究文件與概念稿，未變更外掛功能、未發布、未測量效能收益。需要真機才能確認的部分已在表中區分。

## 10. 來源與程式定位

下列官方文件均於 2026-09-14 核對，沒有標示發布日期者以查閱日期為準。Obsidian 文件同時核對其官方 GitHub 原始 Markdown；W3C 與 OSM 條文核對官方頁面。

[^1]: Obsidian. [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development).
[^2]: Obsidian. [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
[^3]: Obsidian. [Views](https://docs.obsidian.md/Plugins/User+interface/Views).
[^4]: Obsidian. [About styling](https://docs.obsidian.md/Reference/CSS+variables/About+styling).
[^5]: W3C WAI. [Radio Group Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
[^6]: Obsidian. [Context menus](https://docs.obsidian.md/Plugins/User+interface/Context+menus), [Modals](https://docs.obsidian.md/Plugins/User+interface/Modals), [Icons](https://docs.obsidian.md/Plugins/User+interface/Icons).
[^7]: Obsidian. [Vault](https://docs.obsidian.md/Plugins/Vault).
[^8]: Obsidian. [View.getState](https://docs.obsidian.md/Reference/TypeScript+API/View/getState), [View.setState](https://docs.obsidian.md/Reference/TypeScript+API/View/setState).
[^9]: Leaflet 1.9.4. [API reference](https://leafletjs.com/reference.html): FitBounds padding、DomEvent helpers。
[^10]: OpenStreetMap Foundation. [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/): 可見 attribution、禁止 bulk／offline prefetch。
[^11]: W3C WAI. [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
[^12]: W3C WAI. [Understanding SC 2.5.5: Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

程式定位依本機 0.1.5，後續修改可能讓行號移動：

| 引用 | 檔案 | 涵蓋證據 |
|---|---|---|
| C1 | [main.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/main.ts#L155) | 手機 tab、desktop right leaf、autoOpen、activeMarkdown；同檔 25、53、101、239 行為 lifecycle／事件 |
| C2 | [styles.css](https://github.com/kevinsslin/wayfarer/blob/648d0ae/styles.css#L735) | legend wrap、body/map geometry；858 行起為 strip；918 行起為 toggle |
| C3 | [map-view.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/ui/map-view.ts#L491) | 日期選取、取消固定、followCursor 圖示 |
| C4 | [map-view.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/ui/map-view.ts#L317) | draw 全重建；527 行起為卡片／照片／拖曳；169 行起為 narrow layout |
| C5 | [map-view.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/ui/map-view.ts#L404) | popup、todayHours、交通與導航；styles.css 1345 行附近為 card 尺寸 |
| C6 | [map-view.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/ui/map-view.ts#L641) | inset、camera、popup auto-pan、flyTo、fitAll |
| C7 | [map-view.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/ui/map-view.ts#L723) | 找不到 Markdown leaf 時開檔與 editor cursor 操作 |
| C8 | [legs.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/core/legs.ts#L43), [routing.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/routing.ts#L43) | saved route 判斷、metadata、152 行 legKey、fetch Promise.all |
| C9 | [photos.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/photos.ts#L79), [README.md](https://github.com/kevinsslin/wayfarer/blob/648d0ae/README.md#L11) | 照片需要 key、session cache、分享描述 |
| C10 | [net.ts](https://github.com/kevinsslin/wayfarer/blob/648d0ae/src/net.ts#L16) | 手機短連結展開限制與 Node guard |

可核對的遠端原始碼版本：[kevinsslin/wayfarer at 648d0ae](https://github.com/kevinsslin/wayfarer/tree/648d0ae)。
