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

        this.animationFrame = null;
    }

    async start() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            const deviceId = videoDevices[this.cameraId - 1]?.deviceId;

            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : true,
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            await new Promise((resolve) => {
                this.video.onloadedmetadata = resolve;
            });

            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            this.isActive = true;
            this.updateStatus('Online');
            this.video.classList.add('active');

            this.render();
            return true;
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Error');
            return false;
        }
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
        this.isActive = false;
        this.video.classList.remove('active');
        this.canvas.classList.remove('active');
        this.updateStatus('Offline');
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

        if (this.isDSAActive) {
            this.canvas.classList.add('active');
            this.video.classList.remove('active');
        } else {
            this.canvas.classList.remove('active');
            this.video.classList.add('active');
        }

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
            this.ctx.save();
            const scaledWidth = width / this.zoom;
            const scaledHeight = height / this.zoom;
            const x = (width - scaledWidth) / 2 + this.panX;
            const y = (height - scaledHeight) / 2 + this.panY;

            this.ctx.drawImage(this.video, x, y, scaledWidth, scaledHeight, 0, 0, width, height);
            this.ctx.restore();
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
