# VascuVisuals - Angiosuite Visualizer

A lightweight, professional angiosuite visualizer for neurovascular catheterization simulation with hospital-grade interface design.

## Features

### Display Capabilities
- **Dual Camera Support**: Display up to two camera feeds simultaneously
- **Grayscale Output**: All camera feeds automatically displayed in black and white
- **Multiple View Modes**: Dual, Single Camera 1, Single Camera 2, Picture-in-Picture
- **Zoom & Pan**: Digital zoom up to 4x with pan capability

### Image Processing
- **DSA (Digital Subtraction Angiography)**: Capture reference frames and perform real-time subtraction
- **Color Inversion**: Toggle color inversion for enhanced visualization
- **Brightness Control**: Adjust brightness from -100 to +100
- **Contrast Control**: Adjust contrast from 0% to 200%

### Recording & Capture
- **Screenshots**: Capture still images from either camera
- **Video Recording**: Record procedures in WebM format

### Interface
- **Clean Design**: Professional hospital equipment aesthetic
- **Organized Controls**: Grouped by function for easy access
- **Real-time Status**: Live status indicators for each camera
- **Responsive Layout**: Works on different screen sizes

## How to Use

1. Open `index.html` in a web browser (Chrome or Edge recommended)
2. Click "Start Camera 1" or "Start Camera 2" to activate cameras
3. Grant camera permissions when prompted
4. Adjust settings as needed for your procedure

### Display Modes

- **Dual**: Side-by-side view of both cameras
- **Cam 1**: Full-screen view of Camera 1 only
- **Cam 2**: Full-screen view of Camera 2 only
- **PIP**: Picture-in-picture mode (Camera 2 overlaid on Camera 1)

### DSA Workflow

1. Start camera and position catheter at baseline
2. Adjust brightness/contrast as needed
3. Click "DSA Ref" to capture reference frame
4. Click "DSA" to activate subtraction mode
5. Inject contrast - only changes from reference will be visible

### Recording Workflow

1. Start camera and adjust settings
2. Click "Record" to begin recording
3. Perform procedure
4. Click "Stop Rec" to end and download video

## Technical Details

- **Pure JavaScript**: No frameworks or dependencies
- **WebRTC**: Uses getUserMedia API for camera access
- **Canvas Processing**: Real-time image manipulation
- **MediaRecorder API**: Native video recording support
- **Responsive Design**: CSS Grid and Flexbox layout

## Browser Compatibility

Requires a modern browser with full WebRTC and MediaRecorder support:
- Chrome 60+
- Edge 79+
- Firefox 55+
- Safari 14+ (limited MediaRecorder support)

## File Structure

```
VascuVisuals/
├── index.html      # Main application structure
├── style.css       # Hospital-grade styling
├── script.js       # Camera control and processing logic
└── README.md       # This file
```

## Notes

- All camera feeds are automatically converted to grayscale
- Cameras must be connected before starting the application
- If you have multiple cameras, Camera 1 and Camera 2 will attempt to use different devices
- Video recordings are saved in WebM format (VP9 codec)
- Screenshots are saved as PNG files
- All processing happens client-side in real-time
