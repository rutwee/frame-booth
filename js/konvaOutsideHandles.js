const OUTSIDE_HANDLE_ANCHORS = {
  tl: "top-left",
  tr: "top-right",
  bl: "bottom-left",
  br: "bottom-right",
  rotate: "rotater",
};
const OPPOSITE_HANDLE = { tl: "br", tr: "bl", bl: "tr", br: "tl" };
const MIN_SCALE_RATIO = 0.05;

export function createKonvaOutsideHandlesController({
  getStage,
  getLayer,
  getFrameTransformer,
  getCanvasImageTransformer,
  getSelectedFrameNode,
  getSelectedCanvasImageNode,
  isCanvasEnabled,
  onFrameCommit,
  onCanvasImageCommit,
  constrainFrameNode,
} = {}) {
  let frameOutsideHandles = null;
  let canvasImageOutsideHandles = null;
  let outsideHandleSession = null;

  function ensureOutsideHandlesOverlay(kind = "frame") {
    const previewWrap = document.querySelector(".preview-wrap");
    if (!previewWrap) return null;
    const existing = kind === "frame" ? frameOutsideHandles : canvasImageOutsideHandles;
    if (existing) return existing;

    const el = document.createElement("div");
    el.className = kind === "frame" ? "frame-outside-handles" : "canvas-image-outside-handles";
    el.hidden = true;
    el.innerHTML = `
      <span class="outside-handle tl"></span>
      <span class="outside-handle tr"></span>
      <span class="outside-handle bl"></span>
      <span class="outside-handle br"></span>
      <span class="outside-handle rotate"></span>
    `;
    previewWrap.appendChild(el);
    bindOutsideHandleOverlay(el, kind);
    if (kind === "frame") {
      frameOutsideHandles = el;
    } else {
      canvasImageOutsideHandles = el;
    }
    return el;
  }

  function getTransformerScreenAnchorPoints(transformer, stageRect) {
    const stage = getStage?.();
    if (!transformer || !stageRect || !stage) return null;
    const sx = stageRect.width / Math.max(1, stage.width());
    const sy = stageRect.height / Math.max(1, stage.height());
    const points = {};

    for (const [key, anchorName] of Object.entries(OUTSIDE_HANDLE_ANCHORS)) {
      const anchor = transformer.findOne?.(`.${anchorName}`);
      const pos = anchor?.getAbsolutePosition?.();
      if (!pos) continue;
      points[key] = {
        x: stageRect.left + pos.x * sx,
        y: stageRect.top + pos.y * sy,
      };
    }

    return points;
  }

  function renderOutsideHandles(overlay, points, previewRect, stageRect) {
    let showAny = false;
    for (const key of Object.keys(OUTSIDE_HANDLE_ANCHORS)) {
      const handle = overlay.querySelector(`.outside-handle.${key}`);
      if (!handle) continue;
      const point = points?.[key];
      if (!point) {
        handle.style.display = "none";
        continue;
      }

      const outside = (
        point.x < stageRect.left ||
        point.x > stageRect.right ||
        point.y < stageRect.top ||
        point.y > stageRect.bottom
      );
      handle.style.display = outside ? "block" : "none";
      if (!outside) continue;
      handle.style.left = `${point.x - previewRect.left}px`;
      handle.style.top = `${point.y - previewRect.top}px`;
      showAny = true;
    }
    overlay.hidden = !showAny;
  }

  function updateOutsideHandlesFor({ kind, selectedNode, transformer } = {}) {
    const overlay = ensureOutsideHandlesOverlay(kind);
    if (!overlay || !selectedNode || !isCanvasEnabled?.()) {
      if (overlay) overlay.hidden = true;
      return;
    }

    const stageRect = getStageRect();
    const previewRect = document.querySelector(".preview-wrap")?.getBoundingClientRect?.();
    if (!previewRect || !stageRect) {
      overlay.hidden = true;
      return;
    }

    const points = getTransformerScreenAnchorPoints(transformer, stageRect);
    renderOutsideHandles(overlay, points, previewRect, stageRect);
  }

  function refresh() {
    updateOutsideHandlesFor({
      kind: "frame",
      selectedNode: getSelectedFrameNode?.(),
      transformer: getFrameTransformer?.(),
    });
    updateOutsideHandlesFor({
      kind: "canvas-image",
      selectedNode: getSelectedCanvasImageNode?.(),
      transformer: getCanvasImageTransformer?.(),
    });
  }

  function getHandleKey(target) {
    if (!target?.classList?.contains("outside-handle")) return null;
    for (const key of Object.keys(OUTSIDE_HANDLE_ANCHORS)) {
      if (target.classList.contains(key)) return key;
    }
    return null;
  }

  function getStageRect() {
    return getStage?.()?.container?.()?.getBoundingClientRect?.() || null;
  }

  function screenToStagePoint(x, y, stageRect) {
    const stage = getStage?.();
    if (!stageRect || !stage) return null;
    const sx = stageRect.width / Math.max(1, stage.width());
    const sy = stageRect.height / Math.max(1, stage.height());
    return {
      x: (x - stageRect.left) / sx,
      y: (y - stageRect.top) / sy,
    };
  }

  function getSelectionCenterStage(node) {
    const rect = node?.getClientRect?.({ skipShadow: true, skipStroke: true });
    if (!rect) return null;
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  }

  function getOverlayBindingState(kind) {
    if (kind === "frame") {
      return {
        node: getSelectedFrameNode?.(),
        transformer: getFrameTransformer?.(),
        onCommit: onFrameCommit,
      };
    }
    return {
      node: getSelectedCanvasImageNode?.(),
      transformer: getCanvasImageTransformer?.(),
      onCommit: onCanvasImageCommit,
    };
  }

  function endOutsideHandleSession(commit = true) {
    if (!outsideHandleSession) return;
    const { onCommit } = outsideHandleSession;
    outsideHandleSession = null;
    window.removeEventListener("pointermove", onOutsideHandlePointerMove);
    window.removeEventListener("pointerup", onOutsideHandlePointerUp);
    window.removeEventListener("pointercancel", onOutsideHandlePointerUp);
    refresh();
    if (commit) onCommit?.();
  }

  function onOutsideHandlePointerMove(event) {
    if (!outsideHandleSession) return;
    const {
      node,
      mode,
      stageRect,
      centerStage,
      fixedStage,
      startActiveStage,
      startPosition,
      startScale,
      startRotation,
      startPointerAngle,
    } = outsideHandleSession;
    if (!node?.getStage?.()) {
      endOutsideHandleSession(false);
      return;
    }

    event.preventDefault();
    const point = screenToStagePoint(event.clientX, event.clientY, stageRect);
    if (!point) return;

    if (mode === "rotate") {
      const currentAngle = Math.atan2(point.y - centerStage.y, point.x - centerStage.x);
      node.rotation(startRotation + ((currentAngle - startPointerAngle) * 180) / Math.PI);
      const currentCenter = getSelectionCenterStage(node);
      if (currentCenter) {
        node.position({
          x: node.x() + (centerStage.x - currentCenter.x),
          y: node.y() + (centerStage.y - currentCenter.y),
        });
      }
      if (node.hasName?.("mockup-group")) {
        constrainFrameNode?.(node);
      }
    } else {
      const startVector = {
        x: startActiveStage.x - fixedStage.x,
        y: startActiveStage.y - fixedStage.y,
      };
      const currentVector = {
        x: point.x - fixedStage.x,
        y: point.y - fixedStage.y,
      };
      const startLength = Math.hypot(startVector.x, startVector.y) || 1;
      const ux = startVector.x / startLength;
      const uy = startVector.y / startLength;
      const projected = currentVector.x * ux + currentVector.y * uy;
      const ratio = Math.max(MIN_SCALE_RATIO, projected / startLength);

      node.scale({
        x: startScale.x * ratio,
        y: startScale.y * ratio,
      });
      node.position({
        x: startPosition.x * ratio + fixedStage.x * (1 - ratio),
        y: startPosition.y * ratio + fixedStage.y * (1 - ratio),
      });
      if (node.hasName?.("mockup-group")) {
        constrainFrameNode?.(node);
      }
    }

    getLayer?.()?.batchDraw();
    refresh();
  }

  function onOutsideHandlePointerUp() {
    endOutsideHandleSession(true);
  }

  function bindOutsideHandleOverlay(overlay, kind) {
    overlay.addEventListener("pointerdown", (event) => {
      const handleKey = getHandleKey(event.target);
      if (!handleKey || event.button !== 0) return;

      const { node, transformer, onCommit } = getOverlayBindingState(kind);
      const stageRect = getStageRect();
      if (!node || !transformer || !stageRect) return;

      const screenPoints = getTransformerScreenAnchorPoints(transformer, stageRect);
      const activeScreen = screenPoints?.[handleKey];
      if (!activeScreen) return;
      const startActiveStage = screenToStagePoint(activeScreen.x, activeScreen.y, stageRect);
      const pointerStage = screenToStagePoint(event.clientX, event.clientY, stageRect);
      if (!startActiveStage || !pointerStage) return;

      const centerStage = getSelectionCenterStage(node);
      if (!centerStage) return;

      let fixedStage = null;
      if (handleKey !== "rotate") {
        const oppositeKey = OPPOSITE_HANDLE[handleKey];
        const fixedScreen = oppositeKey ? screenPoints?.[oppositeKey] : null;
        fixedStage = fixedScreen ? screenToStagePoint(fixedScreen.x, fixedScreen.y, stageRect) : null;
        if (!fixedStage) return;
      }

      event.preventDefault();
      event.stopPropagation();
      endOutsideHandleSession(false);
      outsideHandleSession = {
        node,
        mode: handleKey === "rotate" ? "rotate" : "scale",
        stageRect,
        centerStage,
        fixedStage,
        startActiveStage,
        startPosition: { x: node.x(), y: node.y() },
        startScale: { x: node.scaleX(), y: node.scaleY() },
        startRotation: node.rotation(),
        startPointerAngle: Math.atan2(pointerStage.y - centerStage.y, pointerStage.x - centerStage.x),
        onCommit,
      };
      window.addEventListener("pointermove", onOutsideHandlePointerMove, { passive: false });
      window.addEventListener("pointerup", onOutsideHandlePointerUp);
      window.addEventListener("pointercancel", onOutsideHandlePointerUp);
    });
  }

  // Hook transformer node assignments so overlay state stays in sync with selection.
  function wrapTransformerNodes(transformer) {
    if (!transformer?.nodes) return;
    const baseNodes = transformer.nodes.bind(transformer);
    transformer.nodes = (...args) => {
      const result = baseNodes(...args);
      if (args.length) refresh();
      return result;
    };
  }

  return {
    refresh,
    wrapTransformerNodes,
  };
}
