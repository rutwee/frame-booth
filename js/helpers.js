// ==================================================================
//    HELPER UTILITIES
// ==================================================================
import {
    mockupArea,
    bgColor,
    bgGradient,
    customGradientData,
    docWidth,
    docHeight,
    canvasEnabled,
} from './ui.js';
import { resizeKonvaStage } from './konvaSetup.js';
import { getCanvasGradientCss, getDefaultCanvasGradientId, getDefaultCustomGradient } from './canvasGradients.js';

/**
 * Loads an image from a given source URL.
 * @param {string} src The URL of the image to load.
 * @returns {Promise<HTMLImageElement>} A promise that resolves with the loaded image element.
 */
export const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

/**
 * Reads a local file (e.g., from an <input type="file">) as a Data URL.
 * @param {File} file The file object to read.
 * @returns {Promise<string>} A promise that resolves with the file's content as a Data URL string.
 */
export const readFileAsDataURL = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
});

export function isCanvasEnabled() {
    return !!canvasEnabled?.checked;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback) {
    return /^#([0-9a-f]{6})$/i.test(String(value || '')) ? value : fallback;
}

export function getCurrentCustomGradientConfig() {
    const defaults = getDefaultCustomGradient();
    try {
        const raw = JSON.parse(customGradientData?.value || '{}');
        const rawStops = Array.isArray(raw?.stops) ? raw.stops : [];
        const stops = rawStops
            .filter((stop) => stop && typeof stop === 'object')
            .map((stop) => {
                const numericPosition = Number(stop.position);
                return {
                    position: Number.isFinite(numericPosition) ? clamp(numericPosition, 0, 1) : 0,
                    color: normalizeHexColor(stop.color, '#ffffff'),
                };
            })
            .sort((a, b) => a.position - b.position);

        if (stops.length >= 2) {
            const normalizedAngle = Number(raw.angle);
            const angle = Number.isFinite(normalizedAngle)
                ? ((normalizedAngle % 360) + 360) % 360
                : defaults.angle;
            return { angle, stops };
        }
    } catch {
        // fall through to defaults
    }

    return {
        angle: defaults.angle,
        stops: [
            { position: defaults.stops[0], color: defaults.stops[1] },
            { position: defaults.stops[2], color: defaults.stops[3] },
        ],
    };
}

export function updateMockupBackground() {
    const enabled = isCanvasEnabled();
    mockupArea.classList.toggle('canvas-disabled', !enabled);
    if (!enabled) {
        mockupArea.style.background = 'transparent';
        return;
    }

    const gradientId = bgGradient?.value || getDefaultCanvasGradientId();
    mockupArea.style.background = getCanvasGradientCss(
        gradientId,
        bgColor.value || '#ffffff',
        getCurrentCustomGradientConfig(),
    );
}

export function resizeDocument() {
    const enabled = isCanvasEnabled();
    let w;
    let h;

    if (enabled) {
        w = +docWidth.value || 900;
        h = +docHeight.value || 600;
    } else {
        const parent = mockupArea.parentElement;
        const styles = parent ? getComputedStyle(parent) : null;
        const padX = (parseFloat(styles?.paddingLeft || 0) + parseFloat(styles?.paddingRight || 0));
        const padY = (parseFloat(styles?.paddingTop || 0) + parseFloat(styles?.paddingBottom || 0));
        w = Math.max(1, (parent?.clientWidth || mockupArea.offsetWidth || 900) - padX);
        h = Math.max(1, (parent?.clientHeight || mockupArea.offsetHeight || 600) - padY);
    }

    mockupArea.style.width = `${w}px`;
    mockupArea.style.height = `${h}px`;
    
    resizeKonvaStage?.();
}
