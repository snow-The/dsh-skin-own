/**
 * @snow-the/dsh-skin-own —— 用自己的施加者套用 `~/.dsh/skins/` 裡的主題。
 *
 * 為什麼存在：使用者的「夏沫琉璃」素材在 `~/.dsh/skins/summer-liquid-glass/`、
 * 選中狀態在 `~/.dsh/skin-center-active.json`，但施加者是 `@linxin666/dsh-client-ui-skin-center`。
 * 只要那個外掛被關掉或移除，主題就消失（素材還在、沒人施加）。這一支把那條依賴拿掉。
 *
 * 契約（照 skin-center 的形狀，2026-11-06 讀它的 lib/index.js 得到）：
 *   - `inject = ["webServer"]`，`apply(ctx)` 內用 `ctx.effect(...)` 掛路由
 *   - route = `{ kind: "exact" | "prefix", path, handler(req, res) }`
 *   - 掛載失敗只記錄、不拋 —— web shell 會因為 apply 拋錯而整個 boot 失敗
 *
 * 端點：
 *   GET /skin-own/active.css   目前選中主題的 skin.css + patches.css（串接）
 *   GET /skin-own/active.json  目前選中的 id、可用清單、每支的 css 位元組數
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const name = "@snow-the/dsh-skin-own";
export const inject = ["webServer"];

const HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const SKINS_DIR = join(HOME, "skins");
const ACTIVE_FILE = join(HOME, "skin-center-active.json");

/** 只認這兩個檔名 —— 不允許用主題 id 走出目錄（那些 id 來自檔案內容，不是我們寫的）。 */
const CSS_FILES = ["skin.css", "patches.css"];
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function readActiveId() {
  try {
    const raw = JSON.parse(readFileSync(ACTIVE_FILE, "utf8"));
    const id = typeof raw?.active === "string" ? raw.active : null;
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

function listSkins() {
  try {
    return readdirSync(SKINS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** 串接一支主題的 CSS；缺檔就跳過（不報錯 —— 只有 skin.css 的主題也是合法主題）。
 *  在這裡再驗一次 id：呼叫端（路由）用的是 `readActiveId()` 的結果，但**兩道檢查比一道好**，
 *  而且測試要能單獨把這道守衛按紅（見 test/route.test.mjs 的 must-reject）。 */
function readSkinCss(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) return "";
  const dir = join(SKINS_DIR, id);
  const out = [];
  for (const file of CSS_FILES) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, "utf8");
      out.push(`/* ---- ${id}/${file} (${text.length} bytes) ---- */\n${text}`);
    } catch (err) {
      out.push(`/* ---- ${id}/${file}: unreadable (${err?.code ?? "error"}) ---- */`);
    }
  }
  return out.join("\n\n");
}

function send(res, status, headers, body) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}

export function apply(ctx) {
  // 掛不起來只記錄。讓 apply 拋錯 = 整個 web shell 起不來，這是 skin-center 自己
  // 在註解裡寫下的失敗策略（`the web shell fails the whole boot when a plugin apply throws`）。
  try {
    ctx.effect(() => {
      const disposers = [];
      try {
        // ★ 主要機制：**伺服器端注入**。`webserver/index-inject` 是一張結構化表，
        //   訂閱者往 table 推列，host 在 renderIndex 時把它們插進 index.html 的 head。
        //   走這條就不需要 client bundle（也就不需要那支沒有驗證過的 client.js）：
        //   瀏覽器拿到的 HTML 裡本來就有 <link>，curl 一次就能驗。
        disposers.push(
          ctx.on("webserver/index-inject", (table) => {
            const id = readActiveId();
            if (!id) return;
            table.push({
              kind: "html",
              placement: "head",
              html: `<link id="dsh-skin-own-stylesheet" rel="stylesheet" href="/skin-own/active.css" data-skin-own="1" data-skin-id="${id}">`,
            });
          }),
        );
        disposers.push(
          ctx.webServer.register({
            kind: "exact",
            path: "/skin-own/active.css",
            handler: (req, res) => {
              const id = readActiveId();
              if (!id) {
                return send(res, 200, { "content-type": "text/css; charset=utf-8" },
                  "/* dsh-skin-own: no active skin (or unreadable " + ACTIVE_FILE + ") */\n");
              }
              const css = readSkinCss(id);
              send(res, 200, { "content-type": "text/css; charset=utf-8" },
                `/* dsh-skin-own: active=${id} ${Buffer.byteLength(css)} bytes */\n${css}\n`);
            },
          }),
        );
        disposers.push(
          ctx.webServer.register({
            kind: "exact",
            path: "/skin-own/active.json",
            handler: (req, res) => {
              const id = readActiveId();
              const css = id ? readSkinCss(id) : "";
              send(res, 200, { "content-type": "application/json; charset=utf-8" }, JSON.stringify({
                active: id,
                cssBytes: css ? Buffer.byteLength(css) : 0,
                available: listSkins(),
                activeStatePath: ACTIVE_FILE,
                skinsDir: existsSync(SKINS_DIR) ? SKINS_DIR : null,
                skinsDirMtime: existsSync(SKINS_DIR) ? statSync(SKINS_DIR).mtimeMs : null,
              }, null, 2));
            },
          }),
        );
      } catch (err) {
        console.error("[skin-own] route mount failed:", err);
      }
      return () => {
        for (const dispose of disposers) {
          try { dispose(); } catch {}
        }
      };
    });
  } catch (err) {
    console.error("[skin-own] effect failed:", err);
  }
}

export const NS = "skin-own";

/** 測試用把手。刻意不掛任何東西到 ctx —— 只是讓 test/route.test.mjs 能直接按紅那兩道守衛。 */
export const internals = { readActiveId, readSkinCss, listSkins, ID_RE, SKINS_DIR, ACTIVE_FILE };
