/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ProfilePreset } from "@vencord/discord-types";

export type PresetSection = "main" | "server";
export type ProfileFrameLike = { skuId: string; label?: string; layers?: unknown[]; [key: string]: unknown; };
export type ProfilePresetEx = ProfilePreset & {
    id?: string;
    avatarRaw?: string | null;
    profileFrame?: ProfileFrameLike | null;
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_PRESETS = 500;

const imagePattern = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const color = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffffff;

export function isSafeImage(value: unknown): value is string {
    if (typeof value !== "string" || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 128) return false;
    if (imagePattern.test(value)) return true;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname);
    } catch {
        return false;
    }
}

export function validatePreset(value: unknown): asserts value is ProfilePresetEx {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid profile data.");
    const p = value as Record<string, unknown>;
    if (typeof p.name !== "string" || !p.name.trim() || p.name.trim().length > 100) throw new Error("Profile names must contain 1–100 characters.");
    if (typeof p.timestamp !== "number" || !Number.isFinite(p.timestamp) || Math.abs(p.timestamp) > 8.64e15) throw new Error("Invalid profile date.");
    for (const [key, max] of [["bio", 190], ["pronouns", 40], ["globalName", 32]] as const) {
        if (p[key] != null && (typeof p[key] !== "string" || p[key].length > max)) throw new Error(`Invalid ${key}: maximum ${max} characters.`);
    }
    for (const key of ["avatarDataUrl", "bannerDataUrl"]) {
        if (p[key] != null && !isSafeImage(p[key])) throw new Error("Images must be PNG, JPEG, GIF or WebP data, or a Discord CDN image.");
    }
    if (p.avatarRaw != null && typeof p.avatarRaw !== "string") throw new Error("Invalid avatar.");
    if (p.accentColor != null && !color(p.accentColor)) throw new Error("Invalid accent colour.");
    if (p.themeColors != null && (!Array.isArray(p.themeColors) || p.themeColors.length !== 2 || !p.themeColors.every(color))) throw new Error("Choose two valid theme colours.");
    for (const key of ["avatarDecoration", "profileEffect", "profileFrame", "nameplate"]) {
        const item = p[key] as Record<string, unknown> | null | undefined;
        if (item == null) continue;
        if (typeof item !== "object" || Array.isArray(item) || typeof item.skuId !== "string" || !/^\d+$/.test(item.skuId)) throw new Error(`Invalid ${key}.`);
        if ((key === "avatarDecoration" || key === "nameplate") && (typeof item.asset !== "string" || !item.asset)) throw new Error(`Invalid ${key} asset.`);
    }
    if (p.primaryGuildId != null && (typeof p.primaryGuildId !== "string" || !/^\d+$/.test(p.primaryGuildId))) throw new Error("Invalid primary server.");
    const status = p.customStatus as Record<string, unknown> | null | undefined;
    if (status != null) {
        if (typeof status !== "object" || Array.isArray(status)) throw new Error("Invalid custom status.");
        for (const key of ["text", "emojiId", "emojiName", "expiresAtMs"]) {
            if (status[key] != null && typeof status[key] !== "string") throw new Error("Invalid custom status.");
        }
        if (typeof status.text === "string" && status.text.length > 128) throw new Error("Custom status must be at most 128 characters.");
    }
    const styles = p.displayNameStyles as Record<string, unknown> | null | undefined;
    if (styles != null && (typeof styles !== "object" || Array.isArray(styles)
        || !Number.isInteger(styles.fontId ?? styles.font_id) || !Number.isInteger(styles.effectId ?? styles.effect_id)
        || !Array.isArray(styles.colors) || !styles.colors.every(color))) throw new Error("Invalid display-name style.");
}

export function normalisePresets(value: unknown): ProfilePresetEx[] {
    if (!Array.isArray(value) || value.length > MAX_PRESETS) throw new Error(`A collection can contain at most ${MAX_PRESETS} profiles.`);
    const ids = new Set<string>();
    return value.map(item => {
        validatePreset(item);
        const clone = structuredClone(item);
        if (typeof clone.id !== "string" || !clone.id || ids.has(clone.id)) clone.id = crypto.randomUUID();
        ids.add(clone.id);
        clone.name = clone.name.trim();
        return clone;
    });
}

export function newDraft(source?: Partial<ProfilePresetEx>): ProfilePresetEx {
    return {
        avatarDataUrl: null, avatarRaw: null, bannerDataUrl: null, bio: "", pronouns: "", globalName: "",
        accentColor: null, themeColors: null, avatarDecoration: null, profileEffect: null,
        profileFrame: null, nameplate: null, displayNameStyles: null, primaryGuildId: null, customStatus: null,
        ...structuredClone(source ?? {}),
        name: "", timestamp: Date.now(), id: crypto.randomUUID()
    };
}

export function forServer(source: ProfilePresetEx): ProfilePresetEx {
    const copy = structuredClone(source);
    delete copy.customStatus;
    delete copy.primaryGuildId;
    return copy;
}
