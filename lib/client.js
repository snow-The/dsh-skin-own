window.__ModuleLoader__.load({
	id: "@snow-the/dsh-skin-own",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * 瀏覽器半邊：把皮膚 CSS **在執行期**掛上，而不是在伺服器端塞進 HTML。
		 *
		 * 為什麼非這樣不可（2026-11-07 量到的事實）：伺服器端注入的 <link> 確實進了頁面
		 * （排在 app 兩張樣式表之後），但畫面沒有變化 → app 在掛載後才把自己的樣式寫進 DOM，
		 * 那份永遠更晚、同特異度就贏。**後寫入者勝**，這是級聯唯一不會變的規則。
		 *
		 * 借鏡壁紙引擎自己的做法（它的 lib/client.js 就是這樣幹的）：
		 *   `<style id="we-font-patch">`、`<style id="we-caret-patch">` —— 執行期建 style 節點 append 到 head。
		 * 我們用 <link> 而不是 fetch+<style>：同源樣式表交給瀏覽器解析與快取，不用在中間搬字串。
		 *
		 * 失敗策略與宿主半邊一致：**只記錄、不拋**。client 外掛的 apply 拋錯會讓整個 web shell
		 * 起不來，而「主題沒套上」遠比「GUI 全白」好。
		 */
		const LINK_ID = "dsh-skin-own-patch";
		const HREF = "/skin-own/active.css";

		function ensure(doc) {
			if (!doc || !doc.head) return false;
			if (doc.getElementById(LINK_ID)) return false;
			const link = doc.createElement("link");
			link.id = LINK_ID;
			link.rel = "stylesheet";
			// 帶時間戳：換主題／改 skin.css 之後重新載入就一定拿到新的（宿主那邊也設了 no-store）。
			link.href = `${HREF}?t=${Date.now()}`;
			link.setAttribute("data-skin-own", "1");
			link.addEventListener("error", () => {
				console.error("[skin-own] stylesheet failed to load:", HREF);
			});
			doc.head.appendChild(link);
			return true;
		}

		const inject = [];

		function apply(ctx) {
			try {
				const first = ensure(document);
				// app 換頁／重掛時可能把 head 整個換掉，所以盯著它；被拿掉就補回來。
				const observer = new MutationObserver(() => ensure(document));
				observer.observe(document.head ?? document.documentElement, { childList: true });
				if (typeof ctx?.effect === "function") {
					ctx.effect(() => () => {
						try { observer.disconnect(); } catch {}
						try { document.getElementById(LINK_ID)?.remove(); } catch {}
					});
				}
				console.info(`[skin-own] stylesheet ${first ? "mounted" : "already present"} (${HREF})`);
			} catch (err) {
				console.error("[skin-own] client apply failed:", err);
			}
		}

		exports.apply = apply;
		exports.inject = inject;

		// ★ 不等 apply：模組載入時就掛。
		// 為什麼：2026-11-07 實測 client bundle 確實被組成並送到瀏覽器（`200 / 2779 bytes`，
		// 內容含我們的 link id），但 guide_boot 讀執行期 DOM 時找不到 marker ——
		// 也就是「模組載入了，apply 沒被叫到（或叫得太晚）」。掛載是 idempotent 的，
		// 所以在 factory 執行時先做一次，apply 再補一次；head 沒準備好就等 DOMContentLoaded。
		try {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => ensure(document), { once: true });
			} else {
				ensure(document);
			}
		} catch (err) {
			console.error("[skin-own] early mount failed:", err);
		}

		return module.exports;
	},
});
