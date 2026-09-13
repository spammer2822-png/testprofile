# Technical notes

## Repository recovery and design

The initial upload was commit 33699a0d219e2566bb714b09233c988d1ac39323. The earlier feature work reached f1e5a430c2c2a8cde6269cbeabccc74d2174c5cf. The later d8d5b26 and ad7fa10 commits changed only the browser test script. The closed pull request was not merged; main still matched the initial upload when checked.

The final work uses the existing feature implementation and restores a compact interface similar to the original: avatar/name rows, ordinary buttons, five profiles per page and a separate simple draft form. It removes the larger banner cards and decorative profile-preview panel.

## Vencord and Discord integration

Vencord 1.15.5, commit 0850f37fbb1623aa6330764d8f4b1e0b2617dcdf, was the current upstream main when checked on 13 September 2026.

The plugin registers its page using Settings.customEntries. It does not patch Discord's profile layout. The optional profile-opening hook falls back to profile_panel. UserSettingsAPI is now declared as a dependency, as its current implementation requires.

Saved avatars and banners are resolved before any changes are staged. Uploads retain their imageUri and NEW_ASSET object shape. The pending-change dispatch is checked against UserProfileSettingsStore afterwards; a changed/unhandled action produces an error instead of silently reporting success.

The Discord probe inspects UserProfileSettingsStore.getPendingChanges, USER_PROFILE_SETTINGS_SET_PENDING_CHANGES, and avatar/banner/bio/pronouns/nickname/global-name fields in current Stable modules. The result includes the live build hash and timestamp. No account credentials are used.

## Feature boundaries

The draft editor starts blank. Start from Current Profile copies the current view including pending edits into the separate draft. Saving and editing call only preset storage, never the apply function. It edits uploaded avatar/banner images, name, bio, pronouns, status text, accent and theme colours. Existing cosmetics can be captured, retained or removed; it does not add a separate cosmetics shop/browser.

Copy Main Profile to Server fetches a fresh main snapshot with includePending:false and targets the selected guildId. It excludes main-only status and primaryGuildId and maps display name to nickname. The operation prepares pending changes for Discord's native Save Changes. It never submits an authenticated profile modification directly.

Applying a main preset retains the original immediate custom-status behaviour. The UI states this. Discord's permissions, Nitro and collectible ownership checks remain in force.

## Reliability and performance

- Per-account ProfilePresets_v2_Main and ProfilePresets_v2_Server keys are preserved. Server presets are a reusable collection, as in the original plugin. The optional main collection on servers is preserved.
- Storage writes are serialized; the UI publishes a new immutable collection only after a successful write. Scope generations and account checks reject stale asynchronous operations. Already-started writes finish under their original key.
- Legacy backups are retained. An ownership marker prevents an unscoped legacy backup from being copied into multiple accounts. Invalid data produces a visible error and blocks replacement writes.
- File imports validate fields, images and IDs. Image inputs support PNG/JPEG/GIF/WebP and trusted Discord CDN URLs. Upload signatures are checked; HTTP and read errors reject the operation.
- Avatar/banner downloads run concurrently and in-flight requests are deduplicated. A bounded 24 MiB character-budget cache lasts five minutes. Applying skips downloads of existing target images. GIF data remains animated.
- Explicit null avatar/banner values continue to mean removal/inheritance. Failed downloads cannot silently become null images.
- Five profiles are rendered per page, with lazy image loading and memoised search/ID lookup. Keyboard actions do not bubble into Apply. Inputs/buttons have labels and focus states.
- Maximum image size is 10 MiB, import size 64 MiB and collection size 500 presets.

## Reproduce checks

Requires Node.js 24, Python 3.10+, Chrome, a Vencord source checkout with its dependencies installed, and the UI test dependencies. All project test scripts are under dev-tools.

From this extracted ProfileSets folder in CMD:

```bat
set "PROFILESETS_VENCORD_DIR=C:\path\to\Vencord"
set "CHROMIUM_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
npm ci --prefix dev-tools\ui --ignore-scripts
node dev-tools\test.mjs
node dev-tools\ui\check.mjs
```

PROFILESETS_UI_PACKAGE can point to an existing dev-tools/ui/package.json when testing another extracted copy. PROFILESETS_TEST_OUTPUT optionally changes the result destination; by default results stay inside ProfileSets/test-results. Node file URL conversions use fileURLToPath for Windows compatibility.

To create and verify an archive from the parent of ProfileSets:

```bat
python ProfileSets\dev-tools\package.py --output ProfileSets.zip --extract-dir extracted-check
```

The extraction directory must be new or empty. The script checks the single top-level folder, required files, runtime relative imports, documentation links, CRC, filename case collisions, path traversal and exact extracted bytes. Generated MANIFEST.sha256 lists every packaged file except itself. node_modules, git metadata, Python caches and ZIPs are excluded.

The included dev-tools/verify.yml is the GitHub Actions workflow template. In the repository it also lives at .github/workflows/verify.yml, the location GitHub requires. The final archive places that copy inside ProfileSets/dev-tools only.

## Test limits

Regression tests exercise actual bundled modules with mocked Discord boundaries. Browser tests render actual plugin components in Chrome with mocked Discord services and a test modal shell. Source from the extracted ZIP is installed into pinned Vencord for full desktop/web builds and TypeScript checking. A logged-out live Discord module check supplements these tests.

These checks cannot prove authenticated Save Changes, premium entitlements or rendering under every account-specific Discord rollout. On a real account, verify image previews/final saved GIFs, main/server Review Profile routes, server-copy isolation and normal Discord entitlement errors. Creating or editing drafts should leave both the active profile and existing pending edits untouched.
