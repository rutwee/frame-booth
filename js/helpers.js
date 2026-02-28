import { mockupArea, bgColor, docWidth, docHeight, canvasEnabled } from './ui.js';
import { resizeKonvaStage } from './konvaSetup.js';

// Load an image source into an HTMLImageElement.
export const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

// Convert a local file into a data URL string.
export const readFileAsDataURL = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
});

export function isCanvasEnabled() {
    return !!canvasEnabled?.checked;
}

// Apply transparent/solid workspace background based on canvas mode.
export function updateMockupBackground() {
    const enabled = isCanvasEnabled();
    mockupArea.classList.toggle('canvas-disabled', !enabled);
    mockupArea.style.backgroundColor = enabled ? (bgColor.value || "#ffffff") : 'transparent';
}

// Measure parent usable size after padding.
function getParentInnerSize() {
    const parent = mockupArea.parentElement;
    if (!parent) {
        return { width: mockupArea.offsetWidth || 900, height: mockupArea.offsetHeight || 600 };
    }
    const styles = getComputedStyle(parent);
    const padX = parseFloat(styles.paddingLeft || 0) + parseFloat(styles.paddingRight || 0);
    const padY = parseFloat(styles.paddingTop || 0) + parseFloat(styles.paddingBottom || 0);
    return {
        width: Math.max(1, parent.clientWidth - padX),
        height: Math.max(1, parent.clientHeight - padY),
    };
}

// Resize mockup area to canvas size or to full preview area in canvas-off mode.
export function resizeDocument() {
    const enabled = isCanvasEnabled();
    if (enabled) {
        mockupArea.style.width = `${+docWidth.value || 900}px`;
        mockupArea.style.height = `${+docHeight.value || 600}px`;
    } else {
        const { width, height } = getParentInnerSize();
        mockupArea.style.width = `${width}px`;
        mockupArea.style.height = `${height}px`;
    }

    resizeKonvaStage?.();
}
