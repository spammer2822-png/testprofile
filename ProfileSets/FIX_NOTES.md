# ProfileSets recovery and server-copy fix

- Restored the original interface, components, spacing, saved-profile rows and controls.
- Removed Add New Profile, its draft editor, the replacement card layout and the strict image validator.
- Restored permissive loading so one older image value cannot hide the whole saved collection.
- Added fallback recovery from original scoped and unscoped storage keys without deleting backups.
- Added one small **Copy Main Profile to Server** button to the original server-profile controls.
- Kept the current avatar/banner pending-state fix and Vencord API dependency declaration.

See [README.md](README.md) for installation and recovery steps.
