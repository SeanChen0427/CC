# CCBABY 韓國年度預購網站

版本：0.3.8｜更新：2026-11-06（Asia/Taipei）

跨 AI 接手先讀 [AI_INDEX.md](AI_INDEX.md)，最新工作狀態見 [HANDOFF.md](docs/HANDOFF.md)。

## 目前狀態

已依指定部署 GitHub Pages 與 Supabase，測試商品、客戶及預購資料已清空。
LINE Login 已設定並發布；未登入開啟客戶網址會直接轉往 LINE，成功後才載入商品。已登入的有效工作階段可直接續用。目前活動為開放預購，已有正式商品與預購資料；不得依早期清空紀錄刪除。

- 客戶端：https://ccbaby.beecharge.live/
- 管理端：https://ccbaby.beecharge.live/admin/
- 原始碼：https://github.com/SeanChen0427/CC
- 啟動：在根目錄執行 `npm start`（Node.js 24 以上，無需安裝 npm 依賴）。
- 唯一管理帳號為 `hannah`，初始密碼位於私有 `.local/admin-credentials.txt`，不放 GitHub。
- [部署與 LINE 啟用說明](docs/DEPLOYMENT.md)；後台上架商品不需要重新發布網站。
- 本機備用版：客戶 4173／管理 4174，預設不產生範例或開啟測試會員登入。
- `npm run build` 建置公開成品，`npm run publish:pages` 發布 gh-pages。
- 操作方式見 [本機預覽說明](docs/LOCAL_PREVIEW.md)，完成範圍見 [實作對照](docs/IMPLEMENTATION_STATUS.md)。

這是每年出國採購一次使用的預購網站，預計上架約 100～200 款商品。
客人使用 LINE 登入，依商品類型瀏覽、加入購物車與送出預購；店主先出國採購，
商品到台灣後再透過 LINE 人工通知付款。本階段網站不處理結帳、收款或金流。

品牌名稱已確認為 **CCBABY**。

## 已確認的核心邊界

- 客戶入口與管理入口完全拆開：獨立網址、獨立介面、獨立登入驗證。
- 客戶入口使用 LINE 登入，只能查看與操作自己的預購。
- 管理入口只有店主使用，僅一組管理員帳號與密碼。
- 商品依類型分類，不按商家篩選，也不建立多店家管理機制。
- 購物車只是暫存；送出成功並產生預購編號後，才納入採購報表。
- 後台提供客戶預購明細、採買彙總、買到／缺貨紀錄及 Excel 匯出。
- 預購與客戶資料保存在後端；瀏覽器本機資料不是正式訂單來源。

## 文件入口

| 文件 | 用途 |
|---|---|
| [跨 AI 共用索引](AI_INDEX.md) | 各工具入口、閱讀順序、任務與主文件對照 |
| [本機操作說明](docs/LOCAL_PREVIEW.md) | 啟動、登入、操作、驗證與截圖 |
| [本機實作對照](docs/IMPLEMENTATION_STATUS.md) | 已完成與仍待串接的目標功能 |
| [最新交接](docs/HANDOFF.md) | 已完成、尚未開始、驗證與下一步 |
| [SPEC.md](SPEC.md) | 完整需求、規則、頁面範圍與驗收條件 |
| [架構地圖](docs/ARCHITECTURE_MAP.md) | 客戶端／管理端／後端樹狀圖、資料流與預定目錄 |
| [資料模型](docs/DATA_MODEL.md) | 客戶、商品、規格、預購、採購與報表的關係 |
| [參考站研究](docs/UI_REFERENCE_AUDIT.md) | 實際驗證過的 UI、截圖及未驗證部分 |
| [決策紀錄](docs/DECISION_LOG.md) | 已確認事項及被取代的早期方向 |
| [待決事項](docs/OPEN_DECISIONS.md) | 尚未選定的細節與建議 |
| [AI 接手入口](docs/AI_START_HERE.md) | 後續開發的閱讀順序與工作邊界 |
| [CHANGELOG.md](CHANGELOG.md) | 文件與未來實作變更紀錄 |
| [project-manifest.json](project-manifest.json) | 機器可讀的專案狀態與文件位置 |

## 系統概覽

```text
韓國年度預購系統
├─ 客戶入口：獨立網址／LINE 登入
│  └─ 商品分類與搜尋 → 商品詳情 → 購物車 → 送出預購 → 我的預購
├─ 管理入口：另一個獨立網址／唯一一組帳號密碼
│  └─ 開團與商品管理 → 客戶預購明細 → 採買彙總 → 採購結果 → 匯出
└─ 後端：分開驗證兩種身分，共用正式預購資料
   └─ 商品、客戶、預購、採購紀錄、圖片與備份
```

## 開發與帳號

本機使用原生 HTML／CSS／JavaScript、Node.js 與 SQLite。正式代管與兩個公開網址尚未選定。
本機管理帳密已安全產生；正式管理設定與 LINE 自有 Channel／LIFF 待設定；
不得把密碼、Channel Secret、Token 或真實客戶資料填入這些文件。

後續接手先讀 [跨 AI 索引](AI_INDEX.md)，再依 [AI 接手指南](docs/AI_START_HERE.md) 工作。
