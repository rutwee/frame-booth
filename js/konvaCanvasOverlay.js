import { createCanvasTextNode, getCanvasTextNodes, getCanvasTextSnapshot, isCanvasTextNode, syncCanvasTextHighlightNode, updateCanvasTextNode } from "./konvaCanvasText.js";

const CANVAS_BG_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const CANVAS_BG_IMAGE_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);

// Read an uploaded file as base64 data URL.
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

// Validate canvas background image file constraints.
function isCanvasBackgroundImageFileValid(file) {
  if (!file) return "No image selected.";
  if (!CANVAS_BG_IMAGE_ACCEPTED_TYPES.has(file.type)) {
    return "Please upload PNG, JPG, WEBP, AVIF, or GIF.";
  }
  if (file.size > CANVAS_BG_IMAGE_MAX_BYTES) {
    return "Image file is too large. Please use a file under 20MB.";
  }
  return null;
}

// Fit an image to stage bounds while preserving aspect ratio.
function fitCanvasBackgroundImageToStage(imageNode, imageElement, stage) {
  if (!imageNode || !stage || !imageElement) return;
  const stageWidth = Math.max(1, stage.width());
  const stageHeight = Math.max(1, stage.height());
  const srcWidth = Math.max(1, imageElement.width || 1);
  const srcHeight = Math.max(1, imageElement.height || 1);
  const containScale = Math.min(stageWidth / srcWidth, stageHeight / srcHeight);
  const initialScale = containScale * 0.92;
  const width = srcWidth * initialScale;
  const height = srcHeight * initialScale;
  imageNode.position({ x: (stageWidth - width) / 2, y: (stageHeight - height) / 2 });
  imageNode.size({ width, height });
  imageNode.scale({ x: 1, y: 1 });
  imageNode.rotation(0);
}

// Build a canvas overlay manager for image + text nodes.
export function createKonvaCanvasOverlayManager({
  stage,
  layer,
  tr,
  canvasImageTransformer,
  deleteButton,
  isCanvasEnabled,
  loadImage,
  getOrderMenuController,
  clearFrameSelection,
  onOverlaysChanged,
} = {}) {
  function isCanvasImageVisible() {
    return !!isCanvasEnabled?.();
  }

  function getCanvasBackgroundImageNodes() {
    if (!stage?.find) return [];
    const found = stage.find(".canvas-bg-image");
    return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
  }

  function getCanvasOverlayNodes() {
    return [...getCanvasBackgroundImageNodes(), ...getCanvasTextNodes(stage)].sort(
      (a, b) => a.zIndex() - b.zIndex(),
    );
  }

  function isCanvasOverlayNode(node) {
    return !!(node?.hasName?.("canvas-bg-image") || isCanvasTextNode(node));
  }

  function getSelectedOverlayNode() {
    const node = canvasImageTransformer?.nodes?.()?.[0] || null;
    return isCanvasOverlayNode(node) ? node : null;
  }

  // Publish overlay selection state to sidebar controls.
  function notifySelectionChanged() {
    const selected = getSelectedOverlayNode();
    const detail = isCanvasTextNode(selected)
      ? { type: "text", text: getCanvasTextSnapshot(selected) }
      : selected?.hasName?.("canvas-bg-image")
        ? { type: "image" }
        : { type: "none" };
    window.dispatchEvent(new CustomEvent("canvas-overlay-selection-changed", { detail }));
  }

  function clearSelection() {
    canvasImageTransformer?.nodes([]);
    if (!tr?.nodes?.()?.length && deleteButton) {
      deleteButton.disabled = true;
    }
    notifySelectionChanged();
  }

  function placeBehindFrames() {
    const nodes = getCanvasOverlayNodes();
    nodes.forEach((node) => {
      if (node.zIndex() < 1) node.zIndex(1);
      if (isCanvasTextNode(node)) {
        syncCanvasTextHighlightNode(node, layer);
      }
    });
  }

  function syncVisibility() {
    const visible = isCanvasImageVisible();
    const nodes = getCanvasOverlayNodes();
    for (const node of nodes) {
      node.visible(visible);
      if (isCanvasTextNode(node)) {
        syncCanvasTextHighlightNode(node, layer);
      }
    }
    if (!visible) clearSelection();
  }

  function selectOverlayNode(node) {
    if (!node || !isCanvasImageVisible()) return;
    getOrderMenuController?.()?.resetSelectionCycle?.();
    clearFrameSelection?.();
    if (isCanvasTextNode(node) && node.padding?.() !== 0) {
      node.padding(0);
    }
    canvasImageTransformer?.padding?.(isCanvasTextNode(node) ? 0 : 12);
    canvasImageTransformer?.nodes([node]);
    canvasImageTransformer?.moveToTop();
    tr?.moveToTop();
    if (deleteButton) deleteButton.disabled = false;
    notifySelectionChanged();
    layer?.batchDraw();
  }

  async function setCanvasBackgroundImageFromSource(src, snapshot = null) {
    if (!src || !layer) return null;
    const imageElement = await loadImage(src);
    const node = new Konva.Image({
      name: "canvas-bg-image",
      draggable: true,
      listening: true,
      image: imageElement,
    });
    node.setAttr("sourceSrc", src);
    node.on("click tap", (event) => {
      if (getOrderMenuController?.()?.handleNodeClickEvent?.(event)) {
        event.cancelBubble = true;
        return;
      }
      event.cancelBubble = true;
      selectOverlayNode(node);
    });
    node.on("dragend transformend", () => onOverlaysChanged?.());
    layer.add(node);
    if (!snapshot) {
      node.zIndex(1);
    }

    if (snapshot) {
      node.position({ x: snapshot.x || 0, y: snapshot.y || 0 });
      node.size({
        width: Math.max(1, snapshot.width || imageElement.width || 1),
        height: Math.max(1, snapshot.height || imageElement.height || 1),
      });
      node.scale({ x: snapshot.scaleX || 1, y: snapshot.scaleY || 1 });
      node.rotation(snapshot.rotation || 0);
    } else {
      fitCanvasBackgroundImageToStage(node, imageElement, stage);
    }

    placeBehindFrames();
    syncVisibility();
    if (isCanvasImageVisible()) {
      selectOverlayNode(node);
    } else {
      clearSelection();
    }
    tr?.moveToTop();
    layer.batchDraw();
    return node;
  }

  function addText(snapshot = null, options = {}) {
    if (!layer || !stage) return null;
    const { skipSelect = false, skipNotify = false } = options;
    const textNode = createCanvasTextNode({
      stage,
      layer,
      snapshot,
      onBeforeSelect: (event) => !!getOrderMenuController?.()?.handleNodeClickEvent?.(event),
      onSelectNode: (node) => selectOverlayNode(node),
      onNodeChanging: () => layer?.batchDraw(),
      onNodeChanged: () => onOverlaysChanged?.(),
    });
    if (!textNode) return null;
    placeBehindFrames();
    syncVisibility();
    if (!skipSelect && isCanvasImageVisible()) {
      selectOverlayNode(textNode);
    } else {
      clearSelection();
    }
    layer.batchDraw();
    if (!skipNotify) onOverlaysChanged?.();
    return textNode;
  }

  function getSelectedTextSnapshot() {
    return getCanvasTextSnapshot(getSelectedOverlayNode());
  }

  function updateSelectedText(next = {}, options = {}) {
    const textNode = getSelectedOverlayNode();
    const wasUpdated = updateCanvasTextNode(textNode, next, {
      layer,
      canvasImageTransformer,
    });
    if (!wasUpdated) return false;
    if (!options.skipSelectionNotify) notifySelectionChanged();
    layer?.batchDraw();
    if (!options.skipNotify) onOverlaysChanged?.();
    return true;
  }

  async function setBackgroundImageFromFile(file) {
    const error = isCanvasBackgroundImageFileValid(file);
    if (error) throw new Error(error);
    const dataURL = await readFileAsDataURL(file);
    await setCanvasBackgroundImageFromSource(dataURL);
  }

  function getState() {
    return getCanvasOverlayNodes().map((node) => {
      if (isCanvasTextNode(node)) return getCanvasTextSnapshot(node);
      return {
        type: "image",
        src: node.getAttr("sourceSrc") || node.image()?.src || null,
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        rotation: node.rotation(),
      };
    });
  }

  async function restoreState(snapshot) {
    const snapshots = Array.isArray(snapshot)
      ? snapshot
      : snapshot?.src || snapshot?.type
        ? [snapshot]
        : [];
    clear(true);
    if (!snapshots.length) return;
    for (const item of snapshots) {
      if (item?.type === "text") {
        addText(item, { skipSelect: true, skipNotify: true });
        continue;
      }
      if (!item?.src) continue;
      await setCanvasBackgroundImageFromSource(item.src, item);
    }
    clearSelection();
    layer?.batchDraw();
  }

  function clear(removeAll = false) {
    const selected = getSelectedOverlayNode();
    if (selected && !removeAll) {
      selected.destroy();
      clearSelection();
      layer?.batchDraw();
      return true;
    }
    const nodes = getCanvasOverlayNodes();
    if (!nodes.length) return false;
    nodes.forEach((node) => node.destroy());
    clearSelection();
    layer?.batchDraw();
    return true;
  }

  return {
    isOverlayNode: isCanvasOverlayNode,
    getOverlayNodes: getCanvasOverlayNodes,
    getSelectedOverlayNode,
    clearSelection,
    selectOverlayNode,
    placeBehindFrames,
    syncVisibility,
    addText,
    getSelectedTextSnapshot,
    updateSelectedText,
    setBackgroundImageFromFile,
    getState,
    restoreState,
    clear,
  };
}
