import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pluginRoot, resultsDir, uiRequire, vencordRequire as require, vencordRoot } from "../paths.mjs";

const { build } = require("esbuild");
const puppeteer = require("puppeteer-core");
const adapter = fileURLToPath(new URL("./adapter.jsx", import.meta.url));
const bundle = await build({
    stdin: {
        contents: 'import * as React from "react"; import { createRoot } from "react-dom/client"; import Tab from "./components/profileSetsTab"; createRoot(document.getElementById("app")).render(<Tab />);',
        loader: "tsx",
        resolveDir: pluginRoot,
        sourcefile: "ui-entry.tsx"
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    plugins: [{
        name: "ui-discord-adapter",
        setup(builder) {
            builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: uiRequire.resolve(args.path) }));
            builder.onResolve({ filter: /^@/ }, () => ({ path: adapter }));
            builder.onResolve({ filter: /^(?:\.\.\/index|\.\.)$/ }, args => args.importer.startsWith(pluginRoot) ? ({ path: adapter }) : undefined);
        }
    }]
});

const styles = await readFile(join(pluginRoot, "styles.css"), "utf8");
const buttonStyles = await readFile(join(vencordRoot, "src/components/Button.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { color-scheme:dark; --text-primary:#f2f3f5; --header-primary:#f2f3f5; --text-normal:#dbdee1; --text-secondary:#c4c9ce; --text-muted:#a3a9b1; --background-secondary:#232428; --background-primary:#313338; --background-tertiary:#1e1f22; --background-surface-high:#232428; --background-surface-higher:#2b2d31; --background-surface-highest:#313338; --background-modifier-accent:#ffffff17; --background-modifier-hover:#ffffff12; --background-modifier-selected:#5865f219; --border-subtle:#ffffff17; --input-background:#1e1f22; --brand-500:#5865f2; --brand-experiment:#5865f2; --interactive-normal:#b5bac1; --interactive-hover:#dbdee1; --button-filled-brand-background:#5865f2; --button-filled-brand-text:#fff; }
body { margin:0; padding:32px; font-family:Arial,sans-serif; background:#313338; color:#f2f3f5; }
body.light { color-scheme:light; --text-primary:#202127; --header-primary:#202127; --text-normal:#303238; --text-secondary:#40444c; --text-muted:#555c67; --background-secondary:#f2f3f5; --background-primary:#fff; --background-tertiary:#e3e5e8; --background-surface-high:#f2f3f5; --background-surface-higher:#fff; --background-surface-highest:#fff; --background-modifier-accent:#00000018; --background-modifier-hover:#0000000d; --background-modifier-selected:#5865f219; --border-subtle:#00000022; --input-background:#fff; --interactive-normal:#4e5058; --interactive-hover:#2e3035; background:#fff; color:#202127; }
#app { max-width:760px; margin:auto; } button,input { font:inherit; } .vc-btn-base { border:1px solid var(--border-subtle); color:var(--text-primary); border-radius:8px; padding:8px 12px; cursor:pointer; background:var(--background-surface-higher); font-size:13px; }.vc-btn-primary { background:#5865f2;color:#fff; }button:disabled{opacity:.55;cursor:default;} input { box-sizing:border-box; padding:10px 12px; border:1px solid var(--border-subtle); border-radius:8px; background:var(--input-background); color:var(--text-primary); }
.test-modal-backdrop { position:fixed; inset:0; overflow-y:auto; background:#0009; padding:20px; z-index:10; }.test-modal { box-sizing:border-box; width:min(500px,100%); margin:auto; padding:24px; border-radius:12px; background:var(--background-primary); }.test-modal footer { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }.test-menu { position:fixed; top:100px; right:50px; background:var(--background-secondary); padding:12px; z-index:20; border:1px solid var(--border-subtle); border-radius:8px; }.test-menu button { display:block; width:100%; padding:10px; border:0; color:inherit; background:transparent; text-align:left; cursor:pointer; } select { box-sizing:border-box; width:100%; padding:10px; border-radius:8px; }
${buttonStyles}
${styles}</style></head><body><div id="app"></div><div id="modals"></div><div id="menus"></div><script src="/bundle.js"></script></body></html>`;

const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

const executablePath = [process.env.CHROMIUM_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(path => path && existsSync(path));
if (!executablePath) throw new Error("Chrome was not found.");
const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage();
const results = [];
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const click = async text => {
    await page.waitForFunction(label => Array.from(document.querySelectorAll("button")).some(button => button.textContent.trim() === label && !button.disabled), {}, text);
    await page.evaluate(label => Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === label)?.click(), text);
};
const capture = name => page.screenshot({ path: join(resultsDir, `${name}.png`), fullPage: true });

try {
    await mkdir(resultsDir, { recursive: true });
    await page.setViewport({ width: 1100, height: 950, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector(".vc-profile-presets-row");
    assert.equal(await page.$$eval(".vc-profile-presets-row", rows => rows.length), 5);
    assert.equal(await page.evaluate(() => document.body.textContent.includes("Add New Profile")), false);
    results.push("Original ProfileSets layout is restored with five compact saved-profile rows and no draft editor");
    await capture("original-main");

    await page.click(".vc-profile-presets-row");
    await page.waitForFunction(() => window.__ui.pending.main?.pendingBio === "Saved profile 0");
    results.push("Existing saved profiles still load through the original row interaction");

    await click("Server Profile");
    await page.waitForSelector('select[aria-label="Server"]');
    await page.select('select[aria-label="Server"]', "888");
    await click("Copy Main Profile to Server");
    await page.waitForFunction(() => window.__ui.pending["888"]?.pendingBio === "Current main bio");
    assert.equal(await page.evaluate(() => window.__ui.pending.main.pendingBio), "Saved profile 0");
    assert.equal(await page.evaluate(() => window.__ui.statuses.length), 0);
    assert.deepEqual(await page.evaluate(() => window.__ui.pending["888"].pendingDisplayNameStyles.colors), [0x5865f2, 0x9b59b6]);
    assert.equal(await page.evaluate(() => window.__ui.pending["888"].pendingDisplayNameStyles.font_id), 3);
    assert.equal(await page.evaluate(() => window.__ui.pending["888"].pendingDisplayNameStyles.effect_id), 2);
    results.push("Copy Main Profile includes the display name style, targets the selected server, and leaves main state untouched");
    await capture("original-server-copy");

    await page.setViewport({ width: 480, height: 1050, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await capture("original-narrow");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    results.push("Original layout remains usable without horizontal overflow at narrow width");

    await click("Main Profile");
    await page.waitForSelector(".vc-profile-presets-row");
    await page.evaluate(() => document.body.classList.add("light"));
    await capture("original-light-narrow");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    results.push("Dark/light rendering completes without browser runtime errors");
    console.log("UI_CHECKS", JSON.stringify(results));
} finally {
    await writeFile(join(resultsDir, "ui.json"), JSON.stringify({
        passed: results.length,
        results,
        browserErrors: errors,
        scope: "Original plugin components with mocked Discord services."
    }, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
