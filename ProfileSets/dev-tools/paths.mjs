import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

export const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
export const vencordRoot = resolve(process.env.PROFILESETS_VENCORD_DIR ?? fileURLToPath(new URL("../../.vencord/", import.meta.url)));
export const resultsDir = resolve(process.env.PROFILESETS_TEST_OUTPUT ?? join(pluginRoot, "test-results"));
export const vencordRequire = createRequire(join(vencordRoot, "package.json"));
export const uiRequire = createRequire(process.env.PROFILESETS_UI_PACKAGE ?? new URL("./ui/package.json", import.meta.url));
