// KONVA.JS INITIALIZATION & SETUP

import * as UI from "./ui.js";
import { frames, AppState } from "./state.js";
import { loadImage, isCanvasEnabled, getCurrentCustomGradientConfig } from "./helpers.js";
import { createKonvaBoundsHelpers } from "./konvaBounds.js";
import { createKonvaPlaceholderFactory } from "./konvaPlaceholder.js";
import { createKonvaSelectionManager } from "./konvaSelection.js";
import { createKonvaOrderMenuController } from "./konvaOrderMenu.js";
import { applyCanvasGradientToRect, getDefaultCanvasGradientId } from "./canvasGradients.js";
import { CANVAS_TEXT_CLASS, isCanvasTextNode, syncCanvasTextHighlightNode } from "./konvaCanvasText.js";
import { createKonvaCanvasOverlayManager } from "./konvaCanvasOverlay.js";
import { collectMockupNodes } from "./sceneUtils.js";
import { createKonvaOutsideHandlesController } from "./konvaOutsideHandles.js";

let stage;
let layer;
export let tr;
let backgroundRect;
export let lastAddedMockup = null;
let initialStageHeight;
let boundsHelpers;
let placeholderFactory;
let selectionManager;
let orderMenuController;
let canvasOverlayManager;
let outsideHandlesController;

const EDITABLE_TAGS = ["INPUT", "SELECT", "TEXTAREA"];
let canvasImageTransformer = null;
const MOCKUP_GROUP_CLASS = "mockup-group";

function isCanvasOverlayNode(node) {
  return canvasOverlayManager?.isOverlayNode(node) || false;
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

function getMockupGroups() {
  return collectMockupNodes(stage);
}

function isActiveSelectionNode(node, name) {
  return !!(node?.hasName?.(name) && node?.getStage?.() === stage);
}

function getSelectedMockupNode() {
  const node = tr?.nodes?.()?.[0] || null;
  return isActiveSelectionNode(node, MOCKUP_GROUP_CLASS) ? node : null;
}

function clearCanvasBackgroundImageSelection() {
  canvasOverlayManager?.clearSelection();
}

function getCanvasOverlayNodes() {
  return canvasOverlayManager?.getOverlayNodes() || [];
}

function getSelectedCanvasBackgroundImageNode() {
  return canvasOverlayManager?.getSelectedOverlayNode() || null;
}

function getSelectedStageNode() {
  return getSelectedCanvasBackgroundImageNode() || tr?.nodes?.()?.[0] || null;
}

function getSelectableNodesAtPoint(pos) {
  if (!stage || !pos) return [];
  const groups = getMockupGroups();
  const candidates = [...groups, ...getCanvasOverlayNodes()]
    .filter((node) => node?.isVisible?.())
    .filter((node) => {
      const rect = node.getClientRect({ relativeTo: stage, skipShadow: true });
      return (
        pos.x >= rect.x &&
        pos.x <= rect.x + rect.width &&
        pos.y >= rect.y &&
        pos.y <= rect.y + rect.height
      );
    })
    .sort((a, b) => (b.getAbsoluteZIndex?.() || 0) - (a.getAbsoluteZIndex?.() || 0));
  return candidates;
}

function getReorderableNodes() {
  if (!stage) return [];
  const groups = getMockupGroups();
  return [...groups, ...getCanvasOverlayNodes()]
    .filter((node) => node?.isVisible?.())
    .sort((a, b) => (a.getAbsoluteZIndex?.() || 0) - (b.getAbsoluteZIndex?.() || 0));
}

function getSelectableAncestor(node) {
  if (!node || node === stage) return null;
  if (isCanvasOverlayNode(node) || node.hasName?.(MOCKUP_GROUP_CLASS)) return node;
  return (
    node.findAncestor?.(`.${CANVAS_TEXT_CLASS}`, true) ||
    node.findAncestor?.(".canvas-bg-image", true) ||
    node.findAncestor?.(`.${MOCKUP_GROUP_CLASS}`, true) ||
    null
  );
}

function applyReorderNodeZIndex(node, zIndex) {
  node.zIndex(zIndex);
  if (isCanvasTextNode(node)) syncCanvasTextHighlightNode(node, layer);
}

function selectStageNode(node, options = {}) {
  if (!node) return;
  if (node.hasName?.(MOCKUP_GROUP_CLASS)) {
    clearCanvasBackgroundImageSelection();
    selectionManager?.selectMockupGroup(node, options);
    return;
  }
  selectCanvasOverlayNode(node);
}

function placeCanvasBackgroundImagesBehindFrames() {
  canvasOverlayManager?.placeBehindFrames();
}

function syncCanvasBackgroundImageVisibility() {
  canvasOverlayManager?.syncVisibility();
}

function selectCanvasOverlayNode(node) {
  canvasOverlayManager?.selectOverlayNode(node);
}

export function addCanvasText(snapshot = null, options = {}) {
  return canvasOverlayManager?.addText(snapshot, options) || null;
}

export function getSelectedCanvasTextSnapshot() {
  return canvasOverlayManager?.getSelectedTextSnapshot() || null;
}

export function updateSelectedCanvasText(next = {}, options = {}) {
  return !!canvasOverlayManager?.updateSelectedText(next, options);
}

export async function setCanvasBackgroundImageFromFile(file) {
  await canvasOverlayManager?.setBackgroundImageFromFile(file);
}

export function getCanvasBackgroundImageState() {
  return canvasOverlayManager?.getState() || [];
}

export async function restoreCanvasBackgroundImageState(snapshot) {
  await canvasOverlayManager?.restoreState(snapshot);
}

export function clearCanvasBackgroundImage(removeAll = false) {
  return !!canvasOverlayManager?.clear(removeAll);
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
  outsideHandlesController?.refresh?.();
  layer.batchDraw();
}

async function createAndAddPlaceholder(group, frameData, scale) {
  if (!placeholderFactory) return;
  await placeholderFactory.createAndAddPlaceholder(group, frameData, scale);
}

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
    const frameNode = selected.getChildren((node) => node.getClassName() === "Image")[0];
    const frameImage = frameNode?.image();
    const scale = frameNode && frameImage ? frameNode.width() / frameImage.width : 0;

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

export async function addMockup(options = {}) {
  if (!stage || !layer || !tr) return null;
  const { initialState = null, skipSelect = false, skipNotify = false } = options;

  const frameData = frames.find((f) => f.id === UI.frameSelect.value);
  if (!frameData) return null;

  const maxCanvasHeight = initialStageHeight * 0.8;
  const maxOriginalHeight = Math.max(...frames.map((f) => f.originalHeight || 0), 1);
  const desiredHeight = (frameData.originalHeight / maxOriginalHeight) * maxCanvasHeight;

  const frameImg = await loadImage(frameData.src);
  const scale = desiredHeight / frameImg.height;
  const frameWidth = frameImg.width * scale;
  const frameHeight = desiredHeight;

  const group = new Konva.Group({
    draggable: true,
    name: MOCKUP_GROUP_CLASS,
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
    group.position(boundsHelpers?.getAutoPlacement(frameWidth, frameHeight) || { x: 0, y: 0 });
  }
  boundsHelpers?.constrainGroupToStage(group);

  group.on("click", (e) => {
    if (orderMenuController?.handleNodeClickEvent(e)) {
      e.cancelBubble = true;
      return;
    }
    e.cancelBubble = true;
    clearCanvasBackgroundImageSelection();
    selectionManager?.selectMockupGroup(group);
  });
  group.on("dragmove transform", () => {
    boundsHelpers?.constrainGroupToStage(group);
    outsideHandlesController?.refresh?.();
  });
  group.on("dragend transformend", () => {
    boundsHelpers?.constrainGroupToStage(group);
    outsideHandlesController?.refresh?.();
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

  canvasOverlayManager = createKonvaCanvasOverlayManager({
    stage,
    layer,
    tr,
    canvasImageTransformer,
    deleteButton: UI.deleteBtn,
    isCanvasEnabled: () => isCanvasEnabled(),
    loadImage,
    getOrderMenuController: () => orderMenuController,
    clearFrameSelection: () => selectionManager?.clearSelection(),
    onOverlaysChanged: () => {
      notifyCanvasBackgroundImagesChanged();
      outsideHandlesController?.refresh?.();
    },
  });

  orderMenuController = createKonvaOrderMenuController({
    stage,
    layer,
    tr,
    canvasImageTransformer,
    getSelectedNode: getSelectedStageNode,
    getSelectableNodesAtPoint,
    getReorderableNodes,
    isReorderableNode: (node) => isCanvasOverlayNode(node) || node?.hasName?.(MOCKUP_GROUP_CLASS),
    isFrameNode: (node) => node?.hasName?.(MOCKUP_GROUP_CLASS),
    selectNode: selectStageNode,
    onApplyNodeZIndex: applyReorderNodeZIndex,
    notifyFramesChanged,
    notifyOverlaysChanged: notifyCanvasBackgroundImagesChanged,
  });
  orderMenuController.bindLongPress(() =>
    getSelectableNodesAtPoint(stage?.getPointerPosition?.())[0] || null,
  );
  orderMenuController.bindDismissHandlers();

  placeholderFactory = createKonvaPlaceholderFactory({
    loadImage,
    fileInput: UI.fileInput,
    selectMockupGroup: (group) => {
      clearCanvasBackgroundImageSelection();
      selectionManager?.selectMockupGroup(group);
    },
  });

  outsideHandlesController = createKonvaOutsideHandlesController({
    getStage: () => stage,
    getLayer: () => layer,
    getFrameTransformer: () => tr,
    getCanvasImageTransformer: () => canvasImageTransformer,
    getSelectedFrameNode: getSelectedMockupNode,
    getSelectedCanvasImageNode: getSelectedCanvasBackgroundImageNode,
    isCanvasEnabled,
    onFrameCommit: notifyFramesChanged,
    onCanvasImageCommit: notifyCanvasBackgroundImagesChanged,
    constrainFrameNode: (node) => boundsHelpers?.constrainGroupToStage(node),
  });
  outsideHandlesController.wrapTransformerNodes(tr);
  outsideHandlesController.wrapTransformerNodes(canvasImageTransformer);

  selectionManager.setSelectionButtonsDisabled(true);

  stage.on("click", (e) => {
    orderMenuController?.resetSelectionCycle();
    orderMenuController?.hideMenu();
    if (e.target !== stage) return;
    selectionManager?.clearSelection();
    clearCanvasBackgroundImageSelection();
    outsideHandlesController?.refresh?.();
    layer.batchDraw();
  });
  stage.on("contextmenu", (e) => {
    const node = getSelectableAncestor(e.target);
    orderMenuController?.handleStageContextMenu(e, node || getSelectedStageNode());
  });

  window.addEventListener("viewport-transform-changed", () => outsideHandlesController?.refresh?.());
  window.addEventListener("scene-restored", () => outsideHandlesController?.refresh?.());
  window.addEventListener("frames-changed", () => outsideHandlesController?.refresh?.());
  window.addEventListener("canvas-bg-images-changed", () => outsideHandlesController?.refresh?.());

  UI.bgColor.addEventListener("input", () => {
    updateKonvaCanvasBackground();
  });
  UI.deleteBtn.addEventListener("click", deleteSelectedMockup);

  window.addEventListener("keydown", (e) => {
    if (isEditingFieldFocused()) return;
    if (!["Delete", "Backspace"].includes(e.key)) return;
    e.preventDefault();
    deleteSelectedMockup();
  });
}

export function resizeKonvaStage() {
  if (!stage || !backgroundRect || !layer) return;
  stage.size({
    width: UI.mockupArea.offsetWidth,
    height: UI.mockupArea.offsetHeight,
  });
  backgroundRect.size(stage.size());
  placeCanvasBackgroundImagesBehindFrames();
  for (const group of getMockupGroups()) {
    boundsHelpers?.constrainGroupToStage(group);
  }
  updateKonvaCanvasBackground();
  outsideHandlesController?.refresh?.();
}
