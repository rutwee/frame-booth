# Frame Booth

Frame Booth is a browser-based mockup tool for placing screenshots into iPhone frames, arranging multiple frames, and exporting high-quality PNGs.

## Features
- Add/update/delete iPhone frame mockups
- Double-click empty frame to upload screenshot
- Drag-and-drop screenshot directly into a frame
- Move, rotate, and resize frames
- Duplicate selected frame
- Copy/paste selected frame (`Ctrl/Cmd + C`, `Ctrl/Cmd + V`)
- Undo/redo (`Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z`, `Ctrl/Cmd + Y`)
- Reset scene to initial state
- Canvas mode toggle (transparent workflow supported)
- Export selected frame and full scene as PNG

## Tech Stack
- HTML, CSS, JavaScript (ES modules)
- [Konva.js](https://konvajs.org/) for stage/canvas interactions

## Run : https://rutwee.github.io/frame-booth/

## Project Structure
- `index.html` - app layout
- `style.css` - UI styling
- `js/main.js` - app orchestration and interactions
- `js/konvaSetup.js` - Konva stage/mockup setup
- `js/export.js` - scene/frame export logic
- `js/helpers.js` - UI/canvas helper utilities
- `js/state.js` - frame catalog + app state
- `assets/` - frame image assets
- `icons/` - UI icons
- `privacy.html`, `terms.html`, `disclaimer.html` - legal pages

## Keyboard Shortcuts
- `Ctrl/Cmd + C` - copy selected frame
- `Ctrl/Cmd + V` - paste copied frame
- `Ctrl/Cmd + Z` - undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` - redo
- `Space + drag` - pan workspace
- `Ctrl/Cmd + wheel` - zoom
- `0` - reset zoom/pan
- `Delete/Backspace` - delete selected frame/content

## Contact
- Email: `framebooth.ca@gmail.com`

## Roadmap
- Add donation link integration when payment account is ready
- Add optional snapping/guides for frame alignment
- Add lightweight crash/error reporting (privacy-safe)

## Contributing
1. Create a branch from your working branch.
2. Keep UI/logic changes small and focused.
3. Validate manually in browser (add frame, upload, drag/resize, export).
4. Open a PR with before/after screenshots for UI changes.
