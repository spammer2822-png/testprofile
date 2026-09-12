/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { openModal, React, showToast, Toasts } from "@webpack/common";

import { cl, settings } from "../index";
import { exportPresets, type ImportDecision, importPresets, savePreset } from "../utils/actions";
import { copyMainProfileToServer, loadPresetAsPending } from "../utils/profile";
import { assertScope, getScope, getSnapshot, loadPresets, type PresetSection, type ProfilePresetEx, subscribe } from "../utils/storage";
import { ImportProfilesModal } from "./confirmModal";
import { DraftEditor } from "./draftEditor";
import { PresetList } from "./presetList";

const PAGE_SIZE = 6;
type Props = {
    section: PresetSection;
    storageSection: PresetSection;
    guildId?: string;
    onOpenProfileEditor: () => void;
    onBusyChange: (busy: boolean) => void;
};

export function PresetManager({ section, storageSection, guildId, onOpenProfileEditor, onBusyChange }: Props) {
    const { presets, loading, error } = React.useSyncExternalStore(subscribe, getSnapshot);
    const [presetName, setPresetName] = React.useState("");
    const [search, setSearch] = React.useState("");
    const [page, setPage] = React.useState(1);
    const [busy, setBusy] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string>();
    const [notice, setNotice] = React.useState("");
    const { avatarSize } = settings.use(["avatarSize"]);
    const busyRef = React.useRef(false);
    const mounted = React.useRef(true);
    const lastRandomId = React.useRef<string | undefined>(undefined);
    const fileInput = React.useRef<HTMLInputElement>(null);
    const id = React.useId();
    const isGuildProfile = section === "server";

    React.useEffect(() => {
        mounted.current = true;
        void loadPresets(storageSection);
        return () => { mounted.current = false; };
    }, [storageSection]);

    const ready = !loading && !error && (!isGuildProfile || Boolean(guildId));
    const filtered = React.useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return query ? presets.filter(preset => preset.name.toLocaleLowerCase().includes(query)) : presets;
    }, [presets, search]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const run = async (action: (guard: () => void) => Promise<void>) => {
        if (busyRef.current || !ready) return;
        const scope = getScope(storageSection);
        const guard = () => {
            assertScope(scope);
            if (!mounted.current) throw new Error("The profile view changed. Please try again.");
        };
        busyRef.current = true;
        setBusy(true);
        onBusyChange(true);
        try { await action(guard); }
        catch (err) {
            showToast(err instanceof Error ? err.message : "Could not complete this profile action.", Toasts.Type.FAILURE);
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy(false);
            onBusyChange(false);
        }
    };
    const saveCurrent = () => run(async guard => {
        const name = presetName.trim();
        if (!name) return;
        guard();
        await savePreset(name, storageSection, guildId, { isGuildProfile });
        guard();
        setPresetName("");
        setSearch("");
        setPage(Math.ceil(getSnapshot().presets.length / PAGE_SIZE));
        showToast(`Saved “${name}”.`, Toasts.Type.SUCCESS);
    });
    const apply = (preset: ProfilePresetEx) => run(async guard => {
        const result = await loadPresetAsPending(preset, guildId, { isGuildProfile, guard });
        guard();
        setSelectedId(preset.id);
        setNotice(result.statusChanged
            ? "Profile changes are ready to review. Your custom status has been updated."
            : result.fieldsChanged ? "Profile changes are ready to review." : "This layout already matches the current profile.");
        showToast(`Loaded “${preset.name}”.`, Toasts.Type.SUCCESS);
    });
    const promptImport = (count: number) => new Promise<ImportDecision>(resolve => {
        openModal(props => <ImportProfilesModal {...props} title="Import Profiles"
            message={`You have ${count} saved profiles. Merge the imported profiles, or replace this collection?`}
            onOverride={() => resolve("override")} onMerge={() => resolve("merge")} onCancel={() => resolve("cancel")} />,
        { onCloseCallback: () => resolve("cancel") });
    });

    return <section className={cl("section")} aria-busy={busy || loading}>
        <div className={cl("section-heading-row")}>
            <Heading tag="h3" className={cl("heading")}>Saved Profiles</Heading>
            <span className={cl("count")}>{presets.length}</span>
            <Button type="button" size="small" className={cl("add-button")} disabled={!ready || busy} onClick={() => {
                const scope = getScope(storageSection);
                openModal(props => <DraftEditor {...props} scope={scope} guildId={guildId} isGuildProfile={isGuildProfile}
                    onSaved={() => { setSearch(""); setPage(Math.ceil(getSnapshot().presets.length / PAGE_SIZE)); }} />);
            }}>+ Add New Profile</Button>
        </div>
        <p className={cl("helper")}>Build a new layout without changing your active profile, or save a snapshot below.</p>
        {storageSection !== section && <p className={cl("helper")}>Showing your main saved collection. Collection edits are shared with Main Profile.</p>}
        {isGuildProfile && <div className={cl("copy-card")}>
            <div><strong>Bring your main layout here</strong><span>Copy your current main profile to the selected server. Your main profile and status stay unchanged.</span></div>
            <Button type="button" size="small" disabled={!ready || busy} onClick={() => void run(async guard => {
                await copyMainProfileToServer(guildId!, guard);
                guard();
                setSelectedId(undefined);
                setNotice("Main profile copied to this server’s pending changes.");
                showToast("Main profile copied. Review and save it in Discord.", Toasts.Type.SUCCESS);
            })}>Copy Main Profile to Server</Button>
        </div>}
        <form className={cl("save-row")} onSubmit={e => { e.preventDefault(); void saveCurrent(); }}>
            <label className={cl("field")} htmlFor={id + "-save"}><span>Save current profile</span>
                <input id={id + "-save"} placeholder="Name this snapshot" maxLength={100} value={presetName} disabled={!ready || busy}
                    onChange={e => setPresetName(e.target.value)} />
            </label>
            <Button type="submit" size="small" variant="secondary" disabled={!ready || busy || !presetName.trim()}>Save Current</Button>
        </form>
        <div className={cl("toolbar")}>
            <label className={cl("search-field")} htmlFor={id + "-search"}>
                <span className={cl("sr-only")}>Search saved profiles</span>
                <input id={id + "-search"} type="search" placeholder="Search profiles…" value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }} disabled={loading} />
            </label>
            <Button type="button" size="small" variant="secondary" disabled={!ready || busy || !filtered.length} onClick={() => {
                const choices = filtered.length > 1 ? filtered.filter(preset => preset.id !== lastRandomId.current) : filtered;
                const preset = choices[Math.floor(Math.random() * choices.length)];
                lastRandomId.current = preset.id;
                void apply(preset);
            }}>Random</Button>
            <Button type="button" size="small" variant="secondary" disabled={!ready || busy} onClick={() => fileInput.current?.click()}>Import</Button>
            <Button type="button" size="small" variant="secondary" disabled={!ready || busy || !presets.length} onClick={() => exportPresets(storageSection)}>Export All</Button>
            <input ref={fileInput} className={cl("sr-only")} type="file" accept=".json,application/json" tabIndex={-1} aria-label="Import profiles"
                onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    void run(async guard => {
                        const count = await importPresets(file, getScope(storageSection), promptImport);
                        guard();
                        if (!count) return;
                        setSearch(""); setPage(1); setSelectedId(undefined); setNotice("");
                        showToast(`Imported ${count} profiles.`, Toasts.Type.SUCCESS);
                    });
                }} />
        </div>
        {loading ? <div className={cl("empty-state")} role="status">Loading your saved profiles…</div>
            : error ? <div className={cl("error")} role="alert"><p>{error}</p><Button type="button" size="small" onClick={() => void loadPresets(storageSection)}>Retry</Button></div>
                : !presets.length ? <div className={cl("empty-state")}><strong>Your next profile starts here</strong><p>Use Add New Profile to create a layout, or Save Current to keep this one.</p></div>
                    : !filtered.length ? <div className={cl("no-results")}>No profiles match “{search}”.</div>
                        : <PresetList presets={visible} allPresets={presets} avatarSize={avatarSize} selectedId={selectedId} disabled={busy || !ready}
                            onLoad={apply} guildId={guildId} isGuildProfile={isGuildProfile} section={storageSection} />}
        {totalPages > 1 && <nav className={cl("pagination")} aria-label="Saved profiles pages">
            <Button type="button" size="small" variant="secondary" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>←</Button>
            <span className={cl("page-of")} aria-live="polite">Page {currentPage} of {totalPages}</span>
            <Button type="button" size="small" variant="secondary" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>→</Button>
        </nav>}
        {notice && <div className={cl("pending-notice")} role="status">
            <div><strong>{notice}</strong><span>Use Discord&apos;s Save Changes button to commit the profile layout.</span></div>
            <Button type="button" size="small" variant="primary" disabled={busy} onClick={onOpenProfileEditor}>Review Profile</Button>
        </div>}
        {!isGuildProfile && presets.some(preset => "customStatus" in preset) && <p className={cl("helper")}>Applying a saved custom status updates it immediately. Other profile fields wait for Discord&apos;s Save Changes.</p>}
    </section>;
}
