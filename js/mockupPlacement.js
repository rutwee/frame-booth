import { frames } from './state.js';
import {
  detectIPhoneScreenshotProfile,
  getTargetIslandLocalRect,
  calculateScreenshotPlacement,
} from './screenshotUtils.js';

export function placeImageInMockup(img, mockup) {
  mockup.find('.upload-placeholder').forEach((node) => node.destroy());
  mockup.find('.screenshot-container').forEach((node) => node.destroy());

  const frameId = mockup.getAttr('frameId');
  const frameData = frames.find((frame) => frame.id === frameId);
  if (!frameData || !frameData.screen) return;

  const frameNode = mockup.getChildren((node) => node.getClassName() === 'Image')[0];
  const frameImage = frameNode?.image?.();
  if (!frameNode || !frameImage) return;
  const frameScale = frameNode.width() / frameImage.width;

  const screenContainer = {
    x: frameData.screen.x * frameScale,
    y: frameData.screen.y * frameScale,
    width: frameData.screen.width * frameScale,
    height: frameData.screen.height * frameScale,
  };
  const targetIslandRect = getTargetIslandLocalRect(frameData, frameScale);
  const sourceProfile = detectIPhoneScreenshotProfile(img.width, img.height);

  const clipGroup = new Konva.Group({
    x: screenContainer.x,
    y: screenContainer.y,
    name: 'screenshot-container',
    clipFunc(ctx) {
      const scaledRadius = frameData.screen.cornerRadius * frameScale;
      ctx.beginPath();
      ctx.roundRect(0, 0, screenContainer.width, screenContainer.height, scaledRadius);
      if (targetIslandRect) {
        ctx.roundRect(
          targetIslandRect.x,
          targetIslandRect.y,
          targetIslandRect.width,
          targetIslandRect.height,
          targetIslandRect.cornerRadius,
        );
      }
      ctx.closePath();
    },
  });

  const placement = calculateScreenshotPlacement(
    img,
    screenContainer,
    targetIslandRect,
    sourceProfile,
  );
  clipGroup.add(new Konva.Image({
    image: img,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    name: 'screenshot',
    imageSmoothingEnabled: true,
  }));
  mockup.add(clipGroup);
  clipGroup.moveToBottom();
  mockup.getLayer()?.batchDraw();
}
