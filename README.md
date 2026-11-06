# @snow-the/dsh-skin-own

用自己的施加者套用 `~/.dsh/skins/` 裡的主題，**不需要** `@linxin666/dsh-client-ui-skin-center`。

## 為什麼有這支

DSH 的主題是**資料 + 施加者**兩件事：

| 部分 | 位置 | 誰擁有 |
|---|---|---|
| 素材 | `~/.dsh/skins/<id>/`（`skin.css`、`patches.css`、`skin.json`、`assets/`） | 使用者 |
| 選中狀態 | `~/.dsh/skin-center-active.json` → `{"active":"<id>"}` | 使用者 |
| 施加者 | 把上面兩者變成畫面的那段程式 | 原本是第三方外掛 |

素材與選擇本來就是使用者的，只有施加者是別人的。那支第三方外掛一旦被關掉或移除（或它的 `disabled` 被改錯一次），主題就消失——**素材還在，只是沒人施加**。2026-11-06 這個情境真的發生過一次（見 `~/.dsh/_p0/LINXIN666-REPLACEMENT.md`），所以改成自己的。

## 它做什麼

宿主半邊（**只有** `lib/index.js`，沒有 client bundle）：

- `GET /skin-own/active.css` —— 把選中主題的 `skin.css` + `patches.css` 串起來回傳（`text/css`，`cache-control: no-store`）
- `GET /skin-own/active.json` —— 目前選中 id、可用主題清單、位元組數、狀態檔路徑
- `ctx.on("webserver/index-inject", …)` —— 在 web shell 的 `<head>` 裡插一行
  `<link id="dsh-skin-own-stylesheet" rel="stylesheet" href="/skin-own/active.css" data-skin-id="…">`

**刻意不走 client bundle**：伺服器端注入讓「有沒有生效」可以用 `curl` 直接驗（頁面原始碼裡就看得到那一行），不必靠截圖或肉眼。少一個瀏覽器半邊＝少一個驗不到的地方。

## 安全邊界

`active` 來自**檔案內容**，是外部輸入，會變成路徑片段。所以：

- id 必須符合 `^[a-z0-9][a-z0-9._-]{0,63}$`（`readActiveId` 與 `readSkinCss` **各驗一次**）
- 只讀 `skin.css` / `patches.css` 兩個固定檔名
- 狀態檔壞掉、缺檔、key 不對 → 一律回 `null`／空字串，**不拋錯**

失敗策略：掛載出錯只 `console.error`，不讓 `apply` 拋——client/host 外掛的 `apply` 拋錯會讓整個 web shell 起不來，而「主題沒套上」遠比「GUI 全白」好。

## 測試

```bash
node --test test/route.test.mjs
```

7 項，**每個 must-accept 都配一個 must-reject**（路徑穿越 `../../etc/passwd`、`C:/Windows/win.ini`、含空白的名稱、壞掉的 JSON、缺檔）。

## 啟用（可逆）

profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: skin-own
      name: '@snow-the/dsh-skin-own'
- id: web-ui-skin-center
  disabled: true
```

回滾：把那兩段刪掉、把 `web-ui-skin-center` 改回 `false`，重啟。

## 已知限制

- 只處理 CSS。`skin.json` 的 `contributes.backgroundMedia`（背景圖/影片）尚未實作——目前那部分仍靠素材本身的 CSS 或另一支插件。
- 不提供選主題的 UI；改主題＝改 `~/.dsh/skin-center-active.json`（或日後另做一支）。
