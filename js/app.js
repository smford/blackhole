/**
 * Main Application Lifecycle Orchestrator
 * 
 * Integrates:
 * 1. WebGL 2 Renderer
 * 2. Relativistic Geodesics Physics Engine
 * 3. Procedural Web Audio Engine
 * 4. DOM Telemetry & Interaction Event Handlers
 * 5. Page Visibility & Battery Conservation Protocols
 */

import { BlackHoleRenderer } from './renderer.js';
import { BlackHolePhysics, SIM_STATES } from './physics.js';
import { CosmicAudioEngine } from './audio.js';

class BlackHoleApp {
    constructor() {
        this.canvas = document.getElementById('gl-canvas');
        this.container = document.getElementById('canvas-container');

        // Core Components
        this.renderer = null;
        this.physics = null;
        this.audio = null;

        // Interaction State
        this.isPointerDown = false;
        this.pointerStartX = 0;
        this.pointerStartY = 0;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.pointerDragDistance = 0;
        this.dragThreshold = 6; // Pixels to distinguish click from drag

        // Animation Loop State
        this.animFrameId = null;
        this.lastFrameTime = performance.now();
        this.startTime = performance.now();
        this.isPaused = false;

        // Telemetry DOM Cache
        this.dom = {
            hudOverlay: document.getElementById('hud-overlay'),
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            valDist: document.getElementById('val-dist'),
            valVel: document.getElementById('val-vel'),
            valGamma: document.getElementById('val-gamma'),
            valRedshift: document.getElementById('val-redshift'),
            valTau: document.getElementById('val-tau'),
            valDilation: document.getElementById('val-dilation'),
            valTidal: document.getElementById('val-tidal'),
            valFps: document.getElementById('val-fps'),
            prompt: document.getElementById('interactive-prompt'),
            btnAudio: document.getElementById('btn-audio'),
            audioIcon: document.getElementById('audio-icon'),
            audioText: document.getElementById('audio-text'),
            btnReset: document.getElementById('btn-reset'),
            btnHud: document.getElementById('btn-hud'),
            btnSettings: document.getElementById('btn-settings'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            singularityModal: document.getElementById('singularity-modal'),
            btnReenter: document.getElementById('btn-reenter'),
            settingsDrawer: document.getElementById('settings-drawer'),
            btnCloseSettings: document.getElementById('btn-close-settings'),
            sliderDisk: document.getElementById('slider-disk'),
            labelDisk: document.getElementById('label-disk'),
            sliderLensing: document.getElementById('slider-lensing'),
            labelLensing: document.getElementById('label-lensing'),
            sliderSpeed: document.getElementById('slider-speed'),
            labelSpeed: document.getElementById('label-speed'),
            sliderFov: document.getElementById('slider-fov'),
            labelFov: document.getElementById('label-fov')
        };

        // Telemetry Update Throttle (10 Hz updates to prevent DOM thrashing)
        this.lastTelemetryUpdate = 0;
        this.telemetryInterval = 100; // ms

        this.lastState = null;

        this.init();
    }

    init() {
        try {
            this.renderer = new BlackHoleRenderer(this.canvas);
            this.physics = new BlackHolePhysics();
            this.audio = new CosmicAudioEngine();

            this.setupEventListeners();
            this.setupUIBindings();
            this.startAnimationLoop();

            console.log('[Chandra-X] Black Hole Simulation initialized successfully.');
        } catch (err) {
            console.error('[Chandra-X] Initialization failure:', err);
            this.showFallbackMessage(err.message);
        }
    }

    setupEventListeners() {
        // Window Resize
        window.addEventListener('resize', () => {
            if (this.renderer) this.renderer.resize();
        });

        // Page Visibility API (Conserve CPU/GPU battery when tab is backgrounded)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isPaused = true;
                if (this.animFrameId) {
                    cancelAnimationFrame(this.animFrameId);
                    this.animFrameId = null;
                }
            } else {
                this.isPaused = false;
                this.lastFrameTime = performance.now();
                this.startAnimationLoop();
            }
        });

        // Unified Pointer Events (Mouse, Touch, Pen) with Pointer Capture
        const container = this.container;

        container.addEventListener('pointerdown', (e) => {
            // Only primary mouse button or touch
            if (e.button !== 0 && e.pointerType === 'mouse') return;

            this.isPointerDown = true;
            this.pointerStartX = e.clientX;
            this.pointerStartY = e.clientY;
            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;
            this.pointerDragDistance = 0;
            container.classList.add('grabbing');

            try {
                container.setPointerCapture(e.pointerId);
            } catch (err) {}
        });

        container.addEventListener('pointermove', (e) => {
            if (!this.isPointerDown) return;

            const dx = e.clientX - this.lastPointerX;
            const dy = e.clientY - this.lastPointerY;
            this.pointerDragDistance += Math.hypot(dx, dy);

            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;

            // Sensitivity scaling
            const rotSpeed = 0.0045;
            this.physics.rotateOrbit(-dx * rotSpeed, dy * rotSpeed);
        });

        const onPointerEnd = (e) => {
            if (!this.isPointerDown) return;
            this.isPointerDown = false;
            container.classList.remove('grabbing');

            try {
                if (container.hasPointerCapture(e.pointerId)) {
                    container.releasePointerCapture(e.pointerId);
                }
            } catch (err) {}

            // If pointer didn't travel significantly, it is a deliberate CLICK!
            if (this.pointerDragDistance < this.dragThreshold) {
                this.handleBackgroundClick();
            }
        };

        container.addEventListener('pointerup', onPointerEnd);
        container.addEventListener('pointercancel', onPointerEnd);

        // Zoom via Scroll Wheel
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY * 0.012;
            this.physics.zoomOrbit(zoomDelta);
        }, { passive: false });

        // Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                this.handleBackgroundClick();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleAudio();
            } else if (e.key === 'h' || e.key === 'H') {
                this.toggleHUD();
            } else if (e.key === 'f' || e.key === 'F') {
                this.toggleFullscreen();
            } else if (e.key === 'Escape') {
                this.dom.settingsDrawer.classList.remove('open');
            }
        });
    }

    setupUIBindings() {
        const dom = this.dom;

        // Prompt Banner Click
        dom.prompt.addEventListener('click', () => {
            this.handleBackgroundClick();
        });

        // Audio Button
        dom.btnAudio.addEventListener('click', () => {
            this.toggleAudio();
        });

        // Reset Orbit Button
        dom.btnReset.addEventListener('click', () => {
            this.resetOrbit();
        });

        // Toggle HUD Button
        dom.btnHud.addEventListener('click', () => {
            this.toggleHUD();
        });

        // Fullscreen Button
        dom.btnFullscreen.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Singularity Re-enter Button
        dom.btnReenter.addEventListener('click', () => {
            this.resetOrbit();
        });

        // Settings Drawer Toggle
        dom.btnSettings.addEventListener('click', () => {
            dom.settingsDrawer.classList.toggle('open');
        });
        dom.btnCloseSettings.addEventListener('click', () => {
            dom.settingsDrawer.classList.remove('open');
        });

        // Settings Sliders
        dom.sliderDisk.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.renderer.diskIntensity = val;
            dom.labelDisk.textContent = `${val.toFixed(2)}x`;
        });

        dom.sliderLensing.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.renderer.lensingStrength = val;
            dom.labelLensing.textContent = `${val.toFixed(2)}x`;
        });

        dom.sliderSpeed.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.physics.freefallRateMultiplier = val;
            dom.labelSpeed.textContent = `${val.toFixed(2)}x`;
        });

        dom.sliderFov.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.renderer.fov = val;
            dom.labelFov.textContent = `${Math.round(val)}°`;
        });
    }

    handleBackgroundClick() {
        // First click unlocks Web Audio if browser was waiting for interaction
        this.audio.init();

        if (this.physics.state === SIM_STATES.ORBIT) {
            // Trigger relativistic plunge!
            this.physics.triggerInfall();
            this.dom.prompt.textContent = "GRAVITATIONAL CAPTURE IN PROGRESS...";
            this.dom.prompt.style.animation = "none";
        } else if (this.physics.state === SIM_STATES.SINGULARITY) {
            this.resetOrbit();
        }
    }

    resetOrbit() {
        this.physics.resetOrbit();
        this.dom.prompt.textContent = "CLICK ANYWHERE TO INITIATE FREE-FALL PLUNGE";
        this.dom.prompt.style.animation = "glow-pulse 2.5s infinite";
        this.dom.singularityModal.classList.remove('visible');
    }

    toggleAudio() {
        const isUnmuted = this.audio.toggleMute();
        this.dom.audioIcon.textContent = isUnmuted ? "🔊" : "🔇";
        this.dom.audioText.textContent = isUnmuted ? "SOUND: ON" : "SOUND: OFF";
    }

    toggleHUD() {
        this.dom.hudOverlay.classList.toggle('hidden');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    startAnimationLoop() {
        const loop = (now) => {
            if (this.isPaused) return;

            const frameDeltaMs = now - this.lastFrameTime;
            const dt = Math.min(frameDeltaMs / 1000, 0.1);
            this.lastFrameTime = now;
            const elapsedTime = (now - this.startTime) / 1000;

            // 1. Advance Physics Geodesics
            this.physics.update(dt);

            // 2. State Change Audio & UI Triggers
            if (this.physics.state !== this.lastState) {
                this.handleStateTransition(this.physics.state);
                this.lastState = this.physics.state;
            }

            // 3. Modulate Audio Synthesizer
            this.audio.update(this.physics);

            // 4. Render Relativistic Spacetime Frame
            this.renderer.render(elapsedTime, this.physics, frameDeltaMs);

            // 5. Update Telemetry Dashboard
            if (now - this.lastTelemetryUpdate > this.telemetryInterval) {
                this.updateTelemetryHUD(frameDeltaMs);
                this.lastTelemetryUpdate = now;
            }

            this.animFrameId = requestAnimationFrame(loop);
        };

        this.animFrameId = requestAnimationFrame(loop);
    }

    handleStateTransition(newState) {
        const dom = this.dom;

        switch (newState) {
            case SIM_STATES.ORBIT:
                dom.statusDot.className = 'status-dot';
                dom.statusText.textContent = 'ORBITING [STABLE]';
                dom.btnReset.textContent = 'RESET ORBIT';
                dom.singularityModal.classList.remove('visible');
                break;

            case SIM_STATES.INFALL:
                dom.statusDot.className = 'status-dot infall';
                dom.statusText.textContent = 'FREEFALL [CAPTURED]';
                dom.btnReset.textContent = 'ABORT PLUNGE';
                break;

            case SIM_STATES.HORIZON_CROSSING:
                dom.statusDot.className = 'status-dot danger';
                dom.statusText.textContent = 'HORIZON BREACH';
                this.audio.triggerHorizonCrossingPulse();
                break;

            case SIM_STATES.SINGULARITY:
                dom.statusDot.className = 'status-dot danger';
                dom.statusText.textContent = 'SINGULARITY COLLAPSE';
                setTimeout(() => {
                    if (this.physics.state === SIM_STATES.SINGULARITY) {
                        dom.singularityModal.classList.add('visible');
                    }
                }, 800);
                break;
        }
    }

    updateTelemetryHUD(frameDeltaMs) {
        const p = this.physics;
        const dom = this.dom;

        // Metrics
        dom.valDist.textContent = `${p.currentR.toFixed(2)} rs`;
        dom.valVel.textContent = `${p.beta.toFixed(3)} c`;
        dom.valGamma.textContent = p.gamma > 50 ? '> 50.0' : p.gamma.toFixed(3);
        dom.valRedshift.textContent = p.redshiftZ > 100 ? 'INF (HORIZON)' : `+${p.redshiftZ.toFixed(3)}`;
        dom.valTau.textContent = `${p.properTime.toFixed(2)} s`;
        dom.valDilation.textContent = p.timeDilation.toFixed(3);
        dom.valTidal.textContent = p.tidalForce > 100 ? '> 100 g' : `${p.tidalForce.toFixed(3)} g`;

        // Color highlighting on extreme states
        if (p.currentR <= 2.5) {
            dom.valDist.className = 'metric-value danger';
            dom.valVel.className = 'metric-value danger';
        } else if (p.currentR <= 6.0) {
            dom.valDist.className = 'metric-value warning';
            dom.valVel.className = 'metric-value warning';
        } else {
            dom.valDist.className = 'metric-value highlight';
            dom.valVel.className = 'metric-value';
        }

        // Performance & DRS metrics
        const fps = Math.round(1000 / Math.max(frameDeltaMs, 1));
        const drsPct = Math.round(this.renderer.drsScale * 100);
        dom.valFps.textContent = `${fps} FPS (${drsPct}%)`;
    }

    showFallbackMessage(errorMsg) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #111; color: #f85149; border: 1px solid #f85149;
            padding: 24px; font-family: monospace; text-align: center; border-radius: 8px;
            max-width: 480px; z-index: 1000;
        `;
        errDiv.innerHTML = `<h3>WebGL 2.0 Initialization Error</h3><p style="margin-top: 10px; font-size: 12px; color: #ccc;">${errorMsg}</p>`;
        document.body.appendChild(errDiv);
    }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    new BlackHoleApp();
});
