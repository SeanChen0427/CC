# GitHub Pages 與 Supabase 部署

## 0.3.24 LINE 發訊設定（正式發布／啟用見 HANDOFF）

Edge v22 ACTIVE；Pages 58a9486cf1640b15ef2c474a564d3403051177eb／[run 42500024196](https://github.com/SeanChen0427/CC/actions/runs/42500024196) success。正式 9 個重點檔及 22 個 Edge 來源一致，health 200，發訊 configured=true；發布及啟用後 revision 91／MD5 4e7fcb6ba7137f6002adb030a0259877 保留。使用者明確同意後已簽發並保存 Token、啟用開關；正式店主 API 取得 available=true、limit=200、used=0、remaining=200，未發真實測試訊息或補發歷史通知

保留既有 ccbaby-api、verify_jwt=false、自訂 session 與 revision RPC，不新增雲端 DDL。部署相對依賴須包含 domain/line-notifications.mjs、server/line-messaging.mjs、server/line-delivery.mjs。新增工作保存在原私有文件，既有商品、會員、預購與活動不得清空或補發歷史訂單。

後端 Supabase Secrets：LINE_MESSAGING_ACCESS_TOKEN（CCbaby Messaging API channel 2012401045 的發訊憑證）、LINE_NOTIFICATIONS_ENABLED=true。LINE Login 原 2012401105 的 ID／Secret 不修改。發訊前核對 bot basicId=@445yxcey、Provider 共用、目前方案與剩餘額度；不將憑證放公開設定、前端、Git、截圖或日誌。發訊憑證建立／移交依工具要求取得具體授權；既有網站發布授權保留。

只用 Push 發送指定通知，本次不啟用 webhook、不變更歡迎／選單／關鍵字、不升級方案。憑證已就緒且啟用，未來設定失效仍提供人工備援；手機實際收訊由本人帳號驗收，不能對正式客戶補建測試單或發歷史通知。

## LINE 原生入口設定 — 2026-11-08（選單與回覆已上線）

本次只操作已登入的 @445yxcey 官方帳號，沒有發布網站／Edge 或改業務資料。三組回覆 83071618／83071663／83071686 已啟用；歡迎訊息保存後重載內容一致，人工聊天及既有回應模式保留。使用者完成圖片上傳後已接手儲存選單 20584051，後台「目前顯示的選單」核對正確圖面與三格文字動作，預設展開、期間 2026/11/08 00:00～2036/11/08 23:59。Default 82936520 經單獨明確同意改為「CCBABY｜一般留言」並套用成功，清單內容一致。實體 LINE 點選／收訊未測，會員免碼配對未實作；完整狀態見 HANDOFF。

## 0.3.23 店主優惠公告 — 2026-11-08

main ab9c7c1、Pages 404f9715b04451c7104ea22c26f22805a9157c6b／[run 42451234705](https://github.com/SeanChen0427/CC/actions/runs/42451234705) success，Edge v21 ACTIVE、verify_jwt=false 沿用。新增 domain/promotion.mjs 與 admin/promotion PUT，完整 19 個 Edge 相對依賴已發布並逐位元核對；只有原 private JSONB 設定，沒有 Postgres DDL／RPC／權限、LINE、Storage 或登入設定變更

管理「活動與設定」提供優惠文字、顯示開關與預覽；需店主 session 與設定版本，原子 revision 衝突會重讀並重新驗證，不覆蓋其他編輯。舊文件無 promotion 時讀取預設關閉空白且不提交，只有店主實際儲存才新增設定。客戶沿用原受保護 catalog／bootstrap 取得啟用的 {text} 或 null，無新增登入 API 或輪詢

125 項測試、48 模組語法與建置、隔離 Chrome 四種寬度三頁面與完整購物流程通過。正式 13 個公開檔案符合成品；店主 API 讀取與匿名／錯誤角色／舊版本／啟用空白拒絕、實際管理表單四種寬度、120 字／預設關閉空白通過。匿名入口只讀 LINE 設定後正常導向（工具攔截、不交換 code）；正式客戶成品搭配攔截的隔離 API 驗證三頁面公告、純文字與關閉隱藏，頁面錯誤 0。成功管理查驗後登出，沒有提交有效正式優惠或示範預購

發布前後 revision 88／MD5 4e7fcb6ba7137f6002adb030a0259877 相同，16 商品／3 會員／1 預購／open，仍沒有 promotion。店主可自行填實際優惠再開啟；既有商品、價格、預購、活動均保留，實體 iPhone 尚未操作

## 0.3.22 揭露位置調整 — 2026-11-08

main 57da845、Pages 1b346945544506d3acaf4dd5fba52405e2a3d64e／[run 42449286082](https://github.com/SeanChen0427/CC/actions/runs/42449286082) success。用途短句移到客戶共用頁尾，會員選單另有完整說明入口；頁首不再常駐顯示。只更新靜態前端，Edge 保持 v20，沒有 SQL、LINE、認證、商品、預購或活動操作

120 項測試、47 模組語法與建置、隔離 Chrome 四種寬度三頁面及登入／購物車重載／送單／本人與管理查單通過。正式 13 檔逐位元符合成品；真實匿名入口只讀 customer/line/config 後正常導向 LINE（工具攔截，未交換 code），正式成品搭配攔截的隔離 API 於 390px 驗證三頁面與兩處揭露入口，無頁面錯誤。沒有建立正式示範瀏覽或預購，不冒稱本次實體 iPhone 已驗證

## 0.3.21 登入等待動畫 — 2026-11-08

main 1357ca1、Pages a56f58ca3042610579593597a8bf072c031d48e4／[run 42448647605](https://github.com/SeanChen0427/CC/actions/runs/42448647605) success。只有客戶靜態介面、可選 async 模組與本地 MP4／海報；Edge 維持 v20，無 SQL、RPC、LINE、session 或正式業務資料操作。本機僅增加 video/mp4 MIME

正式 13 檔逐位元符合建置，含 MP4／海報、可選模組及客戶／管理入口；390px 原「正在確認 LINE 登入…」保留、影片可自動播放、無溢出或頁面錯誤，客戶只查公開 LINE 設定後正常導向 LINE。導向在驗證工具攔截，未交換真實 code 或建立正式示範資料。隔離九種登入／媒體情境及購物車、送單、本人與管理查單已通過；實體 iPhone 的本次網站播放與 LINE 往返仍待實際觀察

## 0.3.20 登入效能 — 2026-11-08

Edge v20 ACTIVE、main ec7c4d4、Pages 44860e83aff6f64bef4465cf89e3ee92937637b3／[run 42438895329](https://github.com/SeanChen0427/CC/actions/runs/42438895329) success。無 DDL／RPC／LINE 設定或主機區域調整；verify_jwt=false 與原自訂 session 沿用。customer/bootstrap 需客戶 session，只回本人資料及受保護商品；exchange 選填 includeStartup，原呼叫者與 me／catalog 保持相容。前端只內嵌原公開設定並預載必要模組，17 個公開成品、18 個 Edge 來源一致，正式權限拒絕與管理唯讀通過

早期基準 revision 74／MD5 c1f206d97f33333f81aefa73d477b444；工作期間原 v19 的正常登入及商品儲存使其變為 revision 76／MD5 edc560aeb17fdd181edd99f004c62a9a（最後寫入 10:27:02），早於 Edge v20 發布 10:29:59。效能發布保留這筆正常變更；最新 16 商品／3 會員／1 預購／open，沒有正式示範送單、瀏覽事件或 LINE 發訊。實體 iPhone 往返尚未測量，請求數縮減已在隔離實際 handler 與瀏覽器驗證

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

## 0.3.16 客戶瀏覽觀察 — 2026-11-08

Edge v17 ACTIVE（verify_jwt=false 沿用自訂 session），新增 domain/browsing.mjs。私有 browsing_events 獨立於 store JSONB，不呼叫業務 revision 提交；migration 為 supabase/migrations/20261107164621_ccbaby_browsing.sql，僅新增表／索引／兩個 SECURITY INVOKER RPC。所有 anon／authenticated／PUBLIC 直接表與函式權限撤銷，service_role 獨享，SQL 每次核對角色／到期／owner，RLS 預設拒絕不建立客戶策略；權限實查符合

180 天查詢窗與回報時清理，沒有排程或 Messaging API，不改 LINE、Storage、商品／預購及活動。客戶使用 browsing.js、管理 #browsing 使用獨立同名模組，均隨公開版本 cache-bust；不把任何私有紀錄寫入 GitHub。觀察不納入原業務 JSON 備份與報表，需保留超過 180 天或獨立備份另行設計

88 項測試、隔離瀏覽器操作及四種寬度通過；SQL 交易已回滾，正式觀察表保持空白，未加入示範客戶。正式 API 管理列表／明細及權限、非法查詢檢查通過，業務雜湊前後不變（16 商品、1 預購、open）。Pages f8117a644fff6fd674964693ff48b59a4d8d7976／[run 42393225835](https://github.com/SeanChen0427/CC/actions/runs/42393225835) 發布成功，正式雙入口與兩端 app／browsing／style 等 10 個公開檔案 HTTP 200 且逐位元符合成品；正式管理登入頁正常，完整帶紀錄互動在隔離環境完成。3 位既有會員仍無新版瀏覽紀錄，沒有模擬正式客戶進站。Migration 檔名已對齊雲端 history version 20261107164621，不重複套用

安全 advisor 僅新增刻意的私有表 [RLS 無 policy 提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)，維持預設拒絕；既有 [外洩密碼保護未啟用提示](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 未變，未更動帳密或登入設定

## 0.3.17 LINE 外部瀏覽器恢復 — 2026-11-08

只有靜態前端更新，Edge 維持 v17，未改 LINE Channel、session 時限、資料庫、商品或預購。shared/line-auth.js 依 state 短期保存與消耗，來源／build 同步複製兩入口依賴。登入暫存存在 sessionStorage 與同源 localStorage 10 分鐘備援，成功／消耗清除秘密、保留短期已用標記，Token 仍僅各分頁 sessionStorage。跨瀏覽器拒絕無綁定回呼，手動重試與 ?login=browser 使用 disable_auto_login=true，依 [LINE 官方](https://developers.line.biz/en/docs/line-login/how-to-handle-auto-login-failure/) 流程避免反覆失敗，仍核對 state／PKCE／nonce

94 項測試（13 項直接相關）及隔離兩瀏覽器／新分頁／回呼重用／恢復登入／390px 通過；未實際操作使用者 iPhone 或使用真實 LINE 憑證測寫。Pages a16834ff95d7f4ca6dacd89b3af3e7e5bc12e250／[run 42394211661](https://github.com/SeanChen0427/CC/actions/runs/42394211661) 已成功發布，正式七檔逐位元符合 dist；隔離 Chrome context 的正式恢復入口與 retry 參數驗證通過，未交換真實 code。正式驗證只檢查公開成品與恢復參數，不記錄真實 callback query、Token 或登入暫存

## 0.3.18 銷售建議與排序

Edge v18 已發布，新增 service_role-only／security invoker 的 ccbaby_merchandising_read，SQL 再核對 owner session、期間與不重複人數。只讀原私有 browsing_events，無新雲端表。排序寫入原私有 store.data.merchandising，沿用 revision 與版本驗證；未有設定時原順序不動。Pages 5cea239 已發布（run 42397189994 success），正式前後台 10 檔與成品逐位元一致；未套用正式排序、未發 LINE 訊息。

SQL 交易回滾驗證角色、去重、非法期間與權限通過，正式業務 revision 73、16 商品／1 預購／open 保留。安全 advisor 仍只有既有私有表 RLS 無策略（刻意預設拒絕）及[未啟用外洩密碼檢查](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)；效能提示仍為單列 store 的 owner 外鍵無索引，未為本功能新增廣泛權限。

0.3.18 正式分析 API 店主讀取、匿名／錯誤角色／非法期間／無效排序版本拒絕通過。發布前後 revision 73 與業務雜湊一致，16 商品／1 預購／open，merchandising 尚未設定，無殘留 qa 測試事件。正式查驗僅送出必定拒絕的舊版本，未提交有效排序。


## 0.3.19 LINE 一對一與圖卡服務

新增 shared/line-contact.js 靜態模組，前後台建置皆複製；管理新增 customer-care.js 與 order-card.js。Edge 沿用自訂 session、verify_jwt=false 與原子 revision，customer/line-contact 只替本人建立一次代碼，重讀已有代碼不提交 revision；店主的 customer-care／order-notice 需角色、版本、內容簽章與階段核對。

私有 JSONB 只在首次建立聯繫碼或店主保存作業紀錄時增加 customers[].contact_code／customerCare／orderNotices，沒有新 DDL 或 RPC，不需重設正式資料。圖卡在店主瀏覽器產生，不上傳商品公開 bucket；不新增 Messaging API Token、Push、好友同步或 LINE 付費方案。

Edge v19 ACTIVE。正式管理 API 3 會員／1 預購讀取、匿名／錯誤角色／無效版本／提前匯款拒絕通過；沒有提交有效作業紀錄。Pages 46af66261deeefc87400d67b297b058332b713ac／run 42403096138 success，正式 12 個公開檔案逐位元與 dist 一致；前後業務 revision 73、MD5 c1f206d97f33333f81aefa73d477b444 相同，16 商品／1 預購／open 保留，未建立正式 customerCare／orderNotices。不得為測試對正式會員建立代碼、標記已通知、改採購結果或傳訊。
