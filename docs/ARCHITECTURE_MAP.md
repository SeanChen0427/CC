# 架構地圖與樹狀圖

## 0.3.21 登入等待動畫

客戶 index 初始等待／app.js 開啟 LINE 等待 → 裝飾性 video／同源海報；login-animation.js 為 async 可選模組，監看等待節點、登入狀態與減少動態效果，150ms 後才開始影片請求。登入 entry.js／runtime.js 不引用或等待此模組；成功渲染、失敗／重試、背景／離開即停止，沒有新增 API、後端、資料或認證依賴。建置沿用 customer-web 靜態複製，管理端不加入動畫；本機 server 僅增加 video/mp4 MIME

## 0.3.20 登入效能

- 無 token → GET customer/line/config → LINE → POST customer/line/exchange（includeStartup:true）→ 同回應帶 token、本人 me 與受保護 catalog，直接渲染
- 有 token → GET customer/bootstrap → PostgreSQL 核對 session／角色／期限 → 同回應 me＋catalog；401 重新登入，其他服務失敗保留憑證供重載
- exchange 保留原 LINE 官方驗證，成功後才更新會員、建立原 session 並按需讀取最新文件。若追加商品讀取失敗，仍回傳已成立 token，由客戶端重試受保護 bootstrap，避免丟失成功登入
- 舊 exchange 不帶 includeStartup 時仍只回 ok／token，me／catalog 不移除。新前端遇舊後端 bootstrap 404 時回到原 me／catalog 流程，取消及回呼失效仍停在恢復頁
- customer index 預載九個必要模組，build 統一版本並安全嵌入既有公開設定；runtime 優先讀內嵌設定，本機與管理端仍讀 config.json。未內嵌個資或秘密，不快取私人 API

## 0.3.17 LINE 跨瀏覽器恢復

shared/runtime.js → shared/line-auth.js，依隨機 state 分隔 10 分鐘登入暫存，原分頁 sessionStorage＋同源 localStorage 短期備援；回呼核對 state／時間／verifier／nonce，消耗後 local 僅留到期清理的已用標記，跨分頁舊副本不能重用。其他瀏覽器取不到暫存就停在恢復頁，下一次登入加 disable_auto_login=true；?login=browser 可直接選擇該流程。正式 session、伺服器 code／ID token 驗證與角色分離沿用。只有靜態前端及本機共用檔案路由更新，Supabase Edge 仍 v17，不改資料或登入設定

## 0.3.16 客戶瀏覽觀察

客戶 browsing.js（記憶體佇列、白名單事件、前景／閒置計時）→ POST customer/browsing → domain/browsing.mjs 核對角色、時間、商品／規格並剔除任意輸入 → 獨立 browsing_events。雲端使用私有表＋service_role-only ccbaby_browsing_write／read，SQL 再核對 session／owner；不呼叫 ccbaby_commit、不爭用業務 revision。資料表開 RLS、無客戶直連策略；本機 SQLite 新增獨立表與索引，舊資料不改。

管理 #browsing → apps/admin-web/browsing.js → GET admin/browsing（days、customerId、before）。彙總全部符合期間資料後合併所有已登入會員及有效預購狀態，明細按客戶讀取 200＋1 筆、以時間與 UUID 游標繼續，關注商品彙總不受明細分頁影響。時間軸依 visitId 分組，重新整理或 30 分鐘閒置另建造訪。無第三方像素／LINE 訊息，前台用途提示不改登入門檻。

0.3.15 尺寸進價與商品拆列：product-cost.js 共用值／個別尺寸完整進價 → costUpdate.sizeCosts＋全規格版本 → planProductCosts 驗證目前尺寸、成本與衝突 → 兩後端更新原 procurement.cost。新顏色沿用該尺寸一致成本，未指定修改保留舊規格；客戶不含成本。productDisplayRows 按實際售價＋完整成本及有效顏色／尺寸組合拆列，productWorkbook 每列同首圖，xlsx.mjs 重用同圖 bytes，連結跟隨新列；CSV／匯入底稿一款一列，無 DDL

0.3.14 商品來源記錄：商品編輯 sourceUrl → 同分頁草稿白名單 → 共用 productSourceUrl 驗證 → 雲端 products.sourceUrl／本機 products.source_url。僅管理 catalog 與採買報表回傳；客戶 catalog 明確排除此欄。商品／CSV／採買 XLSX 帶來源，xlsx.mjs 建立安全 http(s) 超連結關聯，與首圖 drawing 共存；不請求來源網址、不改採購或預購。新增顏色欄空白，既有規格及草稿照原資料。

0.3.13 含圖商品 Excel：product-export.js 先取得已授權 admin/state → 各商品 images[0] 於瀏覽器以四張並行轉 144×144、6 KB 內 JPEG → POST admin/products.xlsx → server/product-workbook.mjs 核對當前商品／第一張 URL、JPEG 格式尺寸 → productSheets 四表 → xlsx.mjs DrawingML／media 內嵌。POST 分支只讀不走 revision 提交，圖片不放 Storage；成本仍取後端目前有效規格的私有紀錄。

0.3.12 商品輸出：選物管理 → admin/products.xlsx 或 products.csv（只讀）→ domain/product-transfer.mjs 共用欄位與列格式 → 既有 XLSX 寫出器／UTF-8 BOM CSV。admin/products-template.csv 提供相同欄位範例；兩端 admin/import 共用預覽／解析，再走原商品驗證與原子交易，只新增、不以編號覆寫。extra:<size> 對應 sizeSurcharges；商品／規格、採購與預購不因匯出改動，無 DDL。

0.3.11 商品進價：product-cost.js 選填韓幣與同頁匯率 → 商品儲存 costUpdate（含原採買版本）→ domain/product-costing.mjs 驗證 → 與採買清單共用 procurement.cost／version。admin catalog 僅於管理端附 variant.cost／costVersion，客戶 catalog 不加欄。私有紀錄可先於預購存在，無需求時不算報表；草稿保留輸入與原版本，衝突明確載入最新進價。無資料庫 DDL。


0.3.10 商品草稿：app.js 表單／照片／尺寸輸入 → product-draft.js → 依部署、活動、商品分隔的 sessionStorage。input／change 即存，visibilitychange(hidden)／pagehide 補存；登入驗證與 admin/state 完成才恢復原編輯。草稿僅含商品白名單欄位，照片保存已完成 URL、綁定開關及未完成張數；不保存 File／帳密或客戶資料。close／cancel／hashchange 走保留確認，外圍不關閉；成功儲存或明確放棄清除本商品並解除監聽。僅靜態管理端，後端及既有權限不變。

0.3.9 預購刪除：管理明細 → 完整編號＋原因確認 → admin/orders/:id/delete → domain/order-deletion.mjs 驗證店主路由、版本及採購／分配 → 標記 deleted_at 並遞增受影響採購版本 → 客戶查單、總覽與有效匯出排除。舊送單請求不復活，重新送單建立新編號。雲端沿用私有 JSONB；本機舊表無損升級，歷史保留。


0.3.8 店主進價：管理匯率設定 → admin/cost-settings → 私有設定；採買紀錄 purchase-cost.js → domain/costing.mjs 驗證 → procurement.cost 與數量同版本提交。shared/costing.js 以整數計算換算與合計，server/reports.mjs 共用三表匯出。雲端 JSONB 原子 revision 與本機 SQLite 交易保留，無 Postgres DDL；成本不加入商品或客戶 API。


0.3.6 客戶相簿：app.js 產生全部照片 → gallery.js 綁定原生 scroll-snap 橫向捲動 → 同步 photoIndex／縮圖／張數。縮圖與方向鍵走同一個 select，放大及返回沿用目前索引，ResizeObserver 保留旋轉後位置；換視窗或關閉時解除監聽。只有靜態前端更新，資料與後端不變。


0.3.5 尺寸定價：商品基本售價 → size-pricing.js 依尺寸列表產生加價欄位及即時售價 → 後端驗證 sizeSurcharges → 同一顏色／尺寸 variant 保留 ID、更新未來售價。product-pricing.js 負責舊商品回填；雲端 JSONB 保存 basePrice／sizeSurcharges，本機 pricing JSON 加欄保存。既有預購快照不回寫。


## 0.3.4 商品照片流程（已實作）

```text
店主商品編輯
├─ image-editor.js：多選／拖入 → 逐張佇列 → 進度／重試／移除
│  └─ image-upload.js：讀圖／縮圖 → admin/upload → Storage 圖片 URL
├─ 相簿：拖曳／左右排序 → images 陣列（首張為封面）
├─ 選填綁定：顏色 → 明確指定 URL → imageBindings
└─ admin/products → 伺服器驗證 → revision 提交
   ├─ 雲端：products JSONB 欄位（無需變更 Postgres schema）
   └─ 本機：images 與 image_bindings JSON，舊 SQLite 加欄保留資料
客戶商品詳情
└─ 全部 images 獨立縮圖 → 主圖／放大
   └─ product-gallery.js：僅明確綁定顏色時切圖，點照片不改規格
```

0.3.3 入口更新：未登入 → 公開 LINE 設定 → 自動 LINE 登入 → 後端驗證／本人 session → 受保護 catalog → 商品頁。客戶取消／失敗停在重試頁，有效工作階段直接續用。此流程取代先瀏覽目錄的舊版實作。

> 0.3.0 最新狀態：使用者已授權 GitHub Pages /CC/、/CC/admin/ 與 Supabase，測試資料已清空，LINE 待設定，活動 draft。下方舊版本／完整目標保留供對照，以 [DEPLOYMENT.md](DEPLOYMENT.md) 與 HANDOFF.md 為目前實作依據。


日期：2026-11-05｜已建立本機 0.2.1；本文件保留完整目標設計，實際路徑見下方。

## 本機 0.2.1 對應

- 客戶：apps/customer-web，127.0.0.1:4173。
- 管理：apps/admin-web，127.0.0.1:4174。
- 同一個 Node.js 程序建立兩個 HTTP 入口；API 與工作階段依入口分離。
- server/index.mjs 管存取邊界；server/api.mjs 管業務；server/store.mjs 管 SQLite。
- domain/rules.mjs 管共用驗證；server/xlsx.mjs 管 Excel；server/art.mjs 管原創示意圖。
- 目前客戶及管理頁面使用各自的 hash 導覽。下方 URL 路由為長期契約草案，不是所有路由均已實作。
- 操作見 [本機預覽](LOCAL_PREVIEW.md)，未完成範圍見 [實作對照](IMPLEMENTATION_STATUS.md)。

## 1. 功能樹

```text
韓國年度預購網站
├─ 客戶入口（獨立網址）
│  ├─ LINE 登入與官方帳號加好友入口
│  ├─ 當期預購活動
│  │  ├─ 活動說明／截止時間
│  │  ├─ 商品類型分類／分類數量
│  │  ├─ 商品名稱與編號搜尋
│  │  └─ 商品列表／空清單／無搜尋結果
│  ├─ 商品詳情
│  │  ├─ 多張照片／圖片放大
│  │  ├─ 說明／選用尺寸表
│  │  └─ 規格／數量／對應價格
│  ├─ 購物車
│  │  ├─ 加入／合併同規格／增減／移除
│  │  ├─ 件數與預估小計
│  │  └─ 送出預購（不用付款）
│  ├─ 成立確認
│  │  └─ 預購編號／時間／明細／追加入口
│  └─ 我的預購
│     ├─ 本期與保留中的歷史預購
│     ├─ 截止前修改與追加
│     ├─ 買到／部分買到／缺貨／到台資訊
│     └─ 聯絡與稍後補填的收件資料
├─ 管理入口（另一個獨立網址）
│  ├─ 唯一一組帳號密碼登入／登出
│  ├─ 活動管理
│  │  └─ 建檔／開放／結單快照／採購／到台／封存／次年複製
│  ├─ 商品管理
│  │  └─ 類型分類／單筆與批次上架／圖片／規格價格／上下架
│  ├─ 客戶與預購
│  │  └─ 聯絡資料／誰預購什麼／追加異動／結單後協助
│  ├─ 採買工作台
│  │  └─ 規格總需求／已買／待採買／確認缺貨／客戶分配
│  ├─ 分貨清單
│  │  └─ 按客戶整理實際買到與待處理商品
│  ├─ 報表
│  │  └─ 客戶預購明細／採買彙總／Excel 匯出
│  └─ 系統設定
│     └─ 管理密碼更換／備份與還原／基本活動設定
└─ 後端與正式資料
   ├─ 客戶登入與本人權限
   ├─ 管理登入與管理權限
   ├─ 商品與年度活動
   ├─ 預購與追加／異動歷史
   ├─ 採購／缺貨／客戶分配
   ├─ 報表與結單快照
   └─ 資料庫／圖片儲存／私有備份
```

## 2. 入口與權限資料流

```text
客戶裝置                               店主裝置
   │                                      │
   ▼                                      ▼
客戶網站（網址 A）                   管理網站（網址 B）
僅包含客戶介面                       僅包含管理介面
   │ LINE 登入／客戶工作階段            │ 一組帳密／管理工作階段
   ▼                                      ▼
客戶 API 與本人授權                  管理 API 與管理授權
   │                                      │
   └──────────┐              ┌─────────────┘
              ▼              ▼
              共用業務規則與服務
              │ 活動／商品／預購／採購／報表
              ▼
              正式資料庫與圖片儲存
```

獨立入口不要求複製兩份資料庫。兩端讀取同一份正式預購資料，避免店主看不到客戶新單。
後端共用不表示權限共用：每一個 API 都需檢查相應身分與資料歸屬。

## 3. 客戶端與管理端必須分開的項目

| 項目 | 客戶端 | 管理端 |
|---|---|---|
| 網址 | 獨立客戶網址，正式名稱待定 | 另一個獨立管理網址，正式名稱待定 |
| 前端 | 自己的入口、路由與建置產物 | 自己的入口、路由與建置產物 |
| 登入 | LINE | 唯一一組帳號密碼 |
| 工作階段 | 客戶身分與本人範圍 | 管理員身分與管理範圍 |
| 可讀內容 | 商品及本人預購／資料 | 所有預購、客戶與採購報表 |
| 修改內容 | 開放期間的本人預購 | 管理活動、商品、預購及採購 |
| 匯出 | 不提供整體客戶報表 | 有權限才可匯出 |

允許共用不含身分與機密的 UI 基礎元件、型別及業務規則。
不得把完整管理應用打包到客戶網站，再用選單隱藏。

## 4. 路由契約草案

下列為設計示意，不是既有可呼叫網址。兩個網站的根路徑互不相同。

```text
客戶網站
├─ /                         當期活動與商品列表
├─ /auth/line                LINE 登入入口
├─ /auth/line/callback       客戶登入回呼
├─ /cart                     購物車
├─ /preorders                我的預購
└─ /preorders/:id            本人預購明細

管理網站
├─ /login                    唯一管理帳密登入
├─ /                         管理總覽
├─ /campaigns                活動與結單
├─ /products                 商品與分類
├─ /customers                客戶與預購明細
├─ /procurement              採買與缺貨紀錄
├─ /allocation               按客戶分配與分貨
├─ /reports                  預購與採買報表
└─ /settings                 管理密碼與備份設定

後端 API 分區
├─ /catalog/*                依目錄公開政策提供商品，無個資
├─ /auth/customer/*          LINE 憑證驗證及客戶工作階段
├─ /customer/*               僅本人資料與預購
├─ /auth/admin/*             管理帳密驗證及管理工作階段
└─ /admin/*                  全部管理與匯出功能
```

早期不同網域方向已由 0.3.0 決策取代：/CC/ 與 /CC/admin/ 同源不同目錄，各自登入，Supabase 後端授權。
即使管理網址被知道，未通過管理驗證也不能讀取資料。

## 5. 正式寫入與報表流程

```text
客戶草稿
  → 伺服器驗證活動、LINE 身分、規格、單價與數量
  → 同一交易寫入預購、明細快照與異動紀錄
  → 依冪等識別回傳同一份成立結果
  → 清除已成功送出的草稿
  → 店主報表從正式明細聚合
  → 採購紀錄與分配回連規格及客戶明細
```

- LINE 是否發出通知不影響資料庫中預購是否成立。
- 所有有效需求都從正式預購明細計算，不從購物車或瀏覽器快取計算。
- 數量、金額及截止判定由共用業務規則處理，兩個前端不各自複製另一套算法。
- 管理異動有版本／衝突檢查，防止多個分頁覆蓋較新的採購紀錄。

## 6. 預定程式目錄樹

以下是完整目標目錄樹；本機已建立 apps、server、domain、scripts 與 tests，細分目錄仍依後續規模演進。兩個前端分別提供，正式部署未進行。

```text
韓國預購網站/
├─ README.md
├─ AI_INDEX.md                跨 AI 共用索引
├─ SPEC.md
├─ AGENTS.md
├─ CLAUDE.md
├─ GEMINI.md
├─ CHANGELOG.md
├─ project-manifest.json
├─ docs/
│  ├─ AI_START_HERE.md
│  ├─ HANDOFF.md              最新交接
│  ├─ LOCAL_PREVIEW.md        本機啟動與操作
│  ├─ IMPLEMENTATION_STATUS.md 已完成範圍
│  ├─ ARCHITECTURE_MAP.md
│  ├─ DATA_MODEL.md
│  ├─ DECISION_LOG.md
│  ├─ OPEN_DECISIONS.md
│  ├─ UI_REFERENCE_AUDIT.md
│  └─ reference-ui/           已挑選的研究截圖
├─ apps/                     本機已建立
│  ├─ customer-web/          客戶端入口與頁面
│  └─ admin-web/             管理端入口與頁面
├─ server/                   本機以 .mjs 模組建立
│  ├─ auth/                  兩種登入與分開的工作階段
│  ├─ customer/              本人預購 API
│  ├─ admin/                 管理與匯出 API
│  ├─ services/              共用業務服務
│  └─ storage/               資料庫／圖片／備份介接
├─ domain/                   已建立共用驗證規則
├─ migrations/               待實作：資料結構版本
└─ tests/                    已建立權限、預購與報表整合測試
```

## 7. 技術與部署原則

- 本機採用原生前端、Node.js 24 與 SQLite；正式主機、公開網址與部署環境待使用者指定。
- 以年度低頻使用、易維護及獨立入口為選型條件，不預設高固定月費。
- 需要正式後端、持久資料庫與圖片儲存；不能用純靜態頁面的本機儲存取代。
- LINE 設定使用店主自己的帳號資源，不沿用參考站的 LIFF ID 或 Channel。
- 涉及官方帳號連結時，LINE Login 與 Messaging API 的 Provider 配置需一併規劃。
- 秘密由伺服器秘密管理保存；正式資料、備份與含個資的報表不進公開儲存庫。
- 目前只建立本機程式、資料庫及測試帳號，不建立雲端資源或公開部署。

## 0.3.18 銷售協助與排序（已實作，部署見 HANDOFF）

管理 browsing.js → browsing-insights.js，以最新 browsing API 的活動／最小預購摘要搭配期間彙總及已載入時間軸，產生依據、下一步與可複製草稿。僅開 LINE 官方管理首頁，無訊息 API。

管理 #merchandising → GET admin/merchandising → 私有 ccbaby_merchandising_read（SQL 核對 owner session）取得不重複人數 → domain/merchandising.mjs 加入本期有效預購並產生建議。畫面手調草稿 → PUT admin/product-order → 完整上架名單及版本驗證 → 原 JSONB revision 原子提交。雲端 merchandising／本機 merchandising_settings 保存目前與上次順序。customer catalog 只用 orderedProducts 排列公開商品，分析不送客戶。

## 0.3.19 LINE 聯繫與訂單服務

客戶詢問入口 → POST customer/line-contact → domain/customer-care.mjs 本人代碼建立／重用 → shared/line-contact.js 組官方聊天室連結及預填文字 → 客戶親自傳送。只在首次建立代碼寫業務文件；重用不增加雲端 revision，不把網站 Token 或 LINE user ID 放入連結。

管理 #care → GET admin/customer-care（最新有效預購及分配）→ customer-care.js 顯示人工核對、追蹤及四階段通知 → order-card.js 瀏覽器 Canvas 分頁產生 PNG／Blob 下載，文字與圖卡由店主另在 LINE 原生個別聊天室傳送。

PUT admin/customer-care 保存私有聊天室備註及下次提醒；PUT admin/order-notice 依版本、通知簽章、有效明細、分配與到台條件保存人工紀錄。雲端沿用 private JSONB + revision，本機 SQLite 新增欄位與獨立兩表；未加雲端 RPC／表／權限或 LINE Secret。工作總覽另讀相同管理分析，列到期及待處理客戶。
