// ==========================================================================
// KONVA.JS INITIALIZATION & SETUP
// ==========================================================================

import * as UI from "./ui.js";
import { frames, AppState } from "./state.js";
import {
  loadImage,
  isCanvasEnabled,
  getCurrentCustomGradientConfig,
  getCurrentGradientConfig,
} from "./helpers.js";
import { createKonvaBoundsHelpers } from "./konvaBounds.js";
import { createKonvaPlaceholderFactory } from "./konvaPlaceholder.js";
import { createKonvaSelectionManager } from "./konvaSelection.js";
import {
  applyCanvasGradientToRect,
  getCanvasGradientById,
  getDefaultCanvasGradientId,
  getGradientLine,
} from "./canvasGradients.js";

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
const CANVAS_TEXT_DEFAULT = "Type text";
const CANVAS_TEXT_CLASS = "canvas-text";
const CANVAS_TEXT_HIGHLIGHT_CLASS = "canvas-text-highlight";
const CANVAS_TEXT_FALLBACK_COLOR = "#2f3a4f";
const CANVAS_TEXT_FALLBACK_FONT = "Arial";
const SOLID_GRADIENT_ID = "solid";
const CUSTOM_GRADIENT_ID = "custom";

function isCanvasOverlayNode(node) {
  return !!(node?.hasName?.("canvas-bg-image") || node?.hasName?.(CANVAS_TEXT_CLASS));
}

function isEditingFieldFocused() {
  const active = document.activeElement;
  if (!active) return false;
  if (EDITABLE_TAGS.includes(active.tagName)) return true;
  if (active.isContentEditable) return true;
  return !!active.closest?.("#canvasTextPanel");
}

function notifyFramesChanged() {
  window.dispatchEvent(new Event("frames-changed"));
}

function notifyCanvasBackgroundImagesChanged() {
  window.dispatchEvent(new Event("canvas-bg-images-changed"));
}

function getCanvasTextSnapshot(node) {
  if (!node?.hasName?.(CANVAS_TEXT_CLASS)) return null;
  return {
    type: "text",
    text: node.text() || "",
    fontFamily: node.fontFamily() || CANVAS_TEXT_FALLBACK_FONT,
    fontSize: node.fontSize() || 24,
    fill: node.fill() || CANVAS_TEXT_FALLBACK_COLOR,
    fontStyle: node.fontStyle() || "normal",
    textDecoration: node.textDecoration() || "",
    textHighlight: node.getAttr("textHighlight") || "",
    textGradientId: node.getAttr("textGradientId") || SOLID_GRADIENT_ID,
    textHighlightGradientId: node.getAttr("textHighlightGradientId") || SOLID_GRADIENT_ID,
    align: node.align() || "center",
    lineHeight: node.lineHeight() || 1.25,
    padding: node.padding() || 0,
    x: node.x(),
    y: node.y(),
    width: node.width(),
    height: node.height(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  };
}

function resolveGradientPreset(gradientId, kind = "text") {
  if (gradientId === CUSTOM_GRADIENT_ID) {
    const custom = kind === "highlight"
      ? getCurrentGradientConfig(UI.customTextHighlightGradientData)
      : kind === "text"
        ? getCurrentGradientConfig(UI.customTextGradientData)
        : getCurrentCustomGradientConfig();
    return {
      angle: custom?.angle || 135,
      stops: (custom?.stops || []).flatMap((stop) => [stop.position, stop.color]),
    };
  }
  return getCanvasGradientById(gradientId || SOLID_GRADIENT_ID);
}

function applyNodeGradientFill(node, gradientId, solidColor, kind = "text") {
  if (!node) return;
  const id = gradientId || SOLID_GRADIENT_ID;
  if (id === SOLID_GRADIENT_ID) {
    node.fillPriority("color");
    node.fill(solidColor || "#000000");
    return;
  }
  const preset = resolveGradientPreset(id, kind);
  if (!preset?.stops?.length) {
    node.fillPriority("color");
    node.fill(solidColor || "#000000");
    return;
  }
  const width = Math.max(1, (node.width?.() || 1) * Math.abs(node.scaleX?.() || 1));
  const height = Math.max(1, (node.height?.() || 1) * Math.abs(node.scaleY?.() || 1));
  const line = getGradientLine(width, height, Number(preset.angle) || 135);
  node.fillPriority("linear-gradient");
  node.fillLinearGradientStartPoint(line.start);
  node.fillLinearGradientEndPoint(line.end);
  node.fillLinearGradientColorStops(preset.stops);
}

function notifyCanvasOverlaySelectionChanged() {
  const selected = getSelectedCanvasBackgroundImageNode();
  const detail = selected?.hasName?.(CANVAS_TEXT_CLASS)
    ? { type: "text", text: getCanvasTextSnapshot(selected) }
    : selected?.hasName?.("canvas-bg-image")
      ? { type: "image" }
      : { type: "none" };
  window.dispatchEvent(
    new CustomEvent("canvas-overlay-selection-changed", { detail }),
  );
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
  notifyCanvasOverlaySelectionChanged();
}

function getCanvasBackgroundImageNodes() {
  if (!stage?.find) return [];
  const found = stage.find(".canvas-bg-image");
  return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
}

function getCanvasTextNodes() {
  if (!stage?.find) return [];
  const found = stage.find(`.${CANVAS_TEXT_CLASS}`);
  return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
}

function getCanvasTextHighlightNode(textNode) {
  const highlightRectId = textNode?.getAttr?.("highlightRectId");
  if (!highlightRectId || !layer?.findOne) return null;
  return layer.findOne(`#${highlightRectId}`) || null;
}

function ensureCanvasTextHighlightNode(textNode) {
  if (!textNode || !layer) return null;
  let highlightNode = getCanvasTextHighlightNode(textNode);
  if (highlightNode) return highlightNode;
  const highlightRectId = `canvas-text-highlight-${textNode._id}`;
  highlightNode = new Konva.Rect({
    id: highlightRectId,
    name: CANVAS_TEXT_HIGHLIGHT_CLASS,
    listening: false,
    visible: false,
    opacity: 0.55,
    cornerRadius: 4,
  });
  layer.add(highlightNode);
  textNode.setAttr("highlightRectId", highlightRectId);
  textNode.on("destroy", () => {
    const node = layer.findOne(`#${highlightRectId}`);
    node?.destroy();
  });
  return highlightNode;
}

function syncCanvasTextHighlightNode(textNode) {
  if (!textNode || !layer || !textNode.hasName?.(CANVAS_TEXT_CLASS)) return;
  const highlightColor = (textNode.getAttr("textHighlight") || "").trim();
  const highlightNode = ensureCanvasTextHighlightNode(textNode);
  if (!highlightNode) return;
  if (!highlightColor) {
    highlightNode.visible(false);
    return;
  }
  highlightNode.position(textNode.position());
  highlightNode.size({
    width: Math.max(1, textNode.width()),
    height: Math.max(1, textNode.height()),
  });
  highlightNode.scale(textNode.scale());
  highlightNode.rotation(textNode.rotation());
  highlightNode.offset(textNode.offset());
  highlightNode.skew({ x: textNode.skewX(), y: textNode.skewY() });
  applyNodeGradientFill(
    highlightNode,
    textNode.getAttr("textHighlightGradientId") || SOLID_GRADIENT_ID,
    highlightColor,
    "highlight",
  );
  highlightNode.visible(textNode.visible());
  highlightNode.opacity(0.55);
  highlightNode.zIndex(Math.max(1, textNode.zIndex() - 1));
}

function getCanvasOverlayNodes() {
  return [...getCanvasBackgroundImageNodes(), ...getCanvasTextNodes()].sort(
    (a, b) => a.zIndex() - b.zIndex(),
  );
}

function getSelectedCanvasBackgroundImageNode() {
  const node = canvasImageTransformer?.nodes?.()?.[0] || null;
  return isCanvasOverlayNode(node) ? node : null;
}

function placeCanvasBackgroundImagesBehindFrames() {
  const nodes = getCanvasOverlayNodes();
  nodes.forEach((node, index) => {
    node.zIndex(1 + index);
    if (node.hasName?.(CANVAS_TEXT_CLASS)) {
      syncCanvasTextHighlightNode(node);
    }
  });
}

function syncCanvasBackgroundImageVisibility() {
  const visible = isCanvasImageVisible();
  const nodes = getCanvasOverlayNodes();
  for (const node of nodes) {
    node.visible(visible);
    if (node.hasName?.(CANVAS_TEXT_CLASS)) {
      syncCanvasTextHighlightNode(node);
    }
  }
  if (!visible) {
    clearCanvasBackgroundImageSelection();
  }
}

function selectCanvasOverlayNode(node) {
  if (!node || !isCanvasImageVisible()) return;
  selectionManager?.clearSelection();
  if (node?.hasName?.(CANVAS_TEXT_CLASS) && node.padding?.() !== 0) {
    node.padding(0);
  }
  canvasImageTransformer?.padding?.(node?.hasName?.(CANVAS_TEXT_CLASS) ? 0 : 12);
  canvasImageTransformer?.nodes([node]);
  canvasImageTransformer?.moveToTop();
  tr?.moveToTop();
  if (UI.deleteBtn) UI.deleteBtn.disabled = false;
  notifyCanvasOverlaySelectionChanged();
  layer?.batchDraw();
}

function applyCanvasTextSnapshot(textNode, snapshot = null) {
  if (!snapshot || !stage) {
    textNode.position({
      x: (stage.width() - textNode.width()) / 2,
      y: (stage.height() - textNode.height()) / 2,
    });
    textNode.scale({ x: 1, y: 1 });
    textNode.rotation(0);
    return;
  }
  textNode.position({ x: snapshot.x || 0, y: snapshot.y || 0 });
  textNode.text(snapshot.text || " ");
  textNode.fontFamily(snapshot.fontFamily || CANVAS_TEXT_FALLBACK_FONT);
  textNode.fontSize(Math.max(8, snapshot.fontSize || textNode.fontSize()));
  textNode.fill(snapshot.fill || CANVAS_TEXT_FALLBACK_COLOR);
  textNode.fontStyle(snapshot.fontStyle || "normal");
  textNode.textDecoration(snapshot.textDecoration || "");
  textNode.setAttr("textHighlight", snapshot.textHighlight || "");
  textNode.setAttr("textGradientId", snapshot.textGradientId || SOLID_GRADIENT_ID);
  textNode.setAttr(
    "textHighlightGradientId",
    snapshot.textHighlightGradientId || SOLID_GRADIENT_ID,
  );
  textNode.align(snapshot.align || "center");
  textNode.lineHeight(Math.max(0.6, snapshot.lineHeight || textNode.lineHeight()));
  textNode.padding(Math.max(0, snapshot.padding ?? textNode.padding()));
  textNode.width(Math.max(80, snapshot.width || textNode.width()));
  textNode.height(Math.max(24, snapshot.height || textNode.height()));
  textNode.scale({ x: snapshot.scaleX || 1, y: snapshot.scaleY || 1 });
  textNode.rotation(snapshot.rotation || 0);
  applyNodeGradientFill(
    textNode,
    textNode.getAttr("textGradientId") || SOLID_GRADIENT_ID,
    textNode.fill() || CANVAS_TEXT_FALLBACK_COLOR,
    "text",
  );
}

function bindCanvasTextInteractions(textNode) {
  textNode.on("click tap", (event) => {
    event.cancelBubble = true;
    selectCanvasOverlayNode(textNode);
  });
  textNode.on("dragend transformend", () => {
    syncCanvasTextHighlightNode(textNode);
    notifyCanvasBackgroundImagesChanged();
  });
  textNode.on("dragmove transform", () => {
    syncCanvasTextHighlightNode(textNode);
    layer?.batchDraw();
  });
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
    selectCanvasOverlayNode(canvasBackgroundImageNode);
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
    selectCanvasOverlayNode(canvasBackgroundImageNode);
  } else {
    clearCanvasBackgroundImageSelection();
  }
  tr?.moveToTop();
  layer.batchDraw();
  return canvasBackgroundImageNode;
}

// Add a lightweight canvas text node using Konva.Text.
export function addCanvasText(snapshot = null, options = {}) {
  if (!layer || !stage) return null;
  const { skipSelect = false, skipNotify = false } = options;
  const textNode = new Konva.Text({
    name: CANVAS_TEXT_CLASS,
    draggable: true,
    listening: true,
    text: snapshot?.text || CANVAS_TEXT_DEFAULT,
    fontFamily: snapshot?.fontFamily || CANVAS_TEXT_FALLBACK_FONT,
    fontSize: Math.max(12, snapshot?.fontSize || Math.round(stage.width() * 0.03)),
    fill: snapshot?.fill || CANVAS_TEXT_FALLBACK_COLOR,
    fontStyle: snapshot?.fontStyle || "normal",
    textDecoration: snapshot?.textDecoration || "",
    width: Math.max(120, snapshot?.width || Math.min(320, stage.width() * 0.4)),
    align: snapshot?.align || "center",
    lineHeight: snapshot?.lineHeight || 1.25,
    padding: snapshot?.padding || 0,
  });
  textNode.setAttr("textGradientId", snapshot?.textGradientId || SOLID_GRADIENT_ID);
  textNode.setAttr(
    "textHighlightGradientId",
    snapshot?.textHighlightGradientId || SOLID_GRADIENT_ID,
  );

  bindCanvasTextInteractions(textNode);
  layer.add(textNode);
  applyCanvasTextSnapshot(textNode, snapshot);
  syncCanvasTextHighlightNode(textNode);
  placeCanvasBackgroundImagesBehindFrames();
  syncCanvasBackgroundImageVisibility();

  if (!skipSelect && isCanvasImageVisible()) {
    selectCanvasOverlayNode(textNode);
  } else {
    clearCanvasBackgroundImageSelection();
  }
  layer.batchDraw();
  if (!skipNotify) {
    notifyCanvasBackgroundImagesChanged();
  }
  return textNode;
}

export function getSelectedCanvasTextSnapshot() {
  const selected = getSelectedCanvasBackgroundImageNode();
  return getCanvasTextSnapshot(selected);
}

export function updateSelectedCanvasText(next = {}, options = {}) {
  const textNode = getSelectedCanvasBackgroundImageNode();
  if (!textNode?.hasName?.(CANVAS_TEXT_CLASS)) return false;
  if (typeof next.text === "string") textNode.text(next.text || " ");
  if (typeof next.fontFamily === "string" && next.fontFamily.trim()) {
    textNode.fontFamily(next.fontFamily.trim());
  }
  if (Number.isFinite(next.fontSize)) {
    textNode.fontSize(Math.max(8, next.fontSize));
  }
  if (typeof next.fill === "string" && next.fill.trim()) {
    textNode.fill(next.fill.trim());
  }
  if (typeof next.textGradientId === "string" && next.textGradientId.trim()) {
    textNode.setAttr("textGradientId", next.textGradientId.trim());
  }
  if (typeof next.fontStyle === "string" && next.fontStyle.trim()) {
    textNode.fontStyle(next.fontStyle.trim());
  }
  if (typeof next.textDecoration === "string") {
    textNode.textDecoration(next.textDecoration.trim());
  }
  if (typeof next.textHighlight === "string") {
    textNode.setAttr("textHighlight", next.textHighlight.trim());
  }
  if (typeof next.textHighlightGradientId === "string" && next.textHighlightGradientId.trim()) {
    textNode.setAttr("textHighlightGradientId", next.textHighlightGradientId.trim());
  }
  if (typeof next.align === "string" && next.align.trim()) {
    textNode.align(next.align.trim());
  }
  if (Number.isFinite(next.lineHeight)) {
    textNode.lineHeight(Math.max(0.6, next.lineHeight));
  }
  if (Number.isFinite(next.padding)) {
    textNode.padding(Math.max(0, next.padding));
  }
  if (Number.isFinite(next.width)) {
    textNode.width(Math.max(60, next.width));
  }
  if (Number.isFinite(next.height)) {
    textNode.height(Math.max(20, next.height));
  }
  applyNodeGradientFill(
    textNode,
    textNode.getAttr("textGradientId") || SOLID_GRADIENT_ID,
    textNode.fill() || CANVAS_TEXT_FALLBACK_COLOR,
    "text",
  );
  syncCanvasTextHighlightNode(textNode);
  canvasImageTransformer?.forceUpdate?.();
  if (!options.skipSelectionNotify) {
    notifyCanvasOverlaySelectionChanged();
  }
  layer?.batchDraw();
  if (!options.skipNotify) {
    notifyCanvasBackgroundImagesChanged();
  }
  return true;
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
  return getCanvasOverlayNodes().map((node) => {
    if (node.hasName(CANVAS_TEXT_CLASS)) {
      return getCanvasTextSnapshot(node);
    }
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

export async function restoreCanvasBackgroundImageState(snapshot) {
  const snapshots = Array.isArray(snapshot)
    ? snapshot
    : snapshot?.src || snapshot?.type
      ? [snapshot]
      : [];
  clearCanvasBackgroundImage(true);
  if (!snapshots.length) {
    return;
  }
  for (const item of snapshots) {
    if (item?.type === "text") {
      addCanvasText(item, { skipSelect: true, skipNotify: true });
      continue;
    }
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
  const nodes = getCanvasOverlayNodes();
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
    if (isEditingFieldFocused()) return;
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
