const LONG_PRESS_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE = 10;

export function createKonvaOrderMenuController({
  stage,
  layer,
  tr,
  canvasImageTransformer,
  getSelectedNode,
  getSelectableNodesAtPoint,
  getReorderableNodes,
  isReorderableNode,
  isFrameNode,
  selectNode,
  onApplyNodeZIndex,
  notifyFramesChanged,
  notifyOverlaysChanged,
} = {}) {
  const selectionCycle = { key: "", nodes: [], index: -1 };
  const longPressState = { timer: null, startX: 0, startY: 0 };
  let reorderMenuEl = null;

  function resetSelectionCycle() {
    selectionCycle.key = "";
    selectionCycle.nodes = [];
    selectionCycle.index = -1;
  }

  function hideMenu() {
    if (reorderMenuEl) reorderMenuEl.hidden = true;
  }

  function getCurrentSelectedNode() {
    return getSelectedNode?.() || null;
  }

  function getPointerPick() {
    return getSelectableNodesAtPoint?.(stage?.getPointerPosition?.())?.[0] || null;
  }

  function ensureMenu() {
    if (reorderMenuEl) return reorderMenuEl;
    reorderMenuEl = document.createElement("div");
    reorderMenuEl.className = "layer-reorder-menu";
    reorderMenuEl.hidden = true;
    reorderMenuEl.innerHTML = `
      <button type="button" data-action="front">Bring Front</button>
      <button type="button" data-action="forward">Bring Forward</button>
      <button type="button" data-action="backward">Send Backward</button>
      <button type="button" data-action="back">Send Back</button>
    `;
    reorderMenuEl.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("button[data-action]")
        : null;
      const action = button?.getAttribute("data-action");
      if (!action) return;
      reorderNode(getCurrentSelectedNode(), action);
      hideMenu();
    });
    document.body.appendChild(reorderMenuEl);
    return reorderMenuEl;
  }

  function positionMenu(clientX, clientY) {
    const menu = ensureMenu();
    const margin = 8;
    menu.hidden = false;
    menu.style.left = `${margin}px`;
    menu.style.top = `${margin}px`;
    const width = menu.offsetWidth || 260;
    const height = menu.offsetHeight || 36;
    const left = Math.min(
      Math.max(margin, clientX - width / 2),
      window.innerWidth - width - margin,
    );
    const top = Math.min(
      Math.max(margin, clientY + 10),
      window.innerHeight - height - margin,
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function applyReorderNodes(nodes) {
    nodes.forEach((node, index) => {
      if (onApplyNodeZIndex) onApplyNodeZIndex(node, index + 1);
      else node.zIndex(index + 1);
    });
    tr?.moveToTop?.();
    canvasImageTransformer?.moveToTop?.();
    layer?.batchDraw?.();
  }

  function reorderNode(node, action) {
    if (!node || !isReorderableNode?.(node)) return false;
    const nodes = [...(getReorderableNodes?.() || [])];
    const index = nodes.indexOf(node);
    if (index < 0 || nodes.length < 2) return false;

    if (action === "front" && index < nodes.length - 1) {
      nodes.push(nodes.splice(index, 1)[0]);
    } else if (action === "back" && index > 0) {
      nodes.unshift(nodes.splice(index, 1)[0]);
    } else if (action === "forward" && index < nodes.length - 1) {
      [nodes[index], nodes[index + 1]] = [nodes[index + 1], nodes[index]];
    } else if (action === "backward" && index > 0) {
      [nodes[index], nodes[index - 1]] = [nodes[index - 1], nodes[index]];
    } else {
      return false;
    }

    applyReorderNodes(nodes);
    selectNode?.(node, { preserveZOrder: true });
    if (isFrameNode?.(node)) notifyFramesChanged?.();
    else notifyOverlaysChanged?.();
    return true;
  }

  function cycleSelectionAtPointer() {
    const pos = stage?.getPointerPosition?.();
    if (!pos) return false;
    const key = `${Math.round(pos.x)}:${Math.round(pos.y)}`;
    if (selectionCycle.key !== key) {
      selectionCycle.key = key;
      selectionCycle.nodes = getSelectableNodesAtPoint?.(pos) || [];
      const selected = getCurrentSelectedNode();
      selectionCycle.index = selected ? selectionCycle.nodes.indexOf(selected) : -1;
    }
    if (!selectionCycle.nodes.length) return false;
    selectionCycle.index = (selectionCycle.index + 1) % selectionCycle.nodes.length;
    selectNode?.(selectionCycle.nodes[selectionCycle.index], { preserveZOrder: true });
    return true;
  }

  function handleNodeClickEvent(event) {
    if (event?.evt?.altKey && cycleSelectionAtPointer()) {
      event.cancelBubble = true;
      return true;
    }
    resetSelectionCycle();
    return false;
  }

  function openMenuAt(clientX, clientY, preferredNode = null) {
    const node = preferredNode || getCurrentSelectedNode() || getPointerPick();
    if (!node) return;
    selectNode?.(node, { preserveZOrder: true });
    positionMenu(clientX, clientY);
  }

  function handleStageContextMenu(event, preferredNode = null) {
    if (!event?.evt) return;
    event.evt.preventDefault();
    event.cancelBubble = true;
    stage?.setPointersPositions?.(event.evt);
    openMenuAt(event.evt.clientX, event.evt.clientY, preferredNode);
  }

  function clearLongPressTimer() {
    if (!longPressState.timer) return;
    clearTimeout(longPressState.timer);
    longPressState.timer = null;
  }

  function bindLongPress(resolvePreferredNode = null) {
    const content = stage?.content;
    if (!content) return;
    content.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      clearLongPressTimer();
      const { clientX, clientY } = event;
      longPressState.startX = clientX;
      longPressState.startY = clientY;
      longPressState.timer = setTimeout(() => {
        stage?.setPointersPositions?.({ clientX, clientY });
        const preferred = typeof resolvePreferredNode === "function"
          ? resolvePreferredNode()
          : null;
        openMenuAt(clientX, clientY, preferred);
        clearLongPressTimer();
      }, LONG_PRESS_MS);
    }, { passive: true });
    content.addEventListener("pointermove", (event) => {
      if (!longPressState.timer || event.pointerType !== "touch") return;
      const dx = event.clientX - longPressState.startX;
      const dy = event.clientY - longPressState.startY;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
        clearLongPressTimer();
      }
    }, { passive: true });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      content.addEventListener(name, clearLongPressTimer, { passive: true });
    });
  }

  function bindDismissHandlers() {
    window.addEventListener("pointerdown", (event) => {
      if (reorderMenuEl?.hidden) return;
      if (reorderMenuEl?.contains(event.target)) return;
      hideMenu();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideMenu();
    });
  }

  return {
    bindDismissHandlers,
    bindLongPress,
    handleNodeClickEvent,
    handleStageContextMenu,
    hideMenu,
    resetSelectionCycle,
  };
}
