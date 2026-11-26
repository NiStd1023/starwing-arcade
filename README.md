# 星翼出擊 STARWING

一款以經典街機射擊為靈感的 9:16 直式太空射擊遊戲。左右閃避蜂群、收集道具、挑戰頭目，在手機或電腦上都能遊玩。

## 遊玩方式

- 開始前可選擇第 1–5 級難度；第 1 級為原始難度。難度越高，敵機俯衝、射擊與頭目攻勢越強。
- 手機：在遊戲畫面左右拖曳。
- 電腦：使用 ←、→ 或 A、D 移動；戰機自動射擊。
- 點選右下角 BOMB，或按 B／X 使用炸彈。每三關有頭目。
- 拾取金色星星罐強化火力、藍色箭頭罐補充炸彈、粉紅愛心罐回復生命。右上角可暫停及切換音樂／音效。
- 各難度最高分分開記錄，只儲存在目前瀏覽器或已安裝的遊戲中；第 1 級保留原有最高分。清除瀏覽器資料可能刪除紀錄。

## 安裝及離線遊玩

透過 HTTPS 開啟網站，首次載入完成後即可快取遊戲，之後離線也能遊玩。Android Chrome 可使用瀏覽器選單的「安裝應用程式」或畫面上的安裝按鈕；iPhone／iPad 請使用 Safari 的「分享」→「加入主畫面」。電腦版瀏覽器可使用網址列中的安裝圖示。選項名稱與可用性依瀏覽器及系統版本而異。

## 本機執行

這是純靜態網頁，無須安裝套件或建置。請用本機 HTTP 伺服器開啟，不要直接以 `file://` 執行，否則離線功能無法運作。

```sh
# 若專案有 dist 資料夾：
python3 -m http.server 8000 --directory dist
# 若 index.html 位於專案根目錄，則執行：python3 -m http.server 8000
```

接著前往 `http://localhost:8000/`。Service Worker 只在 HTTPS 或 localhost 上啟用。

## 檔案與更新

- `index.html`：遊戲畫面與 PWA 連結。
- `style.css`：版面與控制項樣式。
- `game.js`：遊戲邏輯、操作及原創合成音樂／音效。
- `space-bg.png`、`icon*.png`、`icon.svg`：背景與安裝圖示。
- `sprites-ship.png`、`sprites-bees.png`、`sprites-bee-bodies.png`、`sprites-powerups.png`：戰機、分層拍翅蜂群與海報風格能量罐素材。
- `manifest.webmanifest`：安裝名稱、圖示與顯示設定。
- `sw.js`：離線快取。修改遊戲資源後，請同步遞增 `CACHE_NAME` 與 `index.html`、`sw.js` 中的 CSS／JavaScript 版本參數，以確保使用者取得新檔案。

在 GitHub 儲存庫中更新檔案並提交到 Pages 設定的分支後，網站會重新部署。若版本看起來未更新，可關閉再重新開啟遊戲，或重新整理頁面。遊戲不需要帳號、伺服器或外部 API。
