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
    const PASTE_OFFSET = 20;
    let copiedMockupSnapshot = null;

    // Capture transform + screenshot state for copy/swap flows.
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

    // Reapply a saved snapshot to an existing mockup node.
    function applyMockupSnapshot(mockup, snapshot) {
        if (!mockup || !snapshot) return;
        mockup.position({ x: snapshot.x, y: snapshot.y });
        mockup.scale({ x: snapshot.scaleX, y: snapshot.scaleY });
        mockup.rotation(snapshot.rotation);
        if (snapshot.image) placeImageInMockup(snapshot.image, mockup);
    }

    // Focus the given node in transformer + app state.
    function selectMockup(mockup) {
        appState.setCurrentSelectedMockup(mockup);
        transformer?.nodes([mockup]);
        mockup?.getLayer?.()?.batchDraw();
    }

    // Trigger global listeners that react to frame list changes.
    function notifyFramesChanged() {
        window.dispatchEvent(new Event('frames-changed'));
    }

    // Paste a copied mockup with a slight offset like design tools.
    async function pasteCopiedMockup() {
        if (!copiedMockupSnapshot?.frameId) return;
        const previousFrameId = ui.frameSelect.value;
        try {
            ui.frameSelect.value = copiedMockupSnapshot.frameId;
            const newMockup = await addMockup({ skipNotify: true, skipSelect: true });
            if (!newMockup) return;
            applyMockupSnapshot(newMockup, copiedMockupSnapshot);
            newMockup.position({
                x: copiedMockupSnapshot.x + PASTE_OFFSET,
                y: copiedMockupSnapshot.y + PASTE_OFFSET,
            });
            selectMockup(newMockup);
            updateDownloadSceneButtonState();
            pushHistory?.();
            notifyFramesChanged();
        } finally {
            ui.frameSelect.value = previousFrameId;
        }
    }

    // Replace selected frame skin while preserving layout and screenshot.
    async function handleFrameSwap() {
        const oldMockup = appState.currentSelectedMockup;
        if (!oldMockup) return;

        const oldSnapshot = createMockupSnapshot(oldMockup);
        if (!oldSnapshot) return;

        const newMockup = await addMockup({ skipNotify: true, skipSelect: true });
        if (!newMockup) return;

        applyMockupSnapshot(newMockup, oldSnapshot);

        oldMockup.destroy();
        selectMockup(newMockup);
        updateDownloadSceneButtonState();
        pushHistory?.();
        notifyFramesChanged();
    }

    // Handle app-wide shortcuts for history and clipboard frame actions.
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
