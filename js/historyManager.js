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
    getCanvasBackgroundImageState,
    restoreCanvasBackgroundImageState,
    updateDownloadSceneButtonState,
    ensureResponsiveFit,
    historyLimit = 80,
}) {
    let sceneHistory = [];
    let redoHistory = [];
    let initialSceneSnapshot = null;
    let isRestoringHistory = false;
    let lastSceneHash = '';

    // Convert a scene snapshot to a stable hash for dedupe checks.
    function hashScene(scene) {
        return scene ? JSON.stringify(scene) : '';
    }

    // Capture the full UI + stage state required for undo/redo.
    function serializeScene() {
        const stage = getStage();
        return {
            canvasEnabled: !!ui.canvasEnabled?.checked,
            docWidth: +ui.docWidth.value || 900,
            docHeight: +ui.docHeight.value || 600,
            bgColor: ui.bgColor.value || '#ffffff',
            bgGradient: ui.bgGradient?.value || 'solid',
            customGradientData: ui.customGradientData?.value || '',
            canvasBackgroundImage: getCanvasBackgroundImageState?.() || null,
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

    // Push a new scene snapshot unless it is identical to the last state.
    function push() {
        if (isRestoringHistory) return;
        const scene = serializeScene();
        const sceneHash = hashScene(scene);
        if (sceneHash === lastSceneHash) return;
        sceneHistory.push(scene);
        if (sceneHistory.length > historyLimit) sceneHistory.shift();
        redoHistory = [];
        lastSceneHash = sceneHash;
        updateHistoryButtons();
    }

    // Rebuild UI controls + Konva nodes from a stored scene snapshot.
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
            await restoreCanvasBackgroundImageState?.(scene.canvasBackgroundImage || null);

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
            window.dispatchEvent(new Event('scene-restored'));
            if (!forHistory) {
                push();
            } else {
                const current = sceneHistory[sceneHistory.length - 1];
                lastSceneHash = hashScene(current);
            }
            updateHistoryButtons();
        }
    }

    // Move one step backward in history.
    async function undo() {
        if (sceneHistory.length < 2) return;
        const current = sceneHistory.pop();
        if (current) redoHistory.push(current);
        const previous = sceneHistory[sceneHistory.length - 1];
        lastSceneHash = hashScene(previous);
        updateHistoryButtons();
        await restoreScene(previous, true);
    }

    // Move one step forward in history.
    async function redo() {
        if (!redoHistory.length) return;
        const next = redoHistory.pop();
        if (!next) return;
        sceneHistory.push(next);
        lastSceneHash = hashScene(next);
        updateHistoryButtons();
        await restoreScene(next, true);
    }

    // Restore the initial load-state snapshot and reset viewport.
    async function reset(runViewportReset) {
        if (!initialSceneSnapshot) return;
        runViewportReset?.();
        await restoreScene(initialSceneSnapshot);
    }

    // Capture the first stable scene state after app bootstrap.
    function captureInitialScene() {
        sceneHistory = [serializeScene()];
        redoHistory = [];
        initialSceneSnapshot = JSON.parse(JSON.stringify(sceneHistory[0]));
        lastSceneHash = hashScene(sceneHistory[0]);
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
