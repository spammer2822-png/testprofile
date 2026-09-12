# Profile Sets image fix

## What was fixed

Saved avatar and banner images that are stored as data URIs were being sent through Discord's `PROFILE_CUSTOMIZATION_OPEN_PREVIEW_MODAL` event. With the current Discord profile editor, that flow can render the animated image in the chooser/preview without putting it into `UserProfileSettingsStore`'s pending profile state. The other saved fields therefore changed while the avatar/banner stayed unchanged.

The fix removes that preview-modal dependency for preset loading. When a preset contains a data-URI avatar or banner, the plugin now places an image object directly into `pendingAvatar` / `pendingBanner` and dispatches `USER_PROFILE_SETTINGS_SET_PENDING_CHANGES`, which is the state used by Discord's current profile editor.

Animated data URIs are preserved as-is; no GIF-to-PNG conversion is performed.

## Installation

Copy the `ProfileSets` folder from this archive into:

`<Vencord checkout>\\src\\userplugins\\profileSets`

Then rebuild Vencord and inject it, and enable **ProfileSets** in Vencord settings.
