# GitHub Pages 與 Supabase 部署

版本 0.3.0｜2026-11-05。依使用者明確指定部署，參考副主席平台的靜態前端與 Supabase 後端分工。

## 入口與資源

| 項目 | 位置 |
|---|---|
| 客戶選物入口 | https://ccbaby.beecharge.live/ |
| 店主管理入口 | https://ccbaby.beecharge.live/admin/ |
| GitHub 原始碼 | https://github.com/SeanChen0427/CC ，main 分支 |
| Pages 成品 | 同儲存庫 gh-pages 分支，根目錄發布 |
| Supabase | tukluknvmbsbsdzawmjf，ap-northeast-2 |
| Supabase 控制台 | https://supabase.com/dashboard/project/tukluknvmbsbsdzawmjf |
| 後端 | ccbaby-api Edge Function，程式 cloud/index.ts |
| 商品圖片 | ccbaby-products 公開 bucket，只存可公開的商品圖 |
| 公開設定 | deployment.json：API、publishable key、網站網址，沒有服務密鑰 |

兩個頁面同源、不同目錄，是使用者已確認的部署方式。各自有前端檔案、登入流程及 sessionStorage 名稱。
這是介面及後端授權分離，不是瀏覽器 origin 隔離；同一 GitHub 帳號其他 Pages 網站也共享 origin。

## 雲端資料樹與交易

```text
GitHub Pages
├─ /CC/                  客戶頁 → 商品目錄、LINE 待啟用
└─ /CC/admin/            店主頁 → 唯一帳號 hannah
        │ HTTPS / JSON / 各角色 bearer session
        ▼
Supabase ccbaby-api
├─ 公開：health、customer/line/config、me（未登入不傳私人資料）
├─ 客戶：catalog 及自己的預購，需有效客戶 session
├─ 登入：管理帳密 → Supabase Auth → 固定 owner_id 比對
├─ 客戶：LINE code + PKCE → LINE 官方端點驗證 ID token / nonce
├─ 授權：每次由 PostgreSQL 核對 session hash、角色及到期
├─ 商品圖：店主驗證後檢查檔頭、MIME、大小，再上傳 Storage
├─ 報表：店主驗證後產生三張工作表 XLSX / JSON 備份
└─ 業務：cloud/core.mjs
        ▼
PostgreSQL ccbaby_private（不對 anon / authenticated 開放）
├─ store：單期低量預購文件 JSONB + revision + owner_id
│  ├─ campaign / seq
│  ├─ products / variants
│  ├─ customers / preorders / items
│  ├─ procurement（含私有 cost）/ costSettings / submissions
│  └─ events / closing_snapshots
├─ sessions：SHA-256 雜湊、role、subject、12 小時到期
└─ login_limits：雜湊 IP 的五分鐘登入限流
```

雲端採單期 JSONB 文件，符合一年一次、100～200 款的低量情境；邏輯實體並非每個都有實體資料表。
業務只在後端讀取整份文件，前台只取得該 API 允許的結果。每次寫入用 revision 原子比較更新，
衝突重新載入、重新驗證並最多重試五次；報價變動、採購版本衝突仍要求使用者重整。
同一次送單 requestId 具冪等性。單份文件上限 16 MB；大量跨年歷史需先完成獨立活動及歸檔方案。
本機仍用 SQLite，兩個環境不自動同步，也不將本機資料上傳正式環境。

## 登入與權限

- 唯一帳號為 hannah；伺服器映射到固定內部信箱，Supabase Auth 保存密碼雜湊。
- 初始密碼保存在本機私有 `.local/admin-credentials.txt`，不在 GitHub、網頁、文件、匯出或日誌。
- 沒有註冊／新增管理員功能；任何其他 Supabase Auth 使用者都不會成為店主。
- 前端只取得隨機應用程式 session，不取得 service_role key 或 Supabase Auth refresh token。
- 兩個角色的 session 不互用，資料庫每次再確認；登出撤銷該憑證，改密碼撤銷所有管理憑證。
- Edge Function 的 verify_jwt=false 是為了自訂 opaque session；不是省略驗證。
- 公開 RPC 權限全部撤銷，只授權 service_role；三張私有表開 RLS、預設拒絕，無客戶直連策略。
- 商品圖公開讀取；客戶資料、預購、備份不放公開 bucket。前端不能直接寫 Storage。
- CORS 只允許 GitHub Pages origin 與本機 4173／4174；CORS 之外仍要通過角色與 session 驗證。

## 發布與日後更新

1. `npm run check`、`npm test`（整合測試需臨時本機連接埠）。
2. 修改公開設定時只改 deployment.json，不放任何 private key。
3. Supabase DDL 用 migrations 依序套用；Edge 部署 cloud/index.ts、cloud/core.mjs、domain/validation.mjs、server/xlsx.mjs。
4. 先驗證後端及建置結果，提交原始碼 main，再執行 `npm run publish:pages` 更新 gh-pages。
5. GitHub Pages 設為「Deploy from a branch」，gh-pages、/(root)。不依賴 GitHub Actions workflow 權限。
6. 等待 Pages build 完成，驗證兩個正式網址、登入、商品及報表；不要把 Git push 成功當部署完成。

發布腳本使用忽略的 `.local/pages` 工作副本，不上傳專案根目錄。一般後台上架商品不用重新發布 GitHub。
沒有自動發佈排程；主機、repo 或網址異動需同步 CORS、LINE callback、deployment.json、manifest 及本文件。

## LINE Login 已啟用（2026-11-05）

| 項目 | 設定 |
|---|---|
| Provider | CCbaby（官方帳號與 LINE Login 共用） |
| 官方帳號 | CCbaby，@445yxcey |
| LINE Login Channel | CCBABY 網站登入，2012401105 |
| 發布狀態 | Published，使用者於本次明確確認發布 |
| Callback URL | https://ccbaby.beecharge.live/ |
| 後端 Secrets | LINE_CHANNEL_ID、LINE_CHANNEL_SECRET 已存 Supabase |
| Scope | 網站請求 profile、openid |

Secrets 原文不在 GitHub、前端或文件。平台發布與 Secret 設定已完成，無須重新建立 Channel。
已驗證：登入頁啟用、LINE 帳號登入／授權、授權碼交換、後端身分驗證、建立本人 session、回到網站顯示會員名稱，以及重新整理仍保持登入。
發布後已確認 Channel 顯示 Published。只有一位真實帳號完成實測，尚未用第二位客戶驗收完整送單。
此次沒有建立虛構預購；資料庫新增的是第一次真實 LINE 登入的會員，保留不刪除。

下次變更設定：從 LINE Login 的 Basic settings 取值，直接更新 Supabase Edge Functions → Secrets，再以 health / catalog 確認 lineConfigured=true。
LINE 官方帳號已連結，但現階段仍為人工聯絡，沒有自動推播、聊天機器人或自動分貨。
0.3.3 客戶入口：先檢查本人 session，未登入只取公開 LINE 設定並立即跳登入，不讀取商品。取消／失敗停在重試畫面，登入成功後才取受保護 catalog；保留 #cart／#orders 的回站位置。有效登入直接續用。

下一步由店主上架真實商品與設定截止時間，完成實際預購驗收後才把活動從 draft 改為 open。

## 清空與驗證紀錄

- 本機原測試資料先備份至忽略的 `.local/backups`，再清空商品、客戶、預購、明細、採購及 session。
- 正式 Supabase 初始為空專案；建立唯一店主，雲端驗證商品已刪除。活動為 draft。
- 自動測試使用臨時資料庫／記憶體文件，包含 200 款匯入，不會灌進正式資料庫。
- 實測管理登入、商品上架公開讀取、報表匯出、登出撤銷、錯誤角色、偽造 session、匿名 RPC 拒絕。
- Supabase 安全檢查：私有表 RLS 無策略是刻意預設拒絕；無 anon／authenticated 權限。
- 平台提示尚未啟用外洩密碼檢查；初始使用隨機強密碼，可依方案在 [Supabase 密碼安全設定](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 啟用。
- JSON 備份僅為資料與圖片 URL，尚無完整圖片打包與還原介面；營運前請補妥備份流程。

後續正式商品、價格、尺寸與日期由店主填入，不再自動加入範例。

正式網址驗證（2026-11-05）：兩個入口與關鍵資源 HTTP 200，Pages build 為 built；正式前台讀取雲端空目錄、店主管理登入成功。資料仍為商品／客戶／預購／明細零筆，唯一管理員一位。

帳密更新驗證（0.3.1）：hannah 與新密碼登入成功，舊帳號、舊密碼及舊管理工作階段均被拒絕；本機帳號與私有登入檔同步，維持新密碼至少 12 碼。

自訂網域更新（0.3.1）：發布時偵測 gh-pages 新增 CNAME=ccbaby.beecharge.live，保留設定。正式入口為根目錄 / 與 /admin/；原 GitHub Pages /CC/ 網址會轉址。已同步 CORS、LINE callback 預備網址與公開設定，建置保留 CNAME，後續發布前先整合遠端更新。

前端靜態資源以 package.json 版本號加入 app.js／style.css 查詢參數，避免手機瀏覽器繼續使用舊快取。

## 0.3.4 商品照片更新 — 2026-11-06

前端處理每張原圖上限 20 MB，自動縮圖再逐張傳送，Edge 與 bucket 仍限單張 1.4 MB。商品 images 保留順序，imageBindings 為選填顏色／URL 對應；只更新 Edge 業務程式與靜態網站，不更動既有資料或雲端 schema。後台已存在店主的 1 款正式商品，保留不清空。

0.3.4 已發布：Pages ae7605f7b94f1d1bb7c753e9445ffd1dc39f813f（built）、Edge v7（ACTIVE）。正式管理登入、新編輯器、多選及既有 2 張圖片均已驗證，未改動店主商品。

## 0.3.5 尺寸加價更新 — 2026-11-06

Edge v8 支援明確 sizeSurcharges 與 basePrice，靜態商品編輯器提供每尺寸加價及售價。舊請求保留相容；不遷移既有商品價格、不改成立預購，也沒有 Postgres schema 變更。本機 SQLite 增加 pricing 欄位保留現有資料。

0.3.5 已發布：Pages 3fef1c65d1327d9467735ea20cb9ac33296b9c5e（built）、Edge v8（ACTIVE）；正式登入及尺寸加價編輯器已驗證，既有售價未異動。

## 0.3.6 手機滑動相簿更新 — 2026-11-06

只有 GitHub Pages 客戶端靜態檔案更新，gallery.js 提供主圖原生橫向捲動與相簿狀態；Supabase Edge 保持 v8、資料不變。本次執行 9 項相關測試，前次全套 46 項結果保留。

0.3.6 已發布：Pages c70634171eed1836431814721ebf65f81fbe395b（built），正式 LINE 登入、相簿橫向捲動與張數同步已驗證。未部署 Edge 或修改正式業務資料。

## 0.3.8 店主成本功能部署

Edge v10、Pages built 37e6e82。新增私有 JSONB costSettings 與 procurement.cost，不改 Postgres schema／RPC 權限。匯出由 server/reports.mjs 共用三表，成本不傳回客戶 API。正式唯讀查驗 13 款商品、1 份預購、活動 open，業務資料未異動；匯率待店主自行設定。

## 0.3.9 管理刪除預購部署

Edge v11、Pages built 559904e9。私有 JSONB 標記 preorders.deleted_at／delete_reason，無 Postgres DDL／RPC 權限變更。客戶與有效報表排除，歷史留在私有備份；舊送單重試及修改被拒絕。正式站僅測錯誤編號與取消確認，未刪正式預購，業務狀態前後一致。

## 0.3.10 商品編輯不中斷部署

只有 GitHub Pages 管理端靜態更新，product-draft.js 於同分頁暫存與恢復表單，外圍及關閉保護。Supabase Edge 維持 v11，不變更正式業務資料、帳密與 12 小時登入。65 項測試及隔離 Chrome 320／390px 驗證通過；Pages 5f88fab48e6d9523b0d970a90e28005a341c0213 已 built；正式 index 使用 0.3.10，草稿模組與已驗證來源一致，Chrome 正式登入頁載入成功。未於正式站提交商品，完整互動使用隔離資料庫。

## 0.3.11 商品選填進價部署

Edge v12、Pages built 9696420f。商品 POST 支援 costUpdate，與採買共用私有 procurement.cost／version；管理目錄附成本與版本，客戶目錄不加欄。無 DDL／RPC 權限變更，部署須包含 domain/product-costing.mjs 與 shared/product-costing.js。正式只檢視表單與測負數拒絕，未儲存商品或成本，原有 13 商品、1 預購、open 保留。

## 0.3.12 商品輸出部署

新增管理專用只讀 products.xlsx／products.csv／products-template.csv，保留每次 session／role 驗證與 no-store。共用 domain/product-transfer.mjs 及 shared/product-pricing.js／shared/costing.js，沿用 XLSX 寫出器；admin/import 支援尺寸加價、狀態、照片 JSON，仍只新增。無 DDL／RPC／Storage 政策或既有業務資料變更。Edge v13 ACTIVE，正式商品 Excel／CSV 與目前 13 款商品逐位元一致，範例可預覽、既有編號全部報錯、匿名與錯誤入口拒絕，匯出前後業務文件雜湊一致（13 商品、1 預購、open）。Pages built 6b6f80d737acf3878bdad596164df1fad178743d，正式管理 index 使用 0.3.12，app.js 與建置成品一致；沒有在正式站新增測試商品，私有商品匯出留在 .local/exports。

## 0.3.13 含圖商品 Excel

管理新增 product-export.js 處理第一張照片為 144px／6 KB 內 JPEG，POST products.xlsx 接收暫存縮圖。server/product-workbook.mjs 核對商品／第一張 URL／JPEG 尺寸後共用 xlsx.mjs 內嵌 DrawingML／media，沒有外部圖片公式。POST 匯出只讀、不走 ccbaby_commit，不上傳／修改照片；角色／session、來源與 2.2 MB 請求上限保留。無 DDL／RPC／Storage 政策變更；舊 GET 在有照片且無縮圖時回 409 提醒重整。Edge v14 ACTIVE，正式 13 款商品／13 張首圖下載與本機預期檔逐位元一致，缺圖與權限防呆通過，前後業務文件雜湊一致（13 商品、1 預購、open）。Pages c09c214c7f043974247c6b67a1b015171671ee0e 發布成功，正式 index 0.3.13，app.js／product-export.js 與成品一致；正式照片 CORS 與 XLSX 重新渲染排版通過。

## 0.3.14 商品來源記錄

商品 POST 支援 sourceUrl，僅店主目錄／採買表回傳，客戶目錄明確排除。雲端私有 JSONB 新增選填商品欄，無 DDL／RPC／Storage／登入設定變更；本機 SQLite 啟動時加 products.source_url，保留舊資料。來源不由伺服器抓取。XLSX 超連結與首圖內嵌關聯相容，原 CSV 必填欄不變。前台移除新增商品預設顏色，草稿白名單加來源；Edge v15 ACTIVE，正式管理目錄及商品匯出欄位、非法連結拒絕與資料雜湊比對通過；檢查時 16 商品、1 預購、open 保留。Pages 已於後續重試恢復，見下方紀錄

2026-11-07 發布恢復進度：gh-pages 目標為 b6b9954c56a5b6092b37e849bc936cecdd569b33。原 run 42245013491 的 deploy-pages 於 deployment_queued／updating_pages 等待超過 600000ms 後逾時，重跑停在 queued；取消回覆已完成但查詢仍 queued。依官方 Pages builds API 重新觸發 run 42248157954，建置通過但部署再次逾時，正式 index 仍為 0.3.13。未改 Pages 來源或 CNAME，既有功能與正式業務資料保留

### 2026-11-07 逾時原因排查

- 兩次 build 及 artifact 上傳成功，失敗均在 GitHub 接受部署後；第一次由 deployment_queued 進入 updating_pages 後逾時，第二次輪詢回傳空白狀態後逾時
- 發布工具預設等待 600000ms，到限自動取消；不是本機 npm／測試或商品 API 請求逾時。[官方 deploy-pages 定義](https://github.com/actions/deploy-pages/blob/main/action.yml)
- 本次 artifact 61444 bytes、未過期；上一成功版本 61320 bytes，僅增加 124 bytes
- 成功與失敗均使用 runner 2.338.2、deploy-pages@v5 SHA 368f82528645a54fb793d4d04e342629a3f51346，排除 Action 自動換版
- Pages 仍為 legacy／gh-pages／根目錄；github-pages 環境只允許 gh-pages，無 required reviewers／wait timer；自訂網域憑證 approved，HTTPS 開啟，沒有待驗證網域
- 原 run 42245013491 重跑一直 queued、attempt 1、jobs 空陣列，取消卻回覆工作已完成，呈現狀態不一致；新建置 run 42248157954 亦在部署端逾時
- [本次第二次失敗日誌](https://github.com/SeanChen0427/CC/actions/runs/42248157954)，[第一次失敗與卡住的重跑](https://github.com/SeanChen0427/CC/actions/runs/42245013491)
- GitHub 官方狀態頁當下標示正常，不能據此宣稱全面故障；其他使用者有同樣的建置成功、updating_pages／空白狀態、重跑永久排隊現象。[近期相同案例](https://github.com/orgs/community/discussions/212127)、[另一個案例](https://github.com/orgs/community/discussions/212207)
- 判斷：發布卡在 GitHub Pages 服務端／部署狀態，確切內部根因尚無官方確認；不是已證實的程式、檔案大小、分支、審核或憑證問題。停止增加重試，保留現站與資料；待 GitHub 端狀態恢復或取得可驗證的處理方式，再發布並核對 index／app.js／product-draft.js 的 0.3.14 成品

### 2026-11-07 使用者要求重試與舊部署阻擋

- 使用者要求再試發布，未改程式／正式業務資料；POST Pages builds 產生 [run 42251666169](https://github.com/SeanChen0427/CC/actions/runs/42251666169)，build 與 artifact 成功，沿用 b6b9954 部署 ID 後約 5 秒即回報 Deployment cancelled，沒有發出取消指令
- 以不改檔案的空提交 8db331883a51625d304a7732097362a720274115 產生新部署編號，tree 與 b6b9954 完全相同（449826a1cee401faaa4eb76edfc578da7054cdac）；[run 42251915582](https://github.com/SeanChen0427/CC/actions/runs/42251915582) 明確回 400，指出舊 b6b9954 仍為 in progress，須先取消或等待。Request ID：7818:B0134:E81B85:2F92626:6AEDFF0F
- 舊部署查詢曾回 deployment_cancelled，稍後又回空白；但新部署建立 API 仍將它視為進行中，已取得直接的服務端狀態不一致證據，不能把取消錯誤歸咎於 Node 警告
- 台北時間 00:24:42 依 [官方取消部署 API](https://docs.github.com/en/rest/pages/pages#cancel-a-github-pages-deployment) POST 指定舊 b6b9954，HTTP 204 成功，查詢回 deployment_cancelled；等待後重新觸發 [run 42252246268](https://github.com/SeanChen0427/CC/actions/runs/42252246268)，新 8db3318 進入 deployment_queued，之後成功發布
- upload-artifact@v4 的 Node 20 棄用提示是 runner 切換 Node 24 的警告；對應 build 已成功。這是 GitHub 管理的 Pages workflow，沒有為了消除警告更動網站程式或發布架構。[官方說明](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)

### 2026-11-07 00:31 發布恢復與正式檔案驗證

Pages build 於台北 00:31:17 回 built，部署查詢為 succeed，Actions run 42252246268 於 00:31:35 全部成功。正式 gh-pages 為 8db331883a51625d304a7732097362a720274115，內容與原 b6b9954 完全相同；解除指定舊部署後這次發布完成，但首次卡住的 GitHub 內部根因仍無官方確認

使用強制重新驗證／獨立查詢參數取得正式客戶及管理入口、兩端 app.js、管理 product-draft.js／product-export.js／config.json，共 7 檔皆 HTTP 200 且與發布工作副本逐位元相同；正式 index 已為 app.js／style.css?v=0.3.14。來源連結表單、顏色空白及草稿欄位程式已上線；實際填寫／保存／重開／匯出互動先前於隔離資料庫完成，本輪不在正式資料儲存示範商品

本次只重試靜態發布及取消舊 Pages 部署，沒有重新部署 Edge、改動網域、修改正式商品／預購或清空資料；原 80 項測試與 UI／匯出驗證結果適用相同內容，未為空提交重跑測試

## 0.3.15 尺寸進價與商品 Excel 拆列 — 2026-11-07

Edge v16 ACTIVE，仍 verify_jwt=false 配合既有自訂 session／角色驗證；新增 costUpdate.sizeCosts 驗證目前尺寸與全規格版本，更新原私有 procurement.cost，無 DDL／RPC／Storage／網域或登入變更。舊 costUpdate.cost 與省略欄位保持相容，客戶 API 不增加成本

83 項測試、隔離 Chrome 個別尺寸進價的草稿恢復／保存重開／改共用進價保留尺寸例外／新增尺寸／清除、320px 無溢出及真正下載 Excel 通過。Artifact Tool 匯入及渲染確定 S／M／XL 590／10000 KRW 與 2XL 690／15000 KRW 相鄰兩列，兩列保留照片與來源連結

正式只查目錄、拒絕不存在尺寸／非法來源、驗證匯出及資料雜湊，未提交有效商品修改；當下 16 商品、1 預購、open 保留，下載 XLSX 與本機預期逐位元相同，22 價格列／22 首圖錨點／16 media 檔、全部 XML 可解析。同商品重用照片 bytes，未填／零元及 CSV 格式不變，私有檔仍在忽略的 .local/exports/ccbaby-products-with-photos.xlsx

靜態提交 ad3979475f4f288f2d46ba8387017470bc57674d 已發布，[run 42256918889](https://github.com/SeanChen0427/CC/actions/runs/42256918889) 成功，台北 00:58:00 Pages 回 built／部署 succeed。獨立查詢參數與 no-cache 取得正式雙入口、兩端 app.js、管理 product-cost.js／product-costing.js／product-draft.js／product-export.js／style.css／config.json 共 10 檔皆 HTTP 200，與成品逐位元一致，確認正式 0.3.15 已生效；未重新觸發或取消其他部署
