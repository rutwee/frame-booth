import {
    downloadBtn,
    downloadFrameBtn,
    canvasEnabled,
} from './ui.js';
import {
    collectMockupNodes,
    getSceneExportCropBounds,
    shouldEnableSceneDownload,
} from './sceneUtils.js';

const SCENE_EXPORT_PIXEL_RATIO = 3.6;
const FRAME_EXPORT_MAX_SCALE = 7;
const FRAME_EXPORT_MAX_DIMENSION = 5400;

// Reflect current canvas toggle state from UI.
function isCanvasModeEnabled() {
    return !!canvasEnabled?.checked;
}

// Trigger a browser download from a generated data URL.
function downloadURI(uri, name) {
    const link = document.createElement('a');
    link.download = name;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function getStage() {
    return Konva.stages?.[0] ?? null;
}

function getPrimaryLayer(stage) {
    return stage?.findOne('Layer') ?? null;
}

// Temporarily hide selection handles so exports are clean.
function withTransformerHidden(stage, work) {
    const transformer = stage.findOne('Transformer');
    const layer = getPrimaryLayer(stage);
    const previousNodes = transformer?.nodes() ?? [];

    transformer?.nodes([]);
    layer?.batchDraw();

    const restore = () => {
        transformer?.nodes(previousNodes);
        layer?.batchDraw();
    };

    try {
        work(restore);
    } catch (error) {
        restore();
        throw error;
    }
}

// Resolve scene export crop and quality options.
function getSceneExportOptions(stage) {
    const nodes = collectMockupNodes(stage);
    const canvasEnabledNow = isCanvasModeEnabled();
    const canExport = shouldEnableSceneDownload(canvasEnabledNow, nodes.length);
    if (!canExport) return null;

    const cropBounds = getSceneExportCropBounds(canvasEnabledNow, nodes);
    if (!canvasEnabledNow && !cropBounds) return null;

    return {
        ...(cropBounds || {}),
        pixelRatio: SCENE_EXPORT_PIXEL_RATIO,
        mimeType: 'image/png',
    };
}

// Read the most accurate pixel size for image/video-like sources.
function getImagePixelSize(image) {
    if (!image) return { width: 0, height: 0 };
    return {
        width: image.naturalWidth || image.videoWidth || image.width || 0,
        height: image.naturalHeight || image.videoHeight || image.height || 0,
    };
}

// Choose export scale from frame and screenshot source resolution.
function getBestFrameExportScale(selectedNode) {
    let bestScale = 1;

    const frameNode = selectedNode.getChildren((n) => n.getClassName() === 'Image')[0];
    const framePixels = getImagePixelSize(frameNode?.image?.());
    if (frameNode?.width?.() > 0 && frameNode?.height?.() > 0 && framePixels.width > 0 && framePixels.height > 0) {
        bestScale = Math.max(
            bestScale,
            framePixels.width / frameNode.width(),
            framePixels.height / frameNode.height(),
        );
    }

    const screenshotNode = selectedNode.findOne('.screenshot');
    const screenshotPixels = getImagePixelSize(screenshotNode?.image?.());
    if (
        screenshotNode?.width?.() > 0 &&
        screenshotNode?.height?.() > 0 &&
        screenshotPixels.width > 0 &&
        screenshotPixels.height > 0
    ) {
        bestScale = Math.max(
            bestScale,
            screenshotPixels.width / screenshotNode.width(),
            screenshotPixels.height / screenshotNode.height(),
        );
    }

    return Math.min(FRAME_EXPORT_MAX_SCALE, Math.max(1, bestScale));
}

// Keep scene export button state aligned with frame count.
export function updateDownloadSceneButtonState() {
    if (!downloadBtn) return;
    const stage = getStage();
    const frameCount = collectMockupNodes(stage).length;
    downloadBtn.disabled = !shouldEnableSceneDownload(isCanvasModeEnabled(), frameCount);
}

// Bind scene/frame export actions.
export function initExport() {
    if (!downloadBtn || !downloadFrameBtn) return;
    downloadBtn.addEventListener('click', () => {
        const stage = getStage();
        if (!stage) return;

        const exportOptions = getSceneExportOptions(stage);
        if (!exportOptions) return;

        try {
            withTransformerHidden(stage, restore => {
                stage.toDataURL({
                    ...exportOptions,
                    callback(dataURL) {
                        downloadURI(dataURL, 'scene.png');
                        restore();
                    },
                });
            });
        } catch (error) {
            console.error('Scene export failed:', error);
            alert('Sorry, scene export failed. Please try again.');
        }
    });

    downloadFrameBtn.addEventListener('click', () => {
        const stage = getStage();
        if (!stage) return;

        const transformer = stage.findOne('Transformer');
        const selectedNode = transformer?.nodes()[0];
        if (!selectedNode) return;

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.top = '-9999px';
        document.body.appendChild(tempContainer);

        let tempStage = null;
        try {
            tempStage = new Konva.Stage({
                container: tempContainer,
                width: 1,
                height: 1,
            });

            const tempLayer = new Konva.Layer();
            tempStage.add(tempLayer);

            const clone = selectedNode.clone({ draggable: false });
            clone.position({ x: 0, y: 0 });
            clone.rotation(0);
            clone.scale({ x: 1, y: 1 });

            const originalSize = clone.getClientRect({ skipTransform: true });
            const baseWidth = Math.max(1, Math.ceil(originalSize.width));
            const baseHeight = Math.max(1, Math.ceil(originalSize.height));
            const baseMaxDim = Math.max(baseWidth, baseHeight);
            const targetScale = getBestFrameExportScale(selectedNode);
            const maxAllowedScale = FRAME_EXPORT_MAX_DIMENSION / baseMaxDim;
            const scale = Math.max(1, Math.min(targetScale, maxAllowedScale));
            const exportWidth = Math.max(1, Math.round(baseWidth * scale));
            const exportHeight = Math.max(1, Math.round(baseHeight * scale));

            tempStage.size({ width: exportWidth, height: exportHeight });
            clone.position({
                x: Math.round((-originalSize.x) * scale),
                y: Math.round((-originalSize.y) * scale),
            });
            clone.scale({ x: scale, y: scale });
            tempLayer.add(clone);
            tempLayer.draw();

            const dataURL = tempStage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
            downloadURI(dataURL, 'frame.png');
        } catch (error) {
            console.error('Frame export failed:', error);
            alert('Sorry, frame export failed. Please try again.');
        } finally {
            tempStage?.destroy();
            tempContainer.remove();
        }
    });

    updateDownloadSceneButtonState();
}
