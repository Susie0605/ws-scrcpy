<template>
  <div class="device-control">
    <div class="header">
      <button @click="goBack">返回</button>
      <h2>控制设备: {{ udid }}</h2>
      <span class="status-badge" :class="{ connected: status === 'Connected' }">{{ status }}</span>
    </div>
    <div class="main-content">
      <div class="viewport" ref="viewport">
        <canvas ref="videoCanvas"></canvas>
      </div>
      <div class="control-panel">
        <button class="control-btn" @click="sendKeyCode(3)" title="Home">
          <span class="icon">🏠</span>
          <span class="label">主页</span>
        </button>
        <button class="control-btn" @click="sendKeyCode(4)" title="Back">
          <span class="icon">◀</span>
          <span class="label">返回</span>
        </button>
        <button class="control-btn" @click="sendKeyCode(82)" title="Menu">
          <span class="icon">☰</span>
          <span class="label">菜单</span>
        </button>
        <button class="control-btn" @click="sendKeyCode(187)" title="Recent Apps">
          <span class="icon">▣</span>
          <span class="label">任务</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// @ts-ignore
import H264Parser from 'h264-converter/dist/h264-parser';
// @ts-ignore
import NALU from 'h264-converter/dist/util/NALU';
import VideoSettings from '../app/VideoSettings';
import { CommandControlMessage } from '../app/controlMessage/CommandControlMessage';
import { TouchControlMessage } from '../app/controlMessage/TouchControlMessage';
import { KeyCodeControlMessage } from '../app/controlMessage/KeyCodeControlMessage';
import { KeyInputHandler, KeyEventListener } from '../app/googDevice/KeyInputHandler';
import Size from '../app/Size';
import Point from '../app/Point';
import Position from '../app/Position';
// @ts-ignore
import Avc from '../vendor/Broadway/Decoder.js';
// @ts-ignore
import YUVCanvas from '../vendor/h264-live-player/YUVCanvas.ts';
// @ts-ignore
import YUVWebGLCanvas from '../vendor/h264-live-player/YUVWebGLCanvas.ts';
import KeyEvent from '../app/googDevice/android/KeyEvent';

const route = useRoute();
const router = useRouter();
const udid = route.params.udid as string;
const status = ref('Initializing...');
const viewport = ref<HTMLElement | null>(null);
const videoCanvas = ref<HTMLCanvasElement | null>(null);
let ws: WebSocket | null = null;
let avc: any = null;
let canvas: any = null;
let hasInitialInfo = false;
let currentVideoSettings: VideoSettings | null = null;
let actualVideoSize: Size | null = null; // Actual decoded video dimensions
let isMouseDown = false;

const MAGIC_BYTES_INITIAL = new TextEncoder().encode('scrcpy_initial');
const MAGIC_BYTES_MESSAGE = new TextEncoder().encode('scrcpy_message');
const DEVICE_NAME_FIELD_LENGTH = 64;

const goBack = () => {
    router.push({ name: 'home' });
};

// Decoder state
let buffer: ArrayBuffer | undefined;
let bufferedSPS = false;
let bufferedPPS = false;
let hadIDR = false;

const keyHandler: KeyEventListener = {
    onKeyEvent: (event: KeyCodeControlMessage) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(event.toBuffer());
        }
    }
};


function toHex(value: number) {
    return value.toString(16).padStart(2, '0').toUpperCase();
}

function parseSPS(data: Uint8Array) {
    const {
        profile_idc,
        constraint_set_flags,
        level_idc,
        pic_width_in_mbs_minus1,
        frame_crop_left_offset,
        frame_crop_right_offset,
        frame_mbs_only_flag,
        pic_height_in_map_units_minus1,
        frame_crop_top_offset,
        frame_crop_bottom_offset,
        sar,
    } = H264Parser.parseSPS(data);

    const sarScale = sar[0] / sar[1];
    const codec = `avc1.${[profile_idc, constraint_set_flags, level_idc].map(toHex).join('')}`;
    const width = Math.ceil(
        ((pic_width_in_mbs_minus1 + 1) * 16 - frame_crop_left_offset * 2 - frame_crop_right_offset * 2) * sarScale,
    );
    const height =
        (2 - frame_mbs_only_flag) * (pic_height_in_map_units_minus1 + 1) * 16 -
        (frame_mbs_only_flag ? 2 : 4) * (frame_crop_top_offset + frame_crop_bottom_offset);
    return { codec, width, height };
}

const initDecoder = () => {
    avc = new Avc();
    avc.onPictureDecoded = (buffer: Uint8Array, width: number, height: number) => {
        if (!canvas) {
            initCanvas(width, height);
        }
        if (canvas) {
            canvas.decode(buffer, width, height);
        }
    };
};

const initCanvas = (width: number, height: number) => {
    if (!videoCanvas.value) return;
    
    let canvasEl = videoCanvas.value;
    try {
        // canvas = new YUVWebGLCanvas(canvasEl, new Size(width, height));
        throw new Error('Force 2D');
    } catch (e) {
        console.warn('WebGL not supported/failed, falling back to 2D canvas', e);
        
        // Cannot reuse canvas if it has a WebGL context, so replace it
        if (canvasEl.parentNode) {
            const newCanvas = document.createElement('canvas');
            newCanvas.width = width;
            newCanvas.height = height;
            // Copy ID and Style to preserve layout
            newCanvas.id = canvasEl.id;
            newCanvas.className = canvasEl.className;
            newCanvas.style.cssText = canvasEl.style.cssText;

            canvasEl.parentNode.replaceChild(newCanvas, canvasEl);
            canvasEl = newCanvas;
            videoCanvas.value = newCanvas; // Update ref
            
            bindInputEvents(newCanvas);
        }
        // @ts-ignore
        canvas = new YUVCanvas(canvasEl, new Size(width, height));
        actualVideoSize = new Size(width, height); // Store actual decoded size
        
        // Apply initial scaling
        updateCanvasSize();
    }
};

// Update canvas CSS size to fit viewport while maintaining aspect ratio
const updateCanvasSize = () => {
    if (!videoCanvas.value || !actualVideoSize || !viewport.value) return;
    
    const canvasEl = videoCanvas.value;
    const viewportEl = viewport.value;
    
    // Get available space (viewport size minus padding)
    const availableWidth = viewportEl.clientWidth - 20; // 10px padding on each side
    const availableHeight = viewportEl.clientHeight - 20;
    
    // Canvas native resolution
    const videoWidth = actualVideoSize.width;
    const videoHeight = actualVideoSize.height;
    
    // Calculate scale to fit
    const scaleX = availableWidth / videoWidth;
    const scaleY = availableHeight / videoHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    
    // Apply CSS size (canvas internal resolution stays the same)
    canvasEl.style.width = `${videoWidth * scale}px`;
    canvasEl.style.height = `${videoHeight * scale}px`;
};

// Window resize handler
const onWindowResize = () => {
    updateCanvasSize();
};

const bindInputEvents = (el: HTMLElement) => {
    // Mouse events
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mouseleave', onMouseUp);
    el.addEventListener('contextmenu', onContextMenu);
    
    // Touch events for mobile
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });
};

const unbindInputEvents = (el: HTMLElement) => {
    // Mouse events
    el.removeEventListener('mousedown', onMouseDown);
    el.removeEventListener('mousemove', onMouseMove);
    el.removeEventListener('mouseup', onMouseUp);
    el.removeEventListener('mouseleave', onMouseUp);
    el.removeEventListener('contextmenu', onContextMenu);
    
    // Touch events
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
};

const getTouchPosition = (e: MouseEvent, el: HTMLElement): Position | null => {
    // Use actual video size from decoder
    if (!actualVideoSize) return null;
    
    const videoWidth = actualVideoSize.width;
    const videoHeight = actualVideoSize.height;
    
    const rect = el.getBoundingClientRect();
    // Use clientWidth/clientHeight for the actual display size (excluding borders)
    let clientWidth = el.clientWidth || rect.width;
    let clientHeight = el.clientHeight || rect.height;
    
    // Mouse position relative to element
    let touchX = e.clientX - rect.left;
    let touchY = e.clientY - rect.top;
    
    // Handle aspect ratio mismatch between video and displayed canvas
    const eps = 1e5;
    const videoRatio = videoWidth / videoHeight;
    const shouldBe = Math.round(eps * videoRatio);
    const haveNow = Math.round((eps * clientWidth) / clientHeight);
    
    if (shouldBe > haveNow) {
        // Video is wider, there's letterboxing (black bars top/bottom)
        const realHeight = Math.ceil(clientWidth / videoRatio);
        const top = (clientHeight - realHeight) / 2;
        touchY -= top;
        clientHeight = realHeight;
    } else if (shouldBe < haveNow) {
        // Video is taller, there's pillarboxing (black bars left/right)
        const realWidth = Math.ceil(clientHeight * videoRatio);
        const left = (clientWidth - realWidth) / 2;
        touchX -= left;
        clientWidth = realWidth;
    }
    
    // Scale to video coordinates
    const x = (touchX * videoWidth) / clientWidth;
    const y = (touchY * videoHeight) / clientHeight;
    
    console.log('Touch coords debug:', {
        videoWidth, videoHeight,
        clientWidth, clientHeight,
        touchX, touchY,
        finalX: x, finalY: y
    });
    
    return new Position(new Point(x, y), actualVideoSize);
};

const sendTouch = (action: number, e: MouseEvent) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!videoCanvas.value) return;

    const position = getTouchPosition(e, videoCanvas.value);
    if (!position) return;
    
    // Pointer ID 0 for mouse
    // Action: 0=DOWN, 1=UP, 2=MOVE
    const pressure = action === 0 || action === 2 ? 1.0 : 0.0;
    // scrcpy expects MotionEvent.BUTTON_PRIMARY = 1 for primary button
    const buttons = 1; // BUTTON_PRIMARY
    
    const msg = new TouchControlMessage(
        action,
        0, // pointerId
        position,
        pressure,
        buttons
    );
    
    console.log('Sending touch:', msg.toString());
    ws.send(msg.toBuffer());
};

const onMouseDown = (e: MouseEvent) => {
    isMouseDown = true;
    sendTouch(0, e); // ACTION_DOWN
};

const onMouseMove = (e: MouseEvent) => {
    if (!isMouseDown) return;
    sendTouch(2, e); // ACTION_MOVE
};

const onMouseUp = (e: MouseEvent) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    sendTouch(1, e); // ACTION_UP
};

const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Right click = Back
    sendKeyCode(KeyEvent.KEYCODE_BACK);
};

// Touch position helper for Touch objects
const getTouchPositionFromTouch = (touch: Touch, el: HTMLElement): Position | null => {
    // Use actual video size from decoder
    if (!actualVideoSize) return null;
    
    const videoWidth = actualVideoSize.width;
    const videoHeight = actualVideoSize.height;
    
    const rect = el.getBoundingClientRect();
    // Use clientWidth/clientHeight for the actual display size (excluding borders)
    let clientWidth = el.clientWidth || rect.width;
    let clientHeight = el.clientHeight || rect.height;
    
    // Touch position relative to element
    let touchX = touch.clientX - rect.left;
    let touchY = touch.clientY - rect.top;
    
    // Handle aspect ratio mismatch between video and displayed canvas
    const eps = 1e5;
    const videoRatio = videoWidth / videoHeight;
    const shouldBe = Math.round(eps * videoRatio);
    const haveNow = Math.round((eps * clientWidth) / clientHeight);
    
    if (shouldBe > haveNow) {
        // Video is wider, there's letterboxing (black bars top/bottom)
        const realHeight = Math.ceil(clientWidth / videoRatio);
        const top = (clientHeight - realHeight) / 2;
        touchY -= top;
        clientHeight = realHeight;
    } else if (shouldBe < haveNow) {
        // Video is taller, there's pillarboxing (black bars left/right)
        const realWidth = Math.ceil(clientHeight * videoRatio);
        const left = (clientWidth - realWidth) / 2;
        touchX -= left;
        clientWidth = realWidth;
    }
    
    // Scale to video coordinates
    const x = (touchX * videoWidth) / clientWidth;
    const y = (touchY * videoHeight) / clientHeight;
    
    return new Position(new Point(x, y), actualVideoSize);
};

// Send touch from Touch event
const sendTouchFromTouch = (action: number, touch: Touch) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!videoCanvas.value) return;

    const position = getTouchPositionFromTouch(touch, videoCanvas.value);
    if (!position) return;
    
    // Use touch.identifier as pointerId for multi-touch support
    const pressure = action === 0 || action === 2 ? 1.0 : 0.0;
    const buttons = 1; // BUTTON_PRIMARY
    
    const msg = new TouchControlMessage(
        action,
        touch.identifier, // Use touch identifier for multi-touch
        position,
        pressure,
        buttons
    );
    
    console.log('Sending touch (from touch event):', msg.toString());
    ws.send(msg.toBuffer());
};

// Touch event handlers
const onTouchStart = (e: TouchEvent) => {
    e.preventDefault(); // Prevent scrolling and mouse emulation
    isMouseDown = true;
    
    // Handle all changed touches
    for (let i = 0; i < e.changedTouches.length; i++) {
        sendTouchFromTouch(0, e.changedTouches[i]); // ACTION_DOWN
    }
};

const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (!isMouseDown) return;
    
    // Handle all changed touches
    for (let i = 0; i < e.changedTouches.length; i++) {
        sendTouchFromTouch(2, e.changedTouches[i]); // ACTION_MOVE
    }
};

const onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    
    // Handle all changed touches
    for (let i = 0; i < e.changedTouches.length; i++) {
        sendTouchFromTouch(1, e.changedTouches[i]); // ACTION_UP
    }
    
    // Only reset isMouseDown when all touches are released
    if (e.touches.length === 0) {
        isMouseDown = false;
    }
};
const sendKeyCode = (keyCode: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Send key down
    const downMsg = new KeyCodeControlMessage(
        KeyEvent.ACTION_DOWN,
        keyCode,
        0, // repeatCount
        0  // metaState
    );
    ws.send(downMsg.toBuffer());
    
    // Send key up
    const upMsg = new KeyCodeControlMessage(
        KeyEvent.ACTION_UP,
        keyCode,
        0,
        0
    );
    ws.send(upMsg.toBuffer());
};

const addToBuffer = (data: Uint8Array): Uint8Array => {
    let array: Uint8Array;
    if (buffer) {
        array = new Uint8Array(buffer.byteLength + data.byteLength);
        array.set(new Uint8Array(buffer));
        array.set(data, buffer.byteLength);
    } else {
        array = data;
    }
    // @ts-ignore
    buffer = array.buffer;
    return array;
};

const handleVideoData = (data: Uint8Array) => {
    if (!avc) return;
    if (!data || data.length < 5) return;
    
    const type = data[4] & 31;
    const isIDR = type === NALU.IDR;
    
    // Broadway handles SPS/PPS internally usually, but we can verify parsing.
    if (type === NALU.SPS) {
        console.log('Received SPS');
        try {
            const { width, height } = parseSPS(data.subarray(4));
            console.log('Parsed SPS:', width, height);
            // We can init canvas early if we want, or let onPictureDecoded handle it
            // initCanvas(width, height); 
        } catch (e) {
            console.error('Failed to parse SPS', e);
        }
    } else if (type === NALU.PPS) {
        console.log('Received PPS');
    }

    // Broadway expects raw stream with start codes or NALUs.
    // It accumulates buffer internally if needed, but we should feed it complete NALUs or chunks.
    // The implementation in BroadwayPlayer.ts just calls avc.decode(data).
    // So we can feed it directly.
    
    avc.decode(data);
};

const equalArrays = (a: Uint8Array, b: Uint8Array) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const connect = () => {
    // ?action=proxy-adb&remote=tcp%3A8886&udid=10.0.0.47%3A5555
    const wsUrl = new URL('wss://zzz666.top:38169/ws/');
    wsUrl.searchParams.set('action', 'proxy-adb');
    wsUrl.searchParams.set('remote', 'tcp:8886');
    wsUrl.searchParams.set('udid', udid);

    ws = new WebSocket(wsUrl.toString());
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        status.value = 'Connected';
        console.log('Connected to stream');
    };

    ws.onmessage = (event) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
           let bytes = new Uint8Array(data);
           
           // Check magic bytes
           if (!hasInitialInfo && bytes.length >= MAGIC_BYTES_INITIAL.length) {
               const magic = bytes.subarray(0, MAGIC_BYTES_INITIAL.length);
               if (equalArrays(magic, MAGIC_BYTES_INITIAL)) {
                   console.log('Received Initial Info');
                   hasInitialInfo = true;
                   status.value = '握手成功，开始流...';
                   
                   // Initialize Stream with settings - 1080 max dimension works for both orientations
                   currentVideoSettings = new VideoSettings({
                       bitrate: 8000000,
                       maxFps: 60,
                       iFrameInterval: 10,
                       bounds: new Size(1280, 1280), // Max dimension, scrcpy maintains aspect ratio
                       sendFrameMeta: false
                   });
                   
                   const cmd = CommandControlMessage.createSetVideoSettingsCommand(currentVideoSettings);
                   if (ws && ws.readyState === WebSocket.OPEN) {
                       ws.send(cmd.toBuffer());
                   }
                   
                   return;
               }
           }
           
           if (bytes.length >= MAGIC_BYTES_MESSAGE.length) {
               const magic = bytes.subarray(0, MAGIC_BYTES_MESSAGE.length);
               if (equalArrays(magic, MAGIC_BYTES_MESSAGE)) {
                   console.log('Received Device Message');
                   return;
               }
           }
           
           // Assume video
           handleVideoData(bytes);
        }
    };

    ws.onclose = () => {
        status.value = '断开连接';
        hasInitialInfo = false;
    };
    
    ws.onerror = (e) => {
         console.error('Stream error', e);
         status.value = '连接错误: ' + e;
    };
};

onMounted(() => {
    if (videoCanvas.value) {
        bindInputEvents(videoCanvas.value);
    }
    KeyInputHandler.addEventListener(keyHandler);
    window.addEventListener('resize', onWindowResize);
    initDecoder();
    connect();
});

onUnmounted(() => {
    if (videoCanvas.value) {
        unbindInputEvents(videoCanvas.value);
    }
    KeyInputHandler.removeEventListener(keyHandler);
    window.removeEventListener('resize', onWindowResize);
    if (ws) ws.close();
    // Broadway doesn't have an explicit close/destroy method exposed in the wrapper typically,
    // but we can clear references
    avc = null;
    canvas = null;
});
</script>

<style scoped>
.device-control {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.header {
    padding: 10px;
    background: #222;
    color: white;
    display: flex;
    gap: 20px;
    align-items: center;
}
.status-badge {
    font-size: 0.8em;
    padding: 2px 6px;
    border-radius: 4px;
    background: #d32f2f; /* Red for disconnected */
}
.status-badge.connected {
    background: #388e3c; /* Green for connected */
}
.main-content {
    flex: 1;
    display: flex;
    min-height: 0;
}
.viewport {
    flex: 1;
    background: black;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    position: relative;
    padding: 10px;
    box-sizing: border-box;
    min-height: 0; /* Important for flex shrinking */
}
canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
}
.control-panel {
    width: 80px;
    background: #1a1a2e;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px 10px;
    box-sizing: border-box;
}
.control-panel .control-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s ease;
}
.control-panel .control-btn:hover {
    background: rgba(0, 217, 255, 0.2);
    border-color: #00d9ff;
}
.control-panel .control-btn:active {
    transform: scale(0.95);
}
.control-panel .control-btn .icon {
    font-size: 1.5em;
    margin-bottom: 4px;
}
.control-panel .control-btn .label {
    font-size: 0.7em;
    opacity: 0.8;
}
</style>
