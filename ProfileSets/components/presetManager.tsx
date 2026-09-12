/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { classes } from "@utils/misc";
import { openModal, React, SelectedGuildStore, showToast, TextInput, Toasts, useStateFromStores } from "@webpack/common";

import { cl, settings } from "../index";
import { exportPresets, ImportDecision, importPresets, savePreset } from "../utils/actions";
import { loadPresetAsPending } from "../utils/profile";
import { currentPresetIndex, loadPresets, presets, PresetSection, setCurrentPresetIndex } from "../utils/storage";
import { ImportProfilesModal } from "./confirmModal";
import { PresetList } from "./presetList";

const PRESETS_PER_PAGE = 5;

type PresetManagerProps = {
    section?: PresetSection;
    guildId?: string;
    onOpenProfileEditor?: () => void;
};

export function PresetManager({ section, guildId, onOpenProfileEditor }: PresetManagerProps) {
    const [presetName, setPresetName] = React.useState("");
    const [searchQuery, setSearchQuery] = React.useState("");
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isApplying, setIsApplying] = React.useState(false);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageInput, setPageInput] = React.useState("1");
    const [selectedPreset, setSelectedPreset] = React.useState<number>(-1);
    const [searchMode, setSearchMode] = React.useState(false);
    const lastRandomIndexRef = React.useRef<number>(-1);
    const isApplyingRef = React.useRef(false);
    const resolvedSection: PresetSection = section ?? "main";
    const isServerSection = resolvedSection === "server";
    const { useBasePresetsForServerProfiles } = settings.use(["useBasePresetsForServerProfiles"]);
    const lastSelectedGuildId = useStateFromStores(
        [SelectedGuildStore],
        () => SelectedGuildStore.getLastSelectedGuildId() ?? SelectedGuildStore.getGuildId()
    );
    const resolvedGuildId = isServerSection ? (guildId ?? lastSelectedGuildId ?? undefined) : undefined;
    const canUseGuild = !isServerSection || Boolean(resolvedGuildId);
    const storageSection: PresetSection = isServerSection && useBasePresetsForServerProfiles
        ? "main"
        : resolvedSection;

    React.useEffect(() => {
        let isActive = true;
        (async () => {
            await loadPresets(storageSection);
            if (!isActive) return;
            setSelectedPreset(-1);
            setCurrentPage(1);
            setPageInput("1");
            setPresetName("");
            setSearchQuery("");
            setSearchMode(false);
            forceUpdate();
        })();
        return () => {
            isActive = false;
        };
    }, [resolvedGuildId, resolvedSection, storageSection]);

    const filteredPresets = !searchMode
        ? presets
        : presets.filter(preset => preset.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));

    const totalPages = Math.max(1, Math.ceil(filteredPresets.length / PRESETS_PER_PAGE));
    const startIndex = (currentPage - 1) * PRESETS_PER_PAGE;
    const currentPresets = filteredPresets.slice(startIndex, startIndex + PRESETS_PER_PAGE);

    React.useEffect(() => {
        if (currentPage <= totalPages) return;
        setCurrentPage(totalPages);
        setPageInput(String(totalPages));
    }, [currentPage, totalPages]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
            setPageInput(String(newPage));
        }
    };

    const handleSavePreset = async () => {
        if (!canUseGuild) return;
        const trimmedName = presetName.trim();
        if (!trimmedName) return;
        setIsSaving(true);
        try {
            await savePreset(trimmedName, storageSection, resolvedGuildId, {
                isGuildProfile: isServerSection
            });
            setPresetName("");
            const newTotalPages = Math.max(1, Math.ceil(presets.length / PRESETS_PER_PAGE));
            setCurrentPage(newTotalPages);
            setPageInput(String(newTotalPages));
            forceUpdate();
            showToast(`Saved profile set “${trimmedName}”.`, Toasts.Type.SUCCESS);
        } catch (error) {
            console.error("[ProfileSets] Failed to save profile set", error);
            showToast("Could not save this profile set.", Toasts.Type.FAILURE);
        } finally {
            setIsSaving(false);
        }
    };

    const applyPreset = async (index: number) => {
        const preset = presets[index];
        if (!preset || isApplyingRef.current) return;

        isApplyingRef.current = true;
        setIsApplying(true);
        try {
            await loadPresetAsPending(preset, resolvedGuildId, {
                isGuildProfile: resolvedSection === "server"
            });
            setSelectedPreset(index);
            setCurrentPresetIndex(index);
            forceUpdate();
            showToast(`Loaded “${preset.name}” as pending profile changes.`, Toasts.Type.SUCCESS);
        } catch (error) {
            console.error("[ProfileSets] Failed to load profile set", error);
            showToast("Could not load this profile set.", Toasts.Type.FAILURE);
        } finally {
            isApplyingRef.current = false;
            setIsApplying(false);
        }
    };

    const handleLoadPreset = async (index: number) => {
        if (!canUseGuild) return;
        await applyPreset(index);
    };

    const handleRandomPreset = async () => {
        if (!canUseGuild) return;
        if (!presets.length) return;

        let nextIndex = Math.floor(Math.random() * presets.length);
        if (presets.length > 1 && nextIndex === lastRandomIndexRef.current) {
            let attempts = 0;
            while (attempts < 5 && nextIndex === lastRandomIndexRef.current) {
                nextIndex = Math.floor(Math.random() * presets.length);
                attempts++;
            }
        }
        lastRandomIndexRef.current = nextIndex;
        await applyPreset(nextIndex);
    };

    const showImportPrompt = (existingCount: number): Promise<ImportDecision> => {
        return new Promise(resolve => {
            openModal(props => (
                <ImportProfilesModal
                    {...props}
                    title="Import Profiles"
                    message={`You have ${existingCount} existing profiles in this section. Do you want to override them or merge with imported profiles?`}
                    onOverride={() => resolve("override")}
                    onMerge={() => resolve("merge")}
                    onCancel={() => resolve("cancel")}
                />
            ));
        });
    };

    const { avatarSize } = settings.store;
    const hasPresets = presets.length > 0;
    const shouldShowPagination = filteredPresets.length > PRESETS_PER_PAGE;

    return (
        <div className={classes(cl("section"), isServerSection ? cl("section-server") : "")} >
            <div className={cl("section-heading-row")}>
                <Heading tag="h3" className={cl("heading")}>
                    Saved Profiles
                </Heading>
                <span className={cl("count")}>{presets.length}</span>
            </div>

            <div className={cl("text")}>
                <TextInput
                    placeholder={searchMode ? "Search profiles..." : "Profile Name"}
                    value={searchMode ? searchQuery : presetName}
                    onChange={searchMode
                        ? value => {
                            setSearchQuery(value);
                            setCurrentPage(1);
                            setPageInput("1");
                        }
                        : setPresetName}
                    onKeyDown={event => {
                        if (!searchMode && event.key === "Enter" && presetName.trim() && !isSaving) {
                            void handleSavePreset();
                        }
                    }}
                    className={cl("text-input")}
                />
            </div>

            <div className={cl("search")}>
                {!searchMode && (
                    <Button
                        size="small"
                        disabled={isSaving || !presetName.trim() || !canUseGuild}
                        onClick={handleSavePreset}
                        className={cl("search-button")}
                    >
                        {isSaving ? "Saving..." : "Save Profile"}
                    </Button>
                )}
                {hasPresets && (
                    <Button
                        size="small"
                        variant={searchMode ? "primary" : "secondary"}
                        onClick={() => {
                            setSearchMode(current => !current);
                            setSearchQuery("");
                            handlePageChange(1);
                        }}
                    >
                        {searchMode ? "Cancel Search" : "Search"}
                    </Button>
                )}
                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => void handleRandomPreset()}
                    disabled={!presets.length || !canUseGuild || isApplying}
                >
                    Random
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => importPresets(() => {
                        setSelectedPreset(-1);
                        setCurrentPage(1);
                        setPageInput("1");
                        forceUpdate();
                    }, showImportPrompt, storageSection, resolvedGuildId)}
                    disabled={!canUseGuild}
                >
                    Import
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => exportPresets(storageSection)}
                    disabled={!hasPresets}
                >
                    Export All
                </Button>
            </div>

            {hasPresets && filteredPresets.length > 0 && (
                <>
                    <PresetList
                        presets={currentPresets}
                        allPresets={presets}
                        avatarSize={avatarSize}
                        selectedPreset={selectedPreset}
                        onLoad={handleLoadPreset}
                        onUpdate={() => {
                            setSelectedPreset(currentPresetIndex);
                            const newTotal = Math.ceil(presets.length / PRESETS_PER_PAGE);
                            if (newTotal === 0) {
                                setCurrentPage(1);
                                setPageInput("1");
                            } else if (currentPage > newTotal) {
                                handlePageChange(newTotal);
                            }
                            forceUpdate();
                        }}
                        guildId={resolvedGuildId}
                        isGuildProfile={isServerSection}
                        section={storageSection}
                        currentPage={currentPage}
                        onPageChange={handlePageChange}
                    />

                    {shouldShowPagination && (
                        <div className={cl("pagination")}>
                            <Button
                                size="small"
                                variant="secondary"
                                disabled={currentPage === 1}
                                onClick={() => handlePageChange(currentPage - 1)}
                            >
                                ←
                            </Button>
                            <div className={cl("page")}>
                                <input
                                    type="text"
                                    value={pageInput}
                                    onChange={e => {
                                        const { value } = e.target;
                                        setPageInput(value);
                                        const num = parseInt(value);
                                        if (!isNaN(num) && num >= 1 && num <= totalPages) {
                                            setCurrentPage(num);
                                        }
                                    }}
                                    className={cl("page-input")}
                                />
                                <span className={cl("page-of")}>
                                    / {totalPages}
                                </span>
                            </div>
                            <Button
                                size="small"
                                variant="secondary"
                                disabled={currentPage === totalPages}
                                onClick={() => handlePageChange(currentPage + 1)}
                            >
                                →
                            </Button>
                        </div>
                    )}

                    <hr className={cl("block")} />
                </>
            )}

            {searchMode && hasPresets && filteredPresets.length === 0 && (
                <div className={cl("no-results")}>No saved profiles match “{searchQuery.trim()}”.</div>
            )}

            {selectedPreset >= 0 && (
                <div className={cl("pending-notice")}>
                    <div>
                        <strong>Preset loaded</strong>
                        <span>Review the preview, then use Discord&apos;s Save Changes button.</span>
                    </div>
                    {onOpenProfileEditor && (
                        <Button size="small" variant="primary" onClick={onOpenProfileEditor}>
                            Review Profile
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
