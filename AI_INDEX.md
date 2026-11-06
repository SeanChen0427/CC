# 跨 AI 工具共用索引

更新：2026-11-06（Asia/Taipei）｜版本：0.3.4

品牌名稱已確認為 **CCBABY**。

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
目前 GitHub Pages + Supabase 與 LINE Login 已啟用，活動 draft。先讀 docs/DEPLOYMENT.md，勿重做既有設定。
請以文件中的已確認需求為準，依我這次的指示工作，
不要把規劃當成已完成，也不要重問已定的基本需求。
完成後同步交接、變更紀錄與受影響的主文件。
```

這段指令只提供接手脈絡，具體工作範圍仍以使用者當次指示與最新交接為準。
