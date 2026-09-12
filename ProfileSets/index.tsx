/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ImageIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { classNameFactory } from "@utils/css";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { loadPresets } from "./utils/storage";

export const cl = classNameFactory("vc-profile-presets-");
const SETTINGS_ENTRY_KEY = "profile_sets";

export const settings = definePluginSettings({
    avatarSize: {
        type: OptionType.SLIDER,
        description: "Avatar size in preset list.",
        markers: [56, 64, 72, 80, 88, 96],
        default: 56,
        stickToMarkers: true
    },
    useBasePresetsForServerProfiles: {
        type: OptionType.BOOLEAN,
        description: "Show your main saved profiles in server profiles too.",
        default: false
    }
});

export default definePlugin({
    name: "ProfileSets",
    description: "Save, organise and load complete main and server profile presets.",
    tags: ["Appearance", "Customisation", "Utility"],
    authors: [
        { name: "omaw", id: 1155026301791514655n },
        { name: "justjxke", id: 852558183087472640n }
    ],
    settings,

    toolboxActions: {
        "Open Profile Sets": () => {
            SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`);
        }
    },

    start() {
        void loadPresets("main");

        if (!SettingsPlugin.customEntries.some(entry => entry.key === SETTINGS_ENTRY_KEY)) {
            SettingsPlugin.customEntries.push({
                key: SETTINGS_ENTRY_KEY,
                title: "Profile Sets",
                Component: require("./components/profileSetsTab").default,
                Icon: ImageIcon
            });
        }
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === SETTINGS_ENTRY_KEY);
    }
});
