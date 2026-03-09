import * as UI from './ui.js';
import * as Helpers from './helpers.js';
import { AppState, frames } from './state.js';
import {
    initKonva,
    addMockup,
    lastAddedMockup,
    tr,
    updateKonvaCanvasBackground,
    setCanvasBackgroundImageFromFile,
    addCanvasText,
    getSelectedCanvasTextSnapshot,
    updateSelectedCanvasText,
    getCanvasBackgroundImageState,
    restoreCanvasBackgroundImageState,
} from './konvaSetup.js';
import { initExport, updateDownloadSceneButtonState } from './export.js';
import { initZoomPanControls } from './viewportControls.js';
import { createHistoryManager } from './historyManager.js';
import { createUploadManager } from './uploadManager.js';
import { createFrameActions } from './frameActions.js';
import { createLayoutManager } from './layoutManager.js';
import { CANVAS_GRADIENTS, getDefaultCanvasGradientId } from './canvasGradients.js';
import { createGradientEditor } from './gradientEditor.js';
import { placeImageInMockup } from './mockupPlacement.js';
import { initResponsiveToolbarToggle } from './toolbarToggle.js';
import { createCanvasTextPanel } from './canvasTextPanel.js';

const EDITABLE_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const FRAMES_CHANGED_HISTORY_DEBOUNCE_MS = 80;
let resetViewportTransform = null;
let historyManager = null;
let uploadManager = null;
let frameActions = null;
let layoutManager = null;
let gradientEditors = [];
let canvasTextPanel = null;
let framesChangedHistoryTimer = null;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isTypingInFormField() {
    const active = document.activeElement;
    if (!active) return false;
    if (EDITABLE_TAGS.includes(active.tagName)) return true;
    if (active.isContentEditable) return true;
    return !!active.closest?.('#canvasTextPanel');
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

async function ensureInitialFrameVisible() {
    const stage = getStage();
    if (!stage) return;
    if (getMockupGroups(stage).length > 0) return;
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

async function addMockupByFrameId(frameId, options) {
    const previousFrameId = UI.frameSelect.value;
    try {
        UI.frameSelect.value = frameId;
        return await addMockup(options);
    } finally {
        UI.frameSelect.value = previousFrameId;
    }
}

function populateCanvasGradientOptions() {
    populateGradientOptions(UI.bgGradient, {
        includeNone: true,
        defaultValue: getDefaultCanvasGradientId(),
    });
}

function populateTextGradientOptions() {
    populateGradientOptions(UI.canvasTextColorGradient, { defaultValue: 'solid' });
    populateGradientOptions(UI.canvasTextHighlightGradient, {
        includeNone: true,
        defaultValue: 'none',
    });
}

function populateGradientOptions(selectEl, { includeNone = false, defaultValue = 'solid' } = {}) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    if (includeNone) selectEl.appendChild(new Option('None', 'none'));
    CANVAS_GRADIENTS.forEach((preset) => {
        if (preset.id === 'none') return;
        selectEl.appendChild(new Option(preset.name, preset.id));
    });
    selectEl.value = defaultValue;
}

function syncGradientEditorsVisibility() {
    gradientEditors.forEach((editor) => editor?.syncVisibility?.());
}

function ensureCanvasEnabledForOverlay() {
    if (!UI.canvasEnabled || UI.canvasEnabled.checked) return;
    UI.canvasEnabled.checked = true;
    layoutManager?.applyCanvasMode();
    syncGradientEditorsVisibility();
}

function createTextCustomGradientEditor({ modeSource, refs, textGradientKey }) {
    return createGradientEditor({
        ui: UI,
        isTypingInFormField,
        modeSources: [modeSource],
        refs,
        onChange: () => {
            const selected = getSelectedCanvasTextSnapshot();
            if (selected?.[textGradientKey] === 'custom') {
                updateSelectedCanvasText({ [textGradientKey]: 'custom' });
                canvasTextPanel?.sync();
            }
            historyManager?.push();
        },
    });
}

function getGradientEditorRefs(prefix) {
    const capitalizedPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return {
        panel: UI[`${prefix}CustomPanel`],
        editor: UI[`${prefix}Editor`],
        bar: UI[`${prefix}Bar`],
        stopsLayer: UI[`${prefix}StopsLayer`],
        stopColor: UI[`${prefix}StopColor`],
        angle: UI[`${prefix}Angle`],
        angleValue: UI[`${prefix}AngleValue`],
        data: UI[`custom${capitalizedPrefix}Data`],
    };
}

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
    populateCanvasGradientOptions();
    populateTextGradientOptions();
    // responsive default canvas size for mobile
    if (window.innerWidth <= 768) { 
        UI.docWidth.value = 350; 
        UI.docHeight.value = 600;
    }
    if (UI.canvasEnabled) {
        UI.canvasEnabled.checked = false;
    }

    Helpers.resizeDocument();
    initResponsiveToolbarToggle();

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
        getCanvasBackgroundImageState,
        restoreCanvasBackgroundImageState,
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
    gradientEditors = [
        createGradientEditor({
            ui: UI,
            isTypingInFormField,
            modeSources: [UI.bgGradient],
            onChange: () => {
                Helpers.updateMockupBackground();
                updateKonvaCanvasBackground();
                historyManager?.push();
            },
        }),
        ...[
            { modeSource: UI.canvasTextColorGradient, textGradientKey: 'textGradientId', refPrefix: 'textGradient' },
            { modeSource: UI.canvasTextHighlightGradient, textGradientKey: 'textHighlightGradientId', refPrefix: 'textHighlightGradient' },
        ].map((config) => createTextCustomGradientEditor({
            modeSource: config.modeSource,
            textGradientKey: config.textGradientKey,
            refs: getGradientEditorRefs(config.refPrefix),
        })),
    ];
    gradientEditors.forEach((editor) => editor.init());
    canvasTextPanel = createCanvasTextPanel({
        ui: UI,
        getSelectedSnapshot: getSelectedCanvasTextSnapshot,
        updateSelected: updateSelectedCanvasText,
        ensureCanvasEnabled: ensureCanvasEnabledForOverlay,
        addCanvasText,
    });
    canvasTextPanel.bind();
    layoutManager.applyCanvasMode({ skipHistory: true });
    canvasTextPanel.sync();
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
    layoutManager?.fitMockupsToViewport?.();
    setTimeout(() => {
        ensureInitialFrameVisible();
    }, 120);
    historyManager.captureInitialScene();

    // --- Bind event listeners ---
    UI.bgColor.addEventListener('input', Helpers.updateMockupBackground);
    bindCanvasSizeCommitInput(UI.docWidth);
    bindCanvasSizeCommitInput(UI.docHeight);
    UI.canvasEnabled?.addEventListener('change', () => {
        layoutManager?.applyCanvasMode();
        syncGradientEditorsVisibility();
        canvasTextPanel?.sync();
    });
    UI.canvasImageBtn?.addEventListener('click', () => {
        ensureCanvasEnabledForOverlay();
        UI.bgImageInput?.click();
    });
    UI.bgImageInput?.addEventListener('change', async (event) => {
        const file = event.target?.files?.[0];
        if (!file) {
            UI.bgImageInput.value = '';
            return;
        }
        try {
            await setCanvasBackgroundImageFromFile(file);
            updateKonvaCanvasBackground();
            historyManager?.push();
        } catch (error) {
            alert(error?.message || 'Sorry, there was an error processing your image.');
        } finally {
            UI.bgImageInput.value = '';
        }
    });
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
    window.addEventListener('canvas-bg-images-changed', () => {
        historyManager?.push();
    });
    window.addEventListener('canvas-overlay-selection-changed', () => {
        canvasTextPanel?.sync();
    });
    getStage()?.on('dragend transformend', () => historyManager?.push());
    layoutManager.bindWindowResize();

    // --- Start background rendering ---
    layoutManager.renderBackground();
}

window.addEventListener('DOMContentLoaded', initializeApp);
