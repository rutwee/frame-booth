// ==========================================================================
// SCENE EXPORT UTILITIES
// ==========================================================================

/**
 * Normalizes Konva collections, arrays, or iterables into a plain array.
 * @param {unknown} collection
 * @returns {Array}
 */
export function asArray(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (typeof collection.toArray === 'function') return collection.toArray();
    try {
        return Array.from(collection);
    } catch {
        return [];
    }
}

/**
 * Collects all mockup groups from a Konva stage.
 * @param {object|null} stage
 * @returns {Array}
 */
export function collectMockupNodes(stage) {
    if (!stage || typeof stage.find !== 'function') return [];
    return asArray(stage.find('.mockup-group'));
}

/**
 * Computes an outward-rounded bounds rectangle for a list of nodes.
 * @param {Array<{getClientRect: Function}>} nodes
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function getContentBounds(nodes) {
    if (!nodes?.length) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
        const rect = node?.getClientRect?.();
        if (!rect) continue;
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        return null;
    }

    const x = Math.floor(minX);
    const y = Math.floor(minY);
    const width = Math.max(1, Math.ceil(maxX) - x);
    const height = Math.max(1, Math.ceil(maxY) - y);

    return { x, y, width, height };
}

/**
 * Scene download is available whenever at least one frame exists.
 * @param {boolean} canvasEnabled
 * @param {number} frameCount
 * @returns {boolean}
 */
export function shouldEnableSceneDownload(canvasEnabled, frameCount) {
    return frameCount > 0;
}

/**
 * For canvas-off exports, returns tight content bounds; for canvas-on exports, returns null.
 * @param {boolean} canvasEnabled
 * @param {Array<{getClientRect: Function}>} nodes
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function getSceneExportCropBounds(canvasEnabled, nodes) {
    return canvasEnabled ? null : getContentBounds(nodes);
}
