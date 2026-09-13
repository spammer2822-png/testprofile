/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUserSettingLazy } from "@api/UserSettings";
import { fetchUserProfile } from "@utils/discord";
import { AvatarDecorationData, CustomStatus, DisplayNameStyles, Nameplate, ProfileEffect } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import {
    Constants,
    FluxDispatcher,
    GuildMemberStore,
    IconUtils,
    RestAPI,
    UserProfileStore,
    UserStore
} from "@webpack/common";

import { ProfileFrameLike, ProfilePresetEx } from "./storage";

const UserProfileSettingsStore = findStoreLazy("UserProfileSettingsStore");
const CustomStatusSettings = getUserSettingLazy("status", "customStatus")!;
const fetchedGuildProfiles = new Set<string>();

type PendingChanges = Record<string, unknown> & {
    pendingAvatar?: ImageInput;
    pendingBanner?: ImageInput;
    pendingAvatarDecoration?: AvatarDecorationLike | null;
    pendingProfileEffect?: ProfileEffect | null;
    pendingProfileFrame?: ProfileFrameLike | null;
    pendingNameplate?: Nameplate | null;
    pendingDisplayNameStyles?: DisplayNameStyles | null;
    pendingAccentColor?: number | null;
    pendingThemeColors?: number[] | null;
    pendingBio?: string | null;
    pendingPronouns?: string | null;
    pendingNickname?: string | null;
    pendingGlobalName?: string | null;
    pendingPrimaryGuildId?: string | null;
};

type ImageInput = string | { imageUri: string; [key: string]: unknown; } | null | undefined;
type AvatarDecorationLike = AvatarDecorationData & {
    label?: string;
    type?: number;
};
type DisplayNameStylesLike = DisplayNameStyles & {
    fontId?: number;
    effectId?: number;
};

type CurrentProfileOptions = {
    isGuildProfile?: boolean;
    includePending?: boolean;
    refresh?: boolean;
    strictImages?: boolean;
};

type LoadPresetOptions = {
    guard?: () => void;
    forceImages?: boolean;
    skipGlobalName?: boolean;
    skipBio?: boolean;
    skipPronouns?: boolean;
    isGuildProfile?: boolean;
};

type ProfileWithFrame = {
    profileFrame?: ProfileFrameLike | null;
};

function dispatch(type: string, payload: Record<string, unknown>) {
    FluxDispatcher.dispatch({ type, ...payload });
}

function setPendingChanges(payload: Record<string, unknown>, guildId?: string) {
    dispatch("USER_PROFILE_SETTINGS_SET_PENDING_CHANGES", guildId ? { guildId, ...payload } : payload);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function hasImageInput(value: ImageInput): boolean {
    if (!value) return false;
    if (typeof value === "string") return value.length > 0;
    return typeof value === "object" && isNonEmptyString(value?.imageUri);
}

function hasAvatarDecoration(value: unknown): value is AvatarDecorationLike {
    return typeof value === "object"
        && value != null
        && "asset" in value
        && "skuId" in value
        && isNonEmptyString((value as { asset?: unknown; }).asset)
        && isNonEmptyString((value as { skuId?: unknown; }).skuId);
}

function normalizeDisplayNameStyles(value: DisplayNameStylesLike | null | undefined): DisplayNameStylesLike | null {
    if (!value) return null;
    const fontId = value.fontId ?? value.font_id;
    const effectId = value.effectId ?? value.effect_id;
    if (typeof fontId !== "number" || typeof effectId !== "number") return null;
    const colors = Array.isArray(value.colors) ? [...value.colors] : [];

    return {
        fontId,
        effectId,
        font_id: fontId,
        effect_id: effectId,
        colors
    };
}

function getPendingValue<T>(pending: PendingChanges, key: keyof PendingChanges, fallback: T): T {
    const value = pending[key];
    return value === undefined ? fallback : value as T;
}

async function ensureCurrentProfileLoaded(userId: string, guildId?: string, refresh = false) {
    if (!refresh && !UserProfileStore.getUserProfile(userId)) {
        await fetchUserProfile(userId);
    }

    if (!refresh && (!guildId || UserProfileStore.getGuildMemberProfile(userId, guildId))) return;

    const cacheKey = `${userId}:${guildId}`;
    if (!refresh && fetchedGuildProfiles.has(cacheKey)) return;

    const { body } = await RestAPI.get({
        url: Constants.Endpoints.USER_PROFILE(userId),
        query: {
            ...(guildId ? { guild_id: guildId } : {}),
            with_mutual_guilds: false,
            with_mutual_friends_count: false
        },
        oldFormErrors: true
    });

    if (UserStore.getCurrentUser()?.id !== userId) throw new Error("The Discord account changed. Please try again.");
    if (body.user) {
        FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });
    }
    await FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", userProfile: body });
    if (body.guild_member) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBER_PROFILE_UPDATE",
            guildId,
            guildMember: body.guild_member
        });
    }

    if (guildId) fetchedGuildProfiles.add(cacheKey);
}

function getProfileFrame(profile: unknown): ProfileFrameLike | null | undefined {
    if (typeof profile !== "object" || profile == null || !("profileFrame" in profile)) return undefined;
    return (profile as ProfileWithFrame).profileFrame;
}

export async function imageUrlToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Image download failed.");
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function processImage(imageData: ImageInput, userId: string, type: "avatar" | "banner", guildId?: string, useGuildPath?: boolean): Promise<string | null> {
    if (!imageData) return null;

    if (typeof imageData === "object" && isNonEmptyString(imageData?.imageUri)) {
        return imageData.imageUri;
    }

    if (typeof imageData === "string") {
        if (imageData.startsWith("data:")) return imageData;
        if (/^https?:\/\//.test(imageData)) {
            return await imageUrlToBase64(imageData);
        }

        const isAnimated = imageData.startsWith("a_");
        const size = type === "banner" ? 1024 : 512;
        const urlPath = type === "banner" ? "banners" : "avatars";
        const guildPath = guildId ? `guilds/${guildId}/users/${userId}/${type === "banner" ? "banners" : "avatars"}` : urlPath;
        const guildUrl = `https://cdn.discordapp.com/${guildPath}/${imageData}.${isAnimated ? "gif" : "png"}?size=${size}`;
        const globalUrl = `https://cdn.discordapp.com/${urlPath}/${userId}/${imageData}.${isAnimated ? "gif" : "png"}?size=${size}`;
        if (useGuildPath && guildId) {
            const guildResult = await imageUrlToBase64(guildUrl);
            if (guildResult) return guildResult;
        }
        return await imageUrlToBase64(globalUrl);
    }

    return null;
}

export async function getCurrentProfile(guildId?: string, options: CurrentProfileOptions = {}): Promise<Omit<ProfilePresetEx, "name" | "timestamp">> {
    let currentUser = UserStore.getCurrentUser();
    if (!currentUser) throw new Error("ProfileSets cannot read a profile before Discord has logged in.");

    const isGuildProfile = options.isGuildProfile ?? Boolean(guildId);
    const effectiveGuildId = isGuildProfile ? guildId : undefined;
    const userId = currentUser.id;
    await ensureCurrentProfileLoaded(userId, effectiveGuildId, options.refresh);
    if (UserStore.getCurrentUser()?.id !== userId) throw new Error("The Discord account changed. Please try again.");
    // USER_UPDATE may replace the record, including its display-name style.
    currentUser = UserStore.getCurrentUser()!;

    const baseProfile = UserProfileStore.getUserProfile(currentUser.id);
    const guildProfile = effectiveGuildId ? UserProfileStore.getGuildMemberProfile(currentUser.id, effectiveGuildId) : null;
    const userProfile = guildProfile ?? baseProfile;
    const userAny = currentUser;
    const guildMember = effectiveGuildId ? GuildMemberStore.getMember(effectiveGuildId, currentUser.id) : null;

    const pendingChanges: PendingChanges = options.includePending === false ? {} : isGuildProfile
        ? (UserProfileSettingsStore.getPendingChanges(effectiveGuildId) ?? {})
        : (UserProfileSettingsStore.getPendingChanges() ?? {});
    const customStatusSetting = CustomStatusSettings.getSetting();
    const customStatus = isGuildProfile
        ? null
        : {
            text: customStatusSetting?.text ?? "",
            emojiId: customStatusSetting?.emojiId ?? "0",
            emojiName: customStatusSetting?.emojiName ?? "",
            expiresAtMs: customStatusSetting?.expiresAtMs ?? "0"
        };

    const avatarDecorationSource = getPendingValue(
        pendingChanges,
        "pendingAvatarDecoration",
        isGuildProfile ? guildMember?.avatarDecoration : userAny.avatarDecorationData
    );
    const avatarDecoration = hasAvatarDecoration(avatarDecorationSource)
        ? {
            ...avatarDecorationSource,
            asset: avatarDecorationSource.asset,
            skuId: avatarDecorationSource.skuId
        }
        : null;

    let profileEffect: ProfileEffect | null = null;
    const effectToUse = getPendingValue(
        pendingChanges,
        "pendingProfileEffect",
        userProfile?.profileEffect ?? null
    );

    if (effectToUse) {
        if (effectToUse.skuId && effectToUse.effects) {
            profileEffect = {
                skuId: effectToUse.skuId,
                title: effectToUse.title,
                description: effectToUse.description,
                accessibilityLabel: effectToUse.accessibilityLabel,
                reducedMotionSrc: effectToUse.reducedMotionSrc,
                thumbnailPreviewSrc: effectToUse.thumbnailPreviewSrc,
                effects: effectToUse.effects,
                animationType: effectToUse.animationType,
                staticFrameSrc: effectToUse.staticFrameSrc,
                type: effectToUse.type || 1
            };
        } else if (effectToUse.skuId) {
            const collectibles = userProfile?.collectibles;
            const collectible = collectibles?.find(c => c?.skuId === effectToUse.skuId);
            if (collectible) {
                profileEffect = {
                    skuId: collectible.skuId,
                    title: collectible.title,
                    description: collectible.description,
                    accessibilityLabel: collectible.accessibilityLabel,
                    reducedMotionSrc: collectible.reducedMotionSrc,
                    thumbnailPreviewSrc: collectible.thumbnailPreviewSrc,
                    effects: collectible.effects,
                    animationType: collectible.animationType,
                    staticFrameSrc: collectible.staticFrameSrc,
                    type: collectible.type || 1
                };
            }
        }
    }

    const profileFrame = getPendingValue(
        pendingChanges,
        "pendingProfileFrame",
        getProfileFrame(userProfile) ?? null
    );

    const nameplateToUse = getPendingValue(
        pendingChanges,
        "pendingNameplate",
        isGuildProfile ? guildMember?.collectibles?.nameplate : userAny.collectibles?.nameplate
    );
    const nameplate = nameplateToUse ? {
        skuId: nameplateToUse.skuId,
        asset: nameplateToUse.asset,
        label: nameplateToUse.label,
        palette: typeof nameplateToUse.palette === "string" ? nameplateToUse.palette : undefined,
        type: nameplateToUse.type || 2
    } : null;

    const savedDisplayNameStyles = isGuildProfile
        ? (guildMember?.displayNameStyles ?? userAny.displayNameStyles)
        : userAny.displayNameStyles;
    const displayNameStylesToUse = getPendingValue(
        pendingChanges,
        "pendingDisplayNameStyles",
        savedDisplayNameStyles
    );
    const displayNameStyles = normalizeDisplayNameStyles(displayNameStylesToUse);

    const avatarToUse: ImageInput = pendingChanges.pendingAvatar !== undefined
        ? pendingChanges.pendingAvatar
        : (isGuildProfile ? (guildMember?.avatar ?? null) : (currentUser.avatar ?? null));

    const useGuildAvatar = !!(effectiveGuildId && isGuildProfile && guildMember?.avatar && avatarToUse === guildMember.avatar);

    const avatarInput: ImageInput = hasImageInput(avatarToUse)
        ? avatarToUse
        : IconUtils.getUserAvatarURL(currentUser, true, 512);
    const avatarDataUrl = await processImage(avatarInput, currentUser.id, "avatar", effectiveGuildId, useGuildAvatar);
    const resolvedAvatarDataUrl = avatarDataUrl ?? IconUtils.getDefaultAvatarURL(currentUser.id);

    const bannerToUse: ImageInput = pendingChanges.pendingBanner !== undefined
        ? pendingChanges.pendingBanner
        : (isGuildProfile ? (guildProfile?.banner ?? baseProfile?.banner) : baseProfile?.banner);
    const useGuildBanner = !!(effectiveGuildId && isGuildProfile && guildProfile?.banner && bannerToUse === guildProfile?.banner);

    const bannerDataUrl = await processImage(bannerToUse, currentUser.id, "banner", effectiveGuildId, useGuildBanner);
    if (options.strictImages && ((hasImageInput(avatarToUse) && !avatarDataUrl) || (hasImageInput(bannerToUse) && !bannerDataUrl))) {
        throw new Error("Could not download the main profile images. Please try copying again.");
    }

    return {
        avatarDataUrl: resolvedAvatarDataUrl,
        // Preserve the difference between an inherited/default avatar and an
        // uploaded image. The preview still uses avatarDataUrl, while null lets
        // loading a preset remove a main or server avatar override correctly.
        avatarRaw: avatarToUse == null ? null : undefined,
        bannerDataUrl,
        bio: getPendingValue(pendingChanges, "pendingBio", userProfile?.bio ?? null),
        accentColor: getPendingValue(pendingChanges, "pendingAccentColor", userProfile?.accentColor ?? null),
        themeColors: getPendingValue(pendingChanges, "pendingThemeColors", userProfile?.themeColors ?? null),
        globalName: isGuildProfile
            ? getPendingValue(pendingChanges, "pendingNickname", guildMember?.nick ?? null)
            : getPendingValue(pendingChanges, "pendingGlobalName", currentUser.globalName ?? null),
        pronouns: getPendingValue(pendingChanges, "pendingPronouns", userProfile?.pronouns ?? null),
        avatarDecoration,
        profileEffect,
        profileFrame,
        nameplate,
        primaryGuildId: isGuildProfile
            ? null
            : getPendingValue(
                pendingChanges,
                "pendingPrimaryGuildId",
                userAny.primaryGuild?.identityGuildId ?? null
            ),
        customStatus,
        displayNameStyles
    };
}

function jsonEq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    return JSON.stringify(a) === JSON.stringify(b);
}

function customStatusEq(a: CustomStatus | null | undefined, b: CustomStatus | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return a.text === b.text
        && String(a.emojiId ?? "") === String(b.emojiId ?? "")
        && a.emojiName === b.emojiName
        && String(a.expiresAtMs ?? "0") === String(b.expiresAtMs ?? "0");
}

function resolvePendingAvatar(pendingChanges: PendingChanges | null): ImageInput {
    if (!pendingChanges) return null;

    return hasImageInput(pendingChanges.pendingAvatar) ? pendingChanges.pendingAvatar : null;
}

function normalizeImageValue(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "imageUri" in value) {
        const { imageUri } = value as { imageUri: unknown; };
        return typeof imageUri === "string" ? imageUri : null;
    }
    return null;
}

function collectibleEqBySku(a: { skuId?: string | number | null; } | null | undefined, b: { skuId?: string | number | null; } | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return String(a.skuId ?? "") === String(b.skuId ?? "");
}

function avatarDecorationEq(a: { skuId?: string | number | null; asset?: string | null; } | null | undefined, b: { skuId?: string | number | null; asset?: string | null; } | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return String(a.skuId ?? "") === String(b.skuId ?? "") && String(a.asset ?? "") === String(b.asset ?? "");
}

function nameplateEq(a: { skuId?: string | number | null; asset?: string | null; } | null | undefined, b: { skuId?: string | number | null; asset?: string | null; } | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return String(a.skuId ?? "") === String(b.skuId ?? "") && String(a.asset ?? "") === String(b.asset ?? "");
}

export async function loadPresetAsPending(preset: ProfilePresetEx, guildId?: string, options: LoadPresetOptions = {}) {
    const isGuild = options.isGuildProfile ?? Boolean(guildId);
    if (isGuild && !guildId) throw new Error("Select a server first.");

    const userId = UserStore.getCurrentUser()?.id;
    options.guard?.();
    const current = await getCurrentProfile(guildId, { isGuildProfile: isGuild });
    options.guard?.();
    if (UserStore.getCurrentUser()?.id !== userId) throw new Error("The Discord account changed. Please try again.");
    const pendingChanges: PendingChanges = (isGuild && guildId
        ? UserProfileSettingsStore.getPendingChanges(guildId)
        : UserProfileSettingsStore.getPendingChanges()) ?? {};
    const pendingPayload: Record<string, unknown> = {};
    const queuePending = (key: string, value: unknown) => {
        if (value !== undefined) pendingPayload[key] = value;
    };

    if ("avatarDataUrl" in preset) {
        const avatarValue = "avatarRaw" in preset && preset.avatarRaw === null
            ? null
            : preset.avatarDataUrl;
        const presetAvatar = normalizeImageValue(avatarValue);
        const currentAvatar = current.avatarRaw === null
            ? null
            : normalizeImageValue(current.avatarDataUrl);
        const pendingAvatar = normalizeImageValue(resolvePendingAvatar(pendingChanges));
        const hasPendingAvatar = pendingChanges.pendingAvatar !== undefined;
        if (options.forceImages || (presetAvatar !== currentAvatar && (!hasPendingAvatar || presetAvatar !== pendingAvatar))) {
            const avatarPayload = avatarValue?.startsWith?.("data:")
                ? {
                    assetOrigin: "NEW_ASSET",
                    imageUri: avatarValue,
                    description: `profilesets-${preset.name ?? "preset"}`
                }
                : avatarValue;
            const avatarImageUri = avatarPayload != null && "imageUri" in Object(avatarPayload)
                ? (avatarPayload as { imageUri?: unknown; }).imageUri
                : null;

            // Discord's current profile editor accepts the uploaded image directly
            // through pendingAvatar. Opening PROFILE_CUSTOMIZATION_OPEN_PREVIEW_MODAL
            // can display the animation but does not reliably populate the pending
            // profile state used by the current editor.
            if (isNonEmptyString(avatarImageUri)) {
                queuePending("pendingAvatar", { ...Object(avatarPayload), imageUri: avatarImageUri });
            } else {
                queuePending("pendingAvatar", avatarPayload);
            }
        }
    }

    if ("bannerDataUrl" in preset && (options.forceImages || preset.bannerDataUrl !== current.bannerDataUrl)) {
        const bannerPayload = preset.bannerDataUrl?.startsWith?.("data:")
            ? {
                assetOrigin: "NEW_ASSET",
                imageUri: preset.bannerDataUrl,
                description: `profilesets-${preset.name ?? "preset"}`
            }
            : preset.bannerDataUrl;
        const bannerImageUri = bannerPayload != null && "imageUri" in Object(bannerPayload)
            ? (bannerPayload as { imageUri?: unknown; }).imageUri
            : null;

        // As with avatars, write the banner into Discord's pending state directly.
        // The preview-modal event is not sufficient on the current profile editor.
        if (isNonEmptyString(bannerImageUri)) {
            queuePending("pendingBanner", { ...Object(bannerPayload), imageUri: bannerImageUri });
        } else {
            queuePending("pendingBanner", bannerPayload);
        }
    }

    if (!options.skipBio && "bio" in preset && preset.bio !== current.bio) {
        queuePending("pendingBio", preset.bio ?? "");
    }

    if (!options.skipPronouns && "pronouns" in preset && preset.pronouns !== current.pronouns) {
        queuePending("pendingPronouns", preset.pronouns ?? "");
    }

    if (!options.skipGlobalName && "globalName" in preset && preset.globalName !== current.globalName) {
        queuePending(isGuild ? "pendingNickname" : "pendingGlobalName", preset.globalName ?? null);
    }

    if ("avatarDecoration" in preset && !avatarDecorationEq(preset.avatarDecoration, current.avatarDecoration)) {
        queuePending("pendingAvatarDecoration", preset.avatarDecoration ?? null);
    }

    if ("profileEffect" in preset && !collectibleEqBySku(preset.profileEffect, current.profileEffect)) {
        queuePending("pendingProfileEffect", preset.profileEffect ?? null);
    }

    if ("profileFrame" in preset && !collectibleEqBySku(preset.profileFrame, current.profileFrame)) {
        queuePending("pendingProfileFrame", preset.profileFrame ?? null);
    }

    if ("nameplate" in preset && !nameplateEq(preset.nameplate, current.nameplate)) {
        queuePending("pendingNameplate", preset.nameplate ?? null);
    }

    if ("displayNameStyles" in preset) {
        const presetDisplayNameStyles = normalizeDisplayNameStyles(preset.displayNameStyles);
        if (!jsonEq(presetDisplayNameStyles, current.displayNameStyles)) {
            queuePending("pendingDisplayNameStyles", presetDisplayNameStyles);
        }
    }

    if ("accentColor" in preset && preset.accentColor !== current.accentColor) {
        queuePending("pendingAccentColor", preset.accentColor ?? null);
    }

    if ("themeColors" in preset && !jsonEq(preset.themeColors, current.themeColors)) {
        queuePending("pendingThemeColors", preset.themeColors ?? null);
    }

    if (!isGuild && "primaryGuildId" in preset && preset.primaryGuildId !== current.primaryGuildId) {
        queuePending("pendingPrimaryGuildId", preset.primaryGuildId ?? null);
    }

    if (!isGuild && "customStatus" in preset && !customStatusEq(preset.customStatus, current.customStatus)) {
        CustomStatusSettings.updateSetting({
            text: preset.customStatus?.text ?? "",
            expiresAtMs: preset.customStatus?.expiresAtMs ?? "0",
            emojiId: preset.customStatus?.emojiId ?? "0",
            emojiName: preset.customStatus?.emojiName ?? ""
        });
    }

    if (Object.keys(pendingPayload).length) {
        setPendingChanges(pendingPayload, isGuild ? guildId : undefined);
    }
}

export async function copyMainProfileToServer(guildId: string, checkTarget?: () => void) {
    if (!guildId) throw new Error("Select a server first.");
    const userId = UserStore.getCurrentUser()?.id;
    const guard = () => {
        checkTarget?.();
        if (!userId || UserStore.getCurrentUser()?.id !== userId) throw new Error("The Discord account changed. Please try again.");
    };
    guard();

    const mainProfile = await getCurrentProfile(undefined, {
        isGuildProfile: false,
        includePending: false,
        refresh: true,
        strictImages: true
    });
    const serverProfile: ProfilePresetEx = {
        ...mainProfile,
        name: "Main profile",
        timestamp: Date.now(),
        customStatus: null,
        primaryGuildId: null
    };

    guard();
    await loadPresetAsPending(serverProfile, guildId, { isGuildProfile: true, guard, forceImages: true });
}
