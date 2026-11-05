# 最新交接狀態

更新：2026-11-05｜版本 0.3.2｜品牌 CCBABY

## 已確認部署

使用者明確要求清空測試資料、GitHub SeanChen0427/CC + Supabase，並確認同源不同目錄。
LINE channel 尚未建立，指示先完成部署與串接準備；不要重問以上決策。

- 客戶：https://ccbaby.beecharge.live/
- 管理：https://ccbaby.beecharge.live/admin/
- 原始碼：https://github.com/SeanChen0427/CC
- Supabase ref：tukluknvmbsbsdzawmjf，Edge：ccbaby-api。
- 唯一帳號 hannah，初始密碼只在私有 .local/admin-credentials.txt，不轉錄聊天或文件。
- 詳細部署、資料樹、發布與 LINE 設定：[DEPLOYMENT.md](DEPLOYMENT.md)。

## 已完成

- GitHub Pages 子目錄相容的兩個前端，main 原始碼與 gh-pages 公開靜態成品。
- Supabase Auth 唯一店主；12 小時應用 session、雜湊保存、角色隔離、撤銷與限流。
- Edge API：商品／CSV／圖片／活動、全部客戶明細、採買、人工分貨、Excel、JSON。
- 私有 Postgres 單期 JSONB + revision 原子比較更新；RPC 只開 service_role。
- 送單冪等、本人驗證、價格快照、採購版本、缺貨及分配驗證維持既有規則。
- LINE state、nonce、PKCE S256、官方 token 與 ID token 驗證程式準備完成，尚無 channel。
- 公開版無測試會員入口與假尺寸表；活動 draft，LINE 未設定時後端拒絕開團。
- 本機測試資料已私有備份後清空；正式商品／客戶／預購為零，只保留唯一管理帳號。
- seed:false 預設不再產生示範資料；自動測試只能在臨時資料庫明確 seed:true。

## 驗證

- 29 項自動測試通過：本機整合與雲端核心，含 200 款匯入、報表、追加、本人隔離。
- 實際雲端 owner 登入、上架公開讀取、匯出、登出撤銷、偽造與錯誤角色拒絕、匿名 RPC 拒絕。
- 390px 手機：雙入口、空目錄、LINE 待啟用、管理登入與商品表單無橫向溢出。
- Supabase advisories 與刻意 RLS 預設拒絕的說明在部署文件。

## 下一步

1. 建立店主自己的 LINE 官方帳號與 Login channel；秘密只放 Supabase Secrets。
2. 依部署文件用真實 LINE 實測兩位會員、送單、追加與權限隔離。
3. 店主輸入真實商品、照片、規格、價格與日期，再開放預購。
4. 跨年度獨立活動、直接 XLSX 匯入、批次與刪圖排序、店主改客單、完整圖片備份還原仍待做。

不要將串接準備視為正式 LINE 驗收，也不要將完整 SPEC 當全部完成。
本機 SQLite 與雲端不自動同步，不上傳 .local，不任意重做清空。
參考站只實測主要前台，未取得後台權限；本案後台為自行設計。

正式網址驗證（2026-11-05）：兩個入口與關鍵資源 HTTP 200，Pages build 為 built；正式前台讀取雲端空目錄、店主管理登入成功。資料仍為商品／客戶／預購／明細零筆，唯一管理員一位。

0.3.1：依店主要求將唯一管理帳號由 owner 改為 hannah，維持至少 12 碼密碼規則；密碼不寫入此文件。

帳密更新驗證（0.3.1）：hannah 與新密碼登入成功，舊帳號、舊密碼及舊管理工作階段均被拒絕；本機帳號與私有登入檔同步，維持新密碼至少 12 碼。

正式自訂網域 https://ccbaby.beecharge.live/admin/ 已以 hannah 與新密碼實際登入成功；Pages build= built，commit 77c89eb。原網址保留轉址，LINE 尚未設定。

0.3.2：依店主手機截圖統一清除前後台固定換行與多餘句點，縮短頁面／彈窗標題，手機標題與操作按鈕分列，客戶首頁文案使用完整寬度。320／390／430／768／1440px 的主要頁面標題均為一行、無橫向溢出。此次僅修改前端與文件，沒有異動客戶、商品、帳密或後端業務。
