import { collectMockupNodes, getContentBounds } from './sceneUtils.js';

export function createLayoutManager({
    ui,
    helpers,
    getStage,
    updateKonvaCanvasBackground,
    updateDownloadSceneButtonState,
    onHistoryPush,
} = {}) {
    let hasCanvasModeInitialized = false;
    const FIT_PADDING = 16;
    const SMALL_SCREEN_MAX_WIDTH = 1024;
    const drawGroupsLayer = (groups) => groups[0]?.getLayer?.()?.batchDraw();

    // Keep existing frame positions visually centered when the stage size changes.
    function offsetMockupsForStageResize(previousStageWidth, previousStageHeight) {
        const stage = getStage?.();
        if (!stage || !previousStageWidth || !previousStageHeight) return;

        const dx = (stage.width() - previousStageWidth) / 2;
        const dy = (stage.height() - previousStageHeight) / 2;
        if (!dx && !dy) return;

        const groups = collectMockupNodes(stage);
        if (!groups.length) return;

        for (const group of groups) {
            group.x(group.x() + dx);
            group.y(group.y() + dy);
        }
        drawGroupsLayer(groups);
    }

    // Nudge all frames inside a small viewport without changing relative layout.
    function nudgeToFit(groups, stageWidth, stageHeight) {
        const bounds = getContentBounds(groups);
        if (!bounds) return;
        let dx = 0;
        let dy = 0;
        if (bounds.x < FIT_PADDING) {
            dx = FIT_PADDING - bounds.x;
        } else if (bounds.x + bounds.width > stageWidth - FIT_PADDING) {
            dx = stageWidth - FIT_PADDING - (bounds.x + bounds.width);
        }
        if (bounds.y < FIT_PADDING) {
            dy = FIT_PADDING - bounds.y;
        } else if (bounds.y + bounds.height > stageHeight - FIT_PADDING) {
            dy = stageHeight - FIT_PADDING - (bounds.y + bounds.height);
        }
        if (!dx && !dy) return;
        for (const group of groups) {
            group.position({ x: group.x() + dx, y: group.y() + dy });
        }
    }

    // Scale+reposition frames only on tablet/phone-sized viewports.
    function fitMockupsToStageOnSmallScreens() {
        const stage = getStage?.();
        if (!stage || window.innerWidth > SMALL_SCREEN_MAX_WIDTH) return;
        const groups = collectMockupNodes(stage);
        if (!groups.length) return;

        const stageWidth = stage.width();
        const stageHeight = stage.height();
        const bounds = getContentBounds(groups);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

        const availableWidth = Math.max(1, stageWidth - FIT_PADDING * 2);
        const availableHeight = Math.max(1, stageHeight - FIT_PADDING * 2);
        const fitScale = Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height);
        if (fitScale >= 1) {
            nudgeToFit(groups, stageWidth, stageHeight);
            drawGroupsLayer(groups);
            return;
        }

        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        for (const group of groups) {
            group.position({
                x: centerX + (group.x() - centerX) * fitScale,
                y: centerY + (group.y() - centerY) * fitScale,
            });
            group.scale({
                x: group.scaleX() * fitScale,
                y: group.scaleY() * fitScale,
            });
        }
        nudgeToFit(groups, stageWidth, stageHeight);
        drawGroupsLayer(groups);
    }

    // Toggle canvas settings and keep scene state/layout synchronized.
    function applyCanvasMode(options = {}) {
        const stage = getStage?.();
        const previousStageWidth = stage?.width() || 0;
        const previousStageHeight = stage?.height() || 0;
        const enabled = !!ui.canvasEnabled?.checked;
        const canvasCard = ui.canvasSettingsPanel?.closest('.toolbar-group');
        let aboveCard = canvasCard?.previousElementSibling || null;
        while (aboveCard && !aboveCard.classList?.contains('toolbar-group')) {
            aboveCard = aboveCard.previousElementSibling;
        }

        ui.canvasSettingsPanel?.classList.toggle('is-disabled', !enabled);
        ui.docWidth.disabled = !enabled;
        ui.docHeight.disabled = !enabled;
        ui.bgColor.disabled = !enabled;

        if (canvasCard && hasCanvasModeInitialized && !options.skipAnimation) {
            canvasCard.classList.remove('canvas-settings-open', 'canvas-settings-close');
            aboveCard?.classList?.remove('canvas-neighbor-nudge');
            void canvasCard.offsetWidth;
            if (enabled) {
                canvasCard.classList.add('canvas-settings-open');
            } else {
                canvasCard.classList.add('canvas-settings-close');
                aboveCard?.classList?.add('canvas-neighbor-nudge');
            }
        }

        helpers.resizeDocument();
        offsetMockupsForStageResize(previousStageWidth, previousStageHeight);
        fitMockupsToStageOnSmallScreens();
        helpers.updateMockupBackground();
        updateKonvaCanvasBackground?.();
        updateDownloadSceneButtonState?.();
        hasCanvasModeInitialized = true;
        if (!options.skipHistory) onHistoryPush?.();
    }

    // Paint the static workspace background grid canvas.
    function renderBackground() {
        const ctx = ui.canvasEl?.getContext('2d');
        if (!ctx) return;

        const parent = ui.canvasEl.parentElement;
        if (!parent) return;
        const w = parent.clientWidth;
        const h = parent.clientHeight;

        const dpr = window.devicePixelRatio || 1;
        ui.canvasEl.width = Math.floor(w * dpr);
        ui.canvasEl.height = Math.floor(h * dpr);
        ui.canvasEl.style.width = `${w}px`;
        ui.canvasEl.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#e8edf5';
        ctx.fillRect(0, 0, w, h);
    }

    // Recompute stage/canvas layout after viewport changes.
    function handleWindowResize() {
        requestAnimationFrame(() => {
            const stage = getStage?.();
            const previousStageWidth = stage?.width() || 0;
            const previousStageHeight = stage?.height() || 0;
            helpers.resizeDocument();
            offsetMockupsForStageResize(previousStageWidth, previousStageHeight);
            fitMockupsToStageOnSmallScreens();
            renderBackground();
        });
    }

    // Attach the resize listener once during init.
    function bindWindowResize() {
        window.addEventListener('resize', handleWindowResize);
    }

    return {
        applyCanvasMode,
        renderBackground,
        bindWindowResize,
        fitMockupsToViewport: fitMockupsToStageOnSmallScreens,
    };
}
