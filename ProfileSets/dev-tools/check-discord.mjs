import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { vencordRoot, resultsDir, vencordRequire as require } from "./paths.mjs";
import { join } from "node:path";

const puppeteer = require("puppeteer-core");
const executablePath = [process.env.CHROMIUM_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(path => path && existsSync(path));
if (!executablePath) throw new Error("Chrome was not found.");
const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
try {
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    const reporter = await readFile(join(vencordRoot, "dist/browser.js"), "utf8");
    await page.evaluateOnNewDocument(reporter);
    await page.goto("https://discord.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
        const w = window.Vencord?.Webpack;
        return w?.findStore("UserProfileSettingsStore")?.getPendingChanges;
    }, { timeout: 120000 });
    const result = await page.evaluate(() => {
        const w = window.Vencord.Webpack;
        const store = w.findStore("UserProfileSettingsStore");
        const modules = Object.values(w.wreq.m).map(fn => String(fn));
        const source = modules.filter(code => code.includes("USER_PROFILE_SETTINGS_SET_PENDING_CHANGES"));
        const keys = ["pendingAvatar", "pendingBanner", "pendingBio", "pendingPronouns", "pendingNickname", "pendingGlobalName", "pendingDisplayNameStyles"];
        const matches = Object.fromEntries(keys.map(key => [key, source.some(code => code.includes(key))]));
        return {
            checkedAt: new Date().toISOString(),
            buildHash: window.GLOBAL_ENV?.SENTRY_TAGS?.buildId ?? null,
            pendingStore: typeof store.getPendingChanges === "function",
            pendingAction: source.length > 0,
            fields: matches,
            imageObjectFieldsPresent: modules.some(code => code.includes("pendingAvatar") && code.includes("imageUri")),
            limitation: "Logged-out Discord Stable module inspection only; authenticated profile saves and entitlements require manual verification."
        };
    });
    await mkdir(resultsDir, { recursive: true });
    await writeFile(join(resultsDir, "discord-compatibility.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.pendingStore || !result.pendingAction || !result.imageObjectFieldsPresent || Object.values(result.fields).some(value => !value)) throw new Error("Discord profile integration anchors could not be verified.");
} finally {
    await browser.close();
}
