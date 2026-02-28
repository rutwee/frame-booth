export function createKonvaSelectionManager({ ui, appState, getTransformer, getLayer } = {}) {
  // Enable/disable actions that require an active frame selection.
  function setSelectionButtonsDisabled(disabled) {
    ui.deleteBtn.disabled = disabled;
    ui.downloadFrameBtn.disabled = disabled;
    ui.updateFrameBtn.disabled = disabled;
  }

  // Clear current selection and hide transformer handles.
  function clearSelection() {
    appState.setCurrentSelectedMockup(null);
    getTransformer?.()?.nodes([]);
    setSelectionButtonsDisabled(true);
    getLayer?.()?.batchDraw();
  }

  // Select a mockup and move transformer to top for visibility.
  function selectMockupGroup(group) {
    const tr = getTransformer?.();
    const layer = getLayer?.();
    if (!tr || !layer) return;

    appState.setCurrentSelectedMockup(group);
    tr.nodes([group]);
    group.moveToTop();
    tr.moveToTop();
    setSelectionButtonsDisabled(false);
    layer.batchDraw();
  }

  return {
    clearSelection,
    selectMockupGroup,
    setSelectionButtonsDisabled,
  };
}
