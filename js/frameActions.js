export function createFrameActions({
    ui,
    appState,
    transformer,
    addMockup,
    placeImageInMockup,
    updateDownloadSceneButtonState,
    pushHistory,
    undo,
    redo,
    isTypingInFormField,
}) {
    let copiedMockupSnapshot = null;

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
        const previousFrameId = ui.frameSelect.value;
        try {
            ui.frameSelect.value = copiedMockupSnapshot.frameId;
            const newMockup = await addMockup();
            if (!newMockup) return;
            applyMockupSnapshot(newMockup, copiedMockupSnapshot);
            appState.setCurrentSelectedMockup(newMockup);
            transformer?.nodes([newMockup]);
            newMockup.getLayer()?.batchDraw();
            updateDownloadSceneButtonState();
            pushHistory?.();
        } finally {
            ui.frameSelect.value = previousFrameId;
        }
    }

    async function handleFrameSwap() {
        const oldMockup = appState.currentSelectedMockup;
        if (!oldMockup) return;

        const oldSnapshot = createMockupSnapshot(oldMockup);
        if (!oldSnapshot) return;

        const newMockup = await addMockup();
        if (!newMockup) return;

        applyMockupSnapshot(newMockup, oldSnapshot);

        oldMockup.destroy();
        appState.setCurrentSelectedMockup(newMockup);
        transformer?.nodes([newMockup]);
        newMockup.getLayer()?.batchDraw();
        updateDownloadSceneButtonState();
        pushHistory?.();
    }

    function handleGlobalShortcuts(e) {
        if (isTypingInFormField?.() || e.repeat) return;
        if (!(e.metaKey || e.ctrlKey)) return;

        const key = e.key.toLowerCase();
        if (key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo?.();
            } else {
                undo?.();
            }
            return;
        }
        if (key === 'y') {
            e.preventDefault();
            redo?.();
            return;
        }
        if (key === 'c') {
            const snapshot = createMockupSnapshot(appState.currentSelectedMockup);
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

    return {
        handleFrameSwap,
        handleGlobalShortcuts,
    };
}
