# Profile Sets

Save, organise, import, export and load complete Discord profile presets from a dedicated **Profile Sets** page in Vencord Settings.

## Current compatibility

Verified on 8 August 2026 against:

- Discord Stable desktop shell `1.0.9251`
- Discord web build `589596` (`95c90b96b37873e9caa7c79cc841ba6246589efd`)
- Vencord `1.15.0`, commit `1a8c3b71bbfaeb195a7f402458b6b68b0ccea7ef`

The old plugin patched two components inside Discord's former profile-settings page. Discord's new three-column profile editor removed both patch anchors, so the component never mounted. This version registers a normal Vencord settings page instead. It has no patch against Discord's profile layout and therefore does not disappear when Discord renames or rearranges that layout.

## Saved fields

- Avatar and banner
- Bio and pronouns
- Main display name or server nickname
- Avatar decoration
- Nameplate
- Display-name style
- Profile effect
- Profile frame (new profile layout)
- Accent and profile theme colours
- Primary server tag
- Custom status for main profiles

Existing `ProfilePresets_v2_Main` and `ProfilePresets_v2_Server` data is reused; no preset migration is required.

## Use

1. Open **User Settings → Vencord Settings → Profile Sets**. You can also use the plugin's **Open Profile Sets** toolbox action.
2. Choose **Main Profile** or **Server Profile**. For a server profile, choose the server.
3. Enter a name and select **Save Profile**.
4. Select any saved profile to load it as Discord pending changes.
5. Select **Review Profile**, inspect it in Discord's new profile editor, and use Discord's **Save Changes** button.

Loading deliberately leaves profile fields as pending changes for review instead of submitting them automatically. Custom status is the exception because Discord stores it through a separate synced setting and may update it immediately. Avatar or banner presets use Discord's own image handling and may show its confirmation or entitlement UI when required.

## Install

Profile Sets is a custom Vencord plugin, so Vencord must be built from source.

1. Copy this complete folder to `src/userplugins/profileSets` in your Vencord checkout.
2. From the Vencord folder, run `pnpm install` if needed.
3. Run `pnpm build` and then `pnpm inject`.
4. Restart Discord and enable **ProfileSets** in Vencord's Plugins page.

Vencord's official custom-plugin guide is available at <https://docs.vencord.dev/installing/custom-plugins/>.

## Update resilience

The visible page uses Vencord's settings registration and standard Vencord components. The only Discord internals used are the profile stores and the existing `USER_PROFILE_SETTINGS_SET_PENDING_CHANGES` action. If Discord changes those data APIs in the future, the Profile Sets page will remain reachable and failures surface as an error toast instead of silently removing the entire UI.

See [TECHNICAL_NOTES.md](./TECHNICAL_NOTES.md) for the failure analysis, field mapping, compatibility boundaries and verification procedure.
