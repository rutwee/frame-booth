// ==========================================================================
// EXPORT FUNCTIONALITY
// ==========================================================================
import { downloadBtn, downloadFrameBtn } from './ui.js';
const SCENE_EXPORT_PIXEL_RATIO = 4;
const FRAME_EXPORT_SIZE = 1500;

// ==========================================================================
//  HELPER FUNCTIONS
// ==========================================================================
/**
 * A utility to trigger a browser download for a given data URI.
 * @param {string} uri The data URI (e.g., from canvas.toDataURL()) to download.
 * @param {string} name The desired filename for the downloaded file.
 */

// ==========================================================================
// DOWNLOAD URI - downloadURI()
// ==========================================================================
function downloadURI(uri, name) {
    const link = document.createElement('a');
    link.download = name;
    link.href = uri;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link); // Clean up the link element
}

function getStage() {
    return Konva.stages?.[0] ?? null;
}

function getPrimaryLayer(stage) {
    return stage?.findOne('Layer') ?? null;
}

// ==========================================================================
//  INITIALIZATION
// ==========================================================================

// ==========================================================================
// EXPORT BUTTON - initExport()
// ==========================================================================
export function initExport() {

    // --- EXPORT ENTIRE SCENE ---
    downloadBtn.addEventListener('click', () => {
        const stage = getStage();
        if (!stage) return;

        const tr = stage.findOne('Transformer');
        if (!tr) return;

        const layer = getPrimaryLayer(stage);
        const oldNodes = tr.nodes(); 

        tr.nodes([]);
        layer?.batchDraw();

        try {
            stage.toDataURL({
                pixelRatio: SCENE_EXPORT_PIXEL_RATIO,
                mimeType: 'image/png',
                callback(dataURL) {
                    downloadURI(dataURL, 'scene.png');
                    tr.nodes(oldNodes);
                    layer?.batchDraw();
                }
            });
        } catch (error) {
            console.error('Scene export failed:', error);
            alert('Sorry, scene export failed. Please try again.');
            tr.nodes(oldNodes);
            layer?.batchDraw();
        }
    });

    // --- EXPORT SELECTED FRAME ONLY ---
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
}
