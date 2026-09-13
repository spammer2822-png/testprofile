/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { HeadingPrimary } from "@components/Heading";
import { SettingsTab, wrapTab } from "@components/settings";
import { Guild } from "@vencord/discord-types";
import { filters, mapMangledModule } from "@webpack";
import {
    FluxDispatcher,
    GuildStore,
    React,
    SearchableSelect,
    SelectedGuildStore,
    SettingsRouter,
    useStateFromStores
} from "@webpack/common";

import { cl } from "../index";
import { PresetSection } from "../utils/storage";
import { PresetManager } from "./presetManager";

type UseOpenProfileSettings = (options?: { guild?: Guild; }) => () => void;

// Discord currently uses this hook to choose between the new self-profile modal
// and the profile_panel route. It is optional so losing the helper only affects
// the shortcut, never registration or rendering of the Profile Sets page.
function resolveOpenProfileSettingsHook(): UseOpenProfileSettings | null {
    try {
        return mapMangledModule(
            ['"useOpenProfileSettings"', "openUserProfileModal", "openUserSettings"],
            {
                useOpenProfileSettings: filters.byCode(
                    '"useOpenProfileSettings"',
                    "openUserProfileModal",
                    "openUserSettings"
                )
            }
        ).useOpenProfileSettings ?? null;
    } catch (error) {
        console.warn("[ProfileSets] Discord's profile-opening helper was not found; using the settings route.", error);
        return null;
    }
}

const useOpenProfileSettings = resolveOpenProfileSettingsHook();

function ProfileSetsTab() {
    const [section, setSection] = React.useState<PresetSection>("main");
    const guilds = useStateFromStores([GuildStore], () => GuildStore.getGuildsArray());
    const lastSelectedGuildId = useStateFromStores(
        [SelectedGuildStore],
        () => SelectedGuildStore.getLastSelectedGuildId() ?? SelectedGuildStore.getGuildId()
    );

    const guildOptions = React.useMemo(
        () => guilds
            .map(guild => ({ label: guild.name, value: guild.id }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        [guilds]
    );

    const [guildId, setGuildId] = React.useState<string | undefined>(
        lastSelectedGuildId ?? guildOptions[0]?.value
    );

    React.useEffect(() => {
        if (guildOptions.some(option => option.value === guildId)) return;
        setGuildId(lastSelectedGuildId ?? guildOptions[0]?.value);
    }, [guildId, guildOptions, lastSelectedGuildId]);

    const selectedGuild = section === "server" && guildId
        ? GuildStore.getGuild(guildId)
        : undefined;
    const openWithDiscord = useOpenProfileSettings?.({ guild: selectedGuild });

    const openProfileEditor = React.useCallback(() => {
        if (openWithDiscord) {
            openWithDiscord();
            return;
        }

        FluxDispatcher.dispatch({
            type: "USER_PROFILE_SETTINGS_SET_GUILD",
            guildId: section === "server" ? guildId : undefined
        });
        SettingsRouter.openUserSettings("profile_panel");
    }, [guildId, openWithDiscord, section]);

    return (
        <SettingsTab>
            <div className={cl("tab-header")}>
                <div>
                    <HeadingPrimary className={cl("tab-heading")}>Profile Sets</HeadingPrimary>
                    <p className={cl("tab-description")}>
                        Save a complete profile, load it as pending changes, then review it in Discord&apos;s profile editor.
                    </p>
                </div>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={openProfileEditor}
                    disabled={section === "server" && !guildId}
                >
                    Open Profile Editor
                </Button>
            </div>

            <div className={cl("scope-card")}>
                <div className={cl("section-switch")} role="group" aria-label="Profile type">
                    <Button
                        size="small"
                        variant={section === "main" ? "primary" : "secondary"}
                        aria-pressed={section === "main"}
                        onClick={() => setSection("main")}
                    >
                        Main Profile
                    </Button>
                    <Button
                        size="small"
                        variant={section === "server" ? "primary" : "secondary"}
                        aria-pressed={section === "server"}
                        onClick={() => setSection("server")}
                    >
                        Server Profile
                    </Button>
                </div>

                {section === "server" && (
                    <div className={cl("guild-picker")}>
                        <label className={cl("field-label")}>Server</label>
                        <SearchableSelect
                            options={guildOptions}
                            value={guildId}
                            placeholder="Select a server"
                            clearable={false}
                            closeOnSelect={true}
                            onChange={value => {
                                if (typeof value === "string") setGuildId(value);
                            }}
                        />
                    </div>
                )}
            </div>

            {section === "server" && !guildId ? (
                <div className={cl("empty-state")}>
                    You are not currently in a server that can use a server profile.
                </div>
            ) : (
                <PresetManager
                    section={section}
                    guildId={section === "server" ? guildId : undefined}
                    onOpenProfileEditor={openProfileEditor}
                />
            )}
        </SettingsTab>
    );
}

export default wrapTab(ProfileSetsTab, "Profile Sets");
