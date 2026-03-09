import * as UI from "./ui.js";
import {
  getCurrentCustomGradientConfig,
  getCurrentGradientConfig,
} from "./helpers.js";
import { getCanvasGradientById, getGradientLine } from "./canvasGradients.js";

export const CANVAS_TEXT_CLASS = "canvas-text";
const CANVAS_TEXT_HIGHLIGHT_CLASS = "canvas-text-highlight";
const CANVAS_TEXT_DEFAULT = "Type text";
const CANVAS_TEXT_FALLBACK_COLOR = "#2f3a4f";
const CANVAS_TEXT_FALLBACK_FONT = "Arial";
const SOLID_GRADIENT_ID = "solid";
const CUSTOM_GRADIENT_ID = "custom";

// Identify text overlays used in the canvas layer.
export function isCanvasTextNode(node) {
  return !!node?.hasName?.(CANVAS_TEXT_CLASS);
}

// Read all canvas text overlays from the current stage.
export function getCanvasTextNodes(stage) {
  if (!stage?.find) return [];
  const found = stage.find(`.${CANVAS_TEXT_CLASS}`);
  return typeof found?.toArray === "function" ? found.toArray() : Array.from(found || []);
}

// Convert a Konva text node into serializable state.
export function getCanvasTextSnapshot(node) {
  if (!isCanvasTextNode(node)) return null;
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

// Resolve built-in or custom gradient data for text and highlight fills.
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

// Apply color or linear-gradient fill to a Konva node.
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

// Lookup the linked highlight rectangle for a text node.
function getCanvasTextHighlightNode(textNode, layer) {
  const highlightRectId = textNode?.getAttr?.("highlightRectId");
  if (!highlightRectId || !layer?.findOne) return null;
  return layer.findOne(`#${highlightRectId}`) || null;
}

// Create a highlight rectangle lazily and attach lifecycle cleanup.
function ensureCanvasTextHighlightNode(textNode, layer) {
  if (!textNode || !layer) return null;
  let highlightNode = getCanvasTextHighlightNode(textNode, layer);
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
    const linkedNode = layer.findOne(`#${highlightRectId}`);
    linkedNode?.destroy();
  });
  return highlightNode;
}

// Keep highlight geometry in sync with its source text node.
export function syncCanvasTextHighlightNode(textNode, layer) {
  if (!isCanvasTextNode(textNode) || !layer) return;
  const highlightColor = (textNode.getAttr("textHighlight") || "").trim();
  const highlightNode = ensureCanvasTextHighlightNode(textNode, layer);
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

// Apply full text snapshot state to a text node.
export function applyCanvasTextSnapshot(textNode, snapshot = null, stage) {
  if (!textNode || !stage) return;
  if (!snapshot) {
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

// Attach click/drag/transform hooks for text overlay selection and history.
function bindCanvasTextInteractions(
  textNode,
  { layer, onBeforeSelect, onSelectNode, onNodeChanging, onNodeChanged } = {},
) {
  textNode.on("click tap", (event) => {
    if (onBeforeSelect?.(event, textNode)) {
      event.cancelBubble = true;
      return;
    }
    event.cancelBubble = true;
    onSelectNode?.(textNode, event);
  });
  textNode.on("dragend transformend", () => {
    syncCanvasTextHighlightNode(textNode, layer);
    onNodeChanged?.(textNode);
  });
  textNode.on("dragmove transform", () => {
    syncCanvasTextHighlightNode(textNode, layer);
    onNodeChanging?.(textNode);
  });
}

// Create, wire and add a text node to the canvas layer.
export function createCanvasTextNode({
  stage,
  layer,
  snapshot = null,
  onBeforeSelect,
  onSelectNode,
  onNodeChanging,
  onNodeChanged,
} = {}) {
  if (!stage || !layer) return null;
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
  bindCanvasTextInteractions(textNode, {
    layer,
    onBeforeSelect,
    onSelectNode,
    onNodeChanging,
    onNodeChanged,
  });
  layer.add(textNode);
  if (!snapshot) {
    textNode.zIndex(1);
  }
  applyCanvasTextSnapshot(textNode, snapshot, stage);
  syncCanvasTextHighlightNode(textNode, layer);
  return textNode;
}

// Update selected text properties while preserving existing API semantics.
export function updateCanvasTextNode(
  textNode,
  next = {},
  { layer, canvasImageTransformer } = {},
) {
  if (!isCanvasTextNode(textNode)) return false;
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
  syncCanvasTextHighlightNode(textNode, layer);
  canvasImageTransformer?.forceUpdate?.();
  return true;
}
