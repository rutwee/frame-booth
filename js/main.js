// ==========================================================================
// APPLICATION ENTRY POINT
// ==========================================================================

import * as UI from './ui.js';
import * as Helpers from './helpers.js';
import { AppState, frames } from './state.js';
import { initKonva, addMockup, lastAddedMockup, tr, updateKonvaCanvasBackground } from './konvaSetup.js';
import { initExport, updateDownloadSceneButtonState } from './export.js';
import {
    detectIPhoneScreenshotProfile,
    getTargetIslandLocalRect,
    calculateScreenshotPlacement,
} from './screenshotUtils.js';
import { initZoomPanControls } from './viewportControls.js';
import { createHistoryManager } from './historyManager.js';
import { createUploadManager } from './uploadManager.js';
import { createFrameActions } from './frameActions.js';
import { createLayoutManager } from './layoutManager.js';

const EDITABLE_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
let resetViewportTransform = null;
let historyManager = null;
let uploadManager = null;
let frameActions = null;
let layoutManager = null;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isTypingInFormField() {
    return EDITABLE_TAGS.includes(document.activeElement?.tagName);
}

function clampZoom(value) {
    return clamp(value, MIN_ZOOM, MAX_ZOOM);
}

function getStage() {
    return Konva.stages?.[0] || null;
}

function getMockupGroups(stage) {
    if (!stage?.find) return [];
    const found = stage.find('.mockup-group');
    return typeof found?.toArray === 'function' ? found.toArray() : Array.from(found || []);
}

async function addMockupByFrameId(frameId) {
    const previousFrameId = UI.frameSelect.value;
    try {
        UI.frameSelect.value = frameId;
        return await addMockup();
    } finally {
        UI.frameSelect.value = previousFrameId;
    }
}

// ==========================================================================
// INITIALIZATION - initializeApp()
// ==========================================================================
async function initializeApp() {
    // --- initial UI setup ---
    const groupedFrames = frames.reduce((acc, frame) => {
        (acc[frame.group] = acc[frame.group] || []).push(frame);
        return acc;
    }, {});

    Object.keys(groupedFrames).forEach(groupName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        groupedFrames[groupName].forEach(frame => {
            const option = new Option(frame.name, frame.id);
            optgroup.appendChild(option);
        });
        UI.frameSelect.appendChild(optgroup);
    });
    if (UI.frameSelect.options.length > 0) {
        UI.frameSelect.options[0].selected = true;
    }
    // responsive default canvas size for mobile
    if (window.innerWidth <= 768) { 
        UI.docWidth.value = 350; 
        UI.docHeight.value = 600;
    }
    if (UI.canvasEnabled) {
        UI.canvasEnabled.checked = false;
    }

    Helpers.resizeDocument();

    // --- Initialize modules ---
    initKonva();
    layoutManager = createLayoutManager({
        ui: UI,
        helpers: Helpers,
        getStage,
        updateKonvaCanvasBackground,
        updateDownloadSceneButtonState,
        onHistoryPush: () => historyManager?.push(),
    });
    historyManager = createHistoryManager({
        ui: UI,
        appState: AppState,
        transformer: tr,
        helpers: Helpers,
        addMockupByFrameId,
        applyCanvasMode: (options) => layoutManager?.applyCanvasMode(options),
        getStage,
        getMockupGroups,
        placeImageInMockup,
        updateDownloadSceneButtonState,
    });
    uploadManager = createUploadManager({
        ui: UI,
        appState: AppState,
        getLastAddedMockup: () => lastAddedMockup,
        getStage,
        helpers: Helpers,
        placeImageInMockup,
        onSceneChanged: () => historyManager?.push(),
    });
    frameActions = createFrameActions({
        ui: UI,
        appState: AppState,
        transformer: tr,
        addMockup,
        placeImageInMockup,
        updateDownloadSceneButtonState,
        pushHistory: () => historyManager?.push(),
        undo: () => historyManager?.undo(),
        redo: () => historyManager?.redo(),
        isTypingInFormField,
    });
    layoutManager.applyCanvasMode({ skipHistory: true });
    initExport();
    resetViewportTransform = initZoomPanControls({
        previewWrap: document.querySelector('.preview-wrap'),
        mockupArea: UI.mockupArea,
        getStage,
        clampZoom,
        isTypingInFormField,
    });
    uploadManager.initDragAndDropUpload();

    // --- Add the default frame ---
    try {
        await addMockup();
    } catch (error) {
        console.error('Failed to load default frame:', error);
    }
    historyManager.captureInitialScene();

    // --- Bind event listeners ---
    UI.bgColor.addEventListener('input', Helpers.updateMockupBackground);
    UI.docWidth.addEventListener('input', Helpers.resizeDocument);
    UI.docHeight.addEventListener('input', Helpers.resizeDocument);
    UI.canvasEnabled?.addEventListener('change', () => layoutManager?.applyCanvasMode());
    UI.undoBtn?.addEventListener('click', () => historyManager?.undo());
    UI.redoBtn?.addEventListener('click', () => historyManager?.redo());
    UI.resetBtn?.addEventListener('click', () => historyManager?.reset(() => resetViewportTransform?.()));
    UI.uploadBtn.addEventListener('click', () => UI.fileInput.click());
    UI.fileInput.addEventListener('change', uploadManager.handleImageUpload);
    UI.addFrameBtn.addEventListener('click', addMockup);
    UI.updateFrameBtn.addEventListener('click', frameActions.handleFrameSwap);
    window.addEventListener('keydown', frameActions.handleGlobalShortcuts);
    window.addEventListener('frames-changed', () => {
        updateDownloadSceneButtonState();
        historyManager?.push();
    });
    getStage()?.on('dragend transformend', () => historyManager?.push());
    layoutManager.bindWindowResize();

    // --- Start background rendering ---
    layoutManager.renderBackground();
}

window.addEventListener('DOMContentLoaded', initializeApp);


// ==========================================================================
// IMAGE PLACING - placeImageInMockup()
// ==========================================================================
export function placeImageInMockup(img, mockup) {
    mockup.find('.upload-placeholder').forEach(node => node.destroy());
    mockup.find('.screenshot-container').forEach(node => node.destroy());

    const frameId = mockup.getAttr('frameId');
    const frameData = frames.find(f => f.id === frameId);
    if (!frameData || !frameData.screen) return;

    const frameNode = mockup.getChildren(node => node.getClassName() === 'Image')[0];
    const frameImage = frameNode.image();
    if (!frameImage) return;
    const frameScale = frameNode.width() / frameImage.width;

    const screenContainer = {
        x: frameData.screen.x * frameScale, y: frameData.screen.y * frameScale,
        width: frameData.screen.width * frameScale, height: frameData.screen.height * frameScale,
    };
    const targetIslandRect = getTargetIslandLocalRect(frameData, frameScale);
    const sourceProfile = detectIPhoneScreenshotProfile(img.width, img.height);

    const clipGroup = new Konva.Group({
        x: screenContainer.x, y: screenContainer.y, name: 'screenshot-container',
        clipFunc: function(ctx) {
            const scaledRadius = frameData.screen.cornerRadius * frameScale;
            ctx.beginPath();
            ctx.roundRect(0, 0, screenContainer.width, screenContainer.height, scaledRadius);
            if (targetIslandRect) {
                ctx.roundRect(
                    targetIslandRect.x,
                    targetIslandRect.y,
                    targetIslandRect.width,
                    targetIslandRect.height,
                    targetIslandRect.cornerRadius
                );
            }
            ctx.closePath();
        }
    });

    const photoPlacement = calculateScreenshotPlacement(
        img,
        screenContainer,
        targetIslandRect,
        sourceProfile
    );

    const photo = new Konva.Image({
        image: img,
        x: photoPlacement.x,
        y: photoPlacement.y,
        width: photoPlacement.width,
        height: photoPlacement.height,
        name: 'screenshot',
        imageSmoothingEnabled: true 
    });

    clipGroup.add(photo);
    mockup.add(clipGroup);
    clipGroup.moveToBottom();
    mockup.getLayer()?.batchDraw();
}
