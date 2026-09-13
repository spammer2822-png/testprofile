# Changes and fixes

- Added Copy Main Profile to Server and isolated Add New Profile / Edit Saved Profile.
- Kept the original compact list style and five profiles per page; simplified the earlier redesign.
- Added the UserSettingsAPI dependency required by current Vencord.
- Fixed failed storage writes reporting success, lost concurrent writes and stale account/collection operations.
- Preserved avatar/banner removals, GIF bytes and profile effect IDs even when metadata is incomplete.
- Rejected failed/non-image downloads before staging profile changes.
- Added parallel image loading, bounded caching, persistent search and lazy thumbnails.
- Fixed keyboard menu activation accidentally applying a preset.
- Validated imports, handled cancellation and assigned unique preset IDs.
- Retained legacy backups while preventing unscoped data migration into multiple accounts.
- Moved development files, references and generated results inside the single ProfileSets package.
- Added archive creation, extraction, byte-comparison, path and manifest checks.

See README.md for installation and TECHNICAL_NOTES.md for test coverage and limits.
