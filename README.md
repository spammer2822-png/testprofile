# Profile Sets

A custom Vencord plugin for saved main and server profiles.

- **Add New Profile:** build a draft with its own avatar, banner, bio, pronouns, name, colours and status. Save it without changing the active profile.
- **Copy Main Profile to Server:** open Server Profile, select the server and click Copy Main Profile to Server. Review the pending layout and use Discord's Save Changes.
- **Edit Saved Profile:** change a saved layout directly from its actions menu.
- Save Current, import/export, search, random selection and reordering are available in each collection.

Copying uses the current main profile, excluding unsaved main edits. Main-only status and primary server tag are excluded from server copies. Main display name maps to server nickname. Nitro, server permissions and collectible ownership remain subject to Discord's checks.

## Install on Windows

Copy the complete **ProfileSets** folder into your Vencord source checkout as **src/userplugins/profileSets**. Replace the previous copy; keep only one copy of this plugin.

In CMD, from your existing source checkout:

```bat
cd /d "%APPDATA%\Vencord\Vencord"
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Restart Discord, enable **ProfileSets**, then open **User Settings → Vencord Settings → Profile Sets**.

This is plugin source, so it must be built with Vencord. See the [official custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/).

## Behaviour and verification

Creating or editing a saved profile only writes local preset storage. Applying a profile stages its layout for review in Discord. Applying a main profile's saved custom status updates that status immediately, as in the original plugin.

The workflow builds desktop and web targets against Vencord **1.15.5**, commit **0850f37fbb1623aa6330764d8f4b1e0b2617dcdf**, and runs TypeScript plus regression tests. It also inspects Discord Stable's logged-out profile modules. The downloadable build artifact includes test results.

Authenticated saves, Nitro checks and visual rendering inside your particular Discord rollout still need a real account test; a build or logged-out module probe cannot prove those.

Existing per-account main/server storage keys are preserved. Server presets remain a reusable collection, as in the original plugin. The setting to reuse the main collection on servers is preserved. JSON exports remain arrays.

See [technical notes](ProfileSets/TECHNICAL_NOTES.md) for details.
