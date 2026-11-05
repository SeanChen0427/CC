# GitHub Pages 與 Supabase 部署

版本 0.3.0｜2026-11-05。依使用者明確指定部署，參考副主席平台的靜態前端與 Supabase 後端分工。

## 入口與資源

| 項目 | 位置 |
|---|---|
| 客戶選物入口 | https://seanchen0427.github.io/CC/ |
| 店主管理入口 | https://seanchen0427.github.io/CC/admin/ |
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
├─ 公開：health、catalog、me（沒有本人憑證時不傳私人資料）
├─ 登入：管理帳密 → Supabase Auth → 固定 owner_id 比對
├─ 客戶：LINE code + PKCE → LINE 官方端點驗證 ID token / nonce
├─ 授權：每次由 PostgreSQL 核對 session hash、角色及到期
├─ 商品圖：店主驗證後檢查檔頭、MIME、大小，再上傳 Storage
├─ 報表：店主驗證後產生兩張工作表 XLSX / JSON 備份
└─ 業務：cloud/core.mjs
        ▼
PostgreSQL ccbaby_private（不對 anon / authenticated 開放）
├─ store：單期低量預購文件 JSONB + revision + owner_id
│  ├─ campaign / seq
│  ├─ products / variants
│  ├─ customers / preorders / items
│  ├─ procurement / submissions
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

## LINE 啟用清單（尚未執行）

1. 店主建立自己的 LINE 官方帳號與 Provider / LINE Login channel，不沿用參考站資源。
2. Web callback 固定為 `https://seanchen0427.github.io/CC/`；勾選 profile、openid 權限。
3. 在 Supabase Edge Function Secrets 設定 `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`，不能貼入 GitHub 或聊天。
4. 確認 channel 可供目標客戶使用。重新部署 / 確認函式已讀到設定。
5. 用真實 LINE 測試登入、手機返回、取消、到期、追加、兩位客戶互相不可見及管理權限隔離。
6. 完成實測後才從活動設定開放預購。後端在 LINE 未設定時會拒絕開團。

程式已準備 state、nonce、PKCE S256、一次性 callback 檢查與 LINE 官方 token / verify 呼叫，
目前沒有自有 channel，不能宣稱正式 LINE 登入已驗收。LINE Login 能辨識誰預購；人工私訊聯絡還需客戶加入官方帳號及對應營運流程，網站不會自動推播。

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
