export function createHistoryManager({
    ui,
    appState,
    transformer,
    helpers,
    addMockupByFrameId,
    applyCanvasMode,
    getStage,
    getMockupGroups,
    placeImageInMockup,
    updateDownloadSceneButtonState,
    ensureResponsiveFit,
    historyLimit = 80,
}) {
    let sceneHistory = [];
    let redoHistory = [];
    let initialSceneSnapshot = null;
    let isRestoringHistory = false;

    function serializeScene() {
        const stage = getStage();
        return {
            canvasEnabled: !!ui.canvasEnabled?.checked,
            docWidth: +ui.docWidth.value || 900,
            docHeight: +ui.docHeight.value || 600,
            bgColor: ui.bgColor.value || '#ffffff',
            bgGradient: ui.bgGradient?.value || 'solid',
            customGradientData: ui.customGradientData?.value || '',
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

    function updateHistoryButtons() {
        if (ui.undoBtn) ui.undoBtn.disabled = sceneHistory.length < 2;
        if (ui.redoBtn) ui.redoBtn.disabled = redoHistory.length < 1;
    }

    function push() {
        if (isRestoringHistory) return;
        const scene = serializeScene();
        const prev = sceneHistory[sceneHistory.length - 1];
        if (prev && JSON.stringify(prev) === JSON.stringify(scene)) return;
        sceneHistory.push(scene);
        if (sceneHistory.length > historyLimit) sceneHistory.shift();
        redoHistory = [];
        updateHistoryButtons();
    }

    async function restoreScene(scene, forHistory = false) {
        if (!scene) return;
        const stage = getStage();
        if (!stage) return;

        isRestoringHistory = true;
        try {
            ui.canvasEnabled.checked = !!scene.canvasEnabled;
            ui.docWidth.value = `${scene.docWidth ?? 900}`;
            ui.docHeight.value = `${scene.docHeight ?? 600}`;
            ui.bgColor.value = scene.bgColor || '#ffffff';
            if (ui.bgGradient) ui.bgGradient.value = scene.bgGradient || 'solid';
            if (ui.customGradientData) ui.customGradientData.value = scene.customGradientData || ui.customGradientData.value;
            window.dispatchEvent(new Event('custom-gradient-sync'));
            applyCanvasMode({ skipAnimation: true, skipHistory: true });

            for (const group of getMockupGroups(stage)) group.destroy();
            appState.setCurrentSelectedMockup(null);
            transformer?.nodes([]);
            stage.findOne('Layer')?.batchDraw();

            for (const snapshot of scene.mockups || []) {
                if (!snapshot?.frameId) continue;
                const mockup = await addMockupByFrameId(snapshot.frameId, {
                    initialState: snapshot,
                    skipSelect: true,
                    skipNotify: true,
                });
                if (!mockup) continue;
                if (!snapshot.screenshotSrc) continue;
                const image = await helpers.loadImage(snapshot.screenshotSrc);
                placeImageInMockup(image, mockup);
            }

            appState.setCurrentSelectedMockup(null);
            transformer?.nodes([]);
            stage.findOne('Layer')?.batchDraw();
            ensureResponsiveFit?.();
            updateDownloadSceneButtonState();
        } catch (error) {
            console.error('Failed to restore scene:', error);
        } finally {
            isRestoringHistory = false;
            if (!forHistory) push();
            updateHistoryButtons();
        }
    }

    async function undo() {
        if (sceneHistory.length < 2) return;
        const current = sceneHistory.pop();
        if (current) redoHistory.push(current);
        const previous = sceneHistory[sceneHistory.length - 1];
        updateHistoryButtons();
        await restoreScene(previous, true);
    }

    async function redo() {
        if (!redoHistory.length) return;
        const next = redoHistory.pop();
        if (!next) return;
        sceneHistory.push(next);
        updateHistoryButtons();
        await restoreScene(next, true);
    }

    async function reset(runViewportReset) {
        if (!initialSceneSnapshot) return;
        runViewportReset?.();
        await restoreScene(initialSceneSnapshot);
    }

    function captureInitialScene() {
        sceneHistory = [serializeScene()];
        redoHistory = [];
        initialSceneSnapshot = JSON.parse(JSON.stringify(sceneHistory[0]));
        updateHistoryButtons();
    }

    return {
        push,
        undo,
        redo,
        reset,
        captureInitialScene,
        updateHistoryButtons,
    };
}
