const DEFAULT_CANVAS_GRADIENT_ID = 'solid';
const DEFAULT_CUSTOM_GRADIENT = {
    angle: 135,
    stops: [0, '#e0f7ff', 1, '#8ec5ff'],
};

// Gradient preset library for canvas background styles.
export const CANVAS_GRADIENTS = [
    { id: 'solid', name: 'Solid', angle: 135, stops: null },
    { id: 'skyline', name: 'Skyline', angle: 140, stops: [0, '#e0f7ff', 1, '#8ec5ff'] },
    { id: 'sunset', name: 'Sunset', angle: 132, stops: [0, '#f6d365', 1, '#fda085'] },
    { id: 'aurora', name: 'Aurora', angle: 132, stops: [0, '#a1ffce', 1, '#faffd1'] },
    { id: 'ocean', name: 'Ocean', angle: 140, stops: [0, '#89f7fe', 1, '#66a6ff'] },
    { id: 'lilac', name: 'Lilac', angle: 138, stops: [0, '#fbc2eb', 1, '#a6c1ee'] },
    { id: 'mint', name: 'Mint', angle: 135, stops: [0, '#d4fc79', 1, '#96e6a1'] },
    { id: 'twilight', name: 'Twilight', angle: 142, stops: [0, '#667eea', 1, '#764ba2'] },
    { id: 'peach', name: 'Peach', angle: 136, stops: [0, '#ffecd2', 1, '#fcb69f'] },
    { id: 'custom', name: 'Customize', angle: 135, stops: [0, '#e0f7ff', 1, '#8ec5ff'] },
];

export function getCanvasGradientById(gradientId) {
    return CANVAS_GRADIENTS.find((preset) => preset.id === gradientId) || CANVAS_GRADIENTS[0];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeStopPosition(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, 0, 1);
}

function normalizeStopList(stops) {
    const normalized = [];
    if (Array.isArray(stops)) {
        if (typeof stops[0] === 'number') {
            for (let i = 0; i < stops.length; i += 2) {
                const position = normalizeStopPosition(stops[i], normalized.length / Math.max(1, stops.length / 2 - 1));
                const color = normalizeHexColor(stops[i + 1], '#ffffff');
                normalized.push({ position, color });
            }
        } else {
            for (const stop of stops) {
                if (!stop || typeof stop !== 'object') continue;
                normalized.push({
                    position: normalizeStopPosition(stop.position, 0),
                    color: normalizeHexColor(stop.color, '#ffffff'),
                });
            }
        }
    }

    if (normalized.length < 2) {
        return [
            { position: DEFAULT_CUSTOM_GRADIENT.stops[0], color: DEFAULT_CUSTOM_GRADIENT.stops[1] },
            { position: DEFAULT_CUSTOM_GRADIENT.stops[2], color: DEFAULT_CUSTOM_GRADIENT.stops[3] },
        ];
    }

    normalized.sort((a, b) => a.position - b.position);
    const minGap = 0.005;
    for (let i = 1; i < normalized.length; i += 1) {
        normalized[i].position = Math.max(normalized[i].position, normalized[i - 1].position + minGap);
    }
    const overflow = normalized[normalized.length - 1].position - 1;
    if (overflow > 0) {
        for (let i = normalized.length - 1; i >= 0; i -= 1) {
            normalized[i].position = clamp(normalized[i].position - overflow, 0, 1);
            if (i > 0) {
                normalized[i - 1].position = Math.min(normalized[i - 1].position, normalized[i].position - minGap);
            }
        }
    }

    return normalized.map((stop) => ({
        position: clamp(stop.position, 0, 1),
        color: normalizeHexColor(stop.color, '#ffffff'),
    }));
}

function normalizeAngle(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_CUSTOM_GRADIENT.angle;
    return ((numeric % 360) + 360) % 360;
}

function normalizeHexColor(value, fallback) {
    return /^#([0-9a-f]{6})$/i.test(String(value || '')) ? value : fallback;
}

function normalizeCustomGradient(customGradient) {
    const normalizedStops = normalizeStopList(customGradient?.stops);
    const flatStops = normalizedStops.flatMap((stop) => [stop.position, stop.color]);
    return {
        angle: normalizeAngle(customGradient?.angle),
        stops: flatStops,
    };
}

function getResolvedGradient(gradientId, customGradient) {
    if (gradientId === 'custom') {
        return normalizeCustomGradient(customGradient);
    }
    return getCanvasGradientById(gradientId);
}

// Build a CSS gradient string for the mockup area background.
export function getCanvasGradientCss(gradientId, solidColor = '#ffffff', customGradient = null) {
    const preset = getResolvedGradient(gradientId, customGradient);
    if (!preset?.stops?.length) return solidColor || '#ffffff';

    const stopPairs = [];
    for (let i = 0; i < preset.stops.length; i += 2) {
        const position = Math.round((preset.stops[i] || 0) * 100);
        const color = preset.stops[i + 1] || '#ffffff';
        stopPairs.push(`${color} ${position}%`);
    }
    return `linear-gradient(${preset.angle}deg, ${stopPairs.join(', ')})`;
}

function clearRectGradient(rect) {
    rect.fillPriority('color');
}

function getGradientLine(width, height, angle) {
    const radians = (angle * Math.PI) / 180;
    const vx = Math.cos(radians);
    const vy = Math.sin(radians);
    const cx = width / 2;
    const cy = height / 2;
    const halfDiagonal = Math.hypot(width, height) / 2;
    return {
        start: { x: cx - vx * halfDiagonal, y: cy - vy * halfDiagonal },
        end: { x: cx + vx * halfDiagonal, y: cy + vy * halfDiagonal },
    };
}

// Apply solid or gradient canvas background to Konva rect (export-safe).
export function applyCanvasGradientToRect({
    rect,
    stage,
    enabled,
    gradientId,
    solidColor = '#ffffff',
    customGradient = null,
} = {}) {
    if (!rect) return;

    if (!enabled) {
        clearRectGradient(rect);
        rect.fill('rgba(0,0,0,0)');
        return;
    }

    const preset = getResolvedGradient(gradientId, customGradient);
    if (!preset?.stops?.length) {
        clearRectGradient(rect);
        rect.fill(solidColor || '#ffffff');
        return;
    }

    const width = Math.max(1, stage?.width?.() || rect.width() || 1);
    const height = Math.max(1, stage?.height?.() || rect.height() || 1);
    const line = getGradientLine(width, height, preset.angle || 135);

    rect.fillPriority('linear-gradient');
    rect.fillLinearGradientStartPoint(line.start);
    rect.fillLinearGradientEndPoint(line.end);
    rect.fillLinearGradientColorStops(preset.stops);
}

export function getDefaultCanvasGradientId() {
    return DEFAULT_CANVAS_GRADIENT_ID;
}

export function getDefaultCustomGradient() {
    return {
        angle: DEFAULT_CUSTOM_GRADIENT.angle,
        stops: [...DEFAULT_CUSTOM_GRADIENT.stops],
    };
}
