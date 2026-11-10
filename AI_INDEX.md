# 跨 AI 工具共用索引

## 0.3.31 瀏覽紀錄管理（D-52，發布中）

按帳號清除、排除／恢復瀏覽統計；原瀏覽頁內操作，商品排序觀察同步排除，會員／訂單不動。163 項測試、61 模組語法及四寬通過，migration／Edge v29 已發布；Pages 見 [交接](docs/HANDOFF.md)。程式：[管理驗證](domain/browsing-controls.mjs)、[介面](apps/admin-web/browsing.js)、[migration](supabase/migrations/20261110143206_ccbaby_browsing_controls.sql)、[測試](tests/browsing-controls.test.mjs)、[PostgreSQL 隔離驗證建置](scripts/build-browsing-control-test.mjs)／[檢查片段](tests/browsing-controls.sql)，實際帳號由店主自行設定

## 0.3.30 商品詢問網址縮圖（D-51，已發布）

商品詢問與管理複製共用預覽網址，Vercel OGP 接回原 LINE 驗證／商品視窗。公開僅上架商品編號／名稱／首圖，160 項測試及四寬／購物／追加通過；Edge v28／Vercel READY／Pages b617805 已發布，正式 50 檔核對一致，見 [交接](docs/HANDOFF.md)。程式：[連結](shared/product-link.js)、[最少投影](domain/product-preview.mjs)、[預覽服務](services/product-preview/preview.mjs)、[建置](scripts/build-product-preview.mjs)、[驗證](tests/product-preview.test.mjs)；操作／來源見 [CUSTOMER_CARE](docs/CUSTOMER_CARE.md)，部署見 [DEPLOYMENT](docs/DEPLOYMENT.md)。官方帳號兩個收訊端縮圖尚待實機驗收

## 0.3.29 GIF 上限調整為 2 MB（D-50，已發布）

依店主實際檔案大小，GIF 原檔上限從 1.4 MB 提高為 2 MB，原動畫及相簿功能保留；154 項測試、54 模組語法及實際 2 MB 上傳／動畫／購物回歸通過，Edge v27／Pages 589321a 已發布；正式 50 檔／23 後端來源一致，見 [交接](docs/HANDOFF.md)。沿用 image-upload.js、image-editor.js、Edge／本機上傳入口與既有 GIF 測試，不新增程式路徑

## 0.3.28 單品分享連結（D-49，已發布）

後台商品清單增加複製連結，`#product/商品ID` 在 LINE 驗證後直接開啟既有商品視窗；客端 HTML／CSS 與原商品模板不變，不建立獨立商品頁。共用 [連結白名單](shared/product-link.js)、[登入及連結驗證](tests/product-link.test.mjs)；實際結果見 [交接](docs/HANDOFF.md)。還原點 `checkpoint/before-product-links-0.3.27` 已推送 GitHub，來源 `9827d64`／Pages `e052d6c`，回復不還原業務資料

## 0.3.27 商品 GIF（D-48，已發布）

商品照片新增 GIF 原檔動畫保留，單張 1.4 MB、共 8 張；148 項測試及四寬 UI／動畫／購物流程通過，Edge v26／Pages e052d6c 已發布；正式 48 檔及 23 個後端來源一致，詳見 [交接](docs/HANDOFF.md)。入口沿用 [上傳準備](apps/admin-web/image-upload.js)、[相簿管理](apps/admin-web/image-editor.js)、cloud/index.ts／server/api.mjs；新增 [上傳驗證](tests/image-upload.test.mjs) 與 [雙影格測試圖](tests/fixtures/product-gif.mjs)，實際 Edge handler 沿用 tests/cloud-entry.test.mjs

## 0.3.26 商品影片（D-47）

已發布 Edge v25／Pages 2b88e81，145 項測試與四寬 UI／播放／購物流程通過，正式 48 檔及 23 個後端來源一致。管理可填 YouTube 連結與比例；手機卡片維持圓圈＋並在左側加播放鍵，桌面文字按鈕，詳情影片在價格右側。最新驗證及發布進度見 [交接](docs/HANDOFF.md)；網址規則 [shared/youtube.js](shared/youtube.js)、前端播放 [product-video.js](apps/customer-web/product-video.js)、保存／相容驗證 [tests/product-video.test.mjs](tests/product-video.test.mjs)。下方保留研究階段與舊版紀錄

## 商品影片研究（2026-11-10，尚未實作）

已查閱對標站公開前端模組，確認 Shorts 網址可由商品卡／詳情開啟站內直式播放器；本次未實際登入點擊或播放。CCBABY 建議方案、證據、資料／草稿／播放器入口與驗收項目見 [UI 研究](docs/UI_REFERENCE_AUDIT.md#2026-11-10-商品影片研究公開前端程式查閱本案尚未實作)，狀態見 [交接](docs/HANDOFF.md)。僅研究文件更新，網站維持 0.3.25

## 0.3.25 預購文案與人工付款時序

依 2026-11-10 店主新版歡迎詞（D-46），付款改為下單後 24 小時內在 LINE 人工確認，確認付款後才安排採購，依付款順序寄出，預計 11/30 起陸續出貨。缺貨可選擇退款或更換款式；客戶需自行確認尺寸，不直接比照過往尺寸，並同意下單規則。連線／結單日期沿用後台設定，本次不修改。

網站保留原登入、購物車、預購成立／追加／修改、採購與分配流程；不新增付款回報、實收／退款紀錄、24 小時自動取消、付款順序排序或採購付款閘門。付款、退款與寄件順序由店主在 LINE 人工核對及作業，預購資料成立不代表已付款。

已發布 Edge v24／Pages 8ad2919，139 項測試、四寬 UI、45 檔及正式唯讀通過；具體驗證見 [最新交接](docs/HANDOFF.md)；舊版到台後付款文字及 LINE 原生設定紀錄為歷史。程式入口沿用 customer app.js、domain/customer-care.mjs、domain/line-notifications.mjs 及管理 order-card.js，未新增檔案角色

## 0.3.24 LINE 訂單通知（已發布並啟用）

D-45 已授權下單自動通知、到台由店主逐筆確認發送、額度不足轉人工，方案升級由店主自行決定。139 項測試、51 模組語法與隔離 UI 320／390／768／1440px 通過；Edge v22／Pages 58a9486（run 42500024196 success）已發布，正式檔案及業務雜湊核對通過；使用者明確同意後已簽發並僅保存後端，正式 health／店主 API 核對可用、0/200／剩餘 200；手機收訊未測，詳見 HANDOFF。LINE 登入身分可直接指定通知對象，不要求新客傳聯繫碼；未新增後台對話收件匣或歷史聊天同步。

程式：[通知規則](domain/line-notifications.mjs)、[LINE API](server/line-messaging.mjs)、[原子發送](server/line-delivery.mjs)、[通知驗證](tests/line-notifications.test.mjs)；操作與設定見 CUSTOMER_CARE、DEPLOYMENT。

LINE 圖片尺寸：正式 PNG 為 2500×843，預覽已修正為合法的 1200×405；[上傳原檔 ZIP](assets/line-official/ccbaby-line-menu-upload.zip) 只含正式 PNG。使用者完成圖片上傳後，已接手儲存並確認選單正式顯示

## LINE 最新實際進度：選單、回覆與歡迎已上線

加入歡迎詞已依最新要求優化並套用，先引導「看商品 → 購物車送出預購」，保留到台後付款與直接留言；重新載入全文一致，實際文案見 copy.json.greeting revision 2。

三格選單 20584051 已發布，後台「目前顯示的選單」已核對圖片及我的訂單／看商品／預購說明文字動作；預設展開、選單列「選購與預購」。三組關鍵字回覆與歡迎已啟用；Default 82936520 經使用者單獨明確同意改為「CCBABY｜一般留言」，套用後內容核對通過。詳見 [交接](docs/HANDOFF.md) 與 [實際設定](assets/line-official/copy.json)，勿重建已存在的選單與回覆。實體 LINE 點擊／收訊仍待驗收；0.3.24 已實作免碼指定通知對象，完整聊天室同步未製作

## 已確認入口：先加入 LINE，再由選單進站

已上架的選單依 D-44 對齊網站 UI：Georgia 品牌字樣、宋體標題、網站色票／標誌與圖示；[390px 預覽](assets/line-official/rich-menu-mobile-preview.png) 僅供檢視，不作上傳檔

廣告／社團先導向官方帳號，三格選單點擊送出關鍵字，再回覆說明與網站連結；新客不處理聯繫碼。已製作「我的訂單／看商品／預購說明」[選單 PNG](assets/line-official/rich-menu-2500x843.png)、[設定文案](assets/line-official/copy.json) 與 [重建腳本](scripts/build-line-menu.py)，詳見 [服務流程](docs/CUSTOMER_CARE.md)。正式網站已為 0.3.24；免碼通知與憑證啟用以上節為準，LINE 原生設定保留

## 0.3.23 後台置頂優惠資訊

已接入後台「活動與設定」的優惠文字、顯示開關及預覽，前台登入後顯示置頂公告。125 項測試與購物流程通過，Edge v21／Pages 404f971（run 42451234705 success）已發布，正式 13 檔及 19 個 Edge 來源一致，業務資料保留；詳見 HANDOFF。共用規則 [domain/promotion.mjs](domain/promotion.mjs)，保存／權限驗證 [tests/promotion.test.mjs](tests/promotion.test.mjs) 及實際 Edge handler [tests/cloud-entry.test.mjs](tests/cloud-entry.test.mjs)

## 0.3.22 瀏覽用途揭露位置調整

頁首常駐提示移至共用頁尾，會員選單保留說明入口；完整用途說明與觀察行為沿用。頂部優先留給優惠資訊，本次未提供優惠內容、不建立促銷規則。120 項測試及隔離購物流程通過，Pages 1b34694／run 42449286082 success，正式 13 檔核對通過，Edge 沿用 v20；詳見 HANDOFF

更新：2026-11-10（Asia/Taipei）｜版本：0.3.31

品牌名稱已確認為 **CCBABY**。

0.3.21 登入等待動畫已上線，Pages a56f58c／Edge 沿用 v20：採用店主確認的原生跑步影片，原文字／操作保留，登入不等待播放；120 項測試、隔離流程及正式 13 檔／播放核對通過

0.3.20 登入效能已上線，Pages 44860e8／Edge v20：完整登入網站 API 5→2、有效登入進站 2→1，公開設定隨頁提供及必要模組預載；120 項測試、正式權限與 17 檔核對通過，保留原驗證、恢復與購物車／預購／管理功能

0.3.19 LINE 人工一對一聯繫、訂單圖卡與服務提醒已上線，Pages 46af662／Edge v19；109 項測試、四種螢幕寬度、正式 API 與 12 檔核對通過。客戶自行傳出第一則訊息，店主人工核對與傳送，到台後才提供匯款聯繫；既有商品、預購與活動保留

任何 AI 工具接手本專案，先從這份索引定位目前狀態與工作文件。
本索引只負責導覽；產品需求、決策及實作進度各有自己的主文件，不在此另寫第二套規格。

## 1. 不同工具從哪裡進入

| 工具／使用情境 | 本專案提供的入口 | 接續動作 |
|---|---|---|
| Codex／使用 AGENTS 格式的工具 | [AGENTS.md](AGENTS.md) | 依入口閱讀本索引與最新交接 |
| Claude Code／使用 CLAUDE 格式的工具 | [CLAUDE.md](CLAUDE.md) | 依入口閱讀本索引與最新交接 |
| Gemini／使用 GEMINI 格式的工具 | [GEMINI.md](GEMINI.md) | 依入口閱讀本索引與最新交接 |
| Cursor、Copilot、其他本機 AI 編輯器 | 本檔 AI_INDEX.md | 在該工具中明確要求先讀本檔；需要時再設定工具專屬載入規則 |
| 沒有工作區存取能力的聊天工具 | 本檔與任務相關文件 | 一併提供索引指向的文件內容；只有索引不能取得未提供的檔案 |

這是專案的檔案入口對照，不宣稱所有工具都會自動載入。
AGENTS.md、CLAUDE.md、GEMINI.md 內容保持一致；跨工具進度以儲存的文件與實際檔案為準。

## 2. 共用閱讀順序

1. [最新交接](docs/HANDOFF.md)：上次做完什麼、哪些尚未開始、目前下一步。
2. [機器可讀索引](project-manifest.json)：專案階段、入口、範圍與文件位置。
3. [完整需求](SPEC.md)：本次工作的需求與驗收條件。
4. [已定決策](docs/DECISION_LOG.md)及[待決事項](docs/OPEN_DECISIONS.md)：確認與未確認的界線。
5. 依下表讀主文件及程式；正式部署與 LINE 啟用請讀 docs/DEPLOYMENT.md。
6. [接手工作方式](docs/AI_START_HERE.md)及[變更紀錄](CHANGELOG.md)：執行與同步規則。

已讀過的索引與入口不用循環重讀；進入實作前仍需確認當下檔案與未完成變更。

## 3. 任務與主文件對照

登入動畫：[來源與採用紀錄](design-previews/golden-login/README.md)、[可選播放模組](apps/customer-web/login-animation.js)；正式素材 apps/customer-web/assets/login-run.mp4／login-run-poster.webp，舊設計稿僅留本機

| 要處理的工作 | 優先文件 | 需同步的紀錄 |
|---|---|---|
| GitHub、Supabase、LINE 與雲端權限 | [DEPLOYMENT.md](docs/DEPLOYMENT.md) | 交接、架構、manifest 與實際部署 |
| 產品目標、功能、範圍、驗收 | [SPEC.md](SPEC.md) | 決策、待決事項及變更紀錄 |
| 客戶／管理入口分離、頁面樹、程式目錄、資料流 | [ARCHITECTURE_MAP.md](docs/ARCHITECTURE_MAP.md) | SPEC 與 manifest 的相關設定 |
| LINE 身分、管理帳密、授權 | [SPEC.md](SPEC.md)、[DATA_MODEL.md](docs/DATA_MODEL.md) | 架構、待決事項及未來登入實作 |
| 預購、追加、採購、分配與報表計算 | [DATA_MODEL.md](docs/DATA_MODEL.md) | SPEC 及相關未來驗證 |
| 客戶端 UI、參考畫面、互動 | [UI_REFERENCE_AUDIT.md](docs/UI_REFERENCE_AUDIT.md) | SPEC 與實際介面驗證紀錄 |
| 為什麼採用某個方向 | [DECISION_LOG.md](docs/DECISION_LOG.md) | 新增決策；保留被取代關係 |
| 仍需選型或店主提供的資料 | [OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | 確認後移入決策及對應主文件 |
| 本機啟動、登入、操作與驗證 | [LOCAL_PREVIEW.md](docs/LOCAL_PREVIEW.md) | 最新交接及實作對照 |
| 目標規格與真實完成範圍 | [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) | 規格、程式及驗證紀錄 |
| 瀏覽資料如何協助銷售與店主審閱排序 | [SALES_PLAYBOOK.md](docs/SALES_PLAYBOOK.md) | SPEC、決策及實作狀態 |
| LINE 開聊、訂單圖卡、採購／到台與匯款人工提醒 | [CUSTOMER_CARE.md](docs/CUSTOMER_CARE.md) | SPEC、資料、決策及實作狀態 |
| 最新進度、交棒、未完成工作 | [HANDOFF.md](docs/HANDOFF.md) | CHANGELOG 與 manifest 階段 |
| AI 工作規則與驗證方式 | [AI_START_HERE.md](docs/AI_START_HERE.md) | 三份工具入口保持一致 |

### 店主進價程式入口（0.3.8）

- [進價表單](apps/admin-web/purchase-cost.js)、[換算與合計](shared/costing.js)
- [後端成本驗證](domain/costing.mjs)、[共用 Excel 三表](server/reports.mjs)
- [成本與權限驗證](tests/costing.test.mjs)

### 預購刪除程式入口（0.3.9）

- [刪除防呆規則](domain/order-deletion.mjs)、[刪除與舊資料升級驗證](tests/order-deletion.test.mjs)
- 管理介面 apps/admin-web/app.js；雲端 cloud/core.mjs；本機 server/api.mjs 與 server/store.mjs

### 商品草稿與離開保護程式入口（0.3.10）

- [同分頁草稿與生命週期](apps/admin-web/product-draft.js)、[草稿驗證](tests/product-draft.test.mjs)
- 管理表單 apps/admin-web/app.js；照片快照 image-editor.js；逐尺寸原始輸入 size-pricing.js

### 商品編輯選填進價程式入口（0.3.11）

- [商品進價表單](apps/admin-web/product-cost.js)、[共用進價狀態](shared/product-costing.js)
- [進價提交驗證](domain/product-costing.mjs)、[雙向同步與隱私驗證](tests/product-costing.test.mjs)

### 商品輸出與批量底稿程式入口（0.3.12）

- [共用商品輸出與匯入規則](domain/product-transfer.mjs)、[來回與欄位驗證](tests/product-transfer.test.mjs)
- 管理介面 apps/admin-web/app.js；下載 API cloud/index.ts／server/api.mjs；雲端匯入 cloud/core.mjs

### 含圖商品 Excel 程式入口（0.3.13）

- [瀏覽器首圖縮圖與下載](apps/admin-web/product-export.js)、[後端圖片核對與生成](server/product-workbook.mjs)、[XLSX 圖片封裝](server/xlsx.mjs)
- [首圖與空白／零元驗證](tests/product-workbook.test.mjs)，測試縮圖為 tests/fixtures/product-thumbnail.mjs

### 韓國商品連結與顏色（0.3.14）

- 共用驗證 domain/validation.mjs 的 productSourceUrl；保存 cloud/core.mjs、server/api.mjs、server/store.mjs；草稿 product-draft.js
- 表格 domain/product-transfer.mjs／server/reports.mjs，XLSX 超連結 server/xlsx.mjs；[來源保存與隱私驗證](tests/product-source.test.mjs)

### 客戶瀏覽觀察（0.3.16）

- [客戶回報與計時](apps/customer-web/browsing.js)、[管理瀏覽紀錄](apps/admin-web/browsing.js)、[共用驗證與彙總](domain/browsing.mjs)
- [權限／計時／去重／保存驗證](tests/browsing.test.mjs)、[私有表與 service_role RPC](supabase/migrations/20261107164621_ccbaby_browsing.sql)

### 銷售協助與商品排序（0.3.18）

- 研究與操作：[SALES_PLAYBOOK.md](docs/SALES_PLAYBOOK.md)
- 管理建議 apps/admin-web/browsing-insights.js；排序頁 apps/admin-web/merchandising.js；規則 domain/merchandising.mjs；tests/sales-guidance.test.mjs

### LINE 一對一與訂單服務（0.3.19）

- 操作與範圍：[CUSTOMER_CARE.md](docs/CUSTOMER_CARE.md)
- 聯繫碼 shared/line-contact.js；規則 domain/customer-care.mjs；管理聯繫 apps/admin-web/customer-care.js；PNG 圖卡 apps/admin-web/order-card.js；驗證 tests/customer-care.test.mjs

### 登入效能與相容（0.3.20）

- 客戶入口 apps/customer-web/entry.js、shared/runtime.js；合併讀取 cloud/index.ts／cloud/core.mjs；預載與公開設定 scripts/build-pages.mjs
- [入口請求與失效驗證](tests/customer-entry.test.mjs)、[實際 Edge handler 隔離驗證](tests/cloud-entry.test.mjs)，沿用 tests/cloud.test.mjs／line-auth.test.mjs

### LINE 跨瀏覽器恢復（0.3.17）

- [短期登入暫存與消耗](shared/line-auth.js)、[跳轉與回呼](shared/runtime.js)、[跨分頁／state／逾時驗證](tests/line-auth.test.mjs)

## 4. 索引樹

0.3.15 沿用商品進價、商品輸出與含圖 Excel 入口：shared/product-costing.js 的 sizeCostState、domain/product-costing.mjs 的成本規劃／每尺寸 patch、domain/product-transfer.mjs 的 productDisplayRows；驗證沿用 tests/product-costing.test.mjs／product-workbook.test.mjs／product-draft.test.mjs

```text
不同 AI 工具
├─ AGENTS.md
├─ CLAUDE.md
├─ GEMINI.md
└─ 手動指定 AI_INDEX.md
   └─ AI_INDEX.md：共用導覽
      ├─ docs/DEPLOYMENT.md：正式入口、權限、發布與 LINE 啟用
      ├─ docs/LOCAL_PREVIEW.md：本機操作與驗證
      ├─ docs/IMPLEMENTATION_STATUS.md：已完成與未完成
      ├─ docs/HANDOFF.md：最新進度與交棒
      ├─ project-manifest.json：機器可讀狀態與路徑
      ├─ SPEC.md：需求與驗收主檔
      ├─ docs/DECISION_LOG.md：已定決策
      ├─ docs/OPEN_DECISIONS.md：待決細節
      ├─ docs/ARCHITECTURE_MAP.md：系統／頁面／目錄樹
      ├─ docs/DATA_MODEL.md：資料與報表規則
      ├─ docs/SALES_PLAYBOOK.md：研究、對話協助及審閱排序
      ├─ docs/CUSTOMER_CARE.md：一對一開聊、圖卡與服務提醒
      ├─ docs/UI_REFERENCE_AUDIT.md：參考 UI 實測證據
      ├─ docs/AI_START_HERE.md：工作方式與維護規則
      └─ CHANGELOG.md：歷次變更與驗證
```

## 5. 可直接交給下一個 AI 的指令

```text
請接手「韓國年度預購網站」。
先閱讀根目錄 AI_INDEX.md，依索引讀最新交接、project-manifest.json、
SPEC.md 與這次任務相關文件，並確認實際存在的檔案。
目前 GitHub Pages + Supabase 與 LINE Login 已啟用，活動已 open 且有正式預購。先讀 docs/DEPLOYMENT.md，勿重做既有設定。
請以文件中的已確認需求為準，依我這次的指示工作，
不要把規劃當成已完成，也不要重問已定的基本需求。
完成後同步交接、變更紀錄與受影響的主文件。
```

這段指令只提供接手脈絡，具體工作範圍仍以使用者當次指示與最新交接為準。
