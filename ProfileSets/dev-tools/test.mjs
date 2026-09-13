import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

import { pluginRoot, resultsDir, vencordRequire as require } from "./paths.mjs";

const { build } = require("esbuild");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L68AAAAASUVORK5CYII=";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const clone = value => value == null ? value : structuredClone(value);

async function harness() {
    const db = new Map();
    const writes = [];
    const dispatches = [];
    const statuses = [];
    let failWrite = false;
    let refreshedUser;
    let user = {
        id: "100",
        username: "Dariusz",
        globalName: "Main name",
        avatar: null,
        displayNameStyles: { colors: [0x123456, 0xabcdef], effect_id: 2, font_id: 3 }
    };
    let pending = {};
    const base = { bio: "Current main bio", pronouns: "he/him", banner: null, accentColor: 0x5865f2, themeColors: [0x5865f2, 0x232428] };
    const guildProfile = { bio: "Existing server bio", pronouns: null, banner: null, accentColor: null, themeColors: null };
    const member = {
        nick: "Existing nickname",
        avatar: null,
        displayNameStyles: { colors: [0x111111, 0x222222], effect_id: 0, font_id: 0 }
    };
    const mock = {
        DataStore: {
            get: async key => clone(db.get(key)),
            set: async (key, value) => {
                if (failWrite) throw new Error("disk full");
                writes.push(key);
                db.set(key, clone(value));
            }
        },
        Logger: class { error() {} },
        UserStore: { getCurrentUser: () => user },
        GuildMemberStore: { getMember: () => member },
        UserProfileStore: { getUserProfile: () => base, getGuildMemberProfile: () => guildProfile },
        IconUtils: { getUserAvatarURL: () => PNG, getDefaultAvatarURL: () => PNG },
        Constants: { Endpoints: { USER_PROFILE: id => `/users/${id}/profile` } },
        RestAPI: { get: async () => ({ body: refreshedUser ? { user: refreshedUser } : {} }) },
        FluxDispatcher: { dispatch: action => {
            dispatches.push(clone(action));
            if (action.type === "USER_UPDATE") user = { ...user, ...clone(action.user) };
            if (action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES") {
                const { type, guildId, ...changes } = action;
                pending[guildId ?? "main"] = { ...pending[guildId ?? "main"], ...changes };
            }
        } },
        getUserSettingLazy: () => ({
            getSetting: () => ({ text: "Current status", emojiId: "0", emojiName: "", expiresAtMs: "0" }),
            updateSetting: value => { statuses.push(clone(value)); }
        }),
        findStoreLazy: () => ({ getPendingChanges: guildId => pending[guildId ?? "main"] ?? {} }),
        fetchUserProfile: async () => {},
        isNonNullish: value => value != null,
        showToast: () => {},
        Toasts: { Type: { FAILURE: 1, SUCCESS: 2 } }
    };
    const bundle = await build({
        stdin: {
            contents: 'export * from "./utils/storage"; export * from "./utils/actions"; export * from "./utils/profile";',
            resolveDir: pluginRoot,
            sourcefile: "test-entry.ts"
        },
        bundle: true,
        write: false,
        format: "cjs",
        platform: "node",
        plugins: [{
            name: "discord-test-adapter",
            setup(builder) {
                builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "test-adapter" }));
                builder.onLoad({ filter: /.*/, namespace: "test-adapter" }, () => ({
                    contents: Object.keys(mock).map(key => `export const ${key} = globalThis.__mock.${key};`).join("\n")
                }));
            }
        }]
    });
    const context = {
        exports: {},
        module: { exports: {} },
        __mock: mock,
        console,
        structuredClone,
        URL,
        Blob,
        fetch: async () => ({ ok: true, blob: async () => new Blob([Buffer.from(PNG.split(",")[1], "base64")], { type: "image/png" }) }),
        FileReader: class {
            async readAsDataURL(blob) {
                this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
                this.onloadend?.();
            }
        }
    };
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    return {
        api: context.module.exports,
        db,
        writes,
        dispatches,
        statuses,
        setPending: value => { pending = clone(value); },
        pending: () => pending,
        failWrites: () => { failWrite = true; },
        switchUser: id => { user = { ...user, id }; },
        refreshUser: value => { refreshedUser = value; },
        failImages: () => { context.fetch = async () => ({ ok: false }); },
        setBanner: value => { base.banner = value; }
    };
}

const results = [];
async function test(name, fn) {
    try {
        await fn();
        results.push({ name, passed: true });
        console.log("PASS", name);
    } catch (error) {
        results.push({ name, passed: false, error: error.stack });
        console.error("FAIL", name, error);
    }
}

await test("Current saved profiles load without rejecting old image values", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", [{ name: "Recovered", timestamp: 1, avatarDataUrl: "blob:older-profilesets-image" }]);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets.length, 1);
    assert.equal(h.api.presets[0].name, "Recovered");
});

await test("A missing account key recovers the old unscoped v2 backup", async () => {
    const h = await harness();
    const backup = [{ name: "Old v2", timestamp: 2, avatarDataUrl: PNG }];
    h.db.set("ProfilePresets_v2_Main", backup);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets[0].name, "Old v2");
    assert.deepEqual(h.db.get("ProfilePresets_v2_Main"), backup);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].name, "Old v2");
});

await test("An intentionally empty collection stays empty even with older backups", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", []);
    h.db.set("ProfileDataset:100:main", [{ name: "Deleted old profile", timestamp: 1 }]);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets.length, 0);
    assert.equal(h.writes.length, 0);
});

await test("An unscoped backup is retained without copying it into a second account", async () => {
    const h = await harness();
    h.db.set("ProfileDataset", [{ name: "Old profile", timestamp: 1 }]);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets.length, 1);
    h.switchUser("200");
    await h.api.loadPresets("main");
    assert.equal(h.api.presets.length, 0);
    assert.equal(h.db.get("ProfileDataset").length, 1);
});

await test("Unreadable storage cannot be replaced by saving an empty collection", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", { unexpected: "preserve this value" });
    await h.api.loadPresets("main");
    assert.ok(h.api.loadError);
    await assert.rejects(h.api.savePreset("Cannot replace", "main"), /stored data/);
    assert.equal(h.writes.length, 0);
});

await test("Legacy ProfileDataset data is recovered without deleting its backup", async () => {
    const h = await harness();
    const backup = [{ name: "Legacy", timestamp: 3 }];
    h.db.set("ProfileDataset:100:main", backup);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets[0].name, "Legacy");
    assert.deepEqual(h.db.get("ProfileDataset:100:main"), backup);
});

await test("The current non-empty account collection takes priority over backups", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", [{ name: "Current", timestamp: 4 }]);
    h.db.set("ProfileDataset:100:main", [{ name: "Backup", timestamp: 3 }]);
    await h.api.loadPresets("main");
    assert.equal(h.api.presets.length, 1);
    assert.equal(h.api.presets[0].name, "Current");
});

await test("Copy Main Profile stages the selected server only", async () => {
    const h = await harness();
    h.setPending({ main: { pendingBio: "Unsaved main edit", pendingGlobalName: "Unsaved name" } });
    await h.api.copyMainProfileToServer("888");
    assert.equal(h.pending()["888"].pendingBio, "Current main bio");
    assert.equal(h.pending()["888"].pendingNickname, "Main name");
    assert.deepEqual(Array.from(h.pending()["888"].pendingDisplayNameStyles.colors), [0x123456, 0xabcdef]);
    assert.equal(h.pending()["888"].pendingDisplayNameStyles.font_id, 3);
    assert.equal(h.pending()["888"].pendingDisplayNameStyles.effect_id, 2);
    assert.equal(h.pending().main.pendingBio, "Unsaved main edit");
    assert.equal(h.statuses.length, 0);
    const staged = h.dispatches.filter(action => action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES");
    assert.equal(staged.length, 1);
    assert.equal(staged[0].guildId, "888");
    assert.equal("pendingPrimaryGuildId" in staged[0], false);
});

await test("Copy Main Profile does not alter saved-profile storage", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", [{ name: "Keep me", timestamp: 5 }]);
    await h.api.copyMainProfileToServer("999");
    assert.equal(h.writes.length, 0);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].name, "Keep me");
});

await test("Original Save Profile keeps the storage key and display name style", async () => {
    const h = await harness();
    await h.api.loadPresets("main");
    await h.api.savePreset("New save", "main");
    assert.equal(h.db.get("ProfilePresets_v2_Main:100").length, 1);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].name, "New save");
    assert.deepEqual(h.db.get("ProfilePresets_v2_Main:100")[0].displayNameStyles.colors, [0x123456, 0xabcdef]);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].displayNameStyles.font_id, 3);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].displayNameStyles.effect_id, 2);
});

await test("A failed save reports failure without replacing stored data", async () => {
    const h = await harness();
    h.db.set("ProfilePresets_v2_Main:100", [{ name: "Existing", timestamp: 6 }]);
    await h.api.loadPresets("main");
    h.failWrites();
    await assert.rejects(h.api.savePreset("Will fail", "main"), /disk full/);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100").length, 1);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].name, "Existing");
});

await test("Animated saved images retain their data when applied", async () => {
    const h = await harness();
    await h.api.loadPresetAsPending({ name: "Animated", timestamp: 7, avatarDataUrl: GIF, bannerDataUrl: GIF });
    assert.equal(h.pending().main.pendingAvatar.imageUri, GIF);
    assert.equal(h.pending().main.pendingBanner.imageUri, GIF);
});

await test("A saved display name style is restored when its profile is applied", async () => {
    const h = await harness();
    const style = { colors: [0xfedcba, 0x654321], effect_id: 4, font_id: 5 };
    await h.api.loadPresetAsPending({ name: "Styled", timestamp: 8, displayNameStyles: style });
    const pendingStyle = h.pending().main.pendingDisplayNameStyles;
    assert.deepEqual(Array.from(pendingStyle.colors), style.colors);
    assert.equal(pendingStyle.font_id, 5);
    assert.equal(pendingStyle.effect_id, 4);
});

await test("Save Profile captures pending camel-case styles including default IDs and all colours", async () => {
    const h = await harness();
    await h.api.loadPresets("main");
    const colors = [0x112233, 0x445566, 0x778899, 0xaabbcc];
    h.setPending({ main: { pendingDisplayNameStyles: { fontId: 0, effectId: 0, colors } } });
    await h.api.savePreset("Pending style", "main");
    const style = h.db.get("ProfilePresets_v2_Main:100")[0].displayNameStyles;
    assert.equal(style.font_id, 0);
    assert.equal(style.effect_id, 0);
    assert.deepEqual(style.colors, colors);
});

await test("A preset can save and apply an explicitly removed display name style", async () => {
    const h = await harness();
    await h.api.loadPresets("main");
    h.setPending({ main: { pendingDisplayNameStyles: null } });
    await h.api.savePreset("No style", "main");
    const preset = h.db.get("ProfilePresets_v2_Main:100")[0];
    assert.equal(preset.displayNameStyles, null);
    h.setPending({});
    await h.api.loadPresetAsPending(preset);
    assert.equal(h.pending().main.pendingDisplayNameStyles, null);
});

await test("Server profile saving retains the server's display name style", async () => {
    const h = await harness();
    await h.api.loadPresets("server");
    await h.api.savePreset("Server style", "server", "888");
    const style = h.db.get("ProfilePresets_v2_Server:100")[0].displayNameStyles;
    assert.equal(style.font_id, 0);
    assert.equal(style.effect_id, 0);
    assert.deepEqual(style.colors, [0x111111, 0x222222]);
});

await test("Server copy uses the refreshed display name style rather than a stale User record", async () => {
    const h = await harness();
    h.refreshUser({ displayNameStyles: { font_id: 7, effect_id: 9, colors: [0x010203] } });
    await h.api.copyMainProfileToServer("888");
    const style = h.pending()["888"].pendingDisplayNameStyles;
    assert.equal(style.font_id, 7);
    assert.equal(style.effect_id, 9);
    assert.deepEqual(Array.from(style.colors), [0x010203]);
});

await test("Server copy aborts before staging when the account or selected target changes", async () => {
    const h = await harness();
    h.refreshUser({ id: "200" });
    await assert.rejects(h.api.copyMainProfileToServer("888"), /account changed/);
    assert.equal(h.dispatches.filter(action => action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES").length, 0);
    await assert.rejects(h.api.copyMainProfileToServer("888", () => { throw new Error("target changed"); }), /target changed/);
});

await test("Server copy creates a banner override even when the server inherits that banner", async () => {
    const h = await harness();
    h.setBanner(GIF);
    await h.api.copyMainProfileToServer("888");
    assert.equal(h.pending()["888"].pendingBanner.imageUri, GIF);
});

await test("Server copy leaves pending data untouched when its image download fails", async () => {
    const h = await harness();
    h.setBanner("https://cdn.discordapp.com/banners/100/image.png");
    h.failImages();
    await assert.rejects(h.api.copyMainProfileToServer("888"), /download/);
    assert.equal(h.dispatches.filter(action => action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES").length, 0);
});

await mkdir(resultsDir, { recursive: true });
await writeFile(join(resultsDir, "regression.json"), JSON.stringify({
    passed: results.filter(result => result.passed).length,
    total: results.length,
    results
}, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
