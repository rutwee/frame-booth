// ==========================================================================
// EXPORT FUNCTIONALITY
// ==========================================================================
import { downloadBtn, downloadFrameBtn, canvasEnabled } from './ui.js';
import {
    collectMockupNodes,
    getSceneExportCropBounds,
    shouldEnableSceneDownload,
} from './sceneUtils.js';

const SCENE_EXPORT_PIXEL_RATIO = 4;
const FRAME_EXPORT_SIZE = 1500;

// ==========================================================================
// HELPERS
// ==========================================================================
function isCanvasModeEnabled() {
    return !!canvasEnabled?.checked;
}

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

export function updateDownloadSceneButtonState() {
    const stage = getStage();
    const frameCount = collectMockupNodes(stage).length;
    downloadBtn.disabled = !shouldEnableSceneDownload(isCanvasModeEnabled(), frameCount);
}

// ==========================================================================
// EXPORT BUTTON - initExport()
// ==========================================================================
export function initExport() {
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
                width: FRAME_EXPORT_SIZE,
                height: FRAME_EXPORT_SIZE,
            });

            const tempLayer = new Konva.Layer();
            tempStage.add(tempLayer);

            const clone = selectedNode.clone({ draggable: false });
            clone.position({ x: 0, y: 0 });
            clone.rotation(0);
            clone.scale({ x: 1, y: 1 });

            const originalSize = clone.getClientRect({ skipTransform: true });
            const maxDimension = Math.max(originalSize.width, originalSize.height, 1);
            const scale = FRAME_EXPORT_SIZE / maxDimension;
            const newWidth = Math.max(1, originalSize.width * scale);
            const newHeight = Math.max(1, originalSize.height * scale);

            tempStage.size({ width: newWidth, height: newHeight });
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

