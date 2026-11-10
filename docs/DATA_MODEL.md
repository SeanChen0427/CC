# 資料模型與報表規則

## 0.3.25 營運付款規則（D-46）

網站保留原登入、購物車、預購成立／追加／修改、採購與分配流程；不新增付款回報、實收／退款紀錄、24 小時自動取消、付款順序排序或採購付款閘門。付款、退款與寄件順序由店主在 LINE 人工核對及作業，預購資料成立不代表已付款。

匯款提醒與圖卡取有效正數預購全部明細的 quantity × price；採購／到台圖卡仍取本人 bought 分配。payment 簽章保留預購版本及明細快照，不再含 campaign.status／bought／shortage，避免採購進度變動誤列新的匯款提醒；預購實際變更仍需重新人工核對。既存通知工作保存原文，不遷移、不補發；正式資料與活動原樣保留

## 0.3.24 通知工作與結果（D-45）

- 私有 JSONB 新增 lineNotifications[]；本機 line_notifications(id,data)，不遷移或清空既有商品／預購。工作含 id(UUID，同 Retry-Key)、orderId、customerId、kind(thanks/arrived)、signature、不可於首次嘗試後更換的 message、automatic、status、reason、claim／leaseUntil、attempts、firstPushAt、mayHaveSent、acceptedAt 及時間
- status 為 pending／sending／accepted／manual／manual_done／superseded；收到 API 200 或帶 accepted-request-id 的 409 才記 accepted。最多 23 小時安全重試，結果不明且超時需先人工核對。expired lease 可重試，沒有全新 Retry-Key 補送不明工作
- orderNotices 沿用原版本與內容簽章，API 接受附 method=line-api、notificationId；人工已傳為既有標記，並停止同簽章工作重試。舊通知記錄保留
- 客戶只收到自己的提交結果與訂單；通知工作／推送識別／錯誤與發送紀錄只供後端及 owner。訊息不包含電話、成本、內部備註或網站 session。雲端原有私有表與 RPC 權限不變，無 DDL

## LINE 官方帳號優先漏斗（D-43，需求確認）

新客不處理聯繫碼為新目標；本次不變更 schema、客戶識別、contact_code、chatConfirmed 或既有通知紀錄。點選單送關鍵字不能直接寫為會員配對成功；後續免碼識別需使用經驗證的 LINE 身分另行設計，不以暱稱合併會員。下方 0.3.19 欄位仍為正式現況，不因需求更新刪除歷史資料。

## 0.3.23 置頂優惠欄位

- promotion = {enabled:boolean, text:string, version:integer}，文字正規化空白後最多 120 字，啟用不可空白；未設定視為 false／空字串／版本 0，不在讀取時寫入舊資料
- PUT admin/promotion 只接受店主，version 需與目前相同，成功加一；雲端保存 store.data.promotion 並沿用 ccbaby_commit revision，本機獨立 promotion_settings(id=1,data JSON)，不改 campaign 與商品／訂單
- catalog／customer/bootstrap 回 promotion:null 或 {text}，不傳關閉草稿、enabled、version 或其他管理資料；本人訂單不需要此設定
- 雲端業務 JSON 備份自然含 promotion，本機備份新增 promotion_settings；沒有 Postgres DDL、RPC 或權限調整

## 0.3.20 登入查詢合併

無資料表、RPC 或保存規則異動；customer/bootstrap 與選填 exchange.startup 只組合原本允許的本人 me 與商品 catalog，不傳他人資料、進價、來源或管理聯繫紀錄。session 仍為原雜湊、角色與 12 小時期限，每次受保護查詢由 PostgreSQL 驗證。正常 LINE 登入沿用原會員更新／revision，效能發布不主動寫入正式業務文件

## 0.3.17 短期 LINE 驗證暫存

- ccbaby.line.attempt.v2.<state>：state、verifier、nonce、at、白名單 returnHash，同瀏覽器 sessionStorage／localStorage；10 分鐘有效、維護最多 8 筆舊紀錄，於後續登入／回呼清理超期值
- 完成消耗後清除該分頁副本，共用副本覆為 consumed／at，不保留 PKCE 或 nonce；舊版 ccbaby.line.pending 可在原分頁接續，成功消耗即移除
- ccbaby.line.browser-login.v1 為同分頁重試模式，沒有身分或 Token，成功登入移除；跨瀏覽器不讀別的瀏覽器資料，重新產生 state／PKCE／nonce
- 原 ccbaby.session.customer.v1／admin.v1 仍只有 sessionStorage，沒有把登入 Token 改放 localStorage；Supabase 業務資料與資料庫 schema 不變

## 0.3.16 瀏覽紀錄實際結構

- 雲端 ccbaby_private.browsing_events：customer_id、id UUID（兩者主鍵）、visit_id UUID、occurred_at、received_at、event JSONB；本機 browsing_events 同等欄位，以 data JSON 與 at 保存
- event 白名單：id、visitId、at、type(page_view/action)、page、activeMs，action、productId／productCode／productName、variantId／color／size、quantity、category、results、option 為核對後選填；不接受客戶識別與任意 detail／URL／表單
- page_view activeMs 為累計前景停留，重送按相同客戶＋事件 ID upsert，取較大累計值，保持首次事件／商品快照；操作同樣按 ID 去重。日期過舊／未來超限、非法停留、未知事件與商品／規格拒絕，批次最多 20 筆
- 客戶每分鐘超過 200 個近期事件暫停回報；記憶體佇列最多 200 筆，暫時失敗重試、離站以 keepalive 嘗試補送，不將憑證／觀察佇列放持久本機儲存
- 觀察保留最近 180 天，查詢以事件開始時間篩選、回報時刪除超期列；不是永久歷史。查詢彙總 visits／pageViews／productViews／activeMs／cartAdds／submits／lastSeen，沒有紀錄的既有會員仍列出
- 管理明細 keyset：occurred_at DESC、id DESC，每頁最多 200 筆，另取 1 筆判定 nextCursor；商品彙總查全期間。觀察紀錄不改商品／預購／採買、業務異動 events 或報表合計
- 造訪不等於登入次數；跨重新整理／分頁可能多次，同一 tab 前景與互動計時，背景不算，連續閒置一分鐘截止，30 分鐘後再操作另建造訪。原客戶唯一身分及 12 小時登入不改

## 0.3.5 實際尺寸定價欄位

- products.basePrice 為基本售價，products.sizeSurcharges 為 [{size, extra}]，未列尺寸不加價，單價 = 基本售價 + 該尺寸加價
- 各尺寸加價為 0～100000 的整數，最終售價為 1～1000000，尺寸必須存在且不可重複
- 雲端保存於原有 products JSONB，本機保存於新增的 products.pricing JSON；舊資料不改價，編輯時以現有 variants 回填
- 保留相同顏色／尺寸 variant ID，客戶端與後端驗證均以實際 variant 單價為準；成立預購快照保持原價
- 舊客戶端／CSV 的單一 extra 欄位保留歷史 XL／2XL 規則以相容舊請求；新介面一律送明確 sizeSurcharges（包含空陣列），不使用固定尺寸規則


## 0.3.4 實際相簿欄位

- 雲端 products[].images 保存最多 8 個受允許的 Storage URL，陣列順序就是展示順序，首張為封面
- products[].imageBindings 為選填陣列 [{color, url}]，未設定視為 []，舊商品不自動產生綁定
- 伺服器驗證顏色屬於商品、URL 屬於該相簿，每個顏色最多一筆；排序不破壞 URL 綁定，移除照片清除該綁定
- 本機 products.image_bindings 保存同一份 JSON，啟動時安全加欄；客戶及管理 API 統一回 imageBindings
- 照片順序／綁定不改變 variants 身分、價格或已成立預購快照；商品分類與相簿沒有連動
- 上傳單張檔案仍限 1.4 MB 並驗證格式／檔頭；前端處理每張原圖上限 20 MB，最長邊 2000px 以內
- 移除相簿參照不立即刪除 Storage 原檔，完整圖片清理／備份還原另行處理

> 0.3.0 最新狀態：使用者已授權 GitHub Pages /CC/、/CC/admin/ 與 Supabase，測試資料已清空，LINE 待設定，活動 draft。下方舊版本／完整目標保留供對照，以 [DEPLOYMENT.md](DEPLOYMENT.md) 與 HANDOFF.md 為目前實作依據。


日期：2026-11-05｜完整目標的邏輯設計；本機已有 SQLite，實際結構在 server/store.mjs。
本文件將 SPEC 的需求轉為實作契約；表名與欄名可依技術調整，但資料關係與歷史保留原則需維持。

本機將單期活動、規格快照、採購及分配以較小的資料表實作；邏輯表名不代表已有一對一的實體表。當前限制見 [實作對照](IMPLEMENTATION_STATUS.md)。

## 1. 關聯樹

```text
管理員（僅 1 組帳密）
└─ 獨立管理工作階段 → 管理全部活動與資料

客戶（以已驗證 LINE 身分識別）
├─ 聯絡資料
└─ 年度活動中的預購（同客戶／同活動一份主檔）
   ├─ 規格明細與價格快照
   ├─ 送出／追加／修改／取消紀錄
   └─ 實際買到的分配與分貨資訊

年度活動
├─ 商品類型分類
├─ 商品
│  ├─ 分類關聯
│  ├─ 圖片／選用尺寸表
│  └─ 可購規格與本期價格
├─ 已送出預購
├─ 按規格的採購紀錄
├─ 預購明細的採購分配
└─ 結單快照
```

## 2. 身分與客戶

| 實體 | 主要欄位 | 規則 |
|---|---|---|
| admin_account | 固定單一識別、登入帳號、密碼雜湊、session_version、更新時間 | 只允許一組，不開放新增管理員與公開註冊 |
| admin_sessions | 工作階段識別、到期、撤銷、版本 | 與客戶工作階段分開；密碼更換可撤銷舊登入 |
| customers | 內部 ID、LINE Provider／User ID、暱稱、聯絡姓名、手機、時間 | Provider＋User ID 唯一，不用暱稱合併身分 |
| customer_sessions | 客戶 ID、工作階段識別、到期與撤銷 | 由伺服器驗證 LINE 後簽發，不接受前端任意客戶 ID |
| customer_delivery | 客戶 ID、選用收件／取貨資料、更新時間 | 最初預購不要求地址；最終欄位待交付方式確認 |

資料庫保存可撤銷的工作階段參照或等效設計，不保存管理員明文密碼。
LINE Token 不作報表欄位；驗證所需資料與紀錄最小化。
收件資料若後續用於交付，當次確認結果可在預購上留快照，避免改地址影響已處理交付。

## 3. 活動與商品

| 實體 | 主要欄位 |
|---|---|
| campaigns | ID、名稱、說明、階段、開放／截止時間、結單時間、封存時間 |
| categories | ID、活動 ID、類型名稱、排序、啟用狀態 |
| products | ID、活動 ID、商品編號、名稱、說明、上架狀態、排序、版本 |
| product_categories | 商品 ID、分類 ID |
| product_images | 商品 ID、圖片位置、用途、排序、替代文字 |
| variants | ID、商品 ID、規格識別碼、規格名稱與值、單價、價格性質、可預購狀態、版本 |

- 商品編號在同一活動內唯一；規格識別碼須能唯一對應完整規格組合。
- 分類只有商品類型，不設商家／店家實體或 merchant_id。
- 可用單一預設規格表達沒有顏色與尺寸的商品。
- 每年複製產生新商品／規格資料，不能讓新年度改價影響舊年度。
- 規格識別碼是報表合併依據，顯示文字不是唯一識別。
- 金額以整數的最小貨幣單位保存，避免浮點加總誤差；展示幣別待定。

## 4. 預購與異動

| 實體 | 主要欄位 | 規則 |
|---|---|---|
| preorders | ID、預購編號、活動 ID、客戶 ID、狀態、聯絡快照、版本、時間 | 活動＋客戶唯一；追加不另製造無法對帳的主檔 |
| preorder_items | ID、預購 ID、規格 ID、商品與規格快照、單價快照、要求數量、取消數量 | 已送出才是正式需求；歷史不隨商品編輯改寫 |
| preorder_revisions | 預購 ID、版本、異動類型、前後差異、操作者種類、時間、理由 | 留存追加、修改及結單後管理異動 |
| submission_requests | 客戶 ID、活動 ID、送出請求識別、內容摘要、處理結果 | 用來防止同一次重試重複記單 |

實作時同規格、同價格快照可合併數量；若已送出後價格不同，須先明確告知，
並保留分開的價格明細，不能直接覆寫原單價。價格變動處理文案見待決事項。

草稿只代表尚未送出的選購內容，不屬於上述正式預購。是否建立 cart_drafts 表待選型，
無論採哪種保存方式，草稿不能進採購報表或出現在另一位登入者帳下。

## 5. 採購、分配與快照

| 實體 | 主要欄位 | 用途 |
|---|---|---|
| procurement_records | 活動／規格 ID、採購數量變動、時間、備註、沖回原紀錄參照 | 保存實際買到的數量及修正歷史 |
| availability_records | 活動／規格 ID、確認缺貨數量或狀態、時間、備註 | 將確定缺貨與尚未採購分開 |
| purchase_allocations | 採購紀錄參照、預購明細 ID、分配件數、時間 | 追到某一件買到的商品屬於哪位客戶 |
| unavailability_allocations | 缺貨紀錄參照、預購明細 ID、確認缺貨件數、時間 | 將已確認缺貨對應到實際受影響客戶 |
| fulfillment_records | 預購／明細 ID、已分貨或交付狀態、時間、備註 | 人工分貨進度，不是金流或物流串接 |
| closing_snapshots | 活動 ID、版本、結單時間、需求明細與彙總快照 | 保留出發前的採購基準 |

- 採購數量修正以有參照的更正／沖回保留軌跡，不直接消失。
- 分配總數不得超過該規格實際買到數量，也不得超過客戶有效需求。
- 同一客戶明細的買到分配與缺貨分配合計不得超過有效需求；缺貨分配合計不得超過確認缺貨總數。
- 不自動把不足數量判成所有客戶都缺貨；需記錄分配或等待處理。
- 實際多買的件數應顯示未分配，不能自動增加客戶預購數量。
- 已取消但實際買到的商品需保留待處置紀錄，不能因取消而從採購帳消失。
- 自動分配優先順序尚未確認；第一版可由管理員明確指定，不默認抽籤或先到先得。

## 6. 報表計算契約

有效需求只計算已成功送出的預購，不含草稿；排除取消數量。

```text
每筆有效需求 = 要求數量 − 取消數量
規格需求總數 = 同活動、同規格的有效需求加總
規格已買總數 = 有效採購紀錄的淨數量
未分配已買數 = 規格已買總數 − 有效分配總數
尚未滿足需求 = max(規格需求總數 − 有效分配總數, 0)
待採買數 = max(規格需求總數 − 規格已買總數 − 確認缺貨數, 0)
客戶明細預購金額 = 該明細的單價快照 × 有效需求
預購商品總額 = 所有有效明細金額加總
```

確認缺貨數不得超過 max(規格需求總數 − 規格已買總數, 0)；後來補買到貨時需同步修正缺貨紀錄與受影響分配。
不合理或衝突的數字由後端拒絕並要求修正。
當已買但尚未分配時，採買表可以顯示已買，客戶端則顯示等待分配，兩者不可混為缺貨。
報表需分別聚合需求、採購及分配後再關聯，避免多表 JOIN 將數量重複倍增。

### 客戶明細匯出欄位

活動、預購編號、LINE 暱稱、聯絡姓名、手機、送出時間、更新時間、
商品編號、商品名稱、規格、有效數量、單價快照、金額性質、
明細金額、分配買到件數、確認缺貨／待處理資訊、選用收件資料。

### 採買彙總匯出欄位

活動、商品編號、名稱、規格識別碼、規格、有效需求、已買、
待採買、確認缺貨、未分配已買數、備註及匯出時間。

匯出不包含管理密碼、LINE Token 或 Channel Secret。
所有具有聯絡資訊的匯出與下載均需通過管理授權。

## 7. 權威來源與一致性

- 正式資料庫是已送出預購及採購結果的唯一來源。
- 客戶端草稿、快取與 Excel 是操作或匯出副本，不反向取代正式資料。
- 同次送出寫入預購、明細與異動必須具備交易或等效原子性。
- 活動截止、授權、數量與價格檢查皆在後端執行。
- 記錄保存時間採 UTC，顯示與年度截止以 Asia/Taipei 呈現。
- 備份包含結構版本、正式資料與圖片參照；還原需能恢復商品與客戶對應。

## 0.3.8 店主進價資料（已實作）

- 雲端私有 JSONB：`costSettings.exchangeRate`；`procurement[].cost = { unitKrw, exchangeRate } | null`
- 本機：`cost_settings(id=1, exchange_rate)`；`procurement.cost` JSON，可由舊庫加欄，保留原資料
- 未填／清除為 null，零韓元是有效紀錄；舊客戶端未傳 cost 時保留原成本
- 匯率最多 6 位小數，後端驗證正數；韓幣單件進價為 0～100,000,000 整數。設定範圍為 0 < 匯率 ≤ 10
- 以整數匯率微單位運算，台幣單件先四捨五入到分，再乘件數；修改預設不回寫保存匯率
- 規格需求進價＝單件進價 × 有效需求；已買進價＝單件進價 × 累計已買；各自區分韓幣／台幣及未填件數
- 規格售價合計為有效明細快照小計加總，可同規格含不同售價；不以目前商品售價回算
- `admin/state`、店主 XLSX 及私有 JSON 備份可取得成本；客戶 catalog／orders／me 不含成本或設定
- 採買成本隨採購版本原子寫入，保留異動前後值；調整成本不修改預購快照
- Excel 三表「客戶預購明細」「採買彙總」「進銷總覽」共用 server/reports.mjs 計算，空白成本留白並標示未填，不當作零成本

## 0.3.9 店主刪除預購（已實作）

- `preorders.deleted_at`／`delete_reason` 記錄內部刪除狀態，items 與歷史不實體刪除
- 同客戶／同活動僅一份未刪除預購；雲端查詢排除 deleted_at，本機用未刪除 customer_id 的 partial unique index
- 舊 SQLite 的 customer_id 無條件唯一限制於啟動時交易內重建預購表，保留 ID、明細外鍵與價格快照，再驗證 foreign_key_check；不清空資料
- `admin/orders/:id/delete` POST：後端驗證店主、確認編號、原因、預購版本、相關買到／缺貨／分配結果
- 刪除操作與採購版本遞增在同一交易／revision 提交，既有成本與採購紀錄不刪除；有買到或缺貨時阻擋刪除
- orders、report、stats 與 Excel 只計入未刪除預購，客戶舊品項修改與店主舊分配均拒絕
- submissions 保存原結果與 orderId；已刪除預購的原 requestId 重試回 409，新 requestId 可建立新 ID／預購編號
- 重試同一刪除具冪等性，不會刪除客戶後來的新預購；內部備份保留所有已刪除歷史

## 0.3.11 商品與採買共用進價（已實作）

- 沿用既有私有 `procurement.cost`／version，商品未有預購時也可記錄，不建立第二份產品成本；無需求不加入報表
- 僅管理商品目錄在 variants 加上 `cost`／`costVersion`；客戶商品及本人訂單不含這兩欄
- 商品 POST 可選傳 `costUpdate = { cost?, versions?, defaultExchangeRate? }`；省略保留舊成本，明確 null 清除，有值驗證整數韓幣與有效匯率
- 改進價須附原商品全規格的 variantId／version，後端比對後才更新有效規格成本；名稱／照片等一般編輯不修改進價
- 單一進價商品新增規格沿用原成本及保存匯率；不同規格進價不同時不自動猜測，新表單列出差異
- 全商品改進價與採買單規格改價遞增同一 version，保留買到、缺貨、備註、分配與售價快照；異動保留 source=product
- 商品進價與同頁預設匯率在同一 SQLite 交易或雲端 revision 原子提交，失敗不寫入一半
- 草稿保存原始進價／匯率字串與版本，遇到衝突可明確載入最新成本，保留其他商品欄位，避免重載後默默覆寫

## 0.3.12 商品輸出與批量底稿（已實作）

- domain/product-transfer.mjs 從管理目錄所有商品產出，每款一列，僅現行 active 規格形成顏色／尺寸組合，商品 active=false 仍匯出
- price 為保存的 basePrice；extra:<尺寸名稱> 為該尺寸獨立加價，該商品沒有此尺寸則留白，不輸出退役規格
- images／imageBindings 以 JSON 陣列保留照片 URL 順序及顏色對應；沿用原 URL 白名單及每款 8 張驗證
- CSV 預覽共用同一解析規則，必要欄仍為 code/name/category/price/colors/sizes；舊 extra 欄相容，新尺寸欄可自行新增
- 匯入僅新增；商品編號已存在或檔案內重複均報錯，不帶商品 ID、不變更既有成本、預購或售價快照；有任何錯誤整批不提交
- XLSX 規格進價表按現行規格保留單件韓幣／採用匯率／台幣換算，空白及零元區分；CSV 不帶成本，沒有新增第二份成本資料
- CSV 逗號、引號及換行標準跳脫；公式開頭文字加單引號，匯入移除已定義的前綴並保留原文字；XLSX 一律明確文字或數值，無公式

## 0.3.13 含圖與雙幣商品總表（已實作）

- 商品清單一款一列，嵌入 images[0] 的 JPEG 縮圖，無圖留白；總表韓幣／台幣成本與匯率只在所有有效規格相同時顯示，未填空白、0 保留，混合／部分未填提示查看規格進價
- 原始 CSV 欄位移至 Excel「匯入底稿」，CSV 格式與只新增規則不變；含圖總表不是匯入來源
- POST admin/products.xlsx 的 thumbnails 僅暫存於請求／生成檔，每項 productId／url 必須對應目前商品第一張圖；每張 JPEG 144×144、最多 6000 bytes，數量不得超過商品數
- 缺少／過期／重複縮圖阻擋下載；無照片商品不要求縮圖。舊 GET 若有照片回 409 要求由管理頁重新匯出，避免成功卻沒有圖片
- XLSX DrawingML 使用檔內關聯與 JPEG media，不含外部圖片連結／公式；原圖與商品資料、進價、預購、採買版本完全不因下載改動

## 0.3.14 店主商品來源連結（已實作）

- 私有商品 sourceUrl 為選填字串，前後空白去除；空字串清除，省略欄位保留原值，舊商品預設空字串
- 限完整 http／https 網址、2048 字以內，不允許網址內帳密與控制字元；後端只驗證保存，不抓取或解讀來源
- 雲端 JSONB 保存 sourceUrl，無 Postgres DDL；本機 products.source_url 非空字串預設空值，舊表加欄保留商品、規格、成本及預購
- 管理 catalog 與採買 report 回傳 sourceUrl；客戶 catalog 排除 sourceUrl／source_url，orders 與 me 不加入來源
- 草稿白名單加入 sourceUrl；商品 Excel、CSV、規格進價、採買彙總皆輸出目前商品來源，不回寫預購售價快照
- XLSX 以 http(s) 超連結關聯保存網址，點開才由店主瀏覽；不是公式或外部圖片來源，與照片 drawing 關聯分開
- 新增表單只移除顏色預填值；編輯／草稿從原規格或輸入恢復，不做既有商品顏色遷移

## 0.3.15 尺寸進價與商品輸出拆列

- costUpdate 新增選填 sizeCosts=[{size,cost}]，明確 null 清除此尺寸、0 成本保留；只接受目前尺寸、不得重複，與舊 cost／defaultExchangeRate 相容。所有成本變更先驗證原全規格版本與整批資料，失敗不部分寫入
- 每尺寸 patch 更新該尺寸所有現行顏色，未指定尺寸保留原成本／版本；舊共用 cost 仍支援，新 UI 將共用值的變動展開成需要修改的尺寸，不覆蓋未修改的個別成本或顏色混合差價
- 新顏色沿用該尺寸原一致成本及匯率，混合顏色不猜；UI 新尺寸可採畫面共用值。共用輸入以目前最常見成本回填，單獨尺寸保留原完整成本快照，並非新增產品成本資料表
- 草稿增加 sizeCosts／initialSizeCosts 原始字串與基準，原版本仍保存；移除後重加尺寸保留本次輸入，衝突載入最新進價前解除舊監聽
- 商品清單依 variant 實際售價、韓幣成本、保存匯率分組，僅合併具有相同顏色集合的尺寸，保證每個有效規格恰好出現一次。價格不同緊接同商品下方，空白／零元分開，沒有有效規格的舊商品仍保留一列
- 首圖與來源連結隨拆列重複，縮圖請求仍每商品一張，檔內同商品圖片 bytes 重用。CSV／匯入底稿、按規格進價及採買報表粒度不變；本節取代 0.3.13 商品清單每款一列及混合成本提示

## 0.3.18 店主審閱排序與建議

- 雲端私有 store.data.merchandising、本機 merchandising_settings.data：version、productIds、previousIds、updatedAt；首次未設定視為 version=0／原始上架順序，不回填或重排既有資料
- PUT admin/product-order 必須帶符合目前 version 的完整上架商品 ID 排列；成功保存舊排列、版本加一並記 product.order 事件，客戶不得操作
- 商品統計取指定期間不重複 customer_id 的商品瀏覽／加購，正式預購人數及件數由有效明細按 variant 對商品，排除已刪除與零數量；不是事件次數或現存購物車
- ccbaby_merchandising_read 為 service_role-only、security invoker，SQL 核對 owner session，沿用 browsing_time 索引及 7／30／180 天限制，沒有新增雲端表／直連策略
- browsing API 增加最小 context（活動階段、截止、預購 id／customer_id／更新時間／數量／缺貨件數），不帶手機或地址；供管理端使用最新預購狀態
- 排序設定加入既有私有 JSON 業務備份；瀏覽事件仍不加入既有業務匯出。價格與預購快照、採購與分配不變

## 0.3.19 會員聯繫與通知

- customers.contact_code：CC- 加 12 位大寫十六進位，首次本人點入口才建立、重複使用同碼，碰撞重試；不是登入憑證。SQLite nullable 舊資料不回填並設非 null 唯一索引，雲端於 revision 交易檢查唯一
- 雲端 customerCare[customerId]／本機 customer_care.data：version、chatConfirmed、chatLabel、chatConfirmedAt、followUpAt、followUpNote、updatedAt。僅店主可寫；備註不進客戶 me／orders 或圖片
- 雲端 orderNotices[orderId]／本機 order_notices.data：version、notices[kind]（status、signature、recordedAt）、updatedAt。kind 為 thanks／purchased／arrived／payment，status 為 pending／sent，sent 僅代表店主人工標記
- 通知簽章使用明細快照、版本及該階段所需的買到／缺貨／活動階段；更新量或分配後需重新確認，版本與簽章不符回 409，不覆蓋別畫面
- 本人採購進度依 items.bought／shortage 分配，不取他人或未分配總採買；到台與匯款條件皆為 campaign.arrived 且本人 bought>0，匯款商品小計 sum(bought*歷史售價)
- 有效訂單才列分析及通知；刪除與零數量排除，歷史作業紀錄仍保留於私有備份。新增作業不變更實際預購／採購／分配數量或已收款狀態
- 圖卡在瀏覽器暫時產生，不保存在雲端；圖片不含成本與私人聯絡欄位。新聯繫資料加入原私有 JSON 備份，瀏覽事件保存規則不變
