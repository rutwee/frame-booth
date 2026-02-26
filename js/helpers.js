// ==================================================================
//    HELPER UTILITIES
// ==================================================================
import { mockupArea, bgColor, docWidth, docHeight, canvasEnabled } from './ui.js';
import { resizeKonvaStage } from './konvaSetup.js';

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

export function updateMockupBackground() {
    const enabled = isCanvasEnabled();
    mockupArea.classList.toggle('canvas-disabled', !enabled);
    mockupArea.style.backgroundColor = enabled ? (bgColor.value || "#ffffff") : 'transparent';
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
