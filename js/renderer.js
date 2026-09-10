/**
 * WebGL 2.0 Relativistic Renderer
 * 
 * Production features:
 * 1. Fullscreen quad raymarching pipeline with GLSL ES 3.00.
 * 2. Dynamic Resolution Scaling (DRS) to ensure sustained 60 FPS.
 * 3. Robust WebGL Context Loss and Restoration lifecycle.
 * 4. High-DPI support with frame budget limiter.
 */

import { vertexShaderSource, fragmentShaderSource } from './shaders.js';

export class BlackHoleRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.vao = null;
        this.uniforms = {};

        // Dynamic Resolution Scaling (DRS) parameters
        this.drsScale = 1.0;
        this.minDrsScale = 0.55;
        this.maxDrsScale = 1.0;
        this.frameTimeHistory = [];
        this.historySize = 30;
        this.warmupFrames = 60; // Ignore cold start frames for DRS scaling

        // Display configuration
        this.maxPixelRatio = 1.5; // Cap pixel ratio to preserve GPU fillrate
        this.diskIntensity = 1.0;
        this.lensingStrength = 1.0;
        this.fov = 68.0;

        this.initWebGL();
        this.setupContextLossHandling();
    }

    initWebGL() {
        const glOptions = {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false
        };

        this.gl = this.canvas.getContext('webgl2', glOptions);
        if (!this.gl) {
            throw new Error('WebGL 2.0 is not supported on this device/browser.');
        }

        this.compileAndLinkProgram();
        this.setupQuadGeometry();
        this.cacheUniformLocations();
        this.resize();
    }

    compileShader(source, type) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed (${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'}):\n${info}`);
        }
        return shader;
    }

    compileAndLinkProgram() {
        const gl = this.gl;
        const vert = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        const frag = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Program link failed: ${info}`);
        }

        gl.deleteShader(vert);
        gl.deleteShader(frag);

        this.program = program;
        gl.useProgram(this.program);
    }

    setupQuadGeometry() {
        const gl = this.gl;
        
        // Single oversized triangle covering [-1, 1] clip space
        // More efficient than 2-triangle quad (no diagonal seam, fewer vertex ops)
        const vertices = new Float32Array([
            -1.0, -1.0,
             3.0, -1.0,
            -1.0,  3.0
        ]);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const posAttr = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(posAttr);
        gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
    }

    cacheUniformLocations() {
        const gl = this.gl;
        const names = [
            'u_resolution',
            'u_time',
            'u_cam_pos',
            'u_cam_dir',
            'u_cam_up',
            'u_cam_vel',
            'u_fov',
            'u_disk_intensity',
            'u_lensing_strength',
            'u_infall_progress',
            'u_singularity_flash'
        ];

        names.forEach(name => {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        });
    }

    setupContextLossHandling() {
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[Renderer] WebGL Context Lost! Pausing render pipeline.');
        }, false);

        this.canvas.addEventListener('webglcontextrestored', () => {
            console.log('[Renderer] WebGL Context Restored! Reinitializing shaders and buffers.');
            this.initWebGL();
        }, false);
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1.0, this.maxPixelRatio);
        const displayWidth = Math.floor(this.canvas.clientWidth * dpr * this.drsScale);
        const displayHeight = Math.floor(this.canvas.clientHeight * dpr * this.drsScale);

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = Math.max(1, displayWidth);
            this.canvas.height = Math.max(1, displayHeight);
        }

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Dynamic Resolution Scaling (DRS) monitor: adjusts internal buffer size to maintain 60 FPS.
     */
    monitorPerformance(frameTimeMs) {
        if (this.warmupFrames > 0) {
            this.warmupFrames--;
            return;
        }

        this.frameTimeHistory.push(frameTimeMs);
        if (this.frameTimeHistory.length > this.historySize) {
            this.frameTimeHistory.shift();
        }

        if (this.frameTimeHistory.length === this.historySize) {
            const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.historySize;
            
            // If frame time exceeds ~19ms (< 52 FPS), downscale resolution gradually
            if (avgFrameTime > 19.0 && this.drsScale > this.minDrsScale) {
                this.drsScale = Math.max(this.minDrsScale, this.drsScale - 0.05);
                this.resize();
                this.frameTimeHistory = [];
            }
            // If frame time is well within budget (< 13ms), upscale back towards 1.0
            else if (avgFrameTime < 13.0 && this.drsScale < this.maxDrsScale) {
                this.drsScale = Math.min(this.maxDrsScale, this.drsScale + 0.05);
                this.resize();
                this.frameTimeHistory = [];
            }
        }
    }

    /**
     * Render a single frame with updated physics state.
     */
    render(elapsedTime, physics, frameDeltaMs) {
        if (!this.gl || !this.program) return;

        this.monitorPerformance(frameDeltaMs);

        const gl = this.gl;
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Upload uniforms
        gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.u_time, elapsedTime);
        gl.uniform3fv(this.uniforms.u_cam_pos, physics.camPos);
        gl.uniform3fv(this.uniforms.u_cam_dir, physics.camDir);
        gl.uniform3fv(this.uniforms.u_cam_up, physics.camUp);
        gl.uniform3fv(this.uniforms.u_cam_vel, physics.camVel);
        gl.uniform1f(this.uniforms.u_fov, this.fov);
        gl.uniform1f(this.uniforms.u_disk_intensity, this.diskIntensity);
        gl.uniform1f(this.uniforms.u_lensing_strength, this.lensingStrength);
        gl.uniform1f(this.uniforms.u_infall_progress, physics.infallProgress);
        gl.uniform1f(this.uniforms.u_singularity_flash, physics.singularityFlash);

        // Render full screen triangle
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }
}
