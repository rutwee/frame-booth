import * as UI from "./ui.js";
import { frames, AppState } from "./state.js";
import { loadImage, isCanvasEnabled } from "./helpers.js";
import { createKonvaBoundsHelpers } from "./konvaBounds.js";
import { createKonvaPlaceholderFactory } from "./konvaPlaceholder.js";
import { createKonvaSelectionManager } from "./konvaSelection.js";
import { collectMockupNodes } from "./sceneUtils.js";

// Shared Konva runtime references.
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
const MAX_ORIGINAL_FRAME_HEIGHT = Math.max(...frames.map((f) => f.originalHeight || 0), 1);

// Notify app modules that scene content changed.
function notifyFramesChanged() {
  window.dispatchEvent(new Event("frames-changed"));
}

// Keep Konva background rectangle in sync with canvas toggle/color.
export function updateKonvaCanvasBackground() {
  if (!backgroundRect || !layer) return;
  backgroundRect.fill(
    isCanvasEnabled() ? UI.bgColor.value || "#fff" : "rgba(0,0,0,0)",
  );
  layer.batchDraw();
}

// Add an upload placeholder inside a frame screen mask.
async function createAndAddPlaceholder(group, frameData, scale) {
  if (!placeholderFactory) return;
  await placeholderFactory.createAndAddPlaceholder(group, frameData, scale);
}

// Delete screenshot content first; delete frame only when screenshot is absent.
async function deleteSelectedMockup() {
  if (!tr || !layer) return;

  const selected = tr.nodes()[0];
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
    notifyFramesChanged();
    return;
  }

  selected.destroy();
  selectionManager?.clearSelection();
  notifyFramesChanged();
}

// Add a new frame mockup and optionally restore a saved transform state.
export async function addMockup(options = {}) {
  if (!stage || !layer || !tr) return null;
  const {
    initialState = null,
    skipSelect = false,
    skipNotify = false,
  } = options;

  const frameData = frames.find((f) => f.id === UI.frameSelect.value);
  if (!frameData) return null;

  // Normalize frame sizes so different devices are visually balanced.
  const maxCanvasHeight = initialStageHeight * 0.8;
  const desiredHeight =
    (frameData.originalHeight / MAX_ORIGINAL_FRAME_HEIGHT) * maxCanvasHeight;

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

// Initialize stage, layer, transformer, selection and keyboard handlers.
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
    fill: isCanvasEnabled() ? UI.bgColor.value || "#fff" : "rgba(0,0,0,0)",
    listening: false,
  });
  layer.add(backgroundRect);

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
    selectMockupGroup: (group) => selectionManager?.selectMockupGroup(group),
  });
  selectionManager.setSelectionButtonsDisabled(true);

  // Handle stage-level selection and transform notifications.
  stage.on("click", (e) => {
    if (e.target === stage) {
      selectionManager?.clearSelection();
    }
  });
  stage.on("dragend transformend", () => {
    notifyFramesChanged();
  });

  // Bind deletion and color changes to Konva layer updates.
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

// Resize stage to match mockup area and reapply bounds constraints.
export function resizeKonvaStage() {
  if (stage && backgroundRect && layer) {
    stage.size({
      width: UI.mockupArea.offsetWidth,
      height: UI.mockupArea.offsetHeight,
    });
    backgroundRect.size(stage.size());
    const groups = collectMockupNodes(stage);
    for (const group of groups) {
      boundsHelpers?.constrainGroupToStage(group);
    }
    layer.batchDraw();
  }
}
