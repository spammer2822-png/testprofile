/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isNonNullish } from "@utils/guards";
import { findStoreLazy } from "@webpack";
import { showToast, Toasts } from "@webpack/common";

import { getCurrentProfile } from "./profile";
import { addPreset, movePresetInArray, presets, PresetSection, type ProfilePresetEx, removePreset, replaceAllPresets, savePresetsData, updatePreset } from "./storage";

const UserProfileSettingsStore = findStoreLazy("UserProfileSettingsStore");

function isImageInput(value: unknown): value is string | { imageUri: string; } {
    if (typeof value === "string") return value.length > 0;
    return typeof value === "object" && isNonNullish(value) && "imageUri" in value && typeof (value as { imageUri: unknown }).imageUri === "string";
}

function getFreshPendingAvatar(isGuildProfile: boolean, guildId?: string): string | null {
    const pending = (isGuildProfile && guildId
        ? UserProfileSettingsStore.getPendingChanges?.(guildId)
        : UserProfileSettingsStore.getPendingChanges?.()) ?? {};
    const pendingObj = pending as Record<string, unknown>;
    const selected = [pendingObj.pendingAvatar].find(isImageInput);
    if (!selected) return null;
    return typeof selected === "string" ? selected : selected.imageUri;
}

export async function savePreset(
    name: string,
    section: PresetSection,
    guildId?: string,
    options: { isGuildProfile?: boolean; } = {}
) {
    const isGuildProfile = options.isGuildProfile ?? section === "server";
    const profile = await getCurrentProfile(guildId, { isGuildProfile });
    const freshPendingAvatar = getFreshPendingAvatar(isGuildProfile, guildId);
    const effectiveAvatar = freshPendingAvatar ?? profile.avatarDataUrl ?? null;

    const newPreset: ProfilePresetEx = {
        name,
        timestamp: Date.now(),
        ...profile,
        avatarDataUrl: effectiveAvatar,
    };
    addPreset(newPreset);
    await savePresetsData(section);
}

export async function updatePresetFromCurrent(
    index: number,
    section: PresetSection,
    guildId?: string,
    options: { isGuildProfile?: boolean; } = {}
) {
    if (index < 0 || index >= presets.length) return;

    const isGuildProfile = options.isGuildProfile ?? section === "server";
    const profile = await getCurrentProfile(guildId, { isGuildProfile });
    const freshPendingAvatar = getFreshPendingAvatar(isGuildProfile, guildId);

    const updatedPreset = {
        ...presets[index],
        ...profile,
        avatarDataUrl: freshPendingAvatar ?? profile.avatarDataUrl ?? null,
        timestamp: Date.now()
    };
    updatePreset(index, updatedPreset);
    await savePresetsData(section);
}

export async function deletePreset(index: number, section: PresetSection, guildId?: string) {
    if (index < 0 || index >= presets.length) return;

    removePreset(index);
    await savePresetsData(section);
}

export async function movePreset(fromIndex: number, toIndex: number, section: PresetSection, guildId?: string) {
    if (fromIndex < 0 || fromIndex >= presets.length || toIndex < 0 || toIndex >= presets.length) return;

    movePresetInArray(fromIndex, toIndex);
    await savePresetsData(section);
}

export async function renamePreset(index: number, newName: string, section: PresetSection, guildId?: string) {
    if (index < 0 || index >= presets.length || !newName.trim()) return;

    const updatedPreset = { ...presets[index], name: newName.trim() };
    updatePreset(index, updatedPreset);
    await savePresetsData(section);
}

export function exportPresets(section: PresetSection) {
    const dataStr = JSON.stringify(presets, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profile-presets-${section}-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ImportDecision = "override" | "merge" | "cancel";

export async function importPresets(
    forceUpdate: () => void,
    onImportPrompt: (existingCount: number) => Promise<ImportDecision>,
    section: PresetSection,
    guildId?: string
) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (event: Event) => {
        try {
            const target = event.currentTarget as HTMLInputElement | null;
            const file = target?.files?.[0];
            if (!file) return;

            const text = await file.text();
            const importedPresets: unknown = JSON.parse(text);

            if (!Array.isArray(importedPresets) || !importedPresets.every(preset => (
                typeof preset === "object"
                && preset != null
                && "name" in preset
                && typeof preset.name === "string"
                && preset.name.trim().length > 0
                && "timestamp" in preset
                && typeof preset.timestamp === "number"
                && Number.isFinite(preset.timestamp)
            ))) {
                showToast("This file does not contain valid Profile Sets data.", Toasts.Type.FAILURE);
                return;
            }

            const validPresets = importedPresets as ProfilePresetEx[];

            if (presets.length > 0) {
                const decision = await onImportPrompt(presets.length);
                if (decision === "cancel") return;
                if (decision === "override") {
                    replaceAllPresets(validPresets);
                } else {
                    const combined = [...presets, ...validPresets];
                    replaceAllPresets(combined);
                }
            } else {
                replaceAllPresets(validPresets);
            }

            await savePresetsData(section);
            forceUpdate();
            showToast(`Imported ${validPresets.length} profile set${validPresets.length === 1 ? "" : "s"}.`, Toasts.Type.SUCCESS);
        } catch {
            showToast("Failed to import presets. The file might be invalid.", Toasts.Type.FAILURE);
        }
    };
    input.click();
}
