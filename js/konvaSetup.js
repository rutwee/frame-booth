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

function clearCanvasBackgroundImageSelection() {
  canvasImageTransformer?.nodes([]);
  if (!tr?.nodes?.()?.length && UI.deleteBtn) {
    UI.deleteBtn.disabled = true;
  }
}

function getCanvasBackgroundImageNodes() {
  if (!stage?.find) return [];
  const found = stage.find(".canvas-bg-image");
  return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
}

function getSelectedCanvasBackgroundImageNode() {
  const node = canvasImageTransformer?.nodes?.()?.[0] || null;
  return node?.hasName?.("canvas-bg-image") ? node : null;
}

function placeCanvasBackgroundImagesBehindFrames() {
  const nodes = getCanvasBackgroundImageNodes();
  nodes.forEach((node, index) => {
    node.zIndex(1 + index);
  });
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
    selectionManager?.clearSelection();
    canvasImageTransformer?.nodes([canvasBackgroundImageNode]);
    canvasImageTransformer?.moveToTop();
    if (UI.deleteBtn) UI.deleteBtn.disabled = false;
    layer.batchDraw();
  });
  canvasBackgroundImageNode.on("dragend transformend", () => {
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
  layer?.batchDraw();
}

export function clearCanvasBackgroundImage(removeAll = false) {
  const selected = getSelectedCanvasBackgroundImageNode();
  if (selected && !removeAll) {
    selected.destroy();
    clearCanvasBackgroundImageSelection();
    layer?.batchDraw();
    return true;
  }
  const nodes = getCanvasBackgroundImageNodes();
  if (!nodes.length) return false;
  nodes.forEach((node) => node.destroy());
  clearCanvasBackgroundImageSelection();
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
  });
  group.on("dragend transformend", () => {
    boundsHelpers?.constrainGroupToStage(group);
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
      layer.batchDraw();
    }
  });
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
    layer.batchDraw();
  }
}
