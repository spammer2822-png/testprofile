/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, React, showToast, Toasts } from "@webpack/common";

import { cl } from "../index";
import { saveDraft } from "../utils/actions";
import { fileToImageData } from "../utils/images";
import { getCurrentProfile } from "../utils/profile";
import { newDraft, validatePreset } from "../utils/schema";
import { assertScope, type PresetScope, type ProfilePresetEx } from "../utils/storage";

type Props = RenderModalProps & {
    scope: PresetScope;
    initial?: ProfilePresetEx;
    guildId?: string;
    isGuildProfile: boolean;
    onSaved?: (preset: ProfilePresetEx) => void;
};

export function DraftEditor({ scope, initial, guildId, isGuildProfile, onSaved, ...props }: Props) {
    const [draft, setDraft] = React.useState<ProfilePresetEx>(() => initial ? structuredClone(initial) : newDraft());
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const busyRef = React.useRef(false);
    const mounted = React.useRef(true);
    const id = React.useId();
    React.useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const guard = () => {
        assertScope(scope);
        if (!mounted.current) throw new Error("The draft editor was closed.");
    };
    const change = <K extends keyof ProfilePresetEx>(key: K, value: ProfilePresetEx[K]) => setDraft(old => ({ ...old, [key]: value }));
    const run = async (action: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError("");
        try { guard(); await action(); }
        catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not complete this action."); }
        finally { busyRef.current = false; if (mounted.current) setBusy(false); }
    };
    const upload = (file: File | undefined, key: "avatarDataUrl" | "bannerDataUrl") => {
        if (!file) return;
        void run(async () => {
            const data = await fileToImageData(file);
            guard();
            setDraft(old => ({ ...old, [key]: data, ...(key === "avatarDataUrl" ? { avatarRaw: undefined } : {}) }));
        });
    };
    const save = () => run(async () => {
        validatePreset(draft);
        const saved = await saveDraft(draft, scope, initial?.id);
        if (!mounted.current) return;
        onSaved?.(saved);
        showToast(`Saved “${saved.name}”. Your active profile is unchanged.`, Toasts.Type.SUCCESS);
        props.onClose();
    });
    const colorValue = (value: number | null | undefined) => `#${(value ?? 0x5865f2).toString(16).padStart(6, "0")}`;
    const cosmeticKeys = ["avatarDecoration", "profileEffect", "profileFrame", "nameplate", "displayNameStyles", "primaryGuildId"] as const;
    const cosmeticLabels = ["Avatar decoration", "Profile effect", "Profile frame", "Nameplate", "Display-name style", "Primary server tag"];

    return (
        <Modal {...props} onClose={() => { if (!busyRef.current) props.onClose(); }}
            size="md" title={initial ? "Edit Saved Profile" : "Add New Profile"}
            subtitle="Create and save your layout here. Apply it separately from Saved Profiles."
            actions={[
                { text: busy ? "Saving…" : "Save Profile", variant: "primary", disabled: busy || !draft.name.trim(), onClick: () => void save() },
                { text: "Cancel", variant: "secondary", disabled: busy, onClick: props.onClose }
            ]}
        >
            <div className={cl("draft")} aria-busy={busy}>
                {error && <div className={cl("error")} role="alert">{error}</div>}
                <div className={cl("draft-sources")}>
                    <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => void run(async () => {
                        const source = await getCurrentProfile(guildId, { isGuildProfile, guard });
                        guard();
                        setDraft(old => ({ ...newDraft(source), name: old.name, id: old.id }));
                    })}>Start from Current Profile</Button>
                    <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => setDraft(old => ({ ...newDraft(), name: old.name, id: old.id }))}>Start Blank</Button>
                </div>
                <div className={cl("draft-grid")}>
                    <div className={cl("draft-fields")}>
                        <label className={cl("field")} htmlFor={id + "-name"}>
                            <span>Saved profile name</span>
                            <input id={id + "-name"} autoFocus maxLength={100} value={draft.name} disabled={busy} onChange={e => change("name", e.target.value)} placeholder="e.g. Weekend" />
                        </label>
                        <label className={cl("field")} htmlFor={id + "-display"}>
                            <span>{isGuildProfile ? "Server nickname" : "Display name"}</span>
                            <input id={id + "-display"} maxLength={32} value={draft.globalName ?? ""} disabled={busy} onChange={e => change("globalName", e.target.value)} />
                        </label>
                        <label className={cl("field")} htmlFor={id + "-pronouns"}>
                            <span>Pronouns</span>
                            <input id={id + "-pronouns"} maxLength={40} value={draft.pronouns ?? ""} disabled={busy} onChange={e => change("pronouns", e.target.value)} />
                        </label>
                        <label className={cl("field")} htmlFor={id + "-bio"}>
                            <span>About me <small>{draft.bio?.length ?? 0}/190</small></span>
                            <textarea id={id + "-bio"} maxLength={190} rows={4} value={draft.bio ?? ""} disabled={busy} onChange={e => change("bio", e.target.value)} />
                        </label>
                        {!isGuildProfile && <label className={cl("field")} htmlFor={id + "-status"}>
                            <span>Custom status</span>
                            <input id={id + "-status"} maxLength={128} value={draft.customStatus?.text ?? ""} disabled={busy}
                                onChange={e => change("customStatus", { ...draft.customStatus, text: e.target.value, expiresAtMs: "0" })} />
                        </label>}
                    </div>
                    <div className={cl("draft-fields")}>
                        {(["avatarDataUrl", "bannerDataUrl"] as const).map((key, index) => (
                            <div className={cl("image-field")} key={key}>
                                {draft[key] && <img className={cl(index === 0 ? "draft-avatar" : "draft-banner-image")} src={draft[key]!} alt={index === 0 ? "Draft avatar" : "Draft banner"} />}
                                <label className={cl("field")} htmlFor={id + key}>
                                    <span>{index === 0 ? "Avatar" : "Banner"}</span>
                                    <input id={id + key} type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={busy}
                                        onChange={e => { upload(e.target.files?.[0], key); e.target.value = ""; }} />
                                </label>
                                <Button type="button" size="xs" variant="secondary" disabled={busy || !draft[key]} onClick={() => setDraft(old => ({ ...old, [key]: null, ...(key === "avatarDataUrl" ? { avatarRaw: null } : {}) }))}>Remove</Button>
                            </div>
                        ))}
                        <p className={cl("helper")}>PNG, JPEG, GIF or WebP, up to 10 MiB each. Animated images stay animated.</p>
                    </div>
                </div>
                <div className={cl("colour-fields")}>
                    <label className={cl("field")} htmlFor={id + "-accent"}>
                        <span>Accent colour</span>
                        <input id={id + "-accent"} type="color" value={colorValue(draft.accentColor)} disabled={busy} onChange={e => change("accentColor", parseInt(e.target.value.slice(1), 16))} />
                    </label>
                    <Button type="button" size="xs" variant="secondary" disabled={busy || draft.accentColor == null} onClick={() => change("accentColor", null)}>Reset accent</Button>
                    {[0, 1].map(index => <label key={index} className={cl("field")} htmlFor={id + "-theme-" + index}>
                        <span>Theme colour {index + 1}</span>
                        <input id={id + "-theme-" + index} type="color" disabled={busy} value={colorValue(draft.themeColors?.[index])} onChange={e => {
                            const colors = [...(draft.themeColors ?? [0x5865f2, 0x232428])];
                            colors[index] = parseInt(e.target.value.slice(1), 16);
                            change("themeColors", colors);
                        }} />
                    </label>)}
                    <Button type="button" size="xs" variant="secondary" disabled={busy || draft.themeColors == null} onClick={() => change("themeColors", null)}>Reset theme</Button>
                </div>
                <details className={cl("cosmetics")}>
                    <summary>Saved decorations and extras</summary>
                    <p className={cl("helper")}>Start from your current profile to keep its decoration, effects and other extras. Discord checks access when you apply them.</p>
                    {cosmeticKeys.filter(key => !isGuildProfile || key !== "primaryGuildId").map(key => (
                        <div className={cl("cosmetic-row")} key={key}>
                            <span>{cosmeticLabels[cosmeticKeys.indexOf(key)]}</span>
                            <span>{draft[key] ? "Included" : "None"}</span>
                            <Button type="button" size="xs" variant="secondary" disabled={busy || !draft[key]} onClick={() => change(key, null)}>Remove</Button>
                        </div>
                    ))}
                </details>
                <p className={cl("helper")}>Blank fields clear that part of the profile when applied. Saving this draft does not change Discord&apos;s profile or custom status.</p>
            </div>
        </Modal>
    );
}
