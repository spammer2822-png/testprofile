import * as React from "react";
import { createRoot } from "react-dom/client";
export { React };

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L68AAAAASUVORK5CYII=";
export const cl = (...names) => names.map(name => "vc-profile-presets-" + name).join(" ");
export const settings = { use: () => ({ avatarSize: 64, useBasePresetsForServerProfiles: false }) };
const data = new Map([["ProfilePresets_v2_Main:100", Array.from({ length: 8 }, (_, index) => ({
    id: "fixture-" + index, name: ["Everyday", "After hours", "Summer", "Study mode", "Blue skies", "Minimal", "Weekend", "Games"][index],
    timestamp: 1789250000000, avatarDataUrl: PNG, bannerDataUrl: null, accentColor: [0x5865f2, 0x864fd1, 0xd6a353, 0x327b74][index % 4], bio: "Saved profile " + index
}))]]);
const pending = {};
const state = { data, pending, dispatches: [], statuses: [], failWrites: false, toasts: [] };
window.__ui = state;
export const DataStore = {
    get: async key => structuredClone(data.get(key)),
    set: async (key, value) => { if (state.failWrites) throw new Error("disk full"); data.set(key, structuredClone(value)); }
};
export const UserStore = { getCurrentUser: () => ({ id: "100", username: "Dariusz", globalName: "Dariusz", avatar: null }) };
const base = { bio: "Current main bio", pronouns: "he/him", banner: null, accentColor: 0x5865f2, themeColors: [0x5865f2, 0x232428] };
export const UserProfileStore = { getUserProfile: () => base, getGuildMemberProfile: () => ({ bio: "Server bio", banner: null }) };
export const GuildMemberStore = { getMember: () => ({ nick: "Server nickname", avatar: null }) };
const guilds = [{ id: "999", name: "Friends" }, { id: "888", name: "Study Group" }];
export const GuildStore = { getGuildsArray: () => guilds, getGuild: id => guilds.find(g => g.id === id) };
export const SelectedGuildStore = { getGuildId: () => "999", getLastSelectedGuildId: () => "999" };
export const useStateFromStores = (stores, getter) => getter();
export const IconUtils = { getUserAvatarURL: () => PNG, getDefaultAvatarURL: () => PNG };
export const Constants = { Endpoints: { USER_PROFILE: () => "/test/profile" } };
export const RestAPI = { get: async () => ({ body: {} }) };
export const FluxDispatcher = { dispatch: action => {
    state.dispatches.push(structuredClone(action));
    if (action.type === "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES") {
        const { type, guildId, ...changes } = action;
        pending[guildId ?? "main"] = { ...pending[guildId ?? "main"], ...changes };
    }
} };
export const findStoreLazy = () => ({ getPendingChanges: guildId => pending[guildId ?? "main"] ?? {} });
export const getUserSettingLazy = () => ({ getSetting: () => ({ text: "Current status" }), updateSetting: async value => { state.statuses.push(value); } });
export const filters = { byCode: () => () => true };
export const mapMangledModule = () => ({ useOpenProfileSettings: null });
export const SettingsRouter = { openUserSettings: () => {} };
export const Toasts = { Type: { FAILURE: 1, SUCCESS: 2 } };
export const showToast = (message, type) => { state.toasts.push({ message, type }); };
export const Heading = ({ tag = "h3", ...props }) => React.createElement(tag, props);
export const HeadingPrimary = props => <h1 {...props} />;
export const Paragraph = props => <p {...props} />;
export const SettingsTab = props => <div {...props} />;
export const wrapTab = component => component;
export const Button = ({ size = "medium", variant = "primary", className = "", ...props }) => <button data-mana-component="button" className={"vc-btn-base vc-btn-" + size + " vc-btn-" + variant + " " + className} {...props} />;
export const SearchableSelect = ({ options, value, onChange, isDisabled }) => <select aria-label="Server" disabled={isDisabled} value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
const modalRoot = createRoot(document.getElementById("modals"));
export function openModal(render, options = {}) {
    const onClose = () => { modalRoot.render(null); options.onCloseCallback?.(); };
    modalRoot.render(<div className="test-modal-backdrop">{render({ onClose, transitionState: 1 })}</div>);
    return "test-modal";
}
export function Modal({ title, subtitle, children, actions, onClose }) {
    return <div role="dialog" aria-label={title} className="test-modal" onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}{children}
        <footer>{actions?.map(action => <Button key={action.text} disabled={action.disabled} variant={action.variant} onClick={action.onClick}>{action.text}</Button>)}</footer>
    </div>;
}
const menuRoot = createRoot(document.getElementById("menus"));
export const ContextMenuApi = {
    openContextMenu: (event, render) => menuRoot.render(<div className="test-menu">{render()}</div>),
    closeContextMenu: () => menuRoot.render(null)
};
export const Menu = {
    Menu: ({ children }) => <div role="menu">{children}</div>,
    MenuItem: ({ label, action }) => <button role="menuitem" onClick={() => { ContextMenuApi.closeContextMenu(); action(); }}>{label}</button>,
    MenuSeparator: () => <hr />
};
