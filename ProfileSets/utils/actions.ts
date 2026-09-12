/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getCurrentProfile } from "./profile";
import { MAX_IMPORT_BYTES, newDraft, normalisePresets, validatePreset } from "./schema";
import { assertScope, changePresets, getScope, getSnapshot, type PresetScope, type PresetSection, type ProfilePresetEx } from "./storage";

export async function saveDraft(draft: ProfilePresetEx, scope: PresetScope, existingId?: string) {
    validatePreset(draft);
    const saved = structuredClone({ ...draft, id: existingId ?? crypto.randomUUID(), name: draft.name.trim(), timestamp: Date.now() });
    await changePresets(scope, items => {
        if (!existingId) return [...items, saved];
        const index = items.findIndex(item => item.id === existingId);
        if (index < 0) throw new Error("This saved profile was removed.");
        items[index] = saved;
        return items;
    });
    return saved;
}

export async function savePreset(name: string, section: PresetSection, guildId?: string, options: { isGuildProfile?: boolean; } = {}) {
    const scope = getScope(section);
    const profile = await getCurrentProfile(guildId, { ...options, guard: () => assertScope(scope) });
    assertScope(scope);
    return saveDraft({ ...newDraft(profile), name }, scope);
}

export async function updatePresetFromCurrent(id: string, section: PresetSection, guildId?: string, options: { isGuildProfile?: boolean; } = {}) {
    const scope = getScope(section);
    const old = getSnapshot().presets.find(preset => preset.id === id);
    if (!old) throw new Error("This saved profile was removed.");
    const profile = await getCurrentProfile(guildId, { ...options, guard: () => assertScope(scope) });
    assertScope(scope);
    return saveDraft({ ...old, ...profile }, scope, id);
}

export async function deletePreset(id: string, section: PresetSection) {
    await changePresets(getScope(section), items => items.filter(preset => preset.id !== id));
}
export async function renamePreset(id: string, name: string, section: PresetSection) {
    await changePresets(getScope(section), items => items.map(preset => preset.id === id ? { ...preset, name } : preset));
}
export async function movePreset(id: string, offset: number | "first", section: PresetSection) {
    await changePresets(getScope(section), items => {
        const from = items.findIndex(preset => preset.id === id);
        if (from < 0) throw new Error("This saved profile was removed.");
        const to = offset === "first" ? 0 : Math.max(0, Math.min(items.length - 1, from + offset));
        const [preset] = items.splice(from, 1);
        items.splice(to, 0, preset);
        return items;
    });
}

export function exportPresets(section: PresetSection) {
    getScope(section);
    const url = URL.createObjectURL(new Blob([JSON.stringify(getSnapshot().presets, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `profile-presets-${section}-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportDecision = "override" | "merge" | "cancel";
export async function importPresets(file: File, scope: PresetScope, prompt: (count: number) => Promise<ImportDecision>) {
    if (file.size > MAX_IMPORT_BYTES) throw new Error("This import is too large (maximum 64 MiB).");
    const imported = normalisePresets(JSON.parse(await file.text()));
    assertScope(scope);
    if (!imported.length) throw new Error("This file contains no saved profiles.");
    const count = getSnapshot().presets.length;
    const decision = count ? await prompt(count) : "override";
    assertScope(scope);
    if (decision === "cancel") return 0;
    await changePresets(scope, items => decision === "override" ? imported : [...items, ...imported]);
    return imported.length;
}
