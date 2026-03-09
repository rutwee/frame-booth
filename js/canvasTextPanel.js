function parseFontStyle(fontStyle = '') {
  const normalized = String(fontStyle).toLowerCase();
  return {
    bold: normalized.includes('bold'),
    italic: normalized.includes('italic'),
  };
}

function hasUnderline(textDecoration = '') {
  return String(textDecoration).toLowerCase().includes('underline');
}

function composeFontStyle({ bold = false, italic = false } = {}) {
  if (bold && italic) return 'bold italic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

export function createCanvasTextPanel({
  ui,
  getSelectedSnapshot,
  updateSelected,
  ensureCanvasEnabled,
  addCanvasText,
} = {}) {
  const apply = (partial = {}) => updateSelected?.(partial);

  function sync() {
    const selected = getSelectedSnapshot?.();
    const enabled = !!ui.canvasEnabled?.checked && !!selected;
    ui.canvasTextPanel?.classList.toggle('is-disabled', !enabled);
    if (!enabled) return;

    const styleState = parseFontStyle(selected.fontStyle);
    if (ui.canvasTextInput) ui.canvasTextInput.value = selected.text || '';
    if (ui.canvasTextFontFamily) ui.canvasTextFontFamily.value = selected.fontFamily || 'Arial';
    if (ui.canvasTextSize) ui.canvasTextSize.value = `${Math.max(8, Math.round(selected.fontSize || 24))}`;
    if (ui.canvasTextColor) ui.canvasTextColor.value = selected.fill || '#2f3a4f';
    if (ui.canvasTextColorGradient) ui.canvasTextColorGradient.value = selected.textGradientId || 'solid';

    const hasHighlight = !!(selected.textHighlight || '').trim();
    if (ui.canvasTextHighlight) ui.canvasTextHighlight.value = selected.textHighlight || '#fff0a8';
    if (ui.canvasTextHighlightGradient) {
      ui.canvasTextHighlightGradient.value = hasHighlight
        ? (selected.textHighlightGradientId || 'solid')
        : 'none';
    }
    if (ui.canvasTextAlign) ui.canvasTextAlign.value = selected.align || 'left';
    ui.canvasTextBoldBtn?.classList.toggle('is-active', styleState.bold);
    ui.canvasTextItalicBtn?.classList.toggle('is-active', styleState.italic);
    ui.canvasTextUnderlineBtn?.classList.toggle('is-active', hasUnderline(selected.textDecoration));
  }

  function withSelected(onSelected) {
    const selected = getSelectedSnapshot?.();
    if (!selected) return;
    onSelected(selected);
    sync();
  }

  function bind() {
    ui.canvasTextBtn?.addEventListener('click', () => {
      ensureCanvasEnabled?.();
      addCanvasText?.();
      sync();
      ui.canvasTextInput?.focus();
      ui.canvasTextInput?.select();
    });
    ui.canvasTextInput?.addEventListener('input', () => {
      apply({ text: ui.canvasTextInput.value || ' ' });
    });
    ui.canvasTextSize?.addEventListener('input', () => {
      const size = Number(ui.canvasTextSize.value) || 24;
      apply({ fontSize: Math.max(8, size) });
    });
    ui.canvasTextFontFamily?.addEventListener('change', () => {
      apply({ fontFamily: ui.canvasTextFontFamily.value || 'Arial' });
    });
    ui.canvasTextColor?.addEventListener('input', () => {
      apply({ fill: ui.canvasTextColor.value || '#2f3a4f' });
      sync();
    });
    ui.canvasTextColorGradient?.addEventListener('change', () => {
      apply({ textGradientId: ui.canvasTextColorGradient.value || 'solid' });
      sync();
    });
    ui.canvasTextHighlight?.addEventListener('input', () => {
      if (ui.canvasTextHighlightGradient?.value === 'none') {
        ui.canvasTextHighlightGradient.value = 'solid';
      }
      apply({
        textHighlight: ui.canvasTextHighlight.value || '',
        textHighlightGradientId: ui.canvasTextHighlightGradient?.value || 'solid',
      });
      sync();
    });
    ui.canvasTextHighlightGradient?.addEventListener('change', () => {
      const nextMode = ui.canvasTextHighlightGradient.value || 'none';
      apply({
        textHighlight: nextMode === 'none' ? '' : (ui.canvasTextHighlight?.value || '#fff0a8'),
        textHighlightGradientId: nextMode === 'none' ? 'solid' : nextMode,
      });
      sync();
    });
    ui.canvasTextAlign?.addEventListener('change', () => {
      apply({ align: ui.canvasTextAlign.value || 'left' });
    });
    ui.canvasTextBoldBtn?.addEventListener('click', () => withSelected((selected) => {
      const next = parseFontStyle(selected.fontStyle);
      next.bold = !next.bold;
      apply({ fontStyle: composeFontStyle(next) });
    }));
    ui.canvasTextItalicBtn?.addEventListener('click', () => withSelected((selected) => {
      const next = parseFontStyle(selected.fontStyle);
      next.italic = !next.italic;
      apply({ fontStyle: composeFontStyle(next) });
    }));
    ui.canvasTextUnderlineBtn?.addEventListener('click', () => withSelected((selected) => {
      apply({ textDecoration: hasUnderline(selected.textDecoration) ? '' : 'underline' });
    }));
  }

  return { bind, sync };
}
