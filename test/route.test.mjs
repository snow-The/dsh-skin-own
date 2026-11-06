/**
 * dsh-skin-own 的守衛測試。
 *
 * 兩條紀律：
 *   1. **每個 must-accept 旁邊都要有一個 must-reject**——只驗「好的會過」等於沒驗。
 *   2. 被驗的必須是**出貨的那份邏輯**（`../lib/index.js`），不是測試裡重寫一份。
 *
 * 這支插件吃的是「檔案內容裡的字串」（`skin-center-active.json` 的 `active`），
 * 那是**外部輸入**：主題 id 會變成路徑片段。所以 `../../etc/passwd` 這類字串必須被擋。
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必須在 import 之前設定：模組載入時就讀 DSH_HOME。
const HOME = mkdtempSync(join(tmpdir(), "skin-own-test-"));
process.env.DSH_HOME = HOME;

const SKINS = join(HOME, "skins");
const ACTIVE = join(HOME, "skin-center-active.json");

mkdirSync(join(SKINS, "summer-liquid-glass"), { recursive: true });
writeFileSync(join(SKINS, "summer-liquid-glass", "skin.css"), ":root{--marker:skin}");
writeFileSync(join(SKINS, "summer-liquid-glass", "patches.css"), ".p{--marker:patches}");
// 一個資料夾名稱不合法的（含空白）——它不該出現在清單裡
mkdirSync(join(SKINS, "bad name"), { recursive: true });
// 一個只有 skin.css、沒有 patches.css 的主題（合法）
mkdirSync(join(SKINS, "only-skin"), { recursive: true });
writeFileSync(join(SKINS, "only-skin", "skin.css"), ":root{--marker:only}");

const writeActive = (value) => writeFileSync(ACTIVE, JSON.stringify(value));
writeActive({ active: "summer-liquid-glass" });

const { internals } = await import("../lib/index.js");

after(() => rmSync(HOME, { recursive: true, force: true }));

test("must-accept: 讀得到目前選中的主題", () => {
  writeActive({ active: "summer-liquid-glass" });
  assert.equal(internals.readActiveId(), "summer-liquid-glass");
});

test("must-accept: 兩份 CSS 都串進來，順序是 skin.css 再 patches.css", () => {
  const css = internals.readSkinCss("summer-liquid-glass");
  assert.match(css, /--marker:skin/);
  assert.match(css, /--marker:patches/);
  assert.ok(css.indexOf("--marker:skin") < css.indexOf("--marker:patches"), "skin.css 必須在 patches.css 之前");
});

test("must-accept: 只有 skin.css 的主題也合法（缺檔跳過、不拋）", () => {
  const css = internals.readSkinCss("only-skin");
  assert.match(css, /--marker:only/);
});

test("must-reject: active 是路徑穿越時，readActiveId 回 null", () => {
  for (const bad of ["../../etc/passwd", "..", "a/b", "", "x".repeat(200)]) {
    writeActive({ active: bad });
    assert.equal(internals.readActiveId(), null, `應該拒絕: ${JSON.stringify(bad)}`);
  }
});

test("must-reject: 直接把壞 id 丟進 readSkinCss 也讀不到東西（第二道守衛）", () => {
  for (const bad of ["../../etc/passwd", "C:/Windows/win.ini", ".", "..", "bad name"]) {
    assert.equal(internals.readSkinCss(bad), "", `應該回空字串: ${JSON.stringify(bad)}`);
  }
});

test("must-reject: 狀態檔壞掉 / 不存在 → null，不是拋錯", () => {
  writeFileSync(ACTIVE, "{not json");
  assert.equal(internals.readActiveId(), null);
  rmSync(ACTIVE);
  assert.equal(internals.readActiveId(), null);
  writeActive({ nope: "summer-liquid-glass" }); // 有值但 key 不對
  assert.equal(internals.readActiveId(), null);
});

test("must-accept: 清單只列合法名稱的資料夾", () => {
  const list = internals.listSkins();
  assert.ok(list.includes("summer-liquid-glass"));
  assert.ok(list.includes("only-skin"));
  assert.ok(!list.includes("bad name"), "含空白的資料夾不該進清單");
  assert.deepEqual(list, [...list].sort(), "清單必須是有序的");
});
