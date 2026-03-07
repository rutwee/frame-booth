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
import { CANVAS_GRADIENTS, getDefaultCanvasGradientId } from './canvasGradients.js';
import { createGradientEditor } from './gradientEditor.js';

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

function parseFontStyle(fontStyle = '') {
    const normalized = String(fontStyle).toLowerCase();
    return {
        bold: normalized.includes('bold'),
        italic: normalized.includes('italic'),
    };
}

function hasUnderline(textDecoration = '') {
    return String(textDecoration).toLowerCase().includes('underline');
}

function composeFontStyle({ bold = false, italic = false } = {}) {
    if (bold && italic) return 'bold italic';
    if (bold) return 'bold';
    if (italic) return 'italic';
    return 'normal';
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

function initResponsiveToolbarToggle() {
    const toolbar = document.querySelector('#toolbarPanel');
    const toggleBtn = document.querySelector('#toolbarToggleBtn');
    const backdrop = document.querySelector('#toolbarBackdrop');
    if (!toolbar || !toggleBtn || !backdrop) return;

    const phoneMediaQuery = window.matchMedia('(max-width: 768px)');
    const syncToggleButtonVisibility = () => {
        const isPhone = phoneMediaQuery.matches;
        toggleBtn.style.display = isPhone ? 'grid' : 'none';
        if (!isPhone) {
            setOpenState(false);
        }
    };
    const setOpenState = (open) => {
        const shouldOpen = !!open && phoneMediaQuery.matches;
        document.body.classList.toggle('toolbar-open', shouldOpen);
        toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        backdrop.hidden = !shouldOpen;
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
    setOpenState(false);
    syncToggleButtonVisibility();
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
                applyCanvasTextStyle({ [textGradientKey]: 'custom' });
            }
            historyManager?.push();
        },
    });
}

function withSelectedCanvasText(onSelected) {
    const selected = getSelectedCanvasTextSnapshot();
    if (!selected) return;
    onSelected(selected);
    syncCanvasTextPanel();
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

function syncCanvasTextPanel() {
    const selected = getSelectedCanvasTextSnapshot();
    const enabled = !!UI.canvasEnabled?.checked && !!selected;
    UI.canvasTextPanel?.classList.toggle('is-disabled', !enabled);
    if (!enabled) return;
    const styleState = parseFontStyle(selected.fontStyle);
    if (UI.canvasTextInput) UI.canvasTextInput.value = selected.text || '';
    if (UI.canvasTextFontFamily) UI.canvasTextFontFamily.value = selected.fontFamily || 'Arial';
    if (UI.canvasTextSize) UI.canvasTextSize.value = `${Math.max(8, Math.round(selected.fontSize || 24))}`;
    if (UI.canvasTextColor) UI.canvasTextColor.value = selected.fill || '#2f3a4f';
    if (UI.canvasTextColorGradient) UI.canvasTextColorGradient.value = selected.textGradientId || 'solid';
    const hasHighlight = !!(selected.textHighlight || '').trim();
    if (UI.canvasTextHighlight) UI.canvasTextHighlight.value = selected.textHighlight || '#fff0a8';
    if (UI.canvasTextHighlightGradient) {
        UI.canvasTextHighlightGradient.value = hasHighlight
            ? (selected.textHighlightGradientId || 'solid')
            : 'none';
    }
    if (UI.canvasTextAlign) UI.canvasTextAlign.value = selected.align || 'left';
    UI.canvasTextBoldBtn?.classList.toggle('is-active', styleState.bold);
    UI.canvasTextItalicBtn?.classList.toggle('is-active', styleState.italic);
    UI.canvasTextUnderlineBtn?.classList.toggle('is-active', hasUnderline(selected.textDecoration));
}

function applyCanvasTextStyle(partial = {}) {
    updateSelectedCanvasText(partial);
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
    layoutManager.applyCanvasMode({ skipHistory: true });
    syncCanvasTextPanel();
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
        syncCanvasTextPanel();
    });
    UI.canvasImageBtn?.addEventListener('click', () => {
        ensureCanvasEnabledForOverlay();
        UI.bgImageInput?.click();
    });
    UI.canvasTextBtn?.addEventListener('click', () => {
        ensureCanvasEnabledForOverlay();
        addCanvasText();
        syncCanvasTextPanel();
        UI.canvasTextInput?.focus();
        UI.canvasTextInput?.select();
    });
    UI.canvasTextInput?.addEventListener('input', () => {
        applyCanvasTextStyle({ text: UI.canvasTextInput.value || ' ' });
    });
    UI.canvasTextSize?.addEventListener('input', () => {
        const size = Number(UI.canvasTextSize.value) || 24;
        applyCanvasTextStyle({ fontSize: Math.max(8, size) });
    });
    UI.canvasTextFontFamily?.addEventListener('change', () => {
        applyCanvasTextStyle({ fontFamily: UI.canvasTextFontFamily.value || 'Arial' });
    });
    UI.canvasTextColor?.addEventListener('input', () => {
        applyCanvasTextStyle({ fill: UI.canvasTextColor.value || '#2f3a4f' });
        syncCanvasTextPanel();
    });
    UI.canvasTextColorGradient?.addEventListener('change', () => {
        applyCanvasTextStyle({ textGradientId: UI.canvasTextColorGradient.value || 'solid' });
        syncCanvasTextPanel();
    });
    UI.canvasTextHighlight?.addEventListener('input', () => {
        if (UI.canvasTextHighlightGradient?.value === 'none') {
            UI.canvasTextHighlightGradient.value = 'solid';
        }
        applyCanvasTextStyle({
            textHighlight: UI.canvasTextHighlight.value || '',
            textHighlightGradientId: UI.canvasTextHighlightGradient?.value || 'solid',
        });
        syncCanvasTextPanel();
    });
    UI.canvasTextHighlightGradient?.addEventListener('change', () => {
        const nextMode = UI.canvasTextHighlightGradient.value || 'none';
        applyCanvasTextStyle({
            textHighlight: nextMode === 'none' ? '' : (UI.canvasTextHighlight?.value || '#fff0a8'),
            textHighlightGradientId: nextMode === 'none' ? 'solid' : nextMode,
        });
        syncCanvasTextPanel();
    });
    UI.canvasTextAlign?.addEventListener('change', () => {
        applyCanvasTextStyle({ align: UI.canvasTextAlign.value || 'left' });
    });
    UI.canvasTextBoldBtn?.addEventListener('click', () => withSelectedCanvasText((selected) => {
        const next = parseFontStyle(selected.fontStyle);
        next.bold = !next.bold;
        applyCanvasTextStyle({ fontStyle: composeFontStyle(next) });
    }));
    UI.canvasTextItalicBtn?.addEventListener('click', () => withSelectedCanvasText((selected) => {
        const next = parseFontStyle(selected.fontStyle);
        next.italic = !next.italic;
        applyCanvasTextStyle({ fontStyle: composeFontStyle(next) });
    }));
    UI.canvasTextUnderlineBtn?.addEventListener('click', () => withSelectedCanvasText((selected) => {
        applyCanvasTextStyle({
            textDecoration: hasUnderline(selected.textDecoration) ? '' : 'underline',
        });
    }));
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
        syncCanvasTextPanel();
    });
    getStage()?.on('dragend transformend', () => historyManager?.push());
    layoutManager.bindWindowResize();

    // --- Start background rendering ---
    layoutManager.renderBackground();
}

window.addEventListener('DOMContentLoaded', initializeApp);

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
