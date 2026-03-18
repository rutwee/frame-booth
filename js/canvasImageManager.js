import { asArray } from "./sceneUtils.js";

const CANVAS_BG_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const CANVAS_BG_IMAGE_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export function createCanvasImageManager({
  loadImage,
  readFileAsDataURL,
  isCanvasEnabled,
  getStage,
  getLayer,
  getFrameTransformer,
  getCanvasImageTransformer,
  hasFrameSelection,
  clearFrameSelection,
  uiDeleteBtn,
  refreshOutsideHandles,
  onCanvasImagesChanged,
} = {}) {
  function isCanvasImageVisible() {
    return !!isCanvasEnabled?.();
  }

  function isActiveSelectionNode(node) {
    const stage = getStage?.();
    return !!(node?.hasName?.("canvas-bg-image") && node?.getStage?.() === stage);
  }

  function getNodes() {
    const stage = getStage?.();
    return stage?.find ? asArray(stage.find(".canvas-bg-image")) : [];
  }

  function getSelectedNode() {
    const node = getCanvasImageTransformer?.()?.nodes?.()?.[0] || null;
    return isActiveSelectionNode(node) ? node : null;
  }

  function clearSelection() {
    getCanvasImageTransformer?.()?.nodes([]);
    if (!hasFrameSelection?.() && uiDeleteBtn) {
      uiDeleteBtn.disabled = true;
    }
  }

  function placeBehindFrames() {
    getNodes().forEach((node, index) => {
      node.zIndex(1 + index);
    });
  }

  function bringToFront(targetNode) {
    if (!targetNode) return;
    const nodes = getNodes();
    if (!nodes.length) return;

    const ordered = nodes.filter((node) => node !== targetNode);
    ordered.push(targetNode);
    ordered.forEach((node, index) => {
      node.zIndex(1 + index);
    });

    getFrameTransformer?.()?.moveToTop();
    getCanvasImageTransformer?.()?.moveToTop();
  }

  function selectNode(node) {
    if (!node || !isCanvasImageVisible()) return;
    clearFrameSelection?.();
    const transformer = getCanvasImageTransformer?.();
    transformer?.nodes([node]);
    transformer?.moveToTop();
    if (uiDeleteBtn) uiDeleteBtn.disabled = false;
  }

  function syncVisibility() {
    const visible = isCanvasImageVisible();
    for (const node of getNodes()) {
      node.visible(visible);
    }
    if (!visible) {
      clearSelection();
    }
    refreshOutsideHandles?.();
  }

  function fitToStage(imageNode, imageElement) {
    const stage = getStage?.();
    if (!imageNode || !stage || !imageElement) return;
    const stageWidth = Math.max(1, stage.width());
    const stageHeight = Math.max(1, stage.height());
    const srcWidth = Math.max(1, imageElement.width || 1);
    const srcHeight = Math.max(1, imageElement.height || 1);
    const containScale = Math.min(stageWidth / srcWidth, stageHeight / srcHeight);
    const initialScale = containScale * 0.92;
    const width = srcWidth * initialScale;
    const height = srcHeight * initialScale;
    imageNode.position({
      x: (stageWidth - width) / 2,
      y: (stageHeight - height) / 2,
    });
    imageNode.size({ width, height });
    imageNode.scale({ x: 1, y: 1 });
    imageNode.rotation(0);
  }

  async function setFromSource(src, snapshot = null) {
    if (!src || !getLayer?.()) return null;
    const layer = getLayer();
    const imageElement = await loadImage(src);

    const node = new Konva.Image({
      name: "canvas-bg-image",
      draggable: true,
      listening: true,
      image: imageElement,
    });
    node.setAttr("sourceSrc", src);
    node.on("click tap", (event) => {
      event.cancelBubble = true;
      if (!isCanvasImageVisible()) return;
      bringToFront(node);
      selectNode(node);
      refreshOutsideHandles?.();
      layer.batchDraw();
    });
    node.on("dragmove transform", () => {
      refreshOutsideHandles?.();
    });
    node.on("dragend transformend", () => {
      refreshOutsideHandles?.();
      onCanvasImagesChanged?.();
    });
    layer.add(node);

    if (snapshot) {
      node.position({ x: snapshot.x || 0, y: snapshot.y || 0 });
      node.size({
        width: Math.max(1, snapshot.width || imageElement.width || 1),
        height: Math.max(1, snapshot.height || imageElement.height || 1),
      });
      node.scale({
        x: snapshot.scaleX || 1,
        y: snapshot.scaleY || 1,
      });
      node.rotation(snapshot.rotation || 0);
    } else {
      fitToStage(node, imageElement);
    }

    placeBehindFrames();
    syncVisibility();
    if (isCanvasImageVisible()) {
      selectNode(node);
    } else {
      clearSelection();
    }
    getFrameTransformer?.()?.moveToTop();
    refreshOutsideHandles?.();
    layer.batchDraw();
    return node;
  }

  function getImageValidationError(file) {
    if (!file) return "No image selected.";
    if (!CANVAS_BG_IMAGE_ACCEPTED_TYPES.has(file.type)) {
      return "Please upload PNG, JPG, WEBP, AVIF, or GIF.";
    }
    if (file.size > CANVAS_BG_IMAGE_MAX_BYTES) {
      return "Image file is too large. Please use a file under 20MB.";
    }
    return null;
  }

  async function setFromFile(file) {
    const error = getImageValidationError(file);
    if (error) throw new Error(error);
    const dataURL = await readFileAsDataURL(file);
    await setFromSource(dataURL);
  }

  function getState() {
    return getNodes().map((node) => ({
      src: node.getAttr("sourceSrc") || node.image()?.src || null,
      x: node.x(),
      y: node.y(),
      width: node.width(),
      height: node.height(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    }));
  }

  async function restoreState(snapshot) {
    const snapshots = Array.isArray(snapshot)
      ? snapshot
      : snapshot?.src
        ? [snapshot]
        : [];
    clear(true);
    if (!snapshots.length) return;

    for (const item of snapshots) {
      if (!item?.src) continue;
      await setFromSource(item.src, item);
    }
    clearSelection();
    refreshOutsideHandles?.();
    getLayer?.()?.batchDraw();
  }

  function clear(removeAll = false) {
    const selected = getSelectedNode();
    if (selected && !removeAll) {
      selected.destroy();
      clearSelection();
      refreshOutsideHandles?.();
      getLayer?.()?.batchDraw();
      return true;
    }

    const nodes = getNodes();
    if (!nodes.length) return false;
    nodes.forEach((node) => node.destroy());
    clearSelection();
    refreshOutsideHandles?.();
    getLayer?.()?.batchDraw();
    return true;
  }

  return {
    getSelectedNode,
    clearSelection,
    setFromFile,
    getState,
    restoreState,
    clear,
    syncVisibility,
    placeBehindFrames,
  };
}
