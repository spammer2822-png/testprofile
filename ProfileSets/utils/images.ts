/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSafeImage, MAX_IMAGE_BYTES } from "./schema";

const cache = new Map<string, { value: string; expires: number; }>();
const inFlight = new Map<string, Promise<string>>();
const CACHE_BUDGET = 24 * 1024 * 1024;
let cachedBytes = 0;

export function clearImageCache() {
    cache.clear();
    cachedBytes = 0;
}
export async function fileToImageData(file: Blob): Promise<string> {
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Choose an image smaller than 10 MiB.");
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const starts = (...bytes: number[]) => bytes.every((byte, i) => head[i] === byte);
    const mime = starts(137, 80, 78, 71, 13, 10, 26, 10) ? "image/png"
        : starts(255, 216, 255) ? "image/jpeg"
            : starts(71, 73, 70, 56) ? "image/gif"
                : starts(82, 73, 70, 70) && head[8] === 87 && head[9] === 69 && head[10] === 66 && head[11] === 80 ? "image/webp" : null;
    if (!mime) throw new Error("Choose a PNG, JPEG, GIF or WebP image.");
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the image."));
        reader.onabort = () => reject(new Error("Image reading was cancelled."));
        reader.readAsDataURL(new Blob([file], { type: mime }));
    });
}
export async function imageUrlToBase64(url: string): Promise<string> {
    if (!isSafeImage(url)) throw new Error("This image is not a supported Discord image.");
    if (url.startsWith("data:")) return url;
    const cached = cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pending = inFlight.get(url);
    if (pending) return pending;
    const task = (async () => {
        const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Discord image download failed (${response.status}). Please try again.`);
        if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("This image is larger than 10 MiB.");
        const value = await fileToImageData(await response.blob());
        const previous = cache.get(url);
        if (previous) {
            cachedBytes -= previous.value.length;
            cache.delete(url);
        }
        while (cache.size && cachedBytes + value.length > CACHE_BUDGET) {
            const oldest = cache.keys().next().value!;
            cachedBytes -= cache.get(oldest)!.value.length;
            cache.delete(oldest);
        }
        if (value.length <= CACHE_BUDGET) {
            cache.set(url, { value, expires: Date.now() + 300000 });
            cachedBytes += value.length;
        }
        return value;
    })();
    inFlight.set(url, task);
    try { return await task; }
    finally { inFlight.delete(url); }
}
