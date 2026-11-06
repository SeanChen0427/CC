# 跨 AI 工具共用索引

更新：2026-11-07（Asia/Taipei）｜版本：0.3.14

品牌名稱已確認為 **CCBABY**。

0.3.14 與 Edge v15 已正式發布；Pages 舊部署阻擋已取消，新部署成功，正式雙入口與關鍵模組逐位元核對通過。恢復過程見 HANDOFF／DEPLOYMENT

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

## 4. 索引樹

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
