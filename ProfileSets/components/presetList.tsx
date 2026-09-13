/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { ContextMenuApi, Menu, openModal, React, showToast, TextInput, Toasts } from "@webpack/common";

import { cl } from "..";
import { deletePreset, movePreset, renamePreset, updatePresetFromCurrent } from "../utils/actions";
import { PresetSection, type ProfilePresetEx } from "../utils/storage";
import { ConfirmModal } from "./confirmModal";

interface PresetListProps {
    presets: ProfilePresetEx[];
    allPresets: ProfilePresetEx[];
    avatarSize: number;
    selectedPreset: number;
    onLoad: (index: number) => void | Promise<void>;
    onUpdate: () => void;
    guildId?: string;
    isGuildProfile: boolean;
    section: PresetSection;
    currentPage: number;
    onPageChange: (page: number) => void;
}

export function PresetList({
    presets,
    allPresets,
    avatarSize,
    selectedPreset,
    onLoad,
    onUpdate,
    guildId,
    isGuildProfile,
    section,
    currentPage,
    onPageChange
}: PresetListProps) {
    const [renaming, setRenaming] = React.useState<number>(-1);
    const [renameText, setRenameText] = React.useState("");

    return (
        <div className={cl("list-container")}>
            {presets.map(preset => {
                const actualIndex = allPresets.indexOf(preset);
                const isRenaming = renaming === actualIndex;
                const isSelected = !isRenaming && selectedPreset === actualIndex;
                const date = new Date(preset.timestamp);
                const formattedDate = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
                const formattedTime = date.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit"
                });

                const commitRename = () => {
                    const nextName = renameText.trim();
                    if (!nextName) return;
                    renamePreset(actualIndex, nextName, section, guildId);
                    onUpdate();
                };

                const showMoveOptions = actualIndex > 0 || actualIndex < allPresets.length - 1 || currentPage > 1;

                return (
                    <div
                        key={actualIndex}
                        tabIndex={isRenaming ? -1 : 0}
                        role="button"
                        onClick={() => {
                            if (!isRenaming) {
                                onLoad(actualIndex);
                            }
                        }}
                        onKeyDown={e => {
                            if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                onLoad(actualIndex);
                            }
                        }}
                        className={classes(cl("row"), isSelected ? "selected" : "")}
                    >
                        <div className={cl("avatar-url")}>
                            {preset.avatarDataUrl && (
                                <img
                                    src={preset.avatarDataUrl}
                                    alt=""
                                    className={cl("avatar")}
                                    style={{ width: `${avatarSize}px`, height: `${avatarSize}px` }}
                                />
                            )}
                            <div className={cl("rename")}>
                                {isRenaming ? (
                                    <TextInput
                                        value={renameText}
                                        onChange={setRenameText}
                                        onBlur={() => {
                                            commitRename();
                                            setRenaming(-1);
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                commitRename();
                                                setRenaming(-1);
                                            } else if (e.key === "Escape") {
                                                setRenaming(-1);
                                            }
                                            e.stopPropagation();
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        autoFocus
                                    />
                                ) : (
                                    <>
                                        <div className={cl("name")}>
                                            {preset.name}
                                        </div>
                                        <div className={cl("timestamp")}>
                                            {formattedDate} at {formattedTime}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={cl("updated")}>
                            <button
                                type="button"
                                className={cl("menu-icon")}
                                aria-label={`Actions for ${preset.name}`}
                                onClick={e => {
                                    e.stopPropagation();
                                    ContextMenuApi.openContextMenu(e, () => (
                                        <Menu.Menu navId="preset-options" onClose={ContextMenuApi.closeContextMenu}>
                                            <Menu.MenuItem
                                                id="rename"
                                                label="Rename"
                                                action={() => {
                                                    setRenaming(actualIndex);
                                                    setRenameText(preset.name);
                                                }}
                                            />
                                            <Menu.MenuItem
                                                id="update"
                                                label="Update"
                                                action={async () => {
                                                    try {
                                                        await updatePresetFromCurrent(actualIndex, section, guildId, { isGuildProfile });
                                                        onUpdate();
                                                        showToast(`Updated “${preset.name}”.`, Toasts.Type.SUCCESS);
                                                    } catch (error) {
                                                        console.error("[ProfileSets] Failed to update profile set", error);
                                                        showToast("Could not update this profile set.", Toasts.Type.FAILURE);
                                                    }
                                                }}
                                            />
                                            {showMoveOptions && <Menu.MenuSeparator />}
                                            {actualIndex > 0 && (
                                                <Menu.MenuItem
                                                    id="move-up"
                                                    label="Move Up"
                                                    action={() => {
                                                        movePreset(actualIndex, actualIndex - 1, section, guildId);
                                                        onUpdate();
                                                    }}
                                                />
                                            )}
                                            {actualIndex < allPresets.length - 1 && (
                                                <Menu.MenuItem
                                                    id="move-down"
                                                    label="Move Down"
                                                    action={() => {
                                                        movePreset(actualIndex, actualIndex + 1, section, guildId);
                                                        onUpdate();
                                                    }}
                                                />
                                            )}
                                            {currentPage > 1 && (
                                                <Menu.MenuItem
                                                    id="move-to-page-1"
                                                    label="Move to Page 1"
                                                    action={() => {
                                                        movePreset(actualIndex, 0, section, guildId);
                                                        onPageChange(1);
                                                        onUpdate();
                                                    }}
                                                />
                                            )}
                                            <Menu.MenuSeparator />
                                            <Menu.MenuItem
                                                id="delete"
                                                label="Delete"
                                                color="danger"
                                                action={() => {
                                                    openModal(props => (
                                                        <ConfirmModal
                                                            {...props}
                                                            title="Delete Profile Set?"
                                                            message={`Delete “${preset.name}”? This cannot be undone.`}
                                                            confirmText="Delete"
                                                            cancelText="Cancel"
                                                            onConfirm={() => {
                                                                void deletePreset(actualIndex, section, guildId).then(onUpdate);
                                                            }}
                                                            onCancel={() => { }}
                                                        />
                                                    ));
                                                }}
                                            />
                                        </Menu.Menu>
                                    ));
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
