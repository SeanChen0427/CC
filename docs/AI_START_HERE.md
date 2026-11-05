# AI 開發與接手指南

> 0.3.0 最新狀態：使用者已授權 GitHub Pages /CC/、/CC/admin/ 與 Supabase，測試資料已清空，LINE 待設定，活動 draft。下方舊版本／完整目標保留供對照，以 [DEPLOYMENT.md](DEPLOYMENT.md) 與 HANDOFF.md 為目前實作依據。


跨工具導覽在根目錄 [AI_INDEX.md](../AI_INDEX.md)，最新進度在 [HANDOFF.md](HANDOFF.md)。
本文件維護閱讀方式與修改規則，不複製另一套需求。

## 現況

CCBABY 本機 0.2.1 已建立：兩個原生前端、Node.js 24 後端、SQLite 與管理測試帳號。
目前已授權 GitHub Pages 與 Supabase；先讀 DEPLOYMENT.md。
正式 LINE 登入未串接，不能把示範會員當正式身分驗證。

## 閱讀順序

1. AI_INDEX、對應工具入口、HANDOFF 與 project-manifest.json。
2. SPEC、DECISION_LOG 與 OPEN_DECISIONS，分清楚目標、已定事項及未選細節。
3. LOCAL_PREVIEW 與 IMPLEMENTATION_STATUS，確認真實完成範圍。
4. 依任務讀 ARCHITECTURE_MAP、DATA_MODEL、UI_REFERENCE_AUDIT 及實際程式。
5. CHANGELOG 及目前未完成變更。

## 主檔分工

| 主題 | 主檔 |
|---|---|
| 跨 AI 入口與文件定位 | AI_INDEX.md |
| 最新完成、剩餘與下一步 | HANDOFF.md |
| 完整需求與目標驗收 | SPEC.md |
| 本機啟動、帳密位置、使用與驗證 | LOCAL_PREVIEW.md |
| 目標與實際完成的差距 | IMPLEMENTATION_STATUS.md |
| 系統、頁面與目錄樹 | ARCHITECTURE_MAP.md |
| 資料與報表邏輯目標 | DATA_MODEL.md |
| 已確認決策與歷史取代 | DECISION_LOG.md |
| 待選事項與營運細節 | OPEN_DECISIONS.md |
| 第三方 UI 實測證據 | UI_REFERENCE_AUDIT.md |
| 實作變更與檢查歷史 | CHANGELOG.md |

## 實作入口

- 客戶端：apps/customer-web/app.js、style.css、index.html。
- 管理端：apps/admin-web/app.js、style.css、index.html。
- 兩個 HTTP 入口及檔案邊界：server/index.mjs。
- 認證、商品、預購、採購、分配與匯出：server/api.mjs。
- 實際 SQLite schema、示範資料與彙總：server/store.mjs。
- 共用規則：domain/rules.mjs；Excel：server/xlsx.mjs；向量示意：server/art.mjs。
- 測試：tests/app.test.mjs；語法檢查：scripts/check.mjs。

## 工作規則

- 兩端分離，客戶不取得管理 API 或完整客戶報表。
- 只保留唯一管理帳號，不自行增加員工、多店家或商家篩選。
- 保持預購先於採購，收款在到台後以 LINE 人工聯絡，不增加結帳金流。
- 商品原資料與已送出預購快照分開；報表按正式有效規格明細計算。
- 買到、待採買及確認缺貨分開；少量分配由店主決定，不加自動順位。
- 本機資料在 .local，不提交；本次清空已有明確授權且已完成，不要重做。自動測試用臨時資料。
- 正式主機已定；LINE、跨年度、完整備份還原等仍未驗收，不可稱所有 SPEC 已完成。
- 新依賴或技術變動應有具體需要；目前無 npm 外部依賴。

## 驗證與交棒

- 修改程式後跑相關語法與核心測試；`npm run check`、`npm test`。
- 測試會啟動臨時 loopback 服務；若沙箱不允許，依工具權限流程執行，不因環境失敗誤判業務失敗。
- 修改 UI 要走實際操作並看桌面／手機；只過語法不能代表 UI 可用。
- 變更需求同步 SPEC／決策／待決，變更完成範圍同步 IMPLEMENTATION_STATUS。
- 每次交棒更新 HANDOFF、CHANGELOG 與 manifest；新增路徑同步 AI_INDEX。
- AGENTS、CLAUDE、GEMINI 三份入口保持一致，不存三套規格。
