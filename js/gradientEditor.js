import { getDefaultCustomGradient } from './canvasGradients.js';

const CUSTOM_GRADIENT_ID = 'custom';
const MIN_STOPS = 2;
const TRACK_PREVIEW_ANGLE = 90;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback = '#ffffff') {
    return /^#([0-9a-f]{6})$/i.test(String(value || '')) ? value : fallback;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex).slice(1);
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(colorA, colorB, t) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    return rgbToHex({
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
    });
}

function defaultStops() {
    const defaults = getDefaultCustomGradient();
    return [
        { id: 'gs-1', position: defaults.stops[0], color: defaults.stops[1] },
        { id: 'gs-2', position: defaults.stops[2], color: defaults.stops[3] },
    ];
}

export function createGradientEditor({ ui, onChange, isTypingInFormField } = {}) {
    const state = {
        angle: getDefaultCustomGradient().angle,
        stops: defaultStops(),
        selectedStopId: null,
        draggingStopId: null,
        isDragging: false,
        pointerStartX: 0,
        pointerShiftRemove: false,
        editorFocused: false,
    };
    let stopCounter = 2;
    let lastSerializedState = '';

    function nextStopId() {
        stopCounter += 1;
        return `gs-${stopCounter}`;
    }

    function sortStops() {
        state.stops.sort((a, b) => a.position - b.position);
    }

    function isCustomModeActive() {
        return !!ui.canvasEnabled?.checked && ui.bgGradient?.value === CUSTOM_GRADIENT_ID;
    }

    function getSelectedStop() {
        return state.stops.find((stop) => stop.id === state.selectedStopId) || null;
    }

    function serializeState() {
        return JSON.stringify({
            angle: state.angle,
            stops: state.stops.map((stop) => ({
                id: stop.id,
                position: stop.position,
                color: stop.color,
            })),
        });
    }

    function renderTrackBackground() {
        if (!ui.gradientBar) return;
        const stops = state.stops.map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`).join(', ');
        ui.gradientBar.style.background = `linear-gradient(${TRACK_PREVIEW_ANGLE}deg, ${stops})`;
    }

    function renderStops() {
        if (!ui.gradientStopsLayer) return;
        ui.gradientStopsLayer.innerHTML = '';
        for (const stop of state.stops) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gradient-stop-handle';
            if (stop.id === state.selectedStopId) button.classList.add('is-selected');
            button.dataset.stopId = stop.id;
            button.style.left = `${stop.position * 100}%`;
            button.style.setProperty('--stop-color', stop.color);
            ui.gradientStopsLayer.appendChild(button);
        }
    }

    function render() {
        if (ui.gradientAngle) ui.gradientAngle.value = `${Math.round(state.angle)}`;
        if (ui.gradientAngleValue) ui.gradientAngleValue.textContent = `${Math.round(state.angle)}deg`;
        renderTrackBackground();
        renderStops();
    }

    function persistAndNotify({ notify = true } = {}) {
        const serialized = serializeState();
        if (serialized === lastSerializedState) return;
        lastSerializedState = serialized;
        if (ui.customGradientData) ui.customGradientData.value = serialized;
        if (notify) onChange?.();
    }

    function commitState(options = {}) {
        render();
        persistAndNotify(options);
    }

    function syncVisibility() {
        const showPanel = isCustomModeActive();
        ui.gradientCustomPanel?.classList.toggle('is-disabled', !showPanel);
        ui.gradientEditor?.classList.toggle('is-readonly', !showPanel);
        if (ui.gradientAngle) ui.gradientAngle.disabled = !showPanel;
        if (ui.gradientStopColor) ui.gradientStopColor.disabled = !showPanel;
    }

    function normalizeLoadedStops(stops) {
        const loadedStops = Array.isArray(stops) ? stops : [];
        const normalized = loadedStops
            .filter((stop) => stop && typeof stop === 'object')
            .map((stop) => ({
                id: String(stop.id || nextStopId()),
                position: clamp(Number(stop.position), 0, 1),
                color: normalizeHexColor(stop.color),
            }));

        if (normalized.length < MIN_STOPS) return defaultStops();
        normalized.sort((a, b) => a.position - b.position);
        return normalized;
    }

    function hydrateFromHiddenData() {
        let nextState = null;
        try {
            nextState = JSON.parse(ui.customGradientData?.value || '{}');
        } catch {
            nextState = null;
        }

        const defaults = getDefaultCustomGradient();
        const parsedAngle = Number(nextState?.angle);
        state.angle = Number.isFinite(parsedAngle) ? ((parsedAngle % 360) + 360) % 360 : defaults.angle;
        state.stops = normalizeLoadedStops(nextState?.stops);
        stopCounter = Math.max(
            stopCounter,
            ...state.stops.map((stop) => Number(String(stop.id).split('-')[1]) || 0),
        );
        if (!state.selectedStopId || !state.stops.some((stop) => stop.id === state.selectedStopId)) {
            state.selectedStopId = state.stops[0]?.id || null;
        }
        commitState();
    }

    function getPositionAtClientX(clientX) {
        const rect = ui.gradientBar?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return 0;
        return clamp((clientX - rect.left) / rect.width, 0, 1);
    }

    function getInterpolatedColor(position) {
        sortStops();
        if (position <= state.stops[0].position) return state.stops[0].color;
        if (position >= state.stops[state.stops.length - 1].position) return state.stops[state.stops.length - 1].color;
        for (let i = 1; i < state.stops.length; i += 1) {
            const left = state.stops[i - 1];
            const right = state.stops[i];
            if (position < left.position || position > right.position) continue;
            const spread = right.position - left.position || 1;
            return lerpColor(left.color, right.color, (position - left.position) / spread);
        }
        return '#ffffff';
    }

    function addStopAtPosition(position) {
        const stop = {
            id: nextStopId(),
            position: clamp(position, 0, 1),
            color: getInterpolatedColor(position),
        };
        state.stops.push(stop);
        state.selectedStopId = stop.id;
        sortStops();
        commitState();
    }

    function removeStopById(stopId) {
        if (!stopId || state.stops.length <= MIN_STOPS) return;
        state.stops = state.stops.filter((stop) => stop.id !== stopId);
        state.selectedStopId = state.stops[Math.max(0, state.stops.length - 1)]?.id || null;
        sortStops();
        commitState();
    }

    function updateStopPosition(stopId, position, options = {}) {
        const stop = state.stops.find((item) => item.id === stopId);
        if (!stop) return;
        stop.position = clamp(position, 0, 1);
        sortStops();
        if (options.notify === false) {
            render();
            return;
        }
        commitState(options);
    }

    function bindEvents() {
        ui.bgGradient?.addEventListener('change', () => {
            syncVisibility();
            onChange?.();
        });

        ui.gradientEditor?.addEventListener('click', (event) => {
            if (!isCustomModeActive()) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('.gradient-stop-handle')) return;
            state.editorFocused = true;
            addStopAtPosition(getPositionAtClientX(event.clientX));
        });

        ui.gradientStopsLayer?.addEventListener('pointerdown', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const handle = target?.closest('.gradient-stop-handle');
            if (!handle || !isCustomModeActive()) return;
            event.preventDefault();
            state.editorFocused = true;
            state.draggingStopId = handle.dataset.stopId || null;
            state.pointerStartX = event.clientX;
            state.pointerShiftRemove = !!event.shiftKey;
            state.isDragging = false;
            state.selectedStopId = state.draggingStopId;
            render();
        });

        window.addEventListener('pointermove', (event) => {
            if (!state.draggingStopId || !isCustomModeActive()) return;
            if (Math.abs(event.clientX - state.pointerStartX) > 2) state.isDragging = true;
            updateStopPosition(state.draggingStopId, getPositionAtClientX(event.clientX), { notify: false });
        });

        window.addEventListener('pointerup', () => {
            if (!state.draggingStopId) return;
            const selectedStopId = state.draggingStopId;
            const wasDragging = state.isDragging;
            const shiftRemove = state.pointerShiftRemove;
            state.draggingStopId = null;
            state.isDragging = false;
            state.pointerShiftRemove = false;
            if (wasDragging) {
                commitState();
                return;
            }
            if (shiftRemove) {
                removeStopById(selectedStopId);
                return;
            }
            const selectedStop = state.stops.find((stop) => stop.id === selectedStopId);
            if (selectedStop && ui.gradientStopColor) {
                ui.gradientStopColor.value = selectedStop.color;
                ui.gradientStopColor.click();
            }
        });

        ui.gradientStopColor?.addEventListener('input', () => {
            const selectedStop = getSelectedStop();
            if (!selectedStop) return;
            selectedStop.color = normalizeHexColor(ui.gradientStopColor.value, selectedStop.color);
            commitState();
        });

        ui.gradientAngle?.addEventListener('input', () => {
            state.angle = clamp(Number(ui.gradientAngle.value) || 0, 0, 360);
            commitState();
        });

        window.addEventListener('keydown', (event) => {
            if (!isCustomModeActive() || isTypingInFormField?.() || !state.editorFocused) return;
            if (!['Delete', 'Backspace'].includes(event.key)) return;
            if (!state.selectedStopId) return;
            event.preventDefault();
            removeStopById(state.selectedStopId);
        });

        window.addEventListener('pointerdown', (event) => {
            if (!ui.gradientCustomPanel?.contains(event.target)) {
                state.editorFocused = false;
            }
        });

        window.addEventListener('custom-gradient-sync', () => {
            hydrateFromHiddenData();
            syncVisibility();
        });
    }

    function init() {
        hydrateFromHiddenData();
        syncVisibility();
        bindEvents();
    }

    return {
        init,
        syncVisibility,
        hydrateFromHiddenData,
    };
}
