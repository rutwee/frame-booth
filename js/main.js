// ==========================================================================
// APPLICATION ENTRY POINT
// ==========================================================================

import * as UI from './ui.js';
import * as Helpers from './helpers.js';
import { AppState, frames } from './state.js';
import { initKonva, addMockup, lastAddedMockup, tr, updateKonvaCanvasBackground } from './konvaSetup.js';
import { initExport, updateDownloadSceneButtonState } from './export.js';

const SCREENSHOT_PROFILE_MATCH_TOLERANCE = 0.035;
const EDITABLE_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];
const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const HISTORY_LIMIT = 80;
let copiedMockupSnapshot = null;
let hasCanvasModeInitialized = false;
let sceneHistory = [];
let redoHistory = [];
let initialSceneSnapshot = null;
let isRestoringHistory = false;
let resetViewportTransform = null;

const IPHONE_SCREENSHOT_PROFILES = [
    {
        name: 'dynamic-island',
        aspectRatio: 1179 / 2556,
        knownSizes: [
            [1179, 2556],
            [1290, 2796],
            [1320, 2868],
        ],
        cutout: { x: 0.34, y: 0.014, width: 0.32, height: 0.043 },
    },
    {
        name: 'notch',
        aspectRatio: 1170 / 2532,
        knownSizes: [
            [1170, 2532],
            [1125, 2436],
            [1242, 2688],
            [828, 1792],
            [1284, 2778],
        ],
        cutout: { x: 0.29, y: 0.0, width: 0.42, height: 0.075 },
    },
    {
        name: 'home-button',
        aspectRatio: 750 / 1334,
        knownSizes: [
            [750, 1334],
            [640, 1136],
            [1242, 2208],
        ],
        cutout: null,
    },
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizePortraitSize(width, height) {
    return width <= height ? [width, height] : [height, width];
}

function detectIPhoneScreenshotProfile(width, height) {
    const [portraitWidth, portraitHeight] = normalizePortraitSize(width, height);
    const exactMatchTolerance = 6;

    for (const profile of IPHONE_SCREENSHOT_PROFILES) {
        const hasKnownSize = profile.knownSizes.some(([w, h]) => (
            Math.abs(portraitWidth - w) <= exactMatchTolerance &&
            Math.abs(portraitHeight - h) <= exactMatchTolerance
        ));
        if (hasKnownSize) {
            return profile;
        }
    }

    const screenshotAspect = portraitWidth / portraitHeight;
    let bestProfile = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const profile of IPHONE_SCREENSHOT_PROFILES) {
        const delta = Math.abs(screenshotAspect - profile.aspectRatio);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestProfile = profile;
        }
    }

    return bestDelta <= SCREENSHOT_PROFILE_MATCH_TOLERANCE ? bestProfile : null;
}

function getTargetIslandLocalRect(frameData, frameScale) {
    if (!frameData?.screen?.island) return null;
    const island = frameData.screen.island;
    return {
        x: (island.x - frameData.screen.x) * frameScale,
        y: (island.y - frameData.screen.y) * frameScale,
        width: island.width * frameScale,
        height: island.height * frameScale,
        cornerRadius: island.cornerRadius * frameScale,
    };
}

function calculateScreenshotPlacement(img, screenContainer, targetIslandRect, sourceProfile) {
    const screenAspectRatio = screenContainer.width / screenContainer.height;
    const imgAspectRatio = img.width / img.height;
    let width;
    let height;

    if (imgAspectRatio > screenAspectRatio) {
        height = screenContainer.height;
        width = screenContainer.height * imgAspectRatio;
    } else {
        width = screenContainer.width;
        height = screenContainer.width / imgAspectRatio;
    }

    let x = (screenContainer.width - width) / 2;
    let y = (screenContainer.height - height) / 2;

    const isPortraitScreenshot = img.height >= img.width;
    const sourceCutout = isPortraitScreenshot ? sourceProfile?.cutout : null;
    if (targetIslandRect && sourceCutout) {
        const scale = width / img.width;
        const sourceCutoutCenterX = (sourceCutout.x + sourceCutout.width / 2) * img.width;
        const sourceCutoutTopY = sourceCutout.y * img.height;
        const targetCutoutCenterX = targetIslandRect.x + targetIslandRect.width / 2;
        const targetCutoutTopY = targetIslandRect.y;

        const alignedX = targetCutoutCenterX - sourceCutoutCenterX * scale;
        const alignedY = targetCutoutTopY - sourceCutoutTopY * scale;
        const alignmentBlend = 0.85;

        x = x + (alignedX - x) * alignmentBlend;
        y = y + (alignedY - y) * alignmentBlend;
    } else if (targetIslandRect && isPortraitScreenshot) {
        y = Math.min(0, y + targetIslandRect.height * 0.2);
    }

    x = clamp(x, screenContainer.width - width, 0);
    y = clamp(y, screenContainer.height - height, 0);

    return { x, y, width, height };
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

function serializeScene() {
    const stage = getStage();
    return {
        canvasEnabled: !!UI.canvasEnabled?.checked,
        docWidth: +UI.docWidth.value || 900,
        docHeight: +UI.docHeight.value || 600,
        bgColor: UI.bgColor.value || '#ffffff',
        mockups: getMockupGroups(stage).map(group => ({
            frameId: group.getAttr('frameId'),
            x: group.x(),
            y: group.y(),
            scaleX: group.scaleX(),
            scaleY: group.scaleY(),
            rotation: group.rotation(),
            screenshotSrc: group.findOne('.screenshot')?.image()?.src || null,
        })),
    };
}

function sceneSignature(scene) {
    return JSON.stringify(scene);
}

function updateHistoryButtons() {
    if (UI.undoBtn) UI.undoBtn.disabled = sceneHistory.length < 2;
    if (UI.redoBtn) UI.redoBtn.disabled = redoHistory.length < 1;
}

function pushSceneHistory() {
    if (isRestoringHistory) return;
    const scene = serializeScene();
    const prev = sceneHistory[sceneHistory.length - 1];
    if (prev && sceneSignature(prev) === sceneSignature(scene)) return;
    sceneHistory.push(scene);
    if (sceneHistory.length > HISTORY_LIMIT) sceneHistory.shift();
    redoHistory = [];
    updateHistoryButtons();
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

async function restoreScene(scene, forHistory = false) {
    if (!scene) return;
    const stage = getStage();
    if (!stage) return;

    isRestoringHistory = true;
    try {
        UI.canvasEnabled.checked = !!scene.canvasEnabled;
        UI.docWidth.value = `${scene.docWidth ?? 900}`;
        UI.docHeight.value = `${scene.docHeight ?? 600}`;
        UI.bgColor.value = scene.bgColor || '#ffffff';
        applyCanvasMode({ skipAnimation: true, skipHistory: true });

        for (const group of getMockupGroups(stage)) group.destroy();
        AppState.setCurrentSelectedMockup(null);
        tr?.nodes([]);
        stage.findOne('Layer')?.batchDraw();

        for (const snapshot of scene.mockups || []) {
            if (!snapshot?.frameId) continue;
            const mockup = await addMockupByFrameId(snapshot.frameId);
            if (!mockup) continue;
            mockup.position({ x: snapshot.x || 0, y: snapshot.y || 0 });
            mockup.scale({ x: snapshot.scaleX || 1, y: snapshot.scaleY || 1 });
            mockup.rotation(snapshot.rotation || 0);
            if (snapshot.screenshotSrc) {
                const image = await Helpers.loadImage(snapshot.screenshotSrc);
                placeImageInMockup(image, mockup);
            }
        }

        AppState.setCurrentSelectedMockup(null);
        tr?.nodes([]);
        stage.findOne('Layer')?.batchDraw();
        updateDownloadSceneButtonState();
    } catch (error) {
        console.error('Failed to restore scene:', error);
    } finally {
        isRestoringHistory = false;
        if (!forHistory) pushSceneHistory();
        updateHistoryButtons();
    }
}

async function handleUndo() {
    if (sceneHistory.length < 2) return;
    const current = sceneHistory.pop();
    if (current) redoHistory.push(current);
    const previous = sceneHistory[sceneHistory.length - 1];
    updateHistoryButtons();
    await restoreScene(previous, true);
}

async function handleRedo() {
    if (!redoHistory.length) return;
    const next = redoHistory.pop();
    if (!next) return;
    sceneHistory.push(next);
    updateHistoryButtons();
    await restoreScene(next, true);
}

async function handleResetScene() {
    if (!initialSceneSnapshot) return;
    resetViewportTransform?.();
    await restoreScene(initialSceneSnapshot);
}

function applyCanvasMode(options = {}) {
    const stage = Konva.stages?.[0];
    const previousStageWidth = stage?.width() || 0;
    const previousStageHeight = stage?.height() || 0;
    const enabled = !!UI.canvasEnabled?.checked;
    const canvasCard = UI.canvasSettingsPanel?.closest('.toolbar-group');
    let aboveCard = canvasCard?.previousElementSibling || null;
    while (aboveCard && !aboveCard.classList?.contains('toolbar-group')) {
        aboveCard = aboveCard.previousElementSibling;
    }
    UI.canvasSettingsPanel?.classList.toggle('is-disabled', !enabled);
    UI.docWidth.disabled = !enabled;
    UI.docHeight.disabled = !enabled;
    UI.bgColor.disabled = !enabled;
    if (canvasCard && hasCanvasModeInitialized && !options.skipAnimation) {
        canvasCard.classList.remove('canvas-settings-open');
        canvasCard.classList.remove('canvas-settings-close');
        aboveCard?.classList?.remove('canvas-neighbor-nudge');
        void canvasCard.offsetWidth;
        if (enabled) {
            canvasCard.classList.add('canvas-settings-open');
        } else {
            canvasCard.classList.add('canvas-settings-close');
            aboveCard?.classList?.add('canvas-neighbor-nudge');
        }
    }
    Helpers.resizeDocument();
    offsetMockupsForStageResize(previousStageWidth, previousStageHeight);
    Helpers.updateMockupBackground();
    updateKonvaCanvasBackground();
    updateDownloadSceneButtonState();
    hasCanvasModeInitialized = true;
    if (!options.skipHistory) pushSceneHistory();
}

function offsetMockupsForStageResize(previousStageWidth, previousStageHeight) {
    const stage = Konva.stages?.[0];
    if (!stage?.find || !previousStageWidth || !previousStageHeight) return;

    const dx = (stage.width() - previousStageWidth) / 2;
    const dy = (stage.height() - previousStageHeight) / 2;
    if (!dx && !dy) return;

    const found = stage.find('.mockup-group');
    const groups = typeof found?.toArray === 'function' ? found.toArray() : Array.from(found || []);
    if (!groups.length) return;

    for (const group of groups) {
        group.x(group.x() + dx);
        group.y(group.y() + dy);
    }
    groups[0].getLayer()?.batchDraw();
}

function createMockupSnapshot(mockup) {
    if (!mockup) return null;
    return {
        frameId: mockup.getAttr('frameId'),
        x: mockup.x(),
        y: mockup.y(),
        scaleX: mockup.scaleX(),
        scaleY: mockup.scaleY(),
        rotation: mockup.rotation(),
        image: mockup.findOne('.screenshot')?.image() || null,
    };
}

function applyMockupSnapshot(mockup, snapshot) {
    if (!mockup || !snapshot) return;
    mockup.x(snapshot.x);
    mockup.y(snapshot.y);
    mockup.scaleX(snapshot.scaleX);
    mockup.scaleY(snapshot.scaleY);
    mockup.rotation(snapshot.rotation);
    if (snapshot.image) placeImageInMockup(snapshot.image, mockup);
}

async function pasteCopiedMockup() {
    if (!copiedMockupSnapshot?.frameId) return;
    const previousFrameId = UI.frameSelect.value;
    try {
        UI.frameSelect.value = copiedMockupSnapshot.frameId;
        const newMockup = await addMockup();
        if (!newMockup) return;
        applyMockupSnapshot(newMockup, copiedMockupSnapshot);
        AppState.setCurrentSelectedMockup(newMockup);
        tr?.nodes([newMockup]);
        newMockup.getLayer()?.batchDraw();
        updateDownloadSceneButtonState();
        pushSceneHistory();
    } finally {
        UI.frameSelect.value = previousFrameId;
    }
}

function handleGlobalShortcuts(e) {
    if (isTypingInFormField() || e.repeat) return;
    if (!(e.metaKey || e.ctrlKey)) return;

    const key = e.key.toLowerCase();
    if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            handleRedo();
        } else {
            handleUndo();
        }
        return;
    }
    if (key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
    }
    if (key === 'c') {
        const snapshot = createMockupSnapshot(AppState.currentSelectedMockup);
        if (!snapshot) return;
        copiedMockupSnapshot = snapshot;
        e.preventDefault();
        return;
    }

    if (key === 'v') {
        if (!copiedMockupSnapshot) return;
        e.preventDefault();
        pasteCopiedMockup();
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
    applyCanvasMode({ skipHistory: true });
    initExport();
    initZoomPanControls();
    initDragAndDropUpload();

    // --- Add the default frame ---
    try {
        await addMockup();
    } catch (error) {
        console.error('Failed to load default frame:', error);
    }
    sceneHistory = [serializeScene()];
    redoHistory = [];
    initialSceneSnapshot = JSON.parse(JSON.stringify(sceneHistory[0]));
    updateHistoryButtons();

    // --- Bind event listeners ---
    UI.bgColor.addEventListener('input', Helpers.updateMockupBackground);
    UI.docWidth.addEventListener('input', Helpers.resizeDocument);
    UI.docHeight.addEventListener('input', Helpers.resizeDocument);
    UI.canvasEnabled?.addEventListener('change', applyCanvasMode);
    UI.undoBtn?.addEventListener('click', handleUndo);
    UI.redoBtn?.addEventListener('click', handleRedo);
    UI.resetBtn?.addEventListener('click', handleResetScene);
    UI.uploadBtn.addEventListener('click', () => UI.fileInput.click());
    UI.fileInput.addEventListener('change', handleImageUpload);
    UI.addFrameBtn.addEventListener('click', addMockup);
    UI.updateFrameBtn.addEventListener('click', handleFrameSwap);
    window.addEventListener('keydown', handleGlobalShortcuts);
    window.addEventListener('frames-changed', () => {
        updateDownloadSceneButtonState();
        pushSceneHistory();
    });
    const stage = getStage();
    stage?.on('dragend transformend', () => pushSceneHistory());

    // --- Start background rendering ---
    renderBackground();
}

window.addEventListener('DOMContentLoaded', initializeApp);


// ==========================================================================
// ZOOM & PAN CONTROLS - initZoomPanControls()
// ==========================================================================
function initZoomPanControls() {
    const previewWrap = document.querySelector('.preview-wrap');
    const mockupArea = UI.mockupArea;
    if (!previewWrap || !mockupArea) return;

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanningWithSpace = false;
    let isSpaceDown = false;
    let panStart = { x: 0, y: 0 };
    let lastDist = 0;
    let lastCenter = null;
    let isPanningWithTouch = false;

    function applyTransform() {
        mockupArea.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function resetTransform() {
        scale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
    }

    resetViewportTransform = resetTransform;

    previewWrap.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const rect = mockupArea.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = 1.01;
            const direction = e.deltaY < 0 ? 1 : -1;
            const newScale = direction > 0 ? scale * zoomFactor : scale / zoomFactor;
            const oldScale = scale;
            scale = clampZoom(newScale);

            panX -= (mouseX - panX) * (scale / oldScale - 1);
            panY -= (mouseY - panY) * (scale / oldScale - 1);
        } else {
            const panSpeed = 1;
            panX -= e.deltaX * panSpeed;
            panY -= e.deltaY * panSpeed;
        }
        applyTransform();
    }, { passive: false });

    window.addEventListener('keydown', e => {
        if (isTypingInFormField()) return;
        if (e.key === ' ' && !isSpaceDown) {
            e.preventDefault();
            isSpaceDown = true;
            previewWrap.style.cursor = 'grab';
        }
        if (e.key === '0') {
            e.preventDefault();
            resetTransform();
        }
    });

    window.addEventListener('keyup', e => {
        if (e.key === ' ') {
            isSpaceDown = false;
            previewWrap.style.cursor = 'default';
        }
    });

    previewWrap.addEventListener('mousedown', e => {
        if (isSpaceDown) {
            isPanningWithSpace = true;
            panStart.x = e.clientX - panX;
            panStart.y = e.clientY - panY;
            previewWrap.style.cursor = 'grabbing';
        }
    });

    previewWrap.addEventListener('mousemove', e => {
        if (isPanningWithSpace) {
            panX = e.clientX - panStart.x;
            panY = e.clientY - panStart.y;
            applyTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanningWithSpace) {
            isPanningWithSpace = false;
            previewWrap.style.cursor = isSpaceDown ? 'grab' : 'default';
        }
    });


    previewWrap.addEventListener('touchstart', e => {
        if (e.target.closest('.toolbar')) {
            return;
        }

        e.preventDefault();

        if (e.touches.length === 1) {
            const stage = Konva.stages?.[0];
            if (!stage) return;
            const touch = e.touches[0];
            
            const stageBox = stage.container().getBoundingClientRect();
            const konvaX = (touch.clientX - stageBox.left) / scale;
            const konvaY = (touch.clientY - stageBox.top) / scale;
            

            const shape = stage.getIntersection({ x: konvaX, y: konvaY });
            
            if (shape) {
                const isFrame = shape.findAncestor('.mockup-group');
                const isTransformer = shape.findAncestor('Transformer');

                if (isFrame || isTransformer) {
                    isPanningWithTouch = false;
                    return;
                }
            }


            isPanningWithTouch = true;
            panStart.x = e.touches[0].clientX - panX;
            panStart.y = e.touches[0].clientY - panY;
            
        } else if (e.touches.length === 2) {
            isPanningWithTouch = false;
            lastDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            lastCenter = {
                x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
                y: (e.touches[0].pageY + e.touches[1].pageY) / 2
            };
        }
    }, { passive: false });

    previewWrap.addEventListener('touchmove', e => {
        if (isPanningWithTouch && e.touches.length === 1) {
            e.preventDefault();
            panX = e.touches[0].clientX - panStart.x;
            panY = e.touches[0].clientY - panStart.y;
            applyTransform();
            return;
        }

        if (e.touches.length !== 2) return;

        e.preventDefault();
        isPanningWithTouch = false;

        const newDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        const newCenter = {
            x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
            y: (e.touches[0].pageY + e.touches[1].pageY) / 2
        };

        if (!lastCenter || lastDist <= 0) {
            lastCenter = newCenter;
            lastDist = newDist;
            return;
        }

        const scaleFactor = newDist / lastDist;
        const oldScale = scale;
        scale = clampZoom(scale * scaleFactor);

        const rect = mockupArea.getBoundingClientRect();
        const zoomOriginX = lastCenter.x - rect.left;
        const zoomOriginY = lastCenter.y - rect.top;

        panX -= (zoomOriginX - panX) * (scale / oldScale - 1);
        panY -= (zoomOriginY - panY) * (scale / oldScale - 1);

        panX += newCenter.x - lastCenter.x;
        panY += newCenter.y - lastCenter.y;

        applyTransform();
        lastDist = newDist;
        lastCenter = newCenter;
    }, { passive: false });

    previewWrap.addEventListener('touchend', e => {
        isPanningWithTouch = false;

        if (e.touches.length < 2) {
            lastDist = 0;
            lastCenter = null;
        }
    });

    applyTransform();
}



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

// ==========================================================================
// FRAME SWAPPING - handleFrameSwap()
// ==========================================================================
async function handleFrameSwap() {
    const oldMockup = AppState.currentSelectedMockup;
    if (!oldMockup) return;

    const oldSnapshot = createMockupSnapshot(oldMockup);
    if (!oldSnapshot) return;

    const newMockup = await addMockup();
    if (!newMockup) return;

    applyMockupSnapshot(newMockup, oldSnapshot);

    oldMockup.destroy();
    AppState.setCurrentSelectedMockup(newMockup);
    tr?.nodes([newMockup]);
    newMockup.getLayer()?.batchDraw();
    updateDownloadSceneButtonState();
    pushSceneHistory();
}

// ==========================================================================
// IMAGE UPLOAD - handleImageUpload()
// ==========================================================================
function getImageValidationError(file) {
    if (!file.type.startsWith('image/')) {
        return 'Please select a valid image file.';
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        return 'Image file is too large! Please upload a file under 8MB.';
    }
    return null;
}

async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) {
        UI.fileInput.value = "";
        return;
    }

    try {
        const targetMockup = AppState.currentSelectedMockup || lastAddedMockup;
        await loadAndPlaceImage(file, targetMockup);
    } catch (error) {
        console.error("Error processing image:", error);
        alert("Sorry, there was an error processing your image.");
    } finally {
        UI.fileInput.value = "";
    }
}

async function loadAndPlaceImage(file, targetMockup) {
    const validationError = getImageValidationError(file);
    if (validationError) {
        alert(validationError);
        return;
    }
    if (!targetMockup) {
        alert("Please add or select a frame to place the image in.");
        return;
    }
    const dataURL = await Helpers.readFileAsDataURL(file);
    const img = await Helpers.loadImage(dataURL);
    placeImageInMockup(img, targetMockup);
    pushSceneHistory();
}

function getMockupAtClientPoint(clientX, clientY) {
    const stage = Konva.stages?.[0];
    if (!stage) return null;

    const stageBox = stage.container().getBoundingClientRect();
    const scaleX = stageBox.width / stage.width() || 1;
    const scaleY = stageBox.height / stage.height() || 1;
    const point = {
        x: (clientX - stageBox.left) / scaleX,
        y: (clientY - stageBox.top) / scaleY,
    };
    const shape = stage.getIntersection(point);
    const directMockup = shape?.findAncestor?.('.mockup-group');
    if (directMockup) return directMockup;

    const found = stage.find('.mockup-group');
    const groups = typeof found?.toArray === 'function' ? found.toArray() : Array.from(found || []);
    for (let i = groups.length - 1; i >= 0; i -= 1) {
        const r = groups[i].getClientRect();
        if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) {
            return groups[i];
        }
    }
    return null;
}

function initDragAndDropUpload() {
    UI.mockupArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    UI.mockupArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
        if (!file) return;
        const targetMockup = getMockupAtClientPoint(e.clientX, e.clientY);
        if (!targetMockup) return;
        try {
            await loadAndPlaceImage(file, targetMockup);
        } catch (error) {
            console.error("Error processing dropped image:", error);
            alert("Sorry, there was an error processing your image.");
        }
    });
}

// ==========================================================================
// BACKGROUND - renderBackground()
// ==========================================================================
function renderBackground() {
    const ctx = UI.canvasEl.getContext('2d');
    if (!ctx) return;

    // ----- Get size from parent ---
    const parent = UI.canvasEl.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    UI.canvasEl.width = Math.floor(w * dpr);
    UI.canvasEl.height = Math.floor(h * dpr);
    UI.canvasEl.style.width = `${w}px`;
    UI.canvasEl.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    ctx.fillStyle = '#e8edf5';
    ctx.fillRect(0, 0, w, h);
}

window.addEventListener('resize', () => requestAnimationFrame(() => {
    const stage = Konva.stages?.[0];
    const previousStageWidth = stage?.width() || 0;
    const previousStageHeight = stage?.height() || 0;
    Helpers.resizeDocument();
    offsetMockupsForStageResize(previousStageWidth, previousStageHeight);
    renderBackground();
}));
