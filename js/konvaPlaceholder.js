export function createKonvaPlaceholderFactory({ loadImage, fileInput, selectMockupGroup } = {}) {
  let placeholderIconImagePromise;

  function getPlaceholderIconImage() {
    if (!placeholderIconImagePromise) {
      placeholderIconImagePromise = loadImage('icons/add_screenshot_placeholder.svg');
    }
    return placeholderIconImagePromise;
  }

  async function createAndAddPlaceholder(group, frameData, scale) {
    const screenRect = {
      x: frameData.screen.x * scale,
      y: frameData.screen.y * scale,
      width: frameData.screen.width * scale,
      height: frameData.screen.height * scale,
    };

    const placeholderGroup = new Konva.Group({
      name: 'upload-placeholder',
      x: screenRect.x,
      y: screenRect.y,
      clipFunc: function (ctx) {
        const scaledRadius = frameData.screen.cornerRadius * scale;
        ctx.beginPath();
        ctx.roundRect(0, 0, screenRect.width, screenRect.height, scaledRadius);

        if (frameData.screen.island) {
          const island = frameData.screen.island;
          const islandX = (island.x - frameData.screen.x) * scale;
          const islandY = (island.y - frameData.screen.y) * scale;
          const islandW = island.width * scale;
          const islandH = island.height * scale;
          const islandRadius = island.cornerRadius * scale;
          ctx.roundRect(islandX, islandY, islandW, islandH, islandRadius);
        }
        ctx.closePath();
      },
    });

    const clickableArea = new Konva.Rect({
      width: screenRect.width,
      height: screenRect.height,
    });

    const iconImg = await getPlaceholderIconImage();
    const icon = new Konva.Image({ image: iconImg, width: 60, height: 60 });
    const placeholderText = new Konva.Text({
      text: 'Add a Screenshot',
      fontSize: 18,
      fontFamily: 'Inter, sans-serif',
      fill: '#b7c1d2',
      fontStyle: '500',
    });

    icon.position({ x: screenRect.width / 2, y: screenRect.height / 2 - 10 });
    placeholderText.position({ x: screenRect.width / 2, y: screenRect.height / 2 + 40 });
    icon.offset({ x: 30, y: 30 });
    placeholderText.offset({ x: placeholderText.width() / 2, y: placeholderText.height() / 2 });

    placeholderGroup.add(clickableArea, icon, placeholderText);
    group.add(placeholderGroup);

    placeholderGroup.on('dblclick dbltap', e => {
      e.cancelBubble = true;
      selectMockupGroup?.(group);
      fileInput?.click();
    });
  }

  return { createAndAddPlaceholder };
}
