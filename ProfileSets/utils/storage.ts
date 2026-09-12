/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { UserStore } from "@webpack/common";

import { normalisePresets, type PresetSection, type ProfilePresetEx } from "./schema";

export type { PresetSection, ProfileFrameLike, ProfilePresetEx } from "./schema";
export type PresetScope = { key: string; userId: string; generation: number; };
type Snapshot = { presets: ProfilePresetEx[]; loading: boolean; error: string | null; };
let snapshot: Snapshot = { presets: [], loading: true, error: null };
let activeScope: PresetScope | null = null;
let generation = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export const getSnapshot = () => snapshot;
export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
}
function keyFor(section: PresetSection, userId: string) {
    return `ProfilePresets_v2_${section === "main" ? "Main" : "Server"}:${userId}`;
}
export function assertScope(scope: PresetScope) {
    if (activeScope?.generation !== scope.generation || activeScope.key !== scope.key || UserStore.getCurrentUser()?.id !== scope.userId) {
        throw new Error("The account or profile collection changed. Please try again.");
    }
}
export function getScope(section: PresetSection): PresetScope {
    if (!activeScope || snapshot.loading || snapshot.error || activeScope.key !== keyFor(section, activeScope.userId)) {
        throw new Error("Wait for your saved profiles to finish loading.");
    }
    assertScope(activeScope);
    return { ...activeScope };
}
export function clearStorageSession() {
    generation++;
    activeScope = null;
    publish({ presets: [], loading: true, error: null });
}
export async function loadPresets(section: PresetSection) {
    const userId = UserStore.getCurrentUser()?.id;
    const currentGeneration = ++generation;
    activeScope = userId ? { key: keyFor(section, userId), userId, generation: currentGeneration } : null;
    publish({ presets: [], loading: true, error: null });
    if (!activeScope) {
        publish({ presets: [], loading: false, error: "Sign in to Discord to use Profile Sets." });
        return;
    }
    const scope = { ...activeScope };
    try {
        // Complete already-started writes before reading the same collection again.
        await writeQueue;
        assertScope(scope);
        let stored = await DataStore.get(scope.key);
        assertScope(scope);
        if (stored == null && section === "main") {
            const legacyKey = `ProfileDataset:${userId}:main`;
            const legacy = await DataStore.get(legacyKey) ?? await DataStore.get("ProfileDataset");
            assertScope(scope);
            if (legacy != null) {
                stored = normalisePresets(legacy);
                await DataStore.set(scope.key, stored);
                // Keep the original legacy backup until the user exports it.
            }
        }
        const presets = normalisePresets(stored ?? []);
        assertScope(scope);
        publish({ presets, loading: false, error: null });
    } catch (error) {
        if (activeScope?.generation !== scope.generation) return;
        publish({ presets: [], loading: false, error: error instanceof Error ? error.message : "Could not read saved profiles." });
    }
}
export async function changePresets(scope: PresetScope, transform: (items: ProfilePresetEx[]) => ProfilePresetEx[]) {
    const write = writeQueue.then(async () => {
        assertScope(scope);
        const next = normalisePresets(transform([...snapshot.presets]));
        await DataStore.set(scope.key, next);
        if (activeScope?.generation === scope.generation && UserStore.getCurrentUser()?.id === scope.userId) {
            publish({ presets: next, loading: false, error: null });
        }
    });
    writeQueue = write.catch(() => {});
    await write;
}
