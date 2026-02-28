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
    let lastHistorySignature = '';

    // Build a serializable snapshot of current scene/canvas state.
    function serializeScene() {
        const stage = getStage();
        return {
            canvasEnabled: !!ui.canvasEnabled?.checked,
            docWidth: +ui.docWidth.value || 900,
            docHeight: +ui.docHeight.value || 600,
            bgColor: ui.bgColor.value || '#ffffff',
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

    // Keep undo/redo buttons in sync with stack sizes.
    function updateHistoryButtons() {
        if (ui.undoBtn) ui.undoBtn.disabled = sceneHistory.length < 2;
        if (ui.redoBtn) ui.redoBtn.disabled = redoHistory.length < 1;
    }

    // Compare snapshots cheaply with one serialized signature per push.
    function getSceneSignature(scene) {
        return JSON.stringify(scene);
    }

    function getLatestHistoryScene() {
        return sceneHistory[sceneHistory.length - 1] || null;
    }

    function drawStage(stage) {
        stage?.findOne('Layer')?.batchDraw();
    }

    // Push only meaningful scene changes into history.
    function push() {
        if (isRestoringHistory) return;
        const scene = serializeScene();
        const sceneSignature = getSceneSignature(scene);
        if (sceneSignature === lastHistorySignature) return;
        sceneHistory.push(scene);
        if (sceneHistory.length > historyLimit) sceneHistory.shift();
        lastHistorySignature = sceneSignature;
        redoHistory = [];
        updateHistoryButtons();
    }

    // Restore a full scene snapshot (canvas settings, frames, screenshots).
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
            applyCanvasMode({ skipAnimation: true, skipHistory: true });

            for (const group of getMockupGroups(stage)) group.destroy();
            appState.setCurrentSelectedMockup(null);
            transformer?.nodes([]);
            drawStage(stage);

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
            drawStage(stage);
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

    // Move one step back in history and keep redo stack updated.
    async function undo() {
        if (sceneHistory.length < 2) return;
        const current = sceneHistory.pop();
        if (current) redoHistory.push(current);
        const previous = getLatestHistoryScene();
        lastHistorySignature = previous ? getSceneSignature(previous) : '';
        updateHistoryButtons();
        await restoreScene(previous, true);
    }

    // Re-apply one undone step.
    async function redo() {
        if (!redoHistory.length) return;
        const next = redoHistory.pop();
        if (!next) return;
        sceneHistory.push(next);
        lastHistorySignature = getSceneSignature(next);
        updateHistoryButtons();
        await restoreScene(next, true);
    }

    // Return to app startup snapshot and reset viewport transform.
    async function reset(runViewportReset) {
        if (!initialSceneSnapshot) return;
        runViewportReset?.();
        await restoreScene(initialSceneSnapshot);
    }

    // Save baseline state captured after initial app bootstrap.
    function captureInitialScene() {
        const initialScene = serializeScene();
        sceneHistory = [initialScene];
        redoHistory = [];
        lastHistorySignature = getSceneSignature(initialScene);
        initialSceneSnapshot = JSON.parse(lastHistorySignature);
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
