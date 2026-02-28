import * as UI from './ui.js';
import * as Helpers from './helpers.js';
import { AppState, frames } from './state.js';
import { initKonva, addMockup, lastAddedMockup, tr, updateKonvaCanvasBackground } from './konvaSetup.js';
import { initExport, updateDownloadSceneButtonState } from './export.js';
import { collectMockupNodes } from './sceneUtils.js';
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
const FRAMES_CHANGED_HISTORY_DEBOUNCE_MS = 80;
const PHONE_MEDIA_QUERY = '(max-width: 768px)';
let resetViewportTransform = null;
let historyManager = null;
let uploadManager = null;
let frameActions = null;
let layoutManager = null;
let framesChangedHistoryTimer = null;

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

// Ensure users never land on an empty workspace if initial add fails.
async function ensureInitialFrameVisible() {
    const stage = getStage();
    if (!stage) return;
    if (collectMockupNodes(stage).length > 0) return;
    try {
        await addMockup();
    } catch (error) {
        console.error('Failed to recover initial frame:', error);
    }
    layoutManager?.fitMockupsToViewport?.();
}

function scheduleHistoryPushFromFramesChanged() {
    if (framesChangedHistoryTimer) {
        clearTimeout(framesChangedHistoryTimer);
    }
    framesChangedHistoryTimer = setTimeout(() => {
        framesChangedHistoryTimer = null;
        historyManager?.push();
    }, FRAMES_CHANGED_HISTORY_DEBOUNCE_MS);
}

// Commit canvas size updates only after confirmed input actions.
function bindCanvasSizeCommitInput(inputEl) {
    if (!inputEl) return;
    const commit = () => Helpers.resizeDocument();
    inputEl.addEventListener('change', commit);
    inputEl.addEventListener('blur', commit);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        inputEl.blur();
    });
}

// Keep mobile toolbar state in sync across viewport changes.
function initResponsiveToolbarToggle() {
    const toggleBtn = document.querySelector('#toolbarToggleBtn');
    const backdrop = document.querySelector('#toolbarBackdrop');
    if (!toggleBtn || !backdrop) return;

    const phoneMediaQuery = window.matchMedia(PHONE_MEDIA_QUERY);

    const setOpenState = (open) => {
        const shouldOpen = !!open && phoneMediaQuery.matches;
        document.body.classList.toggle('toolbar-open', shouldOpen);
        toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        backdrop.hidden = !shouldOpen;
    };
    const syncToggleButtonVisibility = () => {
        const isPhone = phoneMediaQuery.matches;
        toggleBtn.hidden = !isPhone;
        if (!isPhone) setOpenState(false);
    };

    toggleBtn.addEventListener('click', () => {
        const isOpen = document.body.classList.contains('toolbar-open');
        setOpenState(!isOpen);
    });
    backdrop.addEventListener('click', () => setOpenState(false));
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpenState(false);
    });
    const onMediaChange = (e) => {
        if (!e.matches) setOpenState(false);
        syncToggleButtonVisibility();
    };
    if (typeof phoneMediaQuery.addEventListener === 'function') {
        phoneMediaQuery.addEventListener('change', onMediaChange);
    } else if (typeof phoneMediaQuery.addListener === 'function') {
        phoneMediaQuery.addListener(onMediaChange);
    }
    window.addEventListener('resize', syncToggleButtonVisibility);
    setOpenState(false);
    syncToggleButtonVisibility();
}

// Add a mockup using a specific frame id while restoring prior UI selection.
async function addMockupByFrameId(frameId, options) {
    const previousFrameId = UI.frameSelect.value;
    try {
        UI.frameSelect.value = frameId;
        return await addMockup(options);
    } finally {
        UI.frameSelect.value = previousFrameId;
    }
}

// Build frame dropdown grouped by device family.
function populateFrameSelect() {
    const groupedFrames = frames.reduce((acc, frame) => {
        (acc[frame.group] ||= []).push(frame);
        return acc;
    }, {});

    for (const [groupName, frameList] of Object.entries(groupedFrames)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        for (const frame of frameList) {
            optgroup.appendChild(new Option(frame.name, frame.id));
        }
        UI.frameSelect.appendChild(optgroup);
    }
    if (UI.frameSelect.options.length) UI.frameSelect.options[0].selected = true;
}

// Wire up app modules and event handlers.
async function initializeApp() {
    populateFrameSelect();

    // Use tighter default canvas dimensions on phones.
    if (window.matchMedia(PHONE_MEDIA_QUERY).matches) {
        UI.docWidth.value = 350;
        UI.docHeight.value = 600;
    }
    if (UI.canvasEnabled) UI.canvasEnabled.checked = false;

    Helpers.resizeDocument();
    initResponsiveToolbarToggle();

    // Initialize core modules.
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
        getMockupGroups: collectMockupNodes,
        placeImageInMockup,
        updateDownloadSceneButtonState,
        ensureResponsiveFit: () => layoutManager?.fitMockupsToViewport?.(),
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

    // Seed the workspace with one frame.
    try {
        await addMockup();
    } catch (error) {
        console.error('Failed to load default frame:', error);
    }
    layoutManager?.fitMockupsToViewport?.();
    setTimeout(() => {
        ensureInitialFrameVisible();
    }, 120);
    historyManager.captureInitialScene();

    // Bind UI and scene events.
    UI.bgColor.addEventListener('input', Helpers.updateMockupBackground);
    bindCanvasSizeCommitInput(UI.docWidth);
    bindCanvasSizeCommitInput(UI.docHeight);
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
        layoutManager?.fitMockupsToViewport?.();
        updateDownloadSceneButtonState();
        scheduleHistoryPushFromFramesChanged();
    });
    getStage()?.on('dragend transformend', () => historyManager?.push());
    layoutManager.bindWindowResize();

    // Paint initial workspace background.
    layoutManager.renderBackground();
}

window.addEventListener('DOMContentLoaded', initializeApp);

// Place a screenshot into the selected frame's screen mask.
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
