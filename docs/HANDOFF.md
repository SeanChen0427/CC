# 最新交接狀態

更新：2026-11-05｜程式版本 0.3.2｜LINE Login 已啟用

## 正式入口

- 客戶：https://ccbaby.beecharge.live/
- 店主：https://ccbaby.beecharge.live/admin/
- GitHub：https://github.com/SeanChen0427/CC，main 原始碼、gh-pages 靜態網站。
- Supabase：tukluknvmbsbsdzawmjf，Edge：ccbaby-api。
- 唯一管理帳號 hannah，密碼只在私有 .local/admin-credentials.txt，不轉錄文件。
- 詳細設定：[DEPLOYMENT.md](DEPLOYMENT.md)。

## 最新完成

- 自有 LINE 官方帳號 CCbaby（@445yxcey）與 LINE Login「CCBABY 網站登入」（2012401105）已建立，Provider 相同且官方帳號已連結。
- Callback URL 已確認為 https://ccbaby.beecharge.live/。
- 使用者提供兩項設定並授權操作，LINE_CHANNEL_ID / LINE_CHANNEL_SECRET 已存 Supabase Secrets；不保存 Secret 原文到前端、GitHub 或文件。
- 實際 LINE 帳號登入、個人檔案／openid 授權、後端 code 交換與 ID token 驗證、本人 session、回站顯示會員名稱均成功；重新整理仍保持登入。
- 使用者於公開發布前再次確認，Channel 已為 Published，一般 LINE 使用者可使用此登入。
- 資料：商品 0、預購 0，已有 1 位真實 LINE 登入會員。這是真實登入驗證產生的會員，不是示範資料，不要清空。
- 只驗證一位真實 LINE 帳號；不同客戶與實際商品送單驗收還沒進行。

## 已有功能與驗證

- 雙入口與角色分離，固定唯一店主，12 小時雜湊應用 session、撤銷與限流。
- 商品／CSV／圖片／活動、客戶預購明細、採買與人工分貨、Excel 與 JSON。
- Supabase 私有單期 JSONB + revision 原子提交，RPC 僅 service_role；本人、價格、數量與版本限制保留。
- 29 項既有自動測試通過，曾驗證 200 款匯入、冪等、本人隔離、採購對帳、工作階段撤銷。
- 0.3.2 全站固定文案沒有強制 br 與多餘句點；手機標題與按鈕分列，五種寬度查驗通過。
- 前端資源依 package.json 版本加查詢參數，CNAME 在建置與更新時保留。
- LINE 啟用這次沒有改業務程式、沒有變更管理帳密，也沒有把測試商品灌入正式資料。

## 接下來

1. 店主上架真實商品、照片、分類、規格與價格，設定預購截止時間。
2. 活動目前 draft；準備完成後切 open，再以真實商品與不同客戶完整驗收送單、追加及本人隔離。
3. 官方帳號目前以人工聯絡為主；自動推播、聊天機器人並未實作，登入不代表客戶已送訊息給官方帳號。
4. 跨年度獨立活動、直接 XLSX 匯入、批次／刪圖排序、店主改客單、完整圖片備份還原仍待做。

不要重做已完成的 LINE 建立／發布，也不要將完整 SPEC 當全部已驗收。
本機 SQLite 與雲端不自動同步，.local 與驗證截圖不公開上傳。
