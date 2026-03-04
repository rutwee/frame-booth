// ==========================================================================
// KONVA.JS INITIALIZATION & SETUP
// ==========================================================================

import * as UI from "./ui.js";
import { frames, AppState } from "./state.js";
import { loadImage, isCanvasEnabled, getCurrentCustomGradientConfig } from "./helpers.js";
import { createKonvaBoundsHelpers } from "./konvaBounds.js";
import { createKonvaPlaceholderFactory } from "./konvaPlaceholder.js";
import { createKonvaSelectionManager } from "./konvaSelection.js";
import { applyCanvasGradientToRect, getDefaultCanvasGradientId } from "./canvasGradients.js";

// variables for the Konva stage and its components //
let stage;
let layer;
export let tr;
let backgroundRect;
export let lastAddedMockup = null;
let initialStageHeight;
let boundsHelpers;
let placeholderFactory;
let selectionManager;

const EDITABLE_TAGS = ["INPUT", "SELECT", "TEXTAREA"];
const CANVAS_BG_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const CANVAS_BG_IMAGE_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);
let canvasImageTransformer = null;
let frameOutsideHandles = null;
let canvasImageOutsideHandles = null;
const OUTSIDE_HANDLE_ANCHORS = {
  tl: "top-left",
  tr: "top-right",
  bl: "bottom-left",
  br: "bottom-right",
  rotate: "rotater",
};
const OPPOSITE_HANDLE = { tl: "br", tr: "bl", bl: "tr", br: "tl" };
const MIN_SCALE_RATIO = 0.05;
let outsideHandleSession = null;

function notifyFramesChanged() {
  window.dispatchEvent(new Event("frames-changed"));
}

function notifyCanvasBackgroundImagesChanged() {
  window.dispatchEvent(new Event("canvas-bg-images-changed"));
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function isCanvasImageVisible() {
  return !!isCanvasEnabled();
}

function getSelectedMockupNode() {
  const node = tr?.nodes?.()?.[0] || null;
  if (!node?.hasName?.("mockup-group")) return null;
  return node?.getStage?.() === stage ? node : null;
}

function clearCanvasBackgroundImageSelection() {
  canvasImageTransformer?.nodes([]);
  if (!tr?.nodes?.()?.length && UI.deleteBtn) {
    UI.deleteBtn.disabled = true;
  }
  if (canvasImageOutsideHandles) canvasImageOutsideHandles.hidden = true;
}

function getCanvasBackgroundImageNodes() {
  if (!stage?.find) return [];
  const found = stage.find(".canvas-bg-image");
  return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
}

function getSelectedCanvasBackgroundImageNode() {
  const node = canvasImageTransformer?.nodes?.()?.[0] || null;
  if (!node?.hasName?.("canvas-bg-image")) return null;
  return node?.getStage?.() === stage ? node : null;
}

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

function updateFrameOutsideHandles() {
  const overlay = ensureOutsideHandlesOverlay("frame");
  const selected = getSelectedMockupNode();
  if (!overlay || !selected || !isCanvasEnabled()) {
    if (overlay) overlay.hidden = true;
    return;
  }
  const previewRect = document.querySelector(".preview-wrap")?.getBoundingClientRect?.();
  const stageRect = stage?.container?.()?.getBoundingClientRect?.();
  if (!previewRect || !stageRect) {
    overlay.hidden = true;
    return;
  }
  const points = getTransformerScreenAnchorPoints(tr, stageRect);
  renderOutsideHandles(overlay, points, previewRect, stageRect);
}

function updateCanvasImageOutsideHandles() {
  const overlay = ensureOutsideHandlesOverlay("canvas-image");
  const selected = getSelectedCanvasBackgroundImageNode();
  if (!overlay || !selected || !isCanvasEnabled()) {
    if (overlay) overlay.hidden = true;
    return;
  }
  const previewRect = document.querySelector(".preview-wrap")?.getBoundingClientRect?.();
  const stageRect = stage?.container?.()?.getBoundingClientRect?.();
  if (!previewRect || !stageRect) {
    overlay.hidden = true;
    return;
  }
  const points = getTransformerScreenAnchorPoints(canvasImageTransformer, stageRect);
  renderOutsideHandles(overlay, points, previewRect, stageRect);
}

function refreshOutsideHandles() {
  updateFrameOutsideHandles();
  updateCanvasImageOutsideHandles();
}

function getHandleKey(target) {
  if (!target?.classList?.contains("outside-handle")) return null;
  for (const key of Object.keys(OUTSIDE_HANDLE_ANCHORS)) {
    if (target.classList.contains(key)) return key;
  }
  return null;
}

function getStageRect() {
  return stage?.container?.()?.getBoundingClientRect?.() || null;
}

function screenToStagePoint(x, y, stageRect) {
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
      node: getSelectedMockupNode(),
      transformer: tr,
      onCommit: notifyFramesChanged,
    };
  }
  return {
    node: getSelectedCanvasBackgroundImageNode(),
    transformer: canvasImageTransformer,
    onCommit: notifyCanvasBackgroundImagesChanged,
  };
}

function endOutsideHandleSession(commit = true) {
  if (!outsideHandleSession) return;
  const { onCommit } = outsideHandleSession;
  outsideHandleSession = null;
  window.removeEventListener("pointermove", onOutsideHandlePointerMove);
  window.removeEventListener("pointerup", onOutsideHandlePointerUp);
  window.removeEventListener("pointercancel", onOutsideHandlePointerUp);
  refreshOutsideHandles();
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
    // Keep the visual center fixed so outside-rotate matches Transformer pivot behavior.
    const currentCenter = getSelectionCenterStage(node);
    if (currentCenter) {
      node.position({
        x: node.x() + (centerStage.x - currentCenter.x),
        y: node.y() + (centerStage.y - currentCenter.y),
      });
    }
    if (node.hasName?.("mockup-group")) {
      boundsHelpers?.constrainGroupToStage(node);
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
      boundsHelpers?.constrainGroupToStage(node);
    }
  }

  layer?.batchDraw();
  refreshOutsideHandles();
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

function placeCanvasBackgroundImagesBehindFrames() {
  const nodes = getCanvasBackgroundImageNodes();
  nodes.forEach((node, index) => {
    node.zIndex(1 + index);
  });
}

function bringCanvasBackgroundImageToFront(targetNode) {
  if (!targetNode) return;
  const nodes = getCanvasBackgroundImageNodes();
  if (!nodes.length) return;

  const ordered = nodes.filter((node) => node !== targetNode);
  ordered.push(targetNode);
  ordered.forEach((node, index) => {
    node.zIndex(1 + index);
  });

  tr?.moveToTop();
  canvasImageTransformer?.moveToTop();
}

function syncCanvasBackgroundImageVisibility() {
  const visible = isCanvasImageVisible();
  const nodes = getCanvasBackgroundImageNodes();
  for (const node of nodes) {
    node.visible(visible);
  }
  if (!visible) {
    clearCanvasBackgroundImageSelection();
  }
  refreshOutsideHandles();
}

function fitCanvasBackgroundImageToStage(imageNode, imageElement) {
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

async function setCanvasBackgroundImageFromSource(src, snapshot = null) {
  // Add a movable canvas image node behind all frames (supports multiple images).
  if (!src || !layer) return null;
  const imageElement = await loadImage(src);

  const canvasBackgroundImageNode = new Konva.Image({
    name: "canvas-bg-image",
    draggable: true,
    listening: true,
    image: imageElement,
  });
  canvasBackgroundImageNode.setAttr("sourceSrc", src);
  canvasBackgroundImageNode.on("click tap", (event) => {
    event.cancelBubble = true;
    if (!isCanvasImageVisible()) return;
    bringCanvasBackgroundImageToFront(canvasBackgroundImageNode);
    selectionManager?.clearSelection();
    canvasImageTransformer?.nodes([canvasBackgroundImageNode]);
    canvasImageTransformer?.moveToTop();
    if (UI.deleteBtn) UI.deleteBtn.disabled = false;
    refreshOutsideHandles();
    layer.batchDraw();
  });
  canvasBackgroundImageNode.on("dragmove transform", () => {
    refreshOutsideHandles();
  });
  canvasBackgroundImageNode.on("dragend transformend", () => {
    refreshOutsideHandles();
    notifyCanvasBackgroundImagesChanged();
  });
  layer.add(canvasBackgroundImageNode);

  if (snapshot) {
    canvasBackgroundImageNode.position({ x: snapshot.x || 0, y: snapshot.y || 0 });
    canvasBackgroundImageNode.size({
      width: Math.max(1, snapshot.width || imageElement.width || 1),
      height: Math.max(1, snapshot.height || imageElement.height || 1),
    });
    canvasBackgroundImageNode.scale({
      x: snapshot.scaleX || 1,
      y: snapshot.scaleY || 1,
    });
    canvasBackgroundImageNode.rotation(snapshot.rotation || 0);
  } else {
    fitCanvasBackgroundImageToStage(canvasBackgroundImageNode, imageElement);
  }

  placeCanvasBackgroundImagesBehindFrames();
  syncCanvasBackgroundImageVisibility();
  if (isCanvasImageVisible()) {
    selectionManager?.clearSelection();
    canvasImageTransformer?.nodes([canvasBackgroundImageNode]);
    canvasImageTransformer?.moveToTop();
    if (UI.deleteBtn) UI.deleteBtn.disabled = false;
  } else {
    clearCanvasBackgroundImageSelection();
  }
  tr?.moveToTop();
  refreshOutsideHandles();
  layer.batchDraw();
  return canvasBackgroundImageNode;
}

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

export async function setCanvasBackgroundImageFromFile(file) {
  const error = isCanvasBackgroundImageFileValid(file);
  if (error) throw new Error(error);
  const dataURL = await readFileAsDataURL(file);
  await setCanvasBackgroundImageFromSource(dataURL);
}

export function getCanvasBackgroundImageState() {
  return getCanvasBackgroundImageNodes().map((node) => ({
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

export async function restoreCanvasBackgroundImageState(snapshot) {
  const snapshots = Array.isArray(snapshot)
    ? snapshot
    : snapshot?.src
      ? [snapshot]
      : [];
  clearCanvasBackgroundImage(true);
  if (!snapshots.length) {
    return;
  }
  for (const item of snapshots) {
    if (!item?.src) continue;
    await setCanvasBackgroundImageFromSource(item.src, item);
  }
  clearCanvasBackgroundImageSelection();
  refreshOutsideHandles();
  layer?.batchDraw();
}

export function clearCanvasBackgroundImage(removeAll = false) {
  const selected = getSelectedCanvasBackgroundImageNode();
  if (selected && !removeAll) {
    selected.destroy();
    clearCanvasBackgroundImageSelection();
    refreshOutsideHandles();
    layer?.batchDraw();
    return true;
  }
  const nodes = getCanvasBackgroundImageNodes();
  if (!nodes.length) return false;
  nodes.forEach((node) => node.destroy());
  clearCanvasBackgroundImageSelection();
  refreshOutsideHandles();
  layer?.batchDraw();
  return true;
}

export function updateKonvaCanvasBackground() {
  if (!backgroundRect || !layer) return;
  applyCanvasGradientToRect({
    rect: backgroundRect,
    stage,
    enabled: isCanvasEnabled(),
    gradientId: UI.bgGradient?.value || getDefaultCanvasGradientId(),
    solidColor: UI.bgColor.value || "#ffffff",
    customGradient: getCurrentCustomGradientConfig(),
  });
  syncCanvasBackgroundImageVisibility();
  layer.batchDraw();
}

/**
 * Creates and adds an "Upload an Image" placeholder to a mockup group.
 * The placeholder is clickable and opens the file input dialog.
 * @param {Konva.Group} group The parent mockup group.
 * @param {object} frameData The data object for the frame.
 * @param {number} scale The calculated scale of the frame.
 */

// ==========================================================================
// PLACEHOLDER - createAndAddPlaceholder()
// ==========================================================================
async function createAndAddPlaceholder(group, frameData, scale) {
  if (!placeholderFactory) return;
  await placeholderFactory.createAndAddPlaceholder(group, frameData, scale);
}

// ==========================================================================
// DELETE MOCKUP - deleteSelectedMockup()
// ==========================================================================
async function deleteSelectedMockup() {
  if (!tr || !layer) return;

  const selected = tr.nodes()[0];
  if (!selected && getSelectedCanvasBackgroundImageNode()) {
    clearCanvasBackgroundImage();
    notifyCanvasBackgroundImagesChanged();
    return;
  }
  if (!selected) return;

  const screenshotContainer = selected.findOne(".screenshot-container");

  if (screenshotContainer) {
    screenshotContainer.destroy();

    const frameId = selected.getAttr("frameId");
    const frameData = frames.find((f) => f.id === frameId);
    const frameNode = selected.getChildren(
      (node) => node.getClassName() === "Image",
    )[0];
    const frameImage = frameNode?.image();
    const scale =
      frameNode && frameImage ? frameNode.width() / frameImage.width : 0;

    if (frameData && frameNode && frameImage) {
      await createAndAddPlaceholder(selected, frameData, scale);
      frameNode.moveToTop();
    }
    layer.batchDraw();
    return;
  }

  selected.destroy();
  selectionManager?.clearSelection();
  notifyFramesChanged();
}

// ==========================================================================
// ADD MOCKUP - addMockup()
// ==========================================================================
export async function addMockup(options = {}) {
  if (!stage || !layer || !tr) return null;
  const {
    initialState = null,
    skipSelect = false,
    skipNotify = false,
  } = options;

  const frameData = frames.find((f) => f.id === UI.frameSelect.value);
  if (!frameData) return null;

  /* Calculate a dynamic size for the new frame to fit nicely on the canvas */
  const maxCanvasHeight = initialStageHeight * 0.8;
  const maxOriginalHeight = Math.max(
    ...frames.map((f) => f.originalHeight || 0),
    1,
  );
  const desiredHeight =
    (frameData.originalHeight / maxOriginalHeight) * maxCanvasHeight;

  const frameImg = await loadImage(frameData.src);
  const scale = desiredHeight / frameImg.height;
  const frameWidth = frameImg.width * scale;
  const frameHeight = desiredHeight;

  const group = new Konva.Group({
    draggable: true,
    name: "mockup-group",
  });
  group.setAttr("frameId", frameData.id);

  const frameNode = new Konva.Image({
    image: frameImg,
    width: frameWidth,
    height: frameHeight,
    listening: false,
  });
  await createAndAddPlaceholder(group, frameData, scale);
  group.add(frameNode);

  if (initialState) {
    group.position({ x: initialState.x || 0, y: initialState.y || 0 });
    group.scale({ x: initialState.scaleX || 1, y: initialState.scaleY || 1 });
    group.rotation(initialState.rotation || 0);
  } else {
    group.position(
      boundsHelpers?.getAutoPlacement(frameWidth, frameHeight) || { x: 0, y: 0 },
    );
  }
  boundsHelpers?.constrainGroupToStage(group);

  group.on("click", (e) => {
    e.cancelBubble = true;
    clearCanvasBackgroundImageSelection();
    selectionManager?.selectMockupGroup(group);
  });
  group.on("dragmove transform", () => {
    boundsHelpers?.constrainGroupToStage(group);
    refreshOutsideHandles();
  });
  group.on("dragend transformend", () => {
    boundsHelpers?.constrainGroupToStage(group);
    refreshOutsideHandles();
    notifyFramesChanged();
  });

  layer.add(group);
  lastAddedMockup = group;

  if (!skipSelect) {
    selectionManager?.selectMockupGroup(group);
  }
  layer.batchDraw();
  if (!skipNotify) {
    notifyFramesChanged();
  }
  return group;
}

// ==========================================================================
// KONVA INITIALIZATION - initKonva()
// ==========================================================================
export function initKonva() {
  stage = new Konva.Stage({
    container: "mockupArea",
    width: UI.mockupArea.offsetWidth,
    height: UI.mockupArea.offsetHeight,
  });
  initialStageHeight = stage.height();

  layer = new Konva.Layer();
  stage.add(layer);

  backgroundRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: stage.width(),
    height: stage.height(),
    fill: "rgba(0,0,0,0)",
    listening: false,
  });
  layer.add(backgroundRect);
  updateKonvaCanvasBackground();

  tr = new Konva.Transformer({
    rotateEnabled: true,
    resizeEnabled: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    anchorStroke: "#111827",
    anchorFill: "#fff",
    anchorSize: 10,
    borderStroke: "#111827",
    borderDash: [4, 4],
  });
  layer.add(tr);
  canvasImageTransformer = new Konva.Transformer({
    rotateEnabled: true,
    resizeEnabled: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    padding: 12,
    anchorStroke: "#4b5563",
    anchorFill: "#fff",
    anchorSize: 8,
    borderStroke: "#4b5563",
    borderDash: [4, 4],
  });
  layer.add(canvasImageTransformer);
  const trNodes = tr.nodes.bind(tr);
  tr.nodes = (...args) => {
    const result = trNodes(...args);
    if (args.length) refreshOutsideHandles();
    return result;
  };
  const canvasTransformerNodes = canvasImageTransformer.nodes.bind(canvasImageTransformer);
  canvasImageTransformer.nodes = (...args) => {
    const result = canvasTransformerNodes(...args);
    if (args.length) refreshOutsideHandles();
    return result;
  };
  boundsHelpers = createKonvaBoundsHelpers({
    getStage: () => stage,
    getLastAddedMockup: () => lastAddedMockup,
  });
  selectionManager = createKonvaSelectionManager({
    ui: UI,
    appState: AppState,
    getTransformer: () => tr,
    getLayer: () => layer,
  });
  placeholderFactory = createKonvaPlaceholderFactory({
    loadImage,
    fileInput: UI.fileInput,
    selectMockupGroup: (group) => {
      clearCanvasBackgroundImageSelection();
      selectionManager?.selectMockupGroup(group);
    },
  });
  selectionManager.setSelectionButtonsDisabled(true);

  /* Stage-level event listeners */
  stage.on("click", (e) => {
    if (e.target === stage) {
      selectionManager?.clearSelection();
      clearCanvasBackgroundImageSelection();
      refreshOutsideHandles();
      layer.batchDraw();
    }
  });
  window.addEventListener("viewport-transform-changed", refreshOutsideHandles);
  window.addEventListener("scene-restored", refreshOutsideHandles);
  window.addEventListener("frames-changed", refreshOutsideHandles);
  /* UI event listeners tied to Konva actions */
  UI.bgColor.addEventListener("input", () => {
    updateKonvaCanvasBackground();
  });

  UI.deleteBtn.addEventListener("click", deleteSelectedMockup);

  window.addEventListener("keydown", (e) => {
    if (EDITABLE_TAGS.includes(document.activeElement?.tagName)) return;
    if (["Delete", "Backspace"].includes(e.key)) {
      e.preventDefault();
      deleteSelectedMockup();
    }
  });
}

// ==========================================================================
// KONVA RESIZE - resizeKonvaStage()
// ==========================================================================
export function resizeKonvaStage() {
  if (stage && backgroundRect && layer) {
    stage.size({
      width: UI.mockupArea.offsetWidth,
      height: UI.mockupArea.offsetHeight,
    });
    backgroundRect.size(stage.size());
    placeCanvasBackgroundImagesBehindFrames();
    syncCanvasBackgroundImageVisibility();
    updateKonvaCanvasBackground();
    const found = stage.find(".mockup-group");
    const groups =
      typeof found?.toArray === "function"
        ? found.toArray()
        : Array.from(found || []);
    for (const group of groups) {
      boundsHelpers?.constrainGroupToStage(group);
    }
    refreshOutsideHandles();
    layer.batchDraw();
  }
}
