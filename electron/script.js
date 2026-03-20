class CameraController {
    constructor(cameraId) {
        this.cameraId = cameraId;
        this.video = document.getElementById(`camera${cameraId}`);
        this.canvas = document.getElementById(`canvas${cameraId}`);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.statusElement = document.getElementById(`camera${cameraId}-status`);

        this.stream = null;
        this.isActive = false;
        this.isInverted = false;
        this.isDSAActive = false;
        this.referenceFrame = null;

        // Image adjustments
        this.brightness = 0;
        this.contrast = 100;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        // Recording
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;

        // Panning/dragging
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastPanX = 0;
        this.lastPanY = 0;

        this.animationFrame = null;
        this.popoutWindow = null;

        this.setupDragListeners();
    }

    setupDragListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.onDragMove(e));
        this.canvas.addEventListener('mouseup', () => this.onDragEnd());
        this.canvas.addEventListener('mouseleave', () => this.onDragEnd());

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.onDragStart({ clientX: touch.clientX, clientY: touch.clientY });
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.onDragMove({ clientX: touch.clientX, clientY: touch.clientY });
        });
        this.canvas.addEventListener('touchend', () => this.onDragEnd());
    }

    onDragStart(e) {
        if (this.zoom <= 1) return;

        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastPanX = this.panX;
        this.lastPanY = this.panY;
        this.canvas.style.cursor = 'grabbing';
    }

    onDragMove(e) {
        if (!this.isDragging || this.zoom <= 1) return;

        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;

        // Scale the movement based on zoom level
        const sensitivity = this.video.videoWidth / this.canvas.clientWidth;
        this.panX = this.lastPanX - (deltaX * sensitivity);
        this.panY = this.lastPanY - (deltaY * sensitivity);

        // Constrain panning to prevent showing beyond image bounds
        const maxPanX = (this.video.videoWidth - this.video.videoWidth / this.zoom) / 2;
        const maxPanY = (this.video.videoHeight - this.video.videoHeight / this.zoom) / 2;

        this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
        this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
    }

    onDragEnd() {
        this.isDragging = false;
        this.canvas.style.cursor = this.zoom > 1 ? 'grab' : 'default';
    }

    async start() {
        const delays = [0, 800, 1500]; // ms to wait before each attempt
        let lastError;

        for (let attempt = 0; attempt < delays.length; attempt++) {
            if (delays[attempt] > 0) {
                this.updateStatus(`Retrying...`);
                await new Promise(r => setTimeout(r, delays[attempt]));
            }

            try {
                const selectedDeviceId = document.getElementById(`device-select-cam${this.cameraId}`)?.value || '';

                const constraint = selectedDeviceId
                    ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
                    : { video: true, audio: false };

                this.stream = await navigator.mediaDevices.getUserMedia(constraint);
                this.video.srcObject = this.stream;

                await new Promise((resolve, reject) => {
                    this.video.addEventListener('loadedmetadata', resolve, { once: true });
                    this.video.addEventListener('error', reject, { once: true });
                });

                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;

                this.isActive = true;
                this.updateStatus('Online');
                this.canvas.classList.add('active');
                this.render();
                return true;

            } catch (error) {
                lastError = error;
                console.warn(`Camera ${this.cameraId} attempt ${attempt + 1} failed:`, error.name, error.message);
                if (error.name === 'NotAllowedError') break;
            }
        }

        console.error(`Camera ${this.cameraId} failed after all attempts:`, lastError?.name, lastError?.message);
        this.updateStatus('Error');
        return false;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.isRecording) {
            this.stopRecording();
        }
        if (this.popoutWindow && !this.popoutWindow.closed) {
            this.popoutWindow.close();
            this.popoutWindow = null;
        }
        this.isActive = false;
        this.video.classList.remove('active');
        this.canvas.classList.remove('active');
        this.updateStatus('Offline');
    }

    popout() {
        // If a popout is already open, close it (toggle off)
        if (this.popoutWindow && !this.popoutWindow.closed) {
            this.popoutWindow.close();
            this.popoutWindow = null;
            return false;
        }

        const stream = this.canvas.captureStream(30);
        const win = window.open('', `vascuvisuals-cam${this.cameraId}`, 'width=900,height=700');

        win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>VascuVisuals — Camera ${this.cameraId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        }
        video {
            max-width: 100%;
            max-height: 100vh;
            object-fit: contain;
        }
        .label {
            position: fixed;
            top: 12px;
            left: 12px;
            background: rgba(45, 27, 61, 0.85);
            color: white;
            padding: 6px 14px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="label">Camera ${this.cameraId}</div>
    <video id="pv" autoplay playsinline muted></video>
</body>
</html>`);
        win.document.close();

        // Attach the stream once the window document is ready
        win.addEventListener('load', () => {
            const pv = win.document.getElementById('pv');
            if (pv) pv.srcObject = stream;
        });

        // Fallback: if load already fired, set directly
        setTimeout(() => {
            if (win && !win.closed) {
                const pv = win.document.getElementById('pv');
                if (pv && !pv.srcObject) pv.srcObject = stream;
            }
        }, 200);

        this.popoutWindow = win;
        return true;
    }

    toggleInvert() {
        this.isInverted = !this.isInverted;
        return this.isInverted;
    }

    captureReference() {
        if (!this.isActive) return;

        const refCanvas = document.createElement('canvas');
        refCanvas.width = this.canvas.width;
        refCanvas.height = this.canvas.height;
        const refCtx = refCanvas.getContext('2d');

        refCtx.drawImage(this.video, 0, 0);
        const imageData = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);
        this.convertToGrayscale(imageData);
        this.referenceFrame = imageData;
    }

    toggleDSA() {
        this.isDSAActive = !this.isDSAActive;
        return this.isDSAActive;
    }

    setBrightness(value) {
        this.brightness = parseInt(value);
    }

    setContrast(value) {
        this.contrast = parseInt(value);
    }

    setZoom(value) {
        this.zoom = parseFloat(value);

        // Reset pan when zoom is 1
        if (this.zoom <= 1) {
            this.panX = 0;
            this.panY = 0;
            this.canvas.style.cursor = 'default';
        } else {
            this.canvas.style.cursor = 'grab';
        }
    }

    convertToGrayscale(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
    }

    applyBrightnessContrast(imageData) {
        const data = imageData.data;
        const factor = (259 * (this.contrast + 255)) / (255 * (259 - this.contrast));

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128 + this.brightness));
            data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128 + this.brightness));
            data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128 + this.brightness));
        }
    }

    takeScreenshot() {
        if (!this.isActive) return;

        const canvas = this.isDSAActive ? this.canvas : document.createElement('canvas');

        if (!this.isDSAActive) {
            canvas.width = this.canvas.width;
            canvas.height = this.canvas.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.canvas, 0, 0);
        }

        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `vascuvisuals-cam${this.cameraId}-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    startRecording() {
        if (!this.isActive || this.isRecording) return;

        const canvasStream = this.canvas.captureStream(30);
        this.recordedChunks = [];

        this.mediaRecorder = new MediaRecorder(canvasStream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `vascuvisuals-cam${this.cameraId}-${timestamp}.webm`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        };

        this.mediaRecorder.start();
        this.isRecording = true;
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }

    render() {
        if (!this.isActive) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Apply zoom
        if (this.zoom > 1) {
            // Calculate the cropped area from the video
            const sourceWidth = this.video.videoWidth / this.zoom;
            const sourceHeight = this.video.videoHeight / this.zoom;
            const sourceX = (this.video.videoWidth - sourceWidth) / 2 + this.panX;
            const sourceY = (this.video.videoHeight - sourceHeight) / 2 + this.panY;

            // Draw the cropped section scaled to fill the canvas
            this.ctx.drawImage(
                this.video,
                sourceX, sourceY, sourceWidth, sourceHeight,  // Source crop
                0, 0, width, height                            // Destination (full canvas)
            );
        } else {
            this.ctx.drawImage(this.video, 0, 0);
        }

        // Get image data for processing
        const imageData = this.ctx.getImageData(0, 0, width, height);

        // Convert to grayscale
        this.convertToGrayscale(imageData);

        // Apply DSA if active
        if (this.isDSAActive && this.referenceFrame) {
            const data = imageData.data;
            const refData = this.referenceFrame.data;

            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.abs(data[i] - refData[i]);
                data[i + 1] = Math.abs(data[i + 1] - refData[i + 1]);
                data[i + 2] = Math.abs(data[i + 2] - refData[i + 2]);
            }
        }

        // Apply brightness and contrast
        this.applyBrightnessContrast(imageData);

        // Apply inversion
        if (this.isInverted) {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
        }

        // Put processed image back
        this.ctx.putImageData(imageData, 0, 0);

        this.animationFrame = requestAnimationFrame(() => this.render());
    }

    updateStatus(status) {
        this.statusElement.textContent = status;
        if (status === 'Online') {
            this.statusElement.classList.add('online');
        } else {
            this.statusElement.classList.remove('online');
        }
    }
}

// Initialize cameras
const camera1 = new CameraController(1);
const camera2 = new CameraController(2);

// UI Elements
const displayArea = document.getElementById('display-area');
const statusElement = document.getElementById('status');

// Populate device dropdowns — in Electron, labels are available immediately
async function populateDeviceSelectors() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        [1, 2].forEach(camId => {
            const select = document.getElementById(`device-select-cam${camId}`);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '';

            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                select.appendChild(option);
            });

            // Restore previous selection if still available
            if (currentValue && [...select.options].some(o => o.value === currentValue)) {
                select.value = currentValue;
            }
        });
    } catch (err) {
        console.warn('Could not enumerate devices:', err);
    }
}

populateDeviceSelectors();
navigator.mediaDevices.addEventListener('devicechange', populateDeviceSelectors);

// Fullscreen
document.getElementById('fs-both').addEventListener('click', () => {
    document.getElementById('display-area').requestFullscreen();
});

document.getElementById('fs-exit').addEventListener('click', () => {
    document.exitFullscreen();
});

// Sync bar record button state when entering fullscreen
document.getElementById('display-area').addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        [[1, camera1], [2, camera2]].forEach(([id, cam]) => {
            const btn = document.getElementById(`fs-record-cam${id}`);
            btn.textContent = cam.isRecording ? 'Stop Rec' : 'Record';
            btn.classList.toggle('recording', cam.isRecording);
        });
    }
});

function setupFsRecord(camId, camera) {
    document.getElementById(`fs-screenshot-cam${camId}`).addEventListener('click', () => {
        camera.takeScreenshot();
    });

    document.getElementById(`fs-record-cam${camId}`).addEventListener('click', function() {
        const sidebarBtn = document.getElementById(`record-cam${camId}`);
        if (!camera.isRecording) {
            camera.startRecording();
            this.textContent = 'Stop Rec';
            this.classList.add('recording');
            sidebarBtn.textContent = 'Stop Rec';
            sidebarBtn.classList.add('active');
            updateStatus(`Recording Camera ${camId}`);
        } else {
            camera.stopRecording();
            this.textContent = 'Record';
            this.classList.remove('recording');
            sidebarBtn.textContent = 'Record';
            sidebarBtn.classList.remove('active');
            updateStatus('Recording Stopped');
        }
    });
}

setupFsRecord(1, camera1);
setupFsRecord(2, camera2);

// View mode buttons
const viewModeButtons = document.querySelectorAll('.view-mode-selector .btn');
viewModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        viewModeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.mode;
        displayArea.className = 'display-area';

        if (mode === 'single1') {
            displayArea.classList.add('single-view');
            document.getElementById('camera1-container').classList.add('active-view');
            document.getElementById('camera2-container').classList.remove('active-view');
        } else if (mode === 'single2') {
            displayArea.classList.add('single-view');
            document.getElementById('camera2-container').classList.add('active-view');
            document.getElementById('camera1-container').classList.remove('active-view');
        } else if (mode === 'pip') {
            displayArea.classList.add('pip-view');
            document.getElementById('camera1-container').classList.add('active-view');
            document.getElementById('camera2-container').classList.add('active-view');
        } else {
            document.getElementById('camera1-container').classList.add('active-view');
            document.getElementById('camera2-container').classList.add('active-view');
        }
    });
});

// Camera 1 Controls
document.getElementById('start-cam1').addEventListener('click', async function() {
    if (!camera1.isActive) {
        const success = await camera1.start();
        if (success) {
            this.textContent = 'Stop Camera 1';
            this.classList.remove('success');
            this.classList.add('danger');
            enableCameraControls(1);
        }
    } else {
        camera1.stop();
        this.textContent = 'Start Camera 1';
        this.classList.remove('danger');
        this.classList.add('success');
        disableCameraControls(1);
    }
});

document.getElementById('start-cam2').addEventListener('click', async function() {
    if (!camera2.isActive) {
        const success = await camera2.start();
        if (success) {
            this.textContent = 'Stop Camera 2';
            this.classList.remove('success');
            this.classList.add('danger');
            enableCameraControls(2);
        }
    } else {
        camera2.stop();
        this.textContent = 'Start Camera 2';
        this.classList.remove('danger');
        this.classList.add('success');
        disableCameraControls(2);
    }
});

// Pop Out
document.getElementById('popout-cam1').addEventListener('click', function() {
    const isOpen = camera1.popout();
    this.textContent = isOpen ? 'Close Pop Out' : 'Pop Out';
    this.classList.toggle('active', isOpen);
});

document.getElementById('popout-cam2').addEventListener('click', function() {
    const isOpen = camera2.popout();
    this.textContent = isOpen ? 'Close Pop Out' : 'Pop Out';
    this.classList.toggle('active', isOpen);
});

// Screenshot and Recording
document.getElementById('screenshot-cam1').addEventListener('click', () => camera1.takeScreenshot());
document.getElementById('screenshot-cam2').addEventListener('click', () => camera2.takeScreenshot());

document.getElementById('record-cam1').addEventListener('click', function() {
    if (!camera1.isRecording) {
        camera1.startRecording();
        this.textContent = 'Stop Rec';
        this.classList.add('active');
        updateStatus('Recording Camera 1');
    } else {
        camera1.stopRecording();
        this.textContent = 'Record';
        this.classList.remove('active');
        updateStatus('Recording Stopped');
    }
});

document.getElementById('record-cam2').addEventListener('click', function() {
    if (!camera2.isRecording) {
        camera2.startRecording();
        this.textContent = 'Stop Rec';
        this.classList.add('active');
        updateStatus('Recording Camera 2');
    } else {
        camera2.stopRecording();
        this.textContent = 'Record';
        this.classList.remove('active');
        updateStatus('Recording Stopped');
    }
});

// Inversion
document.getElementById('invert-cam1').addEventListener('click', function() {
    camera1.toggleInvert();
    this.classList.toggle('active');
});

document.getElementById('invert-cam2').addEventListener('click', function() {
    camera2.toggleInvert();
    this.classList.toggle('active');
});

// DSA
document.getElementById('capture-ref1').addEventListener('click', () => {
    camera1.captureReference();
    updateStatus('Camera 1 Reference Captured');
});

document.getElementById('capture-ref2').addEventListener('click', () => {
    camera2.captureReference();
    updateStatus('Camera 2 Reference Captured');
});

document.getElementById('dsa-cam1').addEventListener('click', function() {
    const isActive = camera1.toggleDSA();
    this.classList.toggle('active', isActive);
    if (isActive && !camera1.referenceFrame) {
        updateStatus('Warning: No reference frame for Camera 1');
    }
});

document.getElementById('dsa-cam2').addEventListener('click', function() {
    const isActive = camera2.toggleDSA();
    this.classList.toggle('active', isActive);
    if (isActive && !camera2.referenceFrame) {
        updateStatus('Warning: No reference frame for Camera 2');
    }
});

// Adjustments - Camera 1
document.getElementById('brightness-cam1').addEventListener('input', function() {
    camera1.setBrightness(this.value);
    document.getElementById('brightness1-value').textContent = this.value;
});

document.getElementById('contrast-cam1').addEventListener('input', function() {
    camera1.setContrast(this.value);
    document.getElementById('contrast1-value').textContent = this.value;
});

document.getElementById('zoom-cam1').addEventListener('input', function() {
    camera1.setZoom(this.value);
    document.getElementById('zoom1-value').textContent = parseFloat(this.value).toFixed(1) + 'x';
});

// Adjustments - Camera 2
document.getElementById('brightness-cam2').addEventListener('input', function() {
    camera2.setBrightness(this.value);
    document.getElementById('brightness2-value').textContent = this.value;
});

document.getElementById('contrast-cam2').addEventListener('input', function() {
    camera2.setContrast(this.value);
    document.getElementById('contrast2-value').textContent = this.value;
});

document.getElementById('zoom-cam2').addEventListener('input', function() {
    camera2.setZoom(this.value);
    document.getElementById('zoom2-value').textContent = parseFloat(this.value).toFixed(1) + 'x';
});

// Helper functions
function enableCameraControls(camId) {
    document.getElementById(`screenshot-cam${camId}`).disabled = false;
    document.getElementById(`record-cam${camId}`).disabled = false;
    document.getElementById(`popout-cam${camId}`).disabled = false;
    document.getElementById(`invert-cam${camId}`).disabled = false;
    document.getElementById(`capture-ref${camId}`).disabled = false;
    document.getElementById(`dsa-cam${camId}`).disabled = false;
    document.getElementById(`brightness-cam${camId}`).disabled = false;
    document.getElementById(`contrast-cam${camId}`).disabled = false;
    document.getElementById(`zoom-cam${camId}`).disabled = false;
}

function disableCameraControls(camId) {
    document.getElementById(`screenshot-cam${camId}`).disabled = true;
    document.getElementById(`record-cam${camId}`).disabled = true;
    const popoutBtn = document.getElementById(`popout-cam${camId}`);
    popoutBtn.disabled = true;
    popoutBtn.textContent = 'Pop Out';
    popoutBtn.classList.remove('active');
    document.getElementById(`invert-cam${camId}`).disabled = true;
    document.getElementById(`invert-cam${camId}`).classList.remove('active');
    document.getElementById(`capture-ref${camId}`).disabled = true;
    document.getElementById(`dsa-cam${camId}`).disabled = true;
    document.getElementById(`dsa-cam${camId}`).classList.remove('active');
    document.getElementById(`brightness-cam${camId}`).disabled = true;
    document.getElementById(`contrast-cam${camId}`).disabled = true;
    document.getElementById(`zoom-cam${camId}`).disabled = true;
}

function updateStatus(message) {
    statusElement.textContent = message;
    setTimeout(() => {
        statusElement.textContent = 'System Ready';
    }, 3000);
}
