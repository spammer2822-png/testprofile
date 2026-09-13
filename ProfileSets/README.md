# Profile Sets

This is the original ProfileSets interface with one added control: **Copy Main Profile to Server**.

There is no Add New Profile screen or replacement layout. Saving, searching, importing, exporting, renaming, moving and applying profiles work through the original controls.

## Recovering existing saved profiles

The previous test build could show **0 saved profiles** when one older saved image did not match its new strict validator. That error hid the entire collection from the page. It did not intentionally delete the collection.

This build removes that whole-collection validator and reads the original storage locations:

- `ProfilePresets_v2_Main:<account id>`
- `ProfilePresets_v2_Server:<account id>`
- the older unscoped `ProfilePresets_v2_Main` / `ProfilePresets_v2_Server` backups
- `ProfileDataset:<account id>:main` and `ProfileDataset`

The account-specific collection is read unchanged, including its older image values. If its key is missing, ProfileSets can recover an older backup; backup keys are kept instead of deleted. An intentionally empty collection stays empty. An unscoped backup is associated with the first account that recovers it.

Install this build and open **User Settings → Vencord Settings → Profile Sets**. Your earlier profiles should return automatically if their data is still in Vencord's DataStore. Export them once they appear so you also have a separate JSON backup.

## Copy main profile to a server

1. Select **Server Profile**.
2. Choose the server.
3. Select **Copy Main Profile to Server**.
4. Select **Review Profile**, check the pending changes, then use Discord's **Save Changes** button.

The operation reads the saved main profile from Discord, including its display-name font, effect and colours, while ignoring unsaved main-profile edits. It stages the layout only for the selected server. It does not change the main pending profile, custom status, primary-server tag or the saved-profile collection.

## Installation on Windows

1. Extract the ZIP. Its only top-level item is `ProfileSets/`.
2. Move the entire previous `src\userplugins\profileSets` folder to a backup location outside `src\userplugins`, then put the extracted folder at `src\userplugins\profileSets`. Replace the folder as a whole: merging files would leave the removed draft editor behind and can break the build. `index.tsx` must be directly inside the replacement folder. Do not clear Discord/Vencord's application data; the saved profiles live there, separately from these plugin files.
3. Open CMD and run:

```bat
cd /d "%APPDATA%\Vencord\Vencord"
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

4. Restart Discord and enable **ProfileSets** in Vencord's Plugins page.

If Vencord is installed elsewhere, replace the first path. See Vencord's [custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/).

## Verification

The package is tested from an extracted ZIP against Vencord 1.15.5 commit `0850f37fbb1623aa6330764d8f4b1e0b2617dcdf`. Tests cover storage recovery, display-name-style saving/applying/copying, existing save/apply behavior, server-copy isolation, the original desktop/mobile layout, TypeScript, desktop/web builds, current logged-out Discord profile modules, archive paths, CRC and checksums.

Generated reports and screenshots are inside `test-results/`. Details and test limits are in [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md).
