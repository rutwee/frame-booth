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

## Run Locally
This is a static frontend app. Run it with any local web server.

### Option 1: VS Code Live Server
1. Open the project folder in VS Code
2. Start **Live Server** from `index.html`

### Option 2: Python
```bash
cd /Users/rutvikorat/Web_project/frame_app
python3 -m http.server 5501
```
Then open: `http://127.0.0.1:5501`

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

## Screenshot / Preview
Add app screenshots or GIF previews here for GitHub:

```md
![Frame Booth Workspace](./docs/preview-workspace.png)
![Frame Booth Export Flow](./docs/preview-export.gif)
```

## Notes
- Donation link can be configured later in `index.html` (`#donateLink`).
- Apple names and device imagery are property of their respective owners.

## Roadmap
- Add donation link integration when payment account is ready
- Add optional snapping/guides for frame alignment
- Add optional keyboard shortcut cheat sheet in UI
- Add lightweight crash/error reporting (privacy-safe)

## Contributing
1. Create a branch from your working branch.
2. Keep UI/logic changes small and focused.
3. Validate manually in browser (add frame, upload, drag/resize, export).
4. Open a PR with before/after screenshots for UI changes.
