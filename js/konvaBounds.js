import { collectMockupNodes } from './sceneUtils.js';

const AUTO_LAYOUT_MARGIN = 24;
const AUTO_LAYOUT_GAP = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getVisibleMargin(rect) {
  const shortSide = Math.min(rect.width || 0, rect.height || 0);
  return clamp(shortSide * 0.2, 56, 120);
}

function getCenteredPosition(stage, frameWidth, frameHeight) {
  return {
    x: stage.width() / 2 - frameWidth / 2,
    y: stage.height() / 2 - frameHeight / 2,
  };
}

export function createKonvaBoundsHelpers({ getStage, getLastAddedMockup } = {}) {
  // Keep at least part of each frame visible inside the stage.
  function constrainGroupToStage(group) {
    const stage = getStage?.();
    if (!stage || !group?.getClientRect) return;

    const rect = group.getClientRect();
    const visibleMargin = getVisibleMargin(rect);
    const stageWidth = stage.width();
    const stageHeight = stage.height();

    let dx = 0;
    let dy = 0;

    if (rect.x > stageWidth - visibleMargin) {
      dx = stageWidth - visibleMargin - rect.x;
    } else if (rect.x + rect.width < visibleMargin) {
      dx = visibleMargin - (rect.x + rect.width);
    }

    if (rect.y > stageHeight - visibleMargin) {
      dy = stageHeight - visibleMargin - rect.y;
    } else if (rect.y + rect.height < visibleMargin) {
      dy = visibleMargin - (rect.y + rect.height);
    }

    if (!dx && !dy) return;
    group.position({ x: group.x() + dx, y: group.y() + dy });
  }

  // Place new frames beside the latest one, wrapping when needed.
  function getAutoPlacement(frameWidth, frameHeight) {
    const stage = getStage?.();
    if (!stage) return { x: 0, y: 0 };
    const groups = collectMockupNodes(stage);
    if (!groups.length) return getCenteredPosition(stage, frameWidth, frameHeight);

    const lastAddedMockup = getLastAddedMockup?.();
    const anchor = lastAddedMockup?.getStage?.() === stage ? lastAddedMockup : groups[groups.length - 1];
    const rect = anchor?.getClientRect?.();
    if (!rect) return getCenteredPosition(stage, frameWidth, frameHeight);

    const stageWidth = stage.width();
    const stageHeight = stage.height();
    let x = rect.x + rect.width + AUTO_LAYOUT_GAP;
    let y = rect.y;

    if (x + frameWidth > stageWidth - AUTO_LAYOUT_MARGIN) {
      x = AUTO_LAYOUT_MARGIN;
      y = rect.y + rect.height + AUTO_LAYOUT_GAP;
    }

    const minX = AUTO_LAYOUT_MARGIN;
    const minY = AUTO_LAYOUT_MARGIN;
    const maxX = Math.max(minX, stageWidth - frameWidth - AUTO_LAYOUT_MARGIN);
    const maxY = Math.max(minY, stageHeight - frameHeight - AUTO_LAYOUT_MARGIN);

    return {
      x: clamp(x, minX, maxX),
      y: clamp(y, minY, maxY),
    };
  }

  return {
    constrainGroupToStage,
    getAutoPlacement,
  };
}
