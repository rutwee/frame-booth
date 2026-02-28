export function initZoomPanControls({
    previewWrap,
    mockupArea,
    getStage,
    clampZoom,
    isTypingInFormField,
} = {}) {
    if (!previewWrap || !mockupArea) return null;

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanningWithSpace = false;
    let isSpaceDown = false;
    let panStart = { x: 0, y: 0 };
    let lastDist = 0;
    let lastCenter = null;
    let isPanningWithTouch = false;

    // Apply current pan/zoom state to workspace transform.
    function applyTransform() {
        mockupArea.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    // Restore default zoom and pan.
    function resetTransform() {
        scale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
    }

    // Zoom around the pointer so content stays under cursor/fingers.
    function zoomAround(clientX, clientY, nextScale) {
        const oldScale = scale;
        const clampedScale = clampZoom(nextScale);
        if (clampedScale === oldScale) return;

        const rect = mockupArea.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const scaleRatio = clampedScale / oldScale;

        panX -= (localX - panX) * (scaleRatio - 1);
        panY -= (localY - panY) * (scaleRatio - 1);
        scale = clampedScale;
    }

    // Mouse wheel: pan normally, zoom when Ctrl/Cmd is held.
    previewWrap.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const zoomFactor = 1.06;
            zoomAround(
                e.clientX,
                e.clientY,
                e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor
            );
        } else {
            panX -= e.deltaX;
            panY -= e.deltaY;
        }
        applyTransform();
    }, { passive: false });

    // Keyboard support for hand-tool pan and quick reset.
    window.addEventListener('keydown', e => {
        if (isTypingInFormField()) return;
        if (e.key === ' ' && !isSpaceDown) {
            e.preventDefault();
            isSpaceDown = true;
            previewWrap.style.cursor = 'grab';
        }
        if (e.key === '0') {
            e.preventDefault();
            resetTransform();
        }
    });

    window.addEventListener('keyup', e => {
        if (e.key === ' ') {
            isSpaceDown = false;
            previewWrap.style.cursor = 'default';
        }
    });

    // Space-drag panning with mouse.
    previewWrap.addEventListener('mousedown', e => {
        if (!isSpaceDown) return;
        isPanningWithSpace = true;
        panStart.x = e.clientX - panX;
        panStart.y = e.clientY - panY;
        previewWrap.style.cursor = 'grabbing';
    });

    previewWrap.addEventListener('mousemove', e => {
        if (!isPanningWithSpace) return;
        panX = e.clientX - panStart.x;
        panY = e.clientY - panStart.y;
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        if (!isPanningWithSpace) return;
        isPanningWithSpace = false;
        previewWrap.style.cursor = isSpaceDown ? 'grab' : 'default';
    });

    // Touch gestures: one-finger pan, two-finger pinch zoom.
    previewWrap.addEventListener('touchstart', e => {
        if (e.target.closest('.toolbar')) return;
        e.preventDefault();

        if (e.touches.length === 1) {
            const stage = getStage?.();
            if (!stage) return;
            const touch = e.touches[0];
            const stageBox = stage.container().getBoundingClientRect();
            const konvaX = (touch.clientX - stageBox.left) / scale;
            const konvaY = (touch.clientY - stageBox.top) / scale;
            const shape = stage.getIntersection({ x: konvaX, y: konvaY });

            if (shape) {
                const isFrame = shape.findAncestor('.mockup-group');
                const isTransformer = shape.findAncestor('Transformer');
                if (isFrame || isTransformer) {
                    isPanningWithTouch = false;
                    return;
                }
            }

            isPanningWithTouch = true;
            panStart.x = touch.clientX - panX;
            panStart.y = touch.clientY - panY;
        } else if (e.touches.length === 2) {
            isPanningWithTouch = false;
            lastDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            lastCenter = {
                x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
                y: (e.touches[0].pageY + e.touches[1].pageY) / 2,
            };
        }
    }, { passive: false });

    previewWrap.addEventListener('touchmove', e => {
        if (isPanningWithTouch && e.touches.length === 1) {
            e.preventDefault();
            panX = e.touches[0].clientX - panStart.x;
            panY = e.touches[0].clientY - panStart.y;
            applyTransform();
            return;
        }

        if (e.touches.length !== 2) return;

        e.preventDefault();
        isPanningWithTouch = false;

        const newDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        const newCenter = {
            x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
            y: (e.touches[0].pageY + e.touches[1].pageY) / 2,
        };

        if (!lastCenter || lastDist <= 0) {
            lastCenter = newCenter;
            lastDist = newDist;
            return;
        }

        const scaleFactor = newDist / lastDist;
        zoomAround(lastCenter.x, lastCenter.y, scale * scaleFactor);
        panX += newCenter.x - lastCenter.x;
        panY += newCenter.y - lastCenter.y;

        applyTransform();
        lastDist = newDist;
        lastCenter = newCenter;
    }, { passive: false });

    previewWrap.addEventListener('touchend', e => {
        isPanningWithTouch = false;
        if (e.touches.length >= 2) return;
        lastDist = 0;
        lastCenter = null;
    });

    applyTransform();
    return resetTransform;
}
