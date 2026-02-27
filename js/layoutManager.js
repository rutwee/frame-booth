export function createLayoutManager({
    ui,
    helpers,
    getStage,
    updateKonvaCanvasBackground,
    updateDownloadSceneButtonState,
    onHistoryPush,
} = {}) {
    let hasCanvasModeInitialized = false;

    function getMockupGroups(stage) {
        if (!stage?.find) return [];
        const found = stage.find('.mockup-group');
        return typeof found?.toArray === 'function' ? found.toArray() : Array.from(found || []);
    }

    function offsetMockupsForStageResize(previousStageWidth, previousStageHeight) {
        const stage = getStage?.();
        if (!stage?.find || !previousStageWidth || !previousStageHeight) return;

        const dx = (stage.width() - previousStageWidth) / 2;
        const dy = (stage.height() - previousStageHeight) / 2;
        if (!dx && !dy) return;

        const groups = getMockupGroups(stage);
        if (!groups.length) return;

        for (const group of groups) {
            group.x(group.x() + dx);
            group.y(group.y() + dy);
        }
        groups[0].getLayer()?.batchDraw();
    }

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
        helpers.updateMockupBackground();
        updateKonvaCanvasBackground?.();
        updateDownloadSceneButtonState?.();
        hasCanvasModeInitialized = true;
        if (!options.skipHistory) onHistoryPush?.();
    }

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

    function handleWindowResize() {
        requestAnimationFrame(() => {
            const stage = getStage?.();
            const previousStageWidth = stage?.width() || 0;
            const previousStageHeight = stage?.height() || 0;
            helpers.resizeDocument();
            offsetMockupsForStageResize(previousStageWidth, previousStageHeight);
            renderBackground();
        });
    }

    function bindWindowResize() {
        window.addEventListener('resize', handleWindowResize);
    }

    return {
        applyCanvasMode,
        renderBackground,
        bindWindowResize,
    };
}
