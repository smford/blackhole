/**
 * Relativistic Web Audio Synthesizer
 * 
 * Generates an immersive, procedural deep-space soundscape using the Web Audio API:
 * 1. Binaural sub-bass gravitational drone (detuned fundamental frequencies).
 * 2. Accretion disk matter turbulence (filtered noise modulated by Keplerian speed).
 * 3. Relativistic infall acceleration rumble with Doppler pitch ascent.
 * 4. Event horizon crossing sub-bass boom & singularity distortion.
 * 
 * 100% procedural: zero external audio files, zero network latency, zero 404s.
 */

export class CosmicAudioEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = true; // Safe default respecting autoplay policy
        this.isInitialized = false;

        // Master Volume
        this.masterGain = null;

        // Drone Nodes
        this.droneOsc1 = null;
        this.droneOsc2 = null;
        this.droneFilter = null;
        this.droneGain = null;

        // Accretion Noise Nodes
        this.noiseNode = null;
        this.noiseFilter = null;
        this.noiseGain = null;

        // Infall Engine Nodes
        this.infallOsc = null;
        this.infallGain = null;
        this.infallFilter = null;
    }

    /**
     * Initialize Web Audio context on user gesture.
     */
    init() {
        if (this.isInitialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Master Gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.75, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            this.setupDeepSpaceDrone();
            this.setupAccretionNoise();
            this.setupInfallSynthesizer();

            this.isInitialized = true;
        } catch (err) {
            console.warn('[AudioEngine] Web Audio not supported or blocked:', err);
        }
    }

    setupDeepSpaceDrone() {
        // Binaural sub-bass drone (43.65 Hz & 44.15 Hz for subtle gravitational beat)
        this.droneOsc1 = this.ctx.createOscillator();
        this.droneOsc2 = this.ctx.createOscillator();
        this.droneOsc1.type = 'sine';
        this.droneOsc2.type = 'sine';
        this.droneOsc1.frequency.setValueAtTime(43.65, this.ctx.currentTime);
        this.droneOsc2.frequency.setValueAtTime(44.20, this.ctx.currentTime);

        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.setValueAtTime(120, this.ctx.currentTime);
        this.droneFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.setValueAtTime(0.45, this.ctx.currentTime);

        this.droneOsc1.connect(this.droneFilter);
        this.droneOsc2.connect(this.droneFilter);
        this.droneFilter.connect(this.droneGain);
        this.droneGain.connect(this.masterGain);

        this.droneOsc1.start();
        this.droneOsc2.start();
    }

    setupAccretionNoise() {
        // Generate 3 seconds of looped pink/brown noise for swirling accretion matter
        const bufferSize = this.ctx.sampleRate * 3;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Brown noise one-pole filter integration
            lastOut = (lastOut + 0.025 * white) / 1.02;
            output[i] = lastOut * 3.5;
        }

        this.noiseNode = this.ctx.createBufferSource();
        this.noiseNode.buffer = noiseBuffer;
        this.noiseNode.loop = true;

        this.noiseFilter = this.ctx.createBiquadFilter();
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.setValueAtTime(260, this.ctx.currentTime);
        this.noiseFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

        this.noiseNode.connect(this.noiseFilter);
        this.noiseFilter.connect(this.noiseGain);
        this.noiseGain.connect(this.masterGain);

        this.noiseNode.start();
    }

    setupInfallSynthesizer() {
        // Synthesizer for gravitational plunge & acceleration Doppler shift
        this.infallOsc = this.ctx.createOscillator();
        this.infallOsc.type = 'sawtooth';
        this.infallOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

        this.infallFilter = this.ctx.createBiquadFilter();
        this.infallFilter.type = 'lowpass';
        this.infallFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
        this.infallFilter.Q.setValueAtTime(5.0, this.ctx.currentTime);

        this.infallGain = this.ctx.createGain();
        this.infallGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Silent until infall triggered

        this.infallOsc.connect(this.infallFilter);
        this.infallFilter.connect(this.infallGain);
        this.infallGain.connect(this.masterGain);

        this.infallOsc.start();
    }

    /**
     * Play seismic Event Horizon impact pulse.
     */
    triggerHorizonCrossingPulse() {
        if (!this.isInitialized || this.isMuted) return;

        const now = this.ctx.currentTime;
        const boomOsc = this.ctx.createOscillator();
        const boomGain = this.ctx.createGain();
        const boomFilter = this.ctx.createBiquadFilter();

        boomOsc.type = 'sine';
        boomOsc.frequency.setValueAtTime(110, now);
        // Exponential pitch drop to deep sub-bass
        boomOsc.frequency.exponentialRampToValueAtTime(18, now + 1.8);

        boomFilter.type = 'lowpass';
        boomFilter.frequency.setValueAtTime(160, now);

        boomGain.gain.setValueAtTime(0.85, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

        boomOsc.connect(boomFilter);
        boomFilter.connect(boomGain);
        boomGain.connect(this.masterGain);

        boomOsc.start(now);
        boomOsc.stop(now + 2.6);
    }

    /**
     * Dynamically modulate audio parameters based on relativistic physics state.
     */
    update(physics) {
        if (!this.isInitialized || this.isMuted) return;

        const now = this.ctx.currentTime;
        const { currentR, beta, state, infallProgress } = physics;

        // Modulate drone frequency and resonance as distance changes
        const droneCutoff = Math.max(60, Math.min(650, 60 + (16.0 - currentR) * 35));
        this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.08);

        if (state === 'INFALL' || state === 'HORIZON_CROSSING') {
            // Ramp up infall oscillator volume and pitch as beta increases
            const targetGain = 0.15 + 0.45 * Math.pow(infallProgress, 1.8);
            this.infallGain.gain.setTargetAtTime(targetGain, now, 0.05);

            // Relativistic Doppler climb (55Hz -> 280Hz)
            const targetFreq = 55 + 240 * Math.pow(beta, 2.0);
            this.infallOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);

            // Filter opens with speed
            this.infallFilter.frequency.setTargetAtTime(120 + 800 * beta, now, 0.05);
        } else {
            // Fade out infall engine smoothly
            this.infallGain.gain.setTargetAtTime(0.0, now, 0.2);
            this.infallOsc.frequency.setTargetAtTime(55, now, 0.2);
        }
    }

    /**
     * Toggle sound on/off with soft ramps (prevent clicks).
     */
    toggleMute() {
        this.init();
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            const now = this.ctx.currentTime;
            const target = this.isMuted ? 0.0 : 0.75;
            this.masterGain.gain.setTargetAtTime(target, now, 0.08);
        }
        return !this.isMuted;
    }
}
