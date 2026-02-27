const SCREENSHOT_PROFILE_MATCH_TOLERANCE = 0.035;

const IPHONE_SCREENSHOT_PROFILES = [
    {
        name: 'dynamic-island',
        aspectRatio: 1179 / 2556,
        knownSizes: [
            [1179, 2556],
            [1290, 2796],
            [1320, 2868],
        ],
        cutout: { x: 0.34, y: 0.014, width: 0.32, height: 0.043 },
    },
    {
        name: 'notch',
        aspectRatio: 1170 / 2532,
        knownSizes: [
            [1170, 2532],
            [1125, 2436],
            [1242, 2688],
            [828, 1792],
            [1284, 2778],
        ],
        cutout: { x: 0.29, y: 0.0, width: 0.42, height: 0.075 },
    },
    {
        name: 'home-button',
        aspectRatio: 750 / 1334,
        knownSizes: [
            [750, 1334],
            [640, 1136],
            [1242, 2208],
        ],
        cutout: null,
    },
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizePortraitSize(width, height) {
    return width <= height ? [width, height] : [height, width];
}

export function detectIPhoneScreenshotProfile(width, height) {
    const [portraitWidth, portraitHeight] = normalizePortraitSize(width, height);
    const exactMatchTolerance = 6;

    for (const profile of IPHONE_SCREENSHOT_PROFILES) {
        const hasKnownSize = profile.knownSizes.some(([w, h]) => (
            Math.abs(portraitWidth - w) <= exactMatchTolerance &&
            Math.abs(portraitHeight - h) <= exactMatchTolerance
        ));
        if (hasKnownSize) return profile;
    }

    const screenshotAspect = portraitWidth / portraitHeight;
    let bestProfile = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const profile of IPHONE_SCREENSHOT_PROFILES) {
        const delta = Math.abs(screenshotAspect - profile.aspectRatio);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestProfile = profile;
        }
    }

    return bestDelta <= SCREENSHOT_PROFILE_MATCH_TOLERANCE ? bestProfile : null;
}

export function getTargetIslandLocalRect(frameData, frameScale) {
    if (!frameData?.screen?.island) return null;
    const island = frameData.screen.island;
    return {
        x: (island.x - frameData.screen.x) * frameScale,
        y: (island.y - frameData.screen.y) * frameScale,
        width: island.width * frameScale,
        height: island.height * frameScale,
        cornerRadius: island.cornerRadius * frameScale,
    };
}

export function calculateScreenshotPlacement(img, screenContainer, targetIslandRect, sourceProfile) {
    const screenAspectRatio = screenContainer.width / screenContainer.height;
    const imgAspectRatio = img.width / img.height;
    let width;
    let height;

    if (imgAspectRatio > screenAspectRatio) {
        height = screenContainer.height;
        width = screenContainer.height * imgAspectRatio;
    } else {
        width = screenContainer.width;
        height = screenContainer.width / imgAspectRatio;
    }

    let x = (screenContainer.width - width) / 2;
    let y = (screenContainer.height - height) / 2;

    const isPortraitScreenshot = img.height >= img.width;
    const sourceCutout = isPortraitScreenshot ? sourceProfile?.cutout : null;
    if (targetIslandRect && sourceCutout) {
        const scale = width / img.width;
        const sourceCutoutCenterX = (sourceCutout.x + sourceCutout.width / 2) * img.width;
        const sourceCutoutTopY = sourceCutout.y * img.height;
        const targetCutoutCenterX = targetIslandRect.x + targetIslandRect.width / 2;
        const targetCutoutTopY = targetIslandRect.y;

        const alignedX = targetCutoutCenterX - sourceCutoutCenterX * scale;
        const alignedY = targetCutoutTopY - sourceCutoutTopY * scale;
        const alignmentBlend = 0.85;

        x = x + (alignedX - x) * alignmentBlend;
        y = y + (alignedY - y) * alignmentBlend;
    } else if (targetIslandRect && isPortraitScreenshot) {
        y = Math.min(0, y + targetIslandRect.height * 0.2);
    }

    x = clamp(x, screenContainer.width - width, 0);
    y = clamp(y, screenContainer.height - height, 0);

    return { x, y, width, height };
}
