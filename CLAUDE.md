# 跨 AI 專案入口與工作約定

先讀根目錄 [AI_INDEX.md](AI_INDEX.md)，所有工具由同一索引接手。
最新進度在 [docs/HANDOFF.md](docs/HANDOFF.md)，產品需求以 SPEC.md 為準。

## 範圍與現況

本專案品牌為 CCBABY，版本 0.3.21。使用者已明確授權清空測試資料、部署 GitHub
SeanChen0427/CC 與 Supabase，確認客戶 /CC/、管理 /CC/admin/ 同源不同路徑。
詳見 docs/DEPLOYMENT.md；請勿重問已授權的發布與基本架構。
LINE Login 已設定為 Published，真實 LINE 帳號登入與重新整理保存已驗證。活動已 open，已有正式商品與預購資料，保留資料與活動狀態。

## 必讀順序

1. AI_INDEX.md、docs/HANDOFF.md、project-manifest.json。
2. README.md、SPEC.md、docs/DECISION_LOG.md、docs/OPEN_DECISIONS.md。
3. 依任務讀 docs/ARCHITECTURE_MAP.md、docs/DATA_MODEL.md。
4. 涉及介面時閱讀 docs/UI_REFERENCE_AUDIT.md。
5. docs/LOCAL_PREVIEW.md、docs/IMPLEMENTATION_STATUS.md、docs/AI_START_HERE.md、CHANGELOG.md 與實際程式。

## 已確認且不可自行擴張的需求

- 一年一次採購、約 100～200 款商品、單一店主。
- 客戶入口與管理入口是兩個獨立網址、前端介面與登入流程。
- 客戶未登入時一開網址就自動跳 LINE，驗證成功後才載入商品；店主管理端只用唯一一組帳號密碼。
- 商品按類型分類，不按商家分類、不做多店家或多管理員。
- 購物車送出後才成立預購；後端保存身分、明細、追加與採購結果。
- 提供客戶明細、按商品規格彙總的採買表、Excel 匯出及分貨資料。
- 店主先採購，商品到台後以 LINE 人工通知付款。
- 第一版不做結帳、金流、自動收款、付款回報或物流串接。

## 工作方式

- 後續改版以保留目前功能為前提；優化須驗證既有登入、購物車、預購及管理流程，不以省略驗證換速度

- 用繁體中文維護規格與交接，沿用現有目錄與文件角色。
- 規格草案、已驗證參考行為、待決細節與已實作功能要分開標示。
- 參考站成立後的訂單及管理後台尚未驗證，不得宣稱看過或照其內部實作。
- 不提交密碼、LINE Token、OAuth 回呼參數、真實客戶資料或私有匯出。
- 不複製 .playwright-mcp 中的原始登入日誌到規格；僅使用挑選過的研究截圖。
- 後續修改產品範圍需同步 SPEC、決策、架構及待決事項；實作進度同步變更紀錄與 manifest。
- 每次交棒更新 docs/HANDOFF.md，文件改名或新增時同步 AI_INDEX.md 與 manifest 的路徑。
- AGENTS.md、CLAUDE.md、GEMINI.md 保持一致；它們是入口，不能各自保存不同產品規格。

## 本機實作驗證

- 啟動：npm start；客戶 127.0.0.1:4173，管理 127.0.0.1:4174。
- 語法：npm run check；核心整合：npm test（需允許本機臨時連接埠）。
- 預設不產生範例或開測試登入；自動測試在臨時資料庫明確 seed:true。
- .local 是持久本機資料與秘密，不能上傳；本次已依明確授權備份後清空，不可反覆清空。
- 每次變更只執行受影響的必要驗證，並維護最新交接與實作狀態。

## 雲端變更

- 先讀 docs/DEPLOYMENT.md。公開設定僅含 publishable key，不能放服務密鑰。
- 私有 JSONB 文件採 revision 原子提交；保持本人、角色、價格快照與採購版本驗證。
- RPC 只開 service_role；verify_jwt=false 配合自訂 session，每次操作仍需驗證。
- 原始碼 main、靜態成品 gh-pages；不要提交 .local、私人資料或研究／測試截圖。

## 介面文案與排版偏好

- 文案簡短直接，標題與短句不要加句末句點。
- 不用 br 或固定寬度刻意拆句；手機頁面標題與操作按鈕分列，避免單字落到下一行。
- 商品與客戶自行輸入的內容不做全域刪改；介面說明依實際寬度自然排版。
