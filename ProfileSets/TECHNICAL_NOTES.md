# Profile Sets technical notes

## Verified baseline

This revision was analysed and built on 8 August 2026 against the following live/current versions.

| Component | Verified version |
| --- | --- |
| Discord Stable desktop shell | `1.0.9251` |
| Discord web application | build `589596`, hash `95c90b96b37873e9caa7c79cc841ba6246589efd` |
| Vencord | `1.15.0`, commit `1a8c3b71bbfaeb195a7f402458b6b68b0ccea7ef` |
| Original ProfileSets repository | commit `8c1f75af7b19a9fb81ff078a0b3ce965eb2d1e2b` |

References:

- [Vencord source at the verified commit](https://github.com/Vendicated/Vencord/commit/1a8c3b71bbfaeb195a7f402458b6b68b0ccea7ef)
- [Vencord custom-plugin installation guide](https://docs.vencord.dev/installing/custom-plugins/)
- [Original ProfileSets repository](https://github.com/Eazvy/ProfileSets)
- [Equicord's move of ProfileSets to a settings tab](https://github.com/Equicord/Equicord/commit/7e126aa1c2864e26ac9922896e38d3e92229367a)
- [Discord web application](https://discord.com/app)
- [Discord Stable desktop installer endpoint](https://discord.com/api/downloads/distributions/app/installers/latest?channel=stable&platform=win&arch=x64)

## Why the old integration failed

The previous plugin injected `PresetManager` into Discord's profile page with two regular-expression patches. Their anchors were:

- `DefaultCustomizationSections: user cannot be undefined`
- `profilePreviewTitle`

Neither string exists in the verified Discord bundle. The new profile editor is also a substantially different three-column interface, so changing only a CSS selector would not repair the mount point. When either patch failed, Discord simply never rendered the plugin's controls.

## New integration architecture

The plugin now registers `profile_sets` through Vencord's `SettingsPlugin.customEntries` API and exposes the same page through a Vencord toolbox action. This removes all patches against Discord's profile-editor component tree.

The page provides an explicit Main Profile / Server Profile scope and guild picker. Loading a preset writes Discord's existing pending-profile state. `Review Profile` uses Discord's own `useOpenProfileSettings` chooser when it is available, so users in the new rollout get the self-profile modal shown by Discord while other users get `profile_panel`. A direct `profile_panel` route remains as the fallback. Discord therefore owns the current preview, validation and final Save Changes action.

This separation is deliberate:

1. Vencord owns discovery and rendering of the Profile Sets manager.
2. The plugin owns preset storage, validation and field translation.
3. Discord owns previewing and submitting the final profile update.

## Field mapping

| Stored preset field | Discord pending/native target |
| --- | --- |
| `avatarDataUrl` + `avatarRaw` | Native avatar image handling, or `pendingAvatar: null` for an inherited/default avatar |
| `bannerDataUrl` | Native banner image-preview flow or `pendingBanner` for a cleared value |
| `bio` | `pendingBio` |
| `pronouns` | `pendingPronouns` |
| `globalName` | `pendingGlobalName` or `pendingNickname` for a server profile |
| `avatarDecoration` | `pendingAvatarDecoration` |
| `profileEffect` | `pendingProfileEffect` |
| `profileFrame` | `pendingProfileFrame` |
| `nameplate` | `pendingNameplate` |
| `displayNameStyles` | `pendingDisplayNameStyles` |
| `accentColor` | `pendingAccentColor` |
| `themeColors` | `pendingThemeColors` |
| `primaryGuildId` | `pendingPrimaryGuildId` |
| `customStatus` | Discord's custom-status user setting |

Non-image profile changes are sent in one `USER_PROFILE_SETTINGS_SET_PENDING_CHANGES` dispatch. Explicit `null` values are preserved so a preset can remove an equipped collectible, style, colour, server tag or other optional value rather than accidentally retaining the current one. Custom status remains separate because Discord manages it through its synced custom-status user setting; it may therefore update as soon as a preset is loaded.

## Data and failure handling

- Existing `ProfilePresets_v2_Main` and `ProfilePresets_v2_Server` keys are retained.
- Async storage loads use a generation guard so a slower previous scope cannot overwrite a newly selected scope.
- Imports require an array of objects with a non-empty string `name` and finite numeric `timestamp` before storage is changed.
- Profile reads fetch missing global or guild profile data before creating a snapshot.
- Applying and saving are guarded against duplicate interaction and surface failures as Discord toasts.
- The interface uses Discord theme tokens, responsive layout, focus-visible states and reduced-motion handling.

## Compatibility boundary

No client mod can guarantee compatibility with every unannounced Discord change. This version removes the most fragile dependency: component-source regexes tied to a particular profile layout. A future change to Discord's pending-profile store/action names could require an update to `utils/profile.ts`, but the Profile Sets page itself will remain registered and reachable.

When updating, first verify that the following still exist in Discord's bundle:

- `USER_PROFILE_SETTINGS_SET_PENDING_CHANGES`
- `PROFILE_CUSTOMIZATION_OPEN_PREVIEW_MODAL`
- `UserProfileSettingsStore.getPendingChanges`
- either Discord's `useOpenProfileSettings` helper or the `profile_panel` settings route

## Verification

With this folder copied to `src/userplugins/profileSets` in the verified Vencord checkout, the following commands complete without errors:

```sh
pnpm buildStandalone
pnpm buildReporterDesktop
pnpm testTsc
pnpm eslint src/userplugins/profileSets
pnpm stylelint src/userplugins/profileSets/styles.css
```
