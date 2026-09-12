import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const require = createRequire(new URL("../../.vencord/package.json", import.meta.url));
const { build } = require("esbuild");
const puppeteer = require("puppeteer-core");
const root = new URL("../../", import.meta.url).pathname;
const adapter = new URL("./adapter.tsx", import.meta.url).pathname;
const uiRequire = createRequire(new URL("./package.json", import.meta.url));
const bundle = await build({
    stdin: { contents: 'import * as React from "react"; import { createRoot } from "react-dom/client"; import Tab from "./ProfileSets/components/profileSetsTab"; createRoot(document.getElementById("app")).render(<Tab />);', loader: "tsx", resolveDir: root, sourcefile: "ui-entry.tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
    plugins: [{ name: "ui-discord-adapter", setup(builder) {
        builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: uiRequire.resolve(args.path) }));
        builder.onResolve({ filter: /^@/ }, () => ({ path: adapter }));
        builder.onResolve({ filter: /^\.\.\/index$/ }, args => args.importer.includes("/ProfileSets/") ? ({ path: adapter }) : undefined);
    } }]
});
const styles = await readFile(new URL("../../ProfileSets/styles.css", import.meta.url), "utf8");
const buttonStyles = await readFile(new URL("../../.vencord/src/components/Button.css", import.meta.url), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { color-scheme:dark; --text-primary:#f2f3f5; --header-primary:#f2f3f5; --text-normal:#dbdee1; --text-secondary:#c4c9ce; --text-muted:#a3a9b1; --background-secondary:#232428; --background-primary:#313338; --background-tertiary:#1e1f22; --background-surface-high:#232428; --background-surface-higher:#2b2d31; --background-modifier-accent:#ffffff17; --border-subtle:#ffffff17; --background-modifier-selected:#5865f219; --input-background:#1e1f22; --brand-500:#5865f2; --text-link:#a9b1ff; --button-filled-brand-background:#5865f2; --button-filled-brand-text:#fff; }
body { margin:0; padding:32px; font-family:Arial,sans-serif; background:#313338; color:#f2f3f5; }
body.light { --text-primary:#202127; --header-primary:#202127; --text-normal:#303238; --text-secondary:#40444c; --text-muted:#555c67; --background-secondary:#f2f3f5; --background-primary:#fff; --background-tertiary:#e3e5e8; --background-surface-high:#f2f3f5; --background-surface-higher:#fff; --background-modifier-accent:#00000018; --border-subtle:#00000022; --input-background:#fff; --text-link:#3942b0; background:#fff; color:#202127; }
#app { max-width:860px; margin:auto; } button { font:inherit; } .vc-btn-base { border:1px solid var(--border-subtle); color:var(--text-primary); border-radius:8px; padding:8px 12px; cursor:pointer; background:var(--background-surface-higher); font-size:13px; }.vc-btn-primary { background:#5865f2;color:#fff; }button:disabled{opacity:.55;cursor:default;}
.test-modal-backdrop { position:fixed; inset:0; overflow-y:auto; background:#0009; padding:20px; z-index:10; }
.test-modal { box-sizing:border-box; width:min(780px,100%); margin:auto; padding:24px; border-radius:16px; background:var(--background-primary); }
.test-modal h2 { margin-top:0; }.test-modal footer { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }
.test-menu { position:fixed; top:100px; right:50px; background:var(--background-secondary); padding:12px; z-index:20; border:1px solid var(--border-subtle); border-radius:8px; }
.test-menu button { display:block; width:100%; padding:10px; border:0; color:inherit; background:transparent; text-align:left; cursor:pointer; }
select { padding:10px; border-radius:8px; width:100%; }
${buttonStyles}\n${styles}</style></head><body><div id="app"></div><div id="modals"></div><div id="menus"></div><script src="/bundle.js"></script></body></html>`;
const server = createServer((req, res) => { res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html"); res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : html); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const executablePath = [process.env.CHROMIUM_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path));
const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
const results = [];
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const click = async text => {
    await page.waitForFunction(text => Array.from(document.querySelectorAll("button")).some(button => button.textContent.trim() === text && !button.disabled), {}, text);
    await page.evaluate(text => Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === text).click(), text);
};
const fill = async (selector, text) => { await page.click(selector, { clickCount: 3 }); await page.keyboard.type(text); };
const capture = async name => {
    await page.screenshot({ path: "test-results/" + name + ".png", fullPage: true });
};
try {
    await mkdir("test-results", { recursive: true });
    await page.setViewport({ width: 1100, height: 1050, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.waitForSelector('[aria-label="Apply Everyday"]');
    assert.equal(await page.$eval(".vc-profile-presets-list-container", el => el.children.length), 6);
    await capture("profiles-desktop");
    await click("+ Add New Profile");
    await page.waitForSelector('[role="dialog"]');
    await fill('[role="dialog"] input[maxlength="100"]', "Night mode");
    await fill('[role="dialog"] textarea', "Saved separately from the active profile");
    await fill('[role="dialog"] input[maxlength="128"]', "Draft only");
    const gifPath = root + "test-results/upload.gif";
    await writeFile(gifPath, Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
    const files = await page.$$('[role="dialog"] input[type="file"]');
    await files[0].uploadFile(gifPath);
    await page.waitForFunction(() => document.querySelector(".vc-profile-presets-draft-avatar")?.getAttribute("src")?.startsWith("data:image/gif"));
    await capture("profile-draft");
    await click("Save Profile");
    await page.waitForSelector('[aria-label="Apply Night mode"]');
    assert.equal(await page.evaluate(() => window.__ui.dispatches.length), 0);
    assert.equal(await page.evaluate(() => window.__ui.statuses.length), 0);
    results.push("Creating a draft with animated avatar and status leaves active Discord state unchanged");

    await fill('input[type="search"]', "night");
    assert.equal(await page.$$eval(".vc-profile-presets-card", cards => cards.length), 1);
    const menuButton = await page.$('[aria-label="Actions for Night mode"]');
    await menuButton.focus(); await page.keyboard.press("Enter");
    await page.waitForSelector('[role="menu"]');
    assert.equal(await page.evaluate(() => window.__ui.dispatches.length), 0);
    results.push("Search filters profiles and keyboard activation of the actions menu does not apply a profile");
    await click("Edit Saved Profile");
    await page.waitForSelector('[role="dialog"] textarea');
    await fill('[role="dialog"] textarea', "Edited saved draft");
    await click("Save Profile");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await page.evaluate(() => window.__ui.dispatches.length), 0);
    results.push("Editing a saved profile is isolated from the active profile");
    await page.click('[aria-label="Apply Night mode"]');
    await page.waitForFunction(() => window.__ui.pending.main?.pendingBio === "Edited saved draft");
    assert.equal(await page.evaluate(() => window.__ui.statuses.length), 1);
    assert.ok(await page.evaluate(() => window.__ui.pending.main.pendingAvatar.imageUri.startsWith("data:image/gif")));
    results.push("Explicit Apply stages the saved layout and updates its custom status");

    await click("Server Profile");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent.trim() === "Copy Main Profile to Server" && !button.disabled));
    await page.select('select[aria-label="Server"]', "888");
    await click("Copy Main Profile to Server");
    await page.waitForFunction(() => window.__ui.pending["888"]?.pendingBio === "Current main bio");
    assert.equal(await page.evaluate(() => window.__ui.pending.main.pendingBio), "Edited saved draft");
    assert.equal(await page.evaluate(() => window.__ui.statuses.length), 1);
    results.push("Server selection and copy target the chosen server without modifying main pending edits or status");
    await capture("profile-server");

    await click("+ Add New Profile");
    await fill('[role="dialog"] input[maxlength="100"]', "Cannot save");
    await page.evaluate(() => { window.__ui.failWrites = true; });
    await click("Save Profile");
    await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes("disk full"));
    assert.ok(await page.$('[role="dialog"]'));
    await page.evaluate(() => { window.__ui.failWrites = false; });
    await click("Cancel");
    results.push("Storage errors keep the draft open and do not report success");

    await page.setViewport({ width: 480, height: 1100, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await capture("profile-narrow");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await click("Main Profile");
    await page.waitForSelector('[aria-label="Apply Everyday"]');
    await page.evaluate(() => document.body.classList.add("light"));
    await capture("profiles-light-narrow");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    results.push("Narrow layouts have no horizontal overflow in dark and light themes");
    assert.deepEqual(errors, []);
    results.push("No browser runtime errors during the tested flows");
    const b64 = (await readFile("test-results/profiles-desktop.png")).toString("base64");
    console.log("PROFILESETS_SCREENSHOT:" + b64);
    console.log("UI_CHECKS", JSON.stringify(results));
} finally {
    await writeFile("test-results/ui.json", JSON.stringify({ passed: results.length, results, browserErrors: errors, scope: "Actual plugin components with mocked Discord services and modal shell." }, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
