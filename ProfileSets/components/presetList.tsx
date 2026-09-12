/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, Menu, Modal, openModal, React, showToast, Toasts } from "@webpack/common";

import { cl } from "../index";
import { deletePreset, movePreset, renamePreset, updatePresetFromCurrent } from "../utils/actions";
import { assertScope, getScope, type PresetScope, type PresetSection, type ProfilePresetEx } from "../utils/storage";
import { ConfirmModal } from "./confirmModal";
import { DraftEditor } from "./draftEditor";

type Props = {
    presets: ProfilePresetEx[];
    allPresets: ProfilePresetEx[];
    avatarSize: number;
    selectedId?: string;
    disabled: boolean;
    onLoad: (preset: ProfilePresetEx) => Promise<void>;
    guildId?: string;
    isGuildProfile: boolean;
    section: PresetSection;
};
const dates = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
function report(error: unknown) {
    showToast(error instanceof Error ? error.message : "Could not update this saved profile.", Toasts.Type.FAILURE);
}
function RenameModal({ preset, section, scope, ...props }: { preset: ProfilePresetEx; section: PresetSection; scope: PresetScope; onClose: () => void; transitionState: number; }) {
    const [name, setName] = React.useState(preset.name);
    const [busy, setBusy] = React.useState(false);
    const busyRef = React.useRef(false);
    const id = React.useId();
    const save = async () => {
        if (busyRef.current || !name.trim()) return;
        busyRef.current = true;
        setBusy(true);
        try { assertScope(scope); await renamePreset(preset.id!, name, section); props.onClose(); }
        catch (error) { report(error); }
        finally { busyRef.current = false; setBusy(false); }
    };
    return <Modal {...props} title="Rename Profile" size="sm" actions={[
        { text: "Save", variant: "primary", disabled: busy || !name.trim(), onClick: () => void save() },
        { text: "Cancel", variant: "secondary", disabled: busy, onClick: props.onClose }
    ]}>
        <label className={cl("field")} htmlFor={id}><span>Profile name</span>
            <input id={id} autoFocus maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); void save(); }
            }} />
        </label>
    </Modal>;
}

export function PresetList({ presets, allPresets, avatarSize, selectedId, disabled, onLoad, guildId, isGuildProfile, section }: Props) {
    const [workingId, setWorkingId] = React.useState<string>();
    const workingRef = React.useRef(false);
    const run = async (preset: ProfilePresetEx, operation: () => Promise<unknown>) => {
        if (workingRef.current || disabled) return;
        workingRef.current = true;
        setWorkingId(preset.id);
        try { await operation(); }
        catch (error) { report(error); }
        finally { workingRef.current = false; setWorkingId(undefined); }
    };
    const positions = React.useMemo(() => new Map(allPresets.map((preset, index) => [preset.id, index])), [allPresets]);
    return <div className={cl("list-container")}>
        {presets.map(preset => {
            const index = positions.get(preset.id) ?? 0;
            const selected = selectedId === preset.id;
            const locked = disabled || workingId != null;
            return <article key={preset.id} className={cl("card") + (selected ? " selected" : "")}>
                <button type="button" className={cl("card-apply")} disabled={locked} onClick={() => void onLoad(preset)}
                    aria-label={`Apply ${preset.name}`} aria-pressed={selected}>
                    <div className={cl("card-banner")} style={{ backgroundColor: `#${(preset.accentColor ?? 0x5865f2).toString(16).padStart(6, "0")}` }}>
                        {preset.bannerDataUrl && <img src={preset.bannerDataUrl} alt="" loading="lazy" decoding="async" />}
                    </div>
                    <div className={cl("card-content")}>
                        {preset.avatarDataUrl ? <img src={preset.avatarDataUrl} alt="" className={cl("avatar")} width={avatarSize} height={avatarSize} loading="lazy" decoding="async" />
                            : <div className={cl("avatar", "avatar-placeholder")} style={{ width: avatarSize, height: avatarSize }}>◎</div>}
                        <div className={cl("card-copy")}>
                            <strong className={cl("name")} title={preset.name}>{preset.name}</strong>
                            <span className={cl("timestamp")}>{dates.format(new Date(preset.timestamp))}</span>
                            <span className={cl("apply-label")}>{selected ? "Loaded · pending changes" : "Apply profile"}</span>
                        </div>
                    </div>
                </button>
                <button type="button" className={cl("menu-icon", "card-menu")} disabled={locked} aria-label={`Actions for ${preset.name}`}
                    onClick={e => {
                        const scope = getScope(section);
                        ContextMenuApi.openContextMenu(e, () => <Menu.Menu navId="profile-sets-actions" onClose={ContextMenuApi.closeContextMenu}>
                            <Menu.MenuItem id="edit" label="Edit Saved Profile" action={() => {
                                try { assertScope(scope); openModal(props => <DraftEditor {...props} initial={preset} scope={scope} guildId={guildId} isGuildProfile={isGuildProfile} />); }
                                catch (error) { report(error); }
                            }} />
                            <Menu.MenuItem id="rename" label="Rename" action={() => openModal(props => <RenameModal {...props} preset={preset} section={section} scope={scope} />)} />
                            <Menu.MenuItem id="update" label="Replace with Current Profile" action={() => openModal(props => <ConfirmModal {...props}
                                title="Replace Saved Profile?" message={`Replace “${preset.name}” with the current profile, including pending edits?`}
                                confirmText="Replace" cancelText="Cancel" onCancel={() => {}} onConfirm={() => void run(preset, async () => {
                                    assertScope(scope);
                                    await updatePresetFromCurrent(preset.id!, section, guildId, { isGuildProfile });
                                    showToast("Saved profile updated.", Toasts.Type.SUCCESS);
                                })} />)} />
                            <Menu.MenuSeparator />
                            {index > 0 && <Menu.MenuItem id="move-up" label="Move Up" action={() => void run(preset, async () => { assertScope(scope); await movePreset(preset.id!, -1, section); })} />}
                            {index < allPresets.length - 1 && <Menu.MenuItem id="move-down" label="Move Down" action={() => void run(preset, async () => { assertScope(scope); await movePreset(preset.id!, 1, section); })} />}
                            {index > 0 && <Menu.MenuItem id="move-first" label="Move to First" action={() => void run(preset, async () => { assertScope(scope); await movePreset(preset.id!, "first", section); })} />}
                            <Menu.MenuItem id="delete" label="Delete" color="danger" action={() => openModal(props => <ConfirmModal {...props}
                                title="Delete Profile?" message={`Delete “${preset.name}”? Your active Discord profile will stay as it is.`}
                                confirmText="Delete" cancelText="Cancel" onCancel={() => {}} onConfirm={() => void run(preset, async () => {
                                    assertScope(scope); await deletePreset(preset.id!, section);
                                })} />)} />
                        </Menu.Menu>);
                    }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" /></svg>
                </button>
            </article>;
        })}
    </div>;
}
