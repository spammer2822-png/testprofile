import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const require = createRequire(new URL("../.vencord/package.json", import.meta.url));
const { build } = require("esbuild");
const root = new URL("../", import.meta.url).pathname;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L68AAAAASUVORK5CYII=";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const clone = value => value == null ? value : structuredClone(value);

async function harness() {
    const db = new Map();
    const writes = [], dispatches = [], statuses = [], downloads = [];
    let user = { id: "100", globalName: "Main name", username: "test", avatar: null };
    let pending = {};
    let failWrite = false, failImage = false, dropDispatch = false, deferredWrite;
    const base = { bio: "Main bio", pronouns: "they/them", banner: null, accentColor: 123, themeColors: [0, 0xffffff] };
    const guildProfile = { bio: "Server bio", pronouns: "", banner: null };
    const member = { nick: "Server name", avatar: null };
    const mock = {
        DataStore: {
            get: async key => clone(db.get(key)),
            set: async (key, value) => {
                if (deferredWrite) { const wait = deferredWrite; deferredWrite = null; await wait; }
                if (failWrite) throw new Error("disk full");
                writes.push(key); db.set(key, clone(value));
            }
        },
        UserStore: { getCurrentUser: () => user },
        GuildMemberStore: { getMember: () => member },
        UserProfileStore: { getUserProfile: () => base, getGuildMemberProfile: () => guildProfile },
        IconUtils: { getUserAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png", getDefaultAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png" },
        Constants: { Endpoints: { USER_PROFILE: id => "/users/" + id + "/profile" } },
        RestAPI: { get: async () => ({ body: {} }) },
        FluxDispatcher: { dispatch: action => {
            dispatches.push(clone(action));
            if (!dropDispatch && action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES") {
                const { type, guildId, ...changes } = action;
                pending[guildId ?? "main"] = { ...pending[guildId ?? "main"], ...changes };
            }
        } },
        getUserSettingLazy: () => ({
            getSetting: () => ({ text: "current status", emojiId: "0", emojiName: "", expiresAtMs: "0" }),
            updateSetting: async status => { statuses.push(clone(status)); }
        }),
        findStoreLazy: () => ({ getPendingChanges: guild => pending[guild ?? "main"] ?? {} })
    };
    const bundle = await build({
        stdin: { contents: 'export * from "./ProfileSets/utils/schema"; export * from "./ProfileSets/utils/storage"; export * from "./ProfileSets/utils/actions"; export * from "./ProfileSets/utils/profile"; export * from "./ProfileSets/utils/images";', resolveDir: root, sourcefile: "test-entry.ts" },
        bundle: true, write: false, format: "cjs", platform: "node",
        plugins: [{
            name: "discord-test-adapter",
            setup(builder) {
                builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "test-adapter" }));
                builder.onLoad({ filter: /.*/, namespace: "test-adapter" }, () => ({
                    contents: Object.keys(mock).map(key => "export const " + key + " = globalThis.__mock." + key + ";").join("\n")
                }));
            }
        }]
    });
    const context = {
        exports: {}, module: { exports: {} }, __mock: mock, console, crypto: webcrypto, structuredClone, URL, Blob, File, AbortSignal,
        fetch: async url => {
            downloads.push(url);
            return { ok: !failImage, status: failImage ? 404 : 200, headers: new Headers(), blob: async () => new Blob([Buffer.from(PNG.split(",")[1], "base64")], { type: "image/png" }) };
        },
        FileReader: class {
            async readAsDataURL(blob) {
                this.result = "data:" + blob.type + ";base64," + Buffer.from(await blob.arrayBuffer()).toString("base64");
                this.onload?.();
            }
        }
    };
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    return {
        api: context.module.exports, db, writes, dispatches, statuses, downloads, base, guildProfile, member,
        switchUser: id => { user = { ...user, id }; },
        setPending: value => { pending = value; },
        pending: () => pending,
        failWrite: () => { failWrite = true; },
        failImage: () => { failImage = true; },
        dropDispatch: () => { dropDispatch = true; },
        pauseWrite: () => { let release; deferredWrite = new Promise(resolve => { release = resolve; }); return release; }
    };
}
const results = [];
async function test(name, fn) {
    try { await fn(); results.push({ name, passed: true }); console.log("PASS", name); }
    catch (error) { results.push({ name, passed: false, error: error.stack }); console.error("FAIL", name, error); }
}
await test("Draft creation deep-clones cosmetics and never stages Discord changes", async () => {
    const h = await harness(); await h.api.loadPresets("main");
    const source = { name: "Original", avatarDecoration: { asset: "asset", skuId: "123" } };
    const draft = h.api.newDraft(source); draft.name = "Draft"; draft.avatarDecoration.asset = "changed";
    await h.api.saveDraft(draft, h.api.getScope("main"));
    assert.equal(source.avatarDecoration.asset, "asset");
    assert.equal(h.api.getSnapshot().presets[0].name, "Draft");
    assert.equal(h.dispatches.length, 0); assert.equal(h.statuses.length, 0);
});
await test("Failed storage write preserves the existing collection and rejects", async () => {
    const h = await harness(); await h.api.loadPresets("main"); h.failWrite();
    await assert.rejects(h.api.saveDraft({ ...h.api.newDraft(), name: "Draft" }, h.api.getScope("main")), /disk full/);
    assert.equal(h.api.getSnapshot().presets.length, 0);
});
await test("Stale account cannot save into another account", async () => {
    const h = await harness(); await h.api.loadPresets("main"); const scope = h.api.getScope("main");
    h.switchUser("200");
    await assert.rejects(h.api.saveDraft({ ...h.api.newDraft(), name: "Draft" }, scope), /account/);
    assert.equal(h.writes.length, 0);
});
await test("Scope switch rejects a late draft save", async () => {
    const h = await harness(); await h.api.loadPresets("main"); const scope = h.api.getScope("main");
    await h.api.loadPresets("server");
    await assert.rejects(h.api.saveDraft({ ...h.api.newDraft(), name: "Draft" }, scope), /collection/);
});
await test("Concurrent additions are serialized without losing either profile", async () => {
    const h = await harness(); await h.api.loadPresets("main"); const scope = h.api.getScope("main");
    await Promise.all(["One", "Two"].map(name => h.api.saveDraft({ ...h.api.newDraft(), name }, scope)));
    assert.equal(h.api.getSnapshot().presets.length, 2);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100").length, 2);
});
await test("An in-flight write stays in its original collection across a scope switch", async () => {
    const h = await harness(); await h.api.loadPresets("main"); const scope = h.api.getScope("main");
    const release = h.pauseWrite();
    const save = h.api.saveDraft({ ...h.api.newDraft(), name: "Main draft" }, scope);
    await new Promise(resolve => setImmediate(resolve));
    const load = h.api.loadPresets("server");
    release(); await Promise.all([save, load]);
    assert.equal(h.db.get("ProfilePresets_v2_Main:100")[0].name, "Main draft");
    assert.equal(h.api.getSnapshot().presets.length, 0);
});
await test("Legacy migration retains its backup and assigns stable IDs", async () => {
    const h = await harness(); h.db.set("ProfileDataset:100:main", [{ name: "Old", timestamp: 1, avatarDataUrl: PNG }]);
    await h.api.loadPresets("main");
    assert.ok(h.api.getSnapshot().presets[0].id);
    assert.ok(h.db.has("ProfileDataset:100:main"));
});
await test("Corrupt storage blocks writes rather than replacing the collection", async () => {
    const h = await harness(); h.db.set("ProfilePresets_v2_Main:100", [{ name: "Broken", timestamp: "bad" }]);
    await h.api.loadPresets("main"); assert.ok(h.api.getSnapshot().error);
    assert.throws(() => h.api.getScope("main")); assert.equal(h.writes.length, 0);
});
await test("Copy main to server excludes main pending edits, status and primary server tag", async () => {
    const h = await harness();
    h.setPending({ main: { pendingBio: "Unsaved main bio", pendingGlobalName: "Unsaved name" } });
    await h.api.copyMainProfileToServer("999");
    const staged = h.dispatches.filter(action => action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES");
    assert.equal(staged.length, 1); assert.equal(staged[0].guildId, "999");
    assert.equal(staged[0].pendingBio, "Main bio"); assert.equal(staged[0].pendingNickname, "Main name");
    assert.equal("pendingPrimaryGuildId" in staged[0], false); assert.equal("pendingGlobalName" in staged[0], false);
    assert.equal(h.statuses.length, 0); assert.equal(h.pending().main.pendingBio, "Unsaved main bio");
});
await test("Animated avatar and banner remain image objects with original bytes", async () => {
    const h = await harness();
    await h.api.loadPresetAsPending({ name: "GIF", timestamp: 1, avatarDataUrl: GIF, bannerDataUrl: GIF });
    assert.equal(h.pending().main.pendingAvatar.imageUri, GIF); assert.equal(h.pending().main.pendingBanner.imageUri, GIF);
    assert.equal(h.pending().main.pendingAvatar.assetOrigin, "NEW_ASSET"); assert.equal(h.downloads.length, 0);
});
await test("Explicit null avatar/banner clears previous pending image edits", async () => {
    const h = await harness(); h.setPending({ main: { pendingAvatar: { imageUri: PNG }, pendingBanner: { imageUri: PNG } } });
    await h.api.loadPresetAsPending({ name: "Clear", timestamp: 1, avatarDataUrl: null, avatarRaw: null, bannerDataUrl: null });
    assert.equal(h.pending().main.pendingAvatar, null); assert.equal(h.pending().main.pendingBanner, null);
});
await test("Partial legacy presets do not erase unrelated fields", async () => {
    const h = await harness(); await h.api.loadPresetAsPending({ name: "Bio only", timestamp: 1, bio: "new" });
    assert.deepEqual(Object.keys(h.pending().main), ["pendingBio"]);
});
await test("Image failure aborts staging and preserves pending state", async () => {
    const h = await harness(); h.failImage();
    await assert.rejects(h.api.loadPresetAsPending({ name: "Fail", timestamp: 1, bio: "new", avatarDataUrl: "https://cdn.discordapp.com/avatars/100/hash.png" }), /404/);
    assert.equal(h.dispatches.length, 0); assert.equal(h.statuses.length, 0);
});
await test("Missing server fails rather than touching the main profile", async () => {
    const h = await harness();
    await assert.rejects(h.api.loadPresetAsPending({ name: "Server", timestamp: 1, bio: "new" }, undefined, { isGuildProfile: true }), /server/);
    assert.equal(h.dispatches.length, 0);
});
await test("Apply respects stale-view guards before staging", async () => {
    const h = await harness();
    await assert.rejects(h.api.loadPresetAsPending({ name: "Stale", timestamp: 1, bio: "new" }, undefined, { guard: () => { throw new Error("view changed"); } }), /view changed/);
    assert.equal(h.dispatches.length, 0);
});
await test("A Discord action shape change surfaces an error", async () => {
    const h = await harness(); h.dropDispatch();
    await assert.rejects(h.api.loadPresetAsPending({ name: "Mismatch", timestamp: 1, bio: "new" }), /did not accept/);
});
await test("Status changes only on explicit main-profile apply", async () => {
    const h = await harness(); const preset = { name: "Status", timestamp: 1, customStatus: { text: "new" } };
    await h.api.loadPresetAsPending(preset, "999", { isGuildProfile: true }); assert.equal(h.statuses.length, 0);
    await h.api.loadPresetAsPending(preset); assert.equal(h.statuses.length, 1);
});
await test("Imports reject unsafe images and malformed nested fields", async () => {
    const h = await harness();
    for (const patch of [{ avatarDataUrl: "javascript:alert(1)" }, { avatarDataUrl: "https://example.com/image.png" }, { themeColors: ["red", 1] }, { profileEffect: "broken" }, { customStatus: { text: [] } }, { displayNameStyles: { colors: "bad" } }]) {
        assert.throws(() => h.api.normalisePresets([{ name: "Bad", timestamp: 1, ...patch }]));
    }
});
await test("Import merge handles duplicate IDs; cancelling leaves data unchanged", async () => {
    const h = await harness(); await h.api.loadPresets("main"); const scope = h.api.getScope("main");
    await h.api.saveDraft({ ...h.api.newDraft(), name: "Existing" }, scope);
    const original = h.api.getSnapshot().presets[0];
    const file = new File([JSON.stringify([original])], "profiles.json");
    assert.equal(await h.api.importPresets(file, scope, async () => "cancel"), 0);
    assert.equal(h.api.getSnapshot().presets.length, 1);
    await h.api.importPresets(file, scope, async () => "merge");
    assert.equal(new Set(h.api.getSnapshot().presets.map(p => p.id)).size, 2);
});
await test("Image cache deduplicates concurrent downloads and rejects non-images", async () => {
    const h = await harness(); const url = "https://cdn.discordapp.com/avatars/100/hash.png";
    await Promise.all([h.api.imageUrlToBase64(url), h.api.imageUrlToBase64(url)]);
    await h.api.imageUrlToBase64(url); assert.equal(h.downloads.length, 1);
    await assert.rejects(h.api.fileToImageData(new Blob(["<html>not an image</html>"])), /PNG/);
});
await test("Saving a pending avatar removal preserves null despite inherited preview", async () => {
    const h = await harness(); h.setPending({ "999": { pendingAvatar: null, pendingBanner: null } });
    const profile = await h.api.getCurrentProfile("999", { isGuildProfile: true });
    assert.equal(profile.avatarRaw, null); assert.equal(profile.bannerDataUrl, null);
});
await mkdir("test-results", { recursive: true });
await writeFile("test-results/regression.json", JSON.stringify({ passed: results.filter(r => r.passed).length, total: results.length, results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
