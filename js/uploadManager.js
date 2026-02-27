export function createUploadManager({
    ui,
    appState,
    getLastAddedMockup,
    getStage,
    helpers,
    placeImageInMockup,
    onSceneChanged,
    maxUploadSizeBytes = 8 * 1024 * 1024,
}) {
    function getImageValidationError(file) {
        if (!file.type.startsWith('image/')) {
            return 'Please select a valid image file.';
        }
        if (file.size > maxUploadSizeBytes) {
            return 'Image file is too large! Please upload a file under 8MB.';
        }
        return null;
    }

    async function loadAndPlaceImage(file, targetMockup) {
        const validationError = getImageValidationError(file);
        if (validationError) {
            alert(validationError);
            return;
        }
        if (!targetMockup) {
            alert('Please add or select a frame to place the image in.');
            return;
        }
        const dataURL = await helpers.readFileAsDataURL(file);
        const img = await helpers.loadImage(dataURL);
        placeImageInMockup(img, targetMockup);
        onSceneChanged?.();
    }

    async function handleImageUpload(e) {
        const file = e.target.files?.[0];
        if (!file) {
            ui.fileInput.value = '';
            return;
        }

        try {
            const targetMockup = appState.currentSelectedMockup || getLastAddedMockup?.();
            await loadAndPlaceImage(file, targetMockup);
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Sorry, there was an error processing your image.');
        } finally {
            ui.fileInput.value = '';
        }
    }

    function getMockupAtClientPoint(clientX, clientY) {
        const stage = getStage?.();
        if (!stage) return null;

        const stageBox = stage.container().getBoundingClientRect();
        const scaleX = stageBox.width / stage.width() || 1;
        const scaleY = stageBox.height / stage.height() || 1;
        const point = {
            x: (clientX - stageBox.left) / scaleX,
            y: (clientY - stageBox.top) / scaleY,
        };

        const shape = stage.getIntersection(point);
        const directMockup = shape?.findAncestor?.('.mockup-group');
        if (directMockup) return directMockup;

        const found = stage.find('.mockup-group');
        const groups = typeof found?.toArray === 'function' ? found.toArray() : Array.from(found || []);
        for (let i = groups.length - 1; i >= 0; i -= 1) {
            const r = groups[i].getClientRect();
            if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) {
                return groups[i];
            }
        }
        return null;
    }

    function initDragAndDropUpload() {
        ui.mockupArea.addEventListener('dragover', e => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        ui.mockupArea.addEventListener('drop', async e => {
            e.preventDefault();
            const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
            if (!file) return;
            const targetMockup = getMockupAtClientPoint(e.clientX, e.clientY);
            if (!targetMockup) return;
            try {
                await loadAndPlaceImage(file, targetMockup);
            } catch (error) {
                console.error('Error processing dropped image:', error);
                alert('Sorry, there was an error processing your image.');
            }
        });
    }

    return {
        handleImageUpload,
        initDragAndDropUpload,
        loadAndPlaceImage,
    };
}
