# ProfileSets

Save, create and load Discord profile presets from **User Settings → Vencord Settings → Profile Sets**.

## What changed

- **Add New Profile** opens a separate draft. Set its name, images, text and colours, then save it. Your active profile and Discord's pending edits are unchanged. Apply the saved profile separately later.
- **Copy Main Profile to Server** appears under Server Profile. Choose the server and click the button. It copies the current main layout into that server's pending changes. Use **Review Profile**, then Discord's **Save Changes**.
- **Edit Saved Profile** is available from a saved profile's three-dot menu. It edits the stored preset without applying it.
- The original compact avatar/name rows, simple controls and five profiles per page are retained. Search, random selection, rename, move, update and import/export are supported.

Copying excludes unsaved main edits, custom status and the main server tag. Main display name maps to server nickname. Discord still checks Nitro, permissions and access to cosmetics.

Applying a main preset's **custom status updates it immediately**, as in the original plugin. The other fields stay pending until you use Discord's Save Changes. Saving or editing a draft never updates the status.

## Installation — existing Vencord source checkout

1. Extract the ZIP. Its only top-level entry is **ProfileSets/**.
2. Replace the old plugin folder with this complete folder at **src/userplugins/profileSets** in your Vencord checkout. Keep one copy of the plugin. The folder must directly contain **index.tsx**; avoid nesting ProfileSets inside another profileSets folder.
3. Open CMD in your Vencord source checkout and run:

```bat
cd /d "%APPDATA%\Vencord\Vencord"
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

4. Restart Discord and enable **ProfileSets** under Vencord Plugins.

If your Vencord checkout is elsewhere, use that path in the first command. This ZIP is a custom plugin's source code; it needs a Vencord source build. See the [official installation guide](https://docs.vencord.dev/installing/custom-plugins/).

Existing saved presets use the same per-account storage keys. Updating the plugin files does not delete them.

## Folder contents

- **index.tsx**, **components/**, **utils/**, **styles.css** — the plugin.
- **dev-tools/** — regression/browser tests, the packaging checker and the CI workflow template.
- **test-results/** — generated verification results and screenshots in the final tested distribution.
- **MANIFEST.sha256** — checksums for the files in the archive.
- **LICENSE**, **FIX_NOTES.md**, **TECHNICAL_NOTES.md** — licence and supporting notes.

The test tools are separate from the runtime module imports. You do not need to run them to use the plugin.

## Verification

The release workflow creates a ZIP, extracts it, then runs regression and browser checks using that extracted code. It copies the extracted folder into Vencord for desktop/web builds and full TypeScript checking. The final ZIP is then extracted again and every file is compared byte-for-byte, with runtime import and local documentation links checked.

Vencord is pinned to **1.15.5**, commit **0850f37fbb1623aa6330764d8f4b1e0b2617dcdf**. The Discord Stable probe records the live web build hash. See the included test-results for the run's actual results.

Browser tests use the real plugin components with mocked Discord services and a test modal shell. The live Discord probe inspects modules while logged out. Authenticated profile submission, account-specific entitlements and every Discord experiment still require a real account check.

See [technical notes](TECHNICAL_NOTES.md) for details and test commands.
