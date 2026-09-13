/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { ProfilePreset } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

const logger = new Logger("ProfilePresets");
const LEGACY_PRESETS_KEY = "ProfileDataset";
const MAIN_PRESETS_KEY = "ProfilePresets_v2_Main";
const SERVER_PRESETS_KEY = "ProfilePresets_v2_Server";

export type PresetSection = "main" | "server";

export type ProfileFrameLike = {
    skuId: string;
    label?: string;
    layers?: unknown[];
    [key: string]: unknown;
};

export type ProfilePresetEx = Omit<ProfilePreset, "profileFrame"> & {
    avatarRaw?: string | null;
    profileFrame?: ProfileFrameLike | null;
};

export let presets: ProfilePresetEx[] = [];
export let currentPresetIndex = -1;
export let loadError: string | null = null;
let activeScopeKey: string | null = null;
let loadGeneration = 0;

function resetPresets(nextPresets: ProfilePresetEx[] = []) {
    presets = nextPresets;
    currentPresetIndex = -1;
}

function getPresetsKey(section: PresetSection, userId: string) {
    const baseKey = section === "main" ? MAIN_PRESETS_KEY : SERVER_PRESETS_KEY;
    return `${baseKey}:${userId}`;
}

function getLegacyKey(userId: string) {
    return `${LEGACY_PRESETS_KEY}:${userId}:main`;
}

export async function loadPresets(section: PresetSection) {
    const generation = ++loadGeneration;
    activeScopeKey = null;
    loadError = null;
    resetPresets();

    try {
        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) {
            if (generation === loadGeneration) {
                activeScopeKey = null;
                resetPresets();
            }
            return;
        }

        const userId = currentUser.id;
        const key = getPresetsKey(section, userId);
        const stored = await DataStore.get(key);
        if (generation !== loadGeneration || UserStore.getCurrentUser()?.id !== userId) return;
        if (stored != null) {
            if (!Array.isArray(stored)) throw new Error("Could not read saved profiles. Your stored data has been left untouched.");
            // Image formats from older releases must not hide the collection.
            // An existing empty array is intentional and must also be respected.
            resetPresets([...stored]);
            activeScopeKey = key;
            return;
        }

        const baseKey = section === "main" ? MAIN_PRESETS_KEY : SERVER_PRESETS_KEY;
        const candidates = [
            ...(section === "main" ? [{ key: getLegacyKey(userId), ownerKey: null }] : []),
            { key: baseKey, ownerKey: `${baseKey}:LegacyOwner` },
            ...(section === "main" ? [{ key: LEGACY_PRESETS_KEY, ownerKey: "ProfileSets:LegacyDatasetOwner" }] : [])
        ];
        let recovered: ProfilePresetEx[] = [];
        for (const candidate of candidates) {
            const owner = candidate.ownerKey ? await DataStore.get(candidate.ownerKey) : null;
            if (owner != null && owner !== userId) continue;
            const value = await DataStore.get(candidate.key);
            if (generation !== loadGeneration || UserStore.getCurrentUser()?.id !== userId) return;
            if (!Array.isArray(value) || !value.length) continue;
            if (candidate.ownerKey && owner == null) await DataStore.set(candidate.ownerKey, userId);
            if (generation !== loadGeneration || UserStore.getCurrentUser()?.id !== userId) return;
            recovered = value;
            // Retain the original backup, but bind an unscoped one to its owner.
            await DataStore.set(key, [...recovered]);
            break;
        }
        if (generation !== loadGeneration || UserStore.getCurrentUser()?.id !== userId) return;
        resetPresets([...recovered]);
        activeScopeKey = key;
    } catch (err) {
        logger.error("Failed to load presets", err);
        if (generation === loadGeneration) {
            activeScopeKey = null;
            loadError = err instanceof Error ? err.message : "Could not read saved profiles. Stored data has been left untouched.";
        }
    }
}

export function getStorageGuard(section: PresetSection) {
    const userId = UserStore.getCurrentUser()?.id;
    const key = userId ? getPresetsKey(section, userId) : null;
    const generation = loadGeneration;
    const guard = () => {
        if (!key || activeScopeKey !== key || generation !== loadGeneration || UserStore.getCurrentUser()?.id !== userId) {
            throw new Error(loadError ?? "The account or collection changed, or profiles are still loading. Please try again.");
        }
    };
    guard();
    return guard;
}

export async function savePresetsData(section?: PresetSection) {
    try {
        if (!activeScopeKey) throw new Error(loadError ?? "Wait for saved profiles to finish loading.");
        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) throw new Error("Sign in to Discord first.");

        const userId = currentUser.id;
        const key = section ? getPresetsKey(section, userId) : activeScopeKey!;
        if (key !== activeScopeKey || !key.endsWith(`:${userId}`)) throw new Error("The account or collection changed. Please try again.");
        await DataStore.set(key, [...presets]);
    } catch (err) {
        logger.error("Failed to save presets", err);
        throw err;
    }
}

export function setCurrentPresetIndex(index: number) {
    currentPresetIndex = index;
}

export function addPreset(preset: ProfilePresetEx) {
    presets.push(preset);
}

export function updatePreset(index: number, preset: ProfilePresetEx) {
    if (index >= 0 && index < presets.length) {
        presets[index] = preset;
    }
}

export function removePreset(index: number) {
    if (index >= 0 && index < presets.length) {
        presets.splice(index, 1);
        if (currentPresetIndex === index) {
            currentPresetIndex = -1;
        } else if (currentPresetIndex > index) {
            currentPresetIndex--;
        }
    }
}

export function movePresetInArray(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= presets.length || toIndex < 0 || toIndex >= presets.length) return;
    const [preset] = presets.splice(fromIndex, 1);
    presets.splice(toIndex, 0, preset);

    if (currentPresetIndex === fromIndex) {
        currentPresetIndex = toIndex;
    } else if (fromIndex < toIndex && currentPresetIndex > fromIndex && currentPresetIndex <= toIndex) {
        currentPresetIndex--;
    } else if (toIndex < fromIndex && currentPresetIndex >= toIndex && currentPresetIndex < fromIndex) {
        currentPresetIndex++;
    }
}

export function replaceAllPresets(newPresets: ProfilePresetEx[]) {
    presets = [...newPresets];
    currentPresetIndex = -1;
}
