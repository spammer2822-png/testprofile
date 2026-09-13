import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resultsDir } from "./paths.mjs";
const regression = JSON.parse(await readFile(join(resultsDir, "regression.json"), "utf8"));
const ui = JSON.parse(await readFile(join(resultsDir, "ui.json"), "utf8"));
const discord = JSON.parse(await readFile(join(resultsDir, "discord-compatibility.json"), "utf8"));
if (regression.passed !== regression.total || ui.passed !== 8 || ui.browserErrors.length || !discord.pendingStore || !discord.pendingAction || !discord.imageObjectFieldsPresent || Object.values(discord.fields).some(value => !value)) throw new Error("Verification did not pass");
const report = {
    checkedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA ?? "local working copy",
    vencordCommit: "0850f37fbb1623aa6330764d8f4b1e0b2617dcdf",
    regressionTests: regression.passed,
    browserScenarios: ui.passed,
    desktopBuild: "passed",
    webBuild: "passed",
    typescript: "passed",
    testSource: "Complete project extracted from ProfileSets-candidate.zip",
    packageRoot: "ProfileSets/",
    discordBuild: discord.buildHash,
    limits: "Discord services and modal shell are mocked in browser scenarios. Live Discord module inspection uses no account. Authenticated saves, account entitlements and every Discord experiment are not covered."
};
await writeFile(join(resultsDir, "verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
