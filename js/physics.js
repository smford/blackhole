/**
 * Relativistic Physics Engine & Observer Geodesics
 * 
 * Implements:
 * 1. Schwarzschild metric radial and spiraling null/timelike geodesics.
 * 2. Proper time (tau) vs coordinate time (t) integration.
 * 3. Relativistic velocity (beta = v/c), Lorentz factor (gamma), and gravitational redshift.
 * 4. Tidal tensor calculation (spaghettification strain).
 * 5. Camera trajectory state machine: ORBIT -> INFALL -> HORIZON_CROSSING -> SINGULARITY.
 */

export const SIM_STATES = {
    ORBIT: 'ORBIT',
    INFALL: 'INFALL',
    HORIZON_CROSSING: 'HORIZON_CROSSING',
    SINGULARITY: 'SINGULARITY'
};

export class BlackHolePhysics {
    constructor() {
        // Physical Constants (Normalized: G = 1, c = 1, M = 0.5 -> Rs = 2GM/c^2 = 1.0)
        this.RS = 1.0;          // Schwarzschild radius
        this.M = 0.5 * this.RS;  // Gravitational mass

        // Observer Orbit State (Spherical coordinates)
        this.orbitRadius = 14.5;
        this.initialInfallRadius = 14.5;
        this.azimuth = 0.85;       // Angle in XZ plane (radians)
        this.elevation = 0.26;     // Angle above equatorial plane (~15 degrees)
        this.targetAzimuth = this.azimuth;
        this.targetElevation = this.elevation;
        this.targetOrbitRadius = this.orbitRadius;

        // Infall trajectory parameters
        this.infallAzimuthVelocity = 0.0;

        // Current Cartesian Camera Vectors
        this.camPos = new Float32Array([0, 3.7, 14.0]);
        this.camDir = new Float32Array([0, -0.25, -0.97]);
        this.camUp = new Float32Array([0, 1, 0]);
        this.camVel = new Float32Array([0, 0, 0]); // beta = v/c vector for aberration

        // Infall Kinematics
        this.state = SIM_STATES.ORBIT;
        this.currentR = this.orbitRadius;
        this.infallSpeed = 0.0;
        this.infallProgress = 0.0; // 0.0 at R0, 1.0 at Rs, 1.5 at Singularity
        this.singularityFlash = 0.0;
        this.properTime = 0.0;     // Proper time tau elapsed (seconds)

        // Relativistic Telemetry Metrics
        this.beta = 0.0;           // v / c
        this.gamma = 1.0;          // Lorentz factor 1 / sqrt(1 - beta^2)
        this.redshiftZ = 0.0;      // Gravitational redshift z = 1/sqrt(1 - Rs/r) - 1
        this.tidalForce = 0.0;     // Tidal gravitational gradient ~ 2M / r^3 (in g-units)
        this.timeDilation = 1.0;   // dtau / dt = sqrt(1 - Rs/r)

        // Configuration
        this.freefallRateMultiplier = 1.25; // Speed multiplier for dramatic interactive plunge
        this.isAutoOrbit = true;

        this.updateCameraVectors();
    }

    /**
     * Start gravitational capture / plunge into the black hole.
     */
    triggerInfall() {
        if (this.state !== SIM_STATES.ORBIT) return;
        this.state = SIM_STATES.INFALL;
        this.initialInfallRadius = this.currentR;
        this.infallSpeed = 0.08; // Initial gravitational pull
        this.infallAzimuthVelocity = 0.25; // Conserved angular momentum spiral
        this.singularityFlash = 0.0;
    }

    /**
     * Eject / reset observer safely back to stable orbit.
     */
    resetOrbit() {
        this.state = SIM_STATES.ORBIT;
        this.orbitRadius = 14.5;
        this.targetOrbitRadius = 14.5;
        this.currentR = 14.5;
        this.infallSpeed = 0.0;
        this.infallProgress = 0.0;
        this.singularityFlash = 0.0;
        this.properTime = 0.0;
        this.camVel.fill(0.0);
        this.updateCameraVectors();
    }

    /**
     * Update user-controlled orbital rotation (mouse drag / touch).
     */
    rotateOrbit(deltaAzimuth, deltaElevation) {
        if (this.state === SIM_STATES.SINGULARITY) return;
        
        this.targetAzimuth += deltaAzimuth;
        this.targetElevation += deltaElevation;

        // Clamp elevation to prevent gimbal flipping through poles
        const maxElev = Math.PI * 0.48;
        this.targetElevation = Math.max(-maxElev, Math.min(maxElev, this.targetElevation));
    }

    /**
     * Adjust orbit distance (scroll wheel / pinch).
     */
    zoomOrbit(deltaRadius) {
        if (this.state !== SIM_STATES.ORBIT) return;
        this.targetOrbitRadius = Math.max(3.5, Math.min(26.0, this.targetOrbitRadius + deltaRadius));
    }

    /**
     * Step the relativistic simulation by dt seconds.
     */
    update(dt) {
        const clampedDt = Math.min(dt, 0.066);

        // Smooth orbital mouse damping
        this.azimuth += (this.targetAzimuth - this.azimuth) * 0.12;
        this.elevation += (this.targetElevation - this.elevation) * 0.12;

        if (this.state === SIM_STATES.ORBIT) {
            this.updateOrbitState(clampedDt);
        } else if (this.state === SIM_STATES.INFALL) {
            this.updateInfallState(clampedDt);
        } else if (this.state === SIM_STATES.HORIZON_CROSSING) {
            this.updateHorizonCrossingState(clampedDt);
        } else if (this.state === SIM_STATES.SINGULARITY) {
            this.updateSingularityState(clampedDt);
        }

        this.updateCameraVectors();
        this.computeRelativisticTelemetry();
    }

    updateOrbitState(dt) {
        this.orbitRadius += (this.targetOrbitRadius - this.orbitRadius) * 0.08;
        this.currentR = this.orbitRadius;

        // Subtle Keplerian orbital drift
        if (this.isAutoOrbit) {
            const orbitalAngVel = 0.045 * Math.sqrt(this.M / Math.pow(this.currentR, 1.5));
            this.azimuth += orbitalAngVel * dt;
            this.targetAzimuth = this.azimuth;
        }

        this.camVel.fill(0.0);
        this.beta = 0.0;
        this.infallProgress = 0.0;
    }

    updateInfallState(dt) {
        // Relativistic Timelike Geodesic Infall
        // dr/dtau = - c * sqrt(Rs/r - Rs/R0)
        const rRatio = Math.max(0.01, (this.RS / this.currentR) - (this.RS / this.initialInfallRadius));
        const theoreticalSpeed = Math.sqrt(Math.max(0.008, rRatio)) * 4.2 * this.freefallRateMultiplier;
        
        this.infallSpeed = Math.max(this.infallSpeed, theoreticalSpeed);
        this.currentR -= this.infallSpeed * dt;
        this.properTime += dt;

        // Spiraling infall: angular velocity increases as radius decreases (conservation of L)
        this.azimuth += (this.infallAzimuthVelocity / Math.max(1.0, this.currentR * 0.5)) * dt;
        this.targetAzimuth = this.azimuth;

        // Progress towards Event Horizon [0.0, 1.0]
        this.infallProgress = Math.min(1.0, (this.initialInfallRadius - this.currentR) / (this.initialInfallRadius - this.RS));

        // Relativistic Velocity beta = v/c approaching 0.985 at horizon
        const maxBeta = 0.982;
        this.beta = Math.min(maxBeta, Math.sqrt(Math.max(0.0, 1.0 - this.currentR / this.initialInfallRadius)) * 0.99);
        
        // Direction vector from camera towards black hole center
        const posNorm = Math.hypot(this.camPos[0], this.camPos[1], this.camPos[2]);
        if (posNorm > 0.0001) {
            this.camVel[0] = (-this.camPos[0] / posNorm) * this.beta;
            this.camVel[1] = (-this.camPos[1] / posNorm) * this.beta;
            this.camVel[2] = (-this.camPos[2] / posNorm) * this.beta;
        }

        // Horizon crossing trigger
        if (this.currentR <= this.RS * 1.015) {
            this.state = SIM_STATES.HORIZON_CROSSING;
            this.currentR = this.RS;
        }
    }

    updateHorizonCrossingState(dt) {
        // Inside Event Horizon: inward radial motion is inexorable
        this.currentR -= 1.6 * dt;
        this.properTime += dt;
        this.beta = 0.994;

        this.infallProgress = 1.0 + (this.RS - this.currentR) / this.RS;

        // Flash builds up as singularity approaches
        this.singularityFlash = Math.min(1.0, (this.RS - this.currentR) * 1.6);

        if (this.currentR <= 0.08 * this.RS) {
            this.state = SIM_STATES.SINGULARITY;
            this.currentR = 0.04 * this.RS;
            this.singularityFlash = 1.0;
        }
    }

    updateSingularityState(dt) {
        this.properTime += dt;
        this.singularityFlash = Math.max(0.2, this.singularityFlash - dt * 0.3);
    }

    updateCameraVectors() {
        const cosElev = Math.cos(this.elevation);
        const sinElev = Math.sin(this.elevation);
        const cosAzim = Math.cos(this.azimuth);
        const sinAzim = Math.sin(this.azimuth);

        // Gravitational tidal vibrations (camera shake) during high-speed infall
        let shakeX = 0;
        let shakeY = 0;
        let shakeZ = 0;
        if (this.state === SIM_STATES.INFALL && this.infallProgress > 0.4) {
            const shakeMag = Math.pow(this.infallProgress, 3.0) * 0.045;
            shakeX = (Math.sin(this.properTime * 45.0) + Math.cos(this.properTime * 95.0)) * shakeMag;
            shakeY = (Math.cos(this.properTime * 52.0) + Math.sin(this.properTime * 88.0)) * shakeMag;
            shakeZ = (Math.sin(this.properTime * 63.0)) * shakeMag;
        }

        this.camPos[0] = this.currentR * cosElev * sinAzim + shakeX;
        this.camPos[1] = this.currentR * sinElev + shakeY;
        this.camPos[2] = this.currentR * cosElev * cosAzim + shakeZ;

        // Aim directly at the black hole center
        const dist = Math.hypot(this.camPos[0], this.camPos[1], this.camPos[2]);
        if (dist > 0.0001) {
            this.camDir[0] = -this.camPos[0] / dist;
            this.camDir[1] = -this.camPos[1] / dist;
            this.camDir[2] = -this.camPos[2] / dist;
        }

        // Camera Up vector
        this.camUp[0] = -sinElev * sinAzim;
        this.camUp[1] = cosElev;
        this.camUp[2] = -sinElev * cosAzim;
        
        const upLen = Math.hypot(this.camUp[0], this.camUp[1], this.camUp[2]);
        if (upLen > 0.0001) {
            this.camUp[0] /= upLen;
            this.camUp[1] /= upLen;
            this.camUp[2] /= upLen;
        }
    }

    computeRelativisticTelemetry() {
        const betaSq = Math.min(0.996, this.beta * this.beta);
        this.gamma = 1.0 / Math.sqrt(1.0 - betaSq);

        if (this.currentR > this.RS * 1.001) {
            this.timeDilation = Math.sqrt(1.0 - this.RS / this.currentR);
            this.redshiftZ = (1.0 / this.timeDilation) - 1.0;
        } else {
            this.timeDilation = 0.0;
            this.redshiftZ = 999.9;
        }

        const rSafe = Math.max(0.08, this.currentR);
        this.tidalForce = (2.0 * this.M) / (rSafe * rSafe * rSafe) * 8.5;
    }
}
