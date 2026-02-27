export function createKonvaSelectionManager({ ui, appState, getTransformer, getLayer } = {}) {
  function setSelectionButtonsDisabled(disabled) {
    ui.deleteBtn.disabled = disabled;
    ui.downloadFrameBtn.disabled = disabled;
    ui.updateFrameBtn.disabled = disabled;
  }

  function clearSelection() {
    appState.setCurrentSelectedMockup(null);
    getTransformer?.()?.nodes([]);
    setSelectionButtonsDisabled(true);
    getLayer?.()?.batchDraw();
  }

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
