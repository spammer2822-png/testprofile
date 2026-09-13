# Technical notes

## Scope

All runtime layout and interaction files were restored from the repository's initial upload, commit `33699a0d219e2566bb714b09233c988d1ac39323`. The only new interface control is **Copy Main Profile to Server** in the original server-profile button row. The draft editor, Add New Profile flow, replacement card layout and strict schema validator were removed.

The `UserSettingsAPI` dependency declaration remains because the original profile module imports that Vencord API.

## Saved-profile recovery

The rejected-image message in the replacement design came from validating every saved preset while loading the collection. One unsupported historic image string caused loading to fail before the page could display any preset. The storage key used by both builds was `ProfilePresets_v2_Main:<account id>`, so the error normally hid the array rather than deleting it.

Loading image values is permissive again, as it was in the original build. It searches old scoped and unscoped keys only when the current account key is missing. A recovered array is copied into that key, and source backup keys are retained. Existing arrays, including intentionally empty ones, take priority. Ownership markers prevent an unscoped backup from being copied into multiple accounts. Unreadable non-array data blocks writes rather than being replaced.

The plugin cannot reconstruct data that was manually deleted from every DataStore key, but it does not overwrite a non-empty current collection during recovery.

## Server copy

The button fetches the current main Discord profile without including unsaved main pending changes. It reuses the original pending-profile application path with the selected guild ID, so main display name becomes the server nickname and the layout remains reviewable in Discord before saving.

Server copy does not write ProfileSets storage. Main pending changes, custom status and primary-server tag are not dispatched to the server. Display-name style is preserved as its font ID, effect ID and complete colour array. Avatar/banner data uses Discord's current `NEW_ASSET` pending-image object format already present in the original fixed build.

## Compatibility and tests

The automated workflow uses Node.js 24 and Vencord 1.15.5 at commit `0850f37fbb1623aa6330764d8f4b1e0b2617dcdf`. It packages and extracts the complete `ProfileSets/` directory before running:

- twenty regression tests for recovery, storage preservation, display-name-style saving/applying/copying, fresh profile reads, original save/apply behavior and server-copy isolation;
- five Chrome scenarios using the real original plugin components with mocked Discord services;
- full Vencord TypeScript checking and desktop/web builds;
- a logged-out Discord Stable inspection for `UserProfileSettingsStore`, the pending-change action and required profile fields;
- a second extraction with CRC, manifest, path, import and documentation-link checks.

Browser tests cannot submit an authenticated Discord account's final Save Changes request or prove Nitro/cosmetic entitlements. Review the pending result once in Discord before committing it, especially when a profile contains premium cosmetics.

## Local verification

From the extracted `ProfileSets` folder:

```bat
set "PROFILESETS_VENCORD_DIR=C:\path\to\Vencord"
set "CHROMIUM_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
npm ci --prefix dev-tools\ui --ignore-scripts
node dev-tools\test.mjs
node dev-tools\ui\check.mjs
```

From its parent folder, create and extract-check the package with:

```bat
python ProfileSets\dev-tools\package.py --output ProfileSets.zip --extract-dir extracted-check
```

`dev-tools/verify.yml` is the workflow template. `MANIFEST.sha256` in the final ZIP covers every packaged file except the manifest itself.
