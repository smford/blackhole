/**
 * Relativistic Black Hole GLSL Shaders (WebGL 2.0 / GLSL ES 3.00)
 * 
 * Implements:
 * 1. Curved null-geodesic raymarching in Schwarzschild spacetime.
 * 2. Relativistic aberration for high-velocity observers (Lorentz transform of incoming rays).
 * 3. Optically thin / semi-transparent Keplerian accretion disk with differential rotation.
 * 4. Relativistic Doppler boosting (D^4 beaming) and gravitational redshift.
 * 5. Primary, secondary, and tertiary lensed images (photon ring formation).
 * 6. High-fidelity procedural cosmic starfield on pure obsidian black space.
 * 7. Infall singularity collapse transition effects.
 */

export const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Uniforms
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cam_pos;
uniform vec3 u_cam_dir;
uniform vec3 u_cam_up;
uniform vec3 u_cam_vel;            // Observer velocity vector beta = v/c
uniform float u_fov;
uniform float u_disk_intensity;
uniform float u_lensing_strength;
uniform float u_infall_progress;    // 0.0 = safe orbit, 1.0 = event horizon, >1.0 = singularity
uniform float u_singularity_flash;  // Flash intensity on singularity impact

// Physical constants (normalized: G = c = 1, M = 0.5 -> Rs = 1.0)
const float RS = 1.0;              // Schwarzschild radius Rs = 2GM/c^2
const float M = 0.5;               // Gravitational Mass of black hole
const float DISK_R_IN = 1.6 * RS;   // Innermost boundary (near ISCO / photon sphere)
const float DISK_R_OUT = 7.2 * RS;  // Outer boundary of luminous accretion disk
const float ESCAPE_R = 30.0;       // Escape boundary to deep celestial sphere
const int MAX_STEPS = 128;
const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;

// Pseudo-random hash functions
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 2D Noise for accretion disk turbulence
float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

// Fractional Brownian Motion for accretion gas structures
float fbmDisk(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
        v += a * noise2D(p);
        p = rot * p * 2.18;
        a *= 0.46;
    }
    return v;
}

// Star temperature to realistic RGB blackbody color
vec3 starColor(float temp) {
    // 0.0 = cool reddish M-dwarf, 0.5 = solar G-type white/yellow, 1.0 = brilliant O/B blue-white
    vec3 col = mix(vec3(1.0, 0.4, 0.15), vec3(1.0, 0.96, 0.90), smoothstep(0.0, 0.45, temp));
    col = mix(col, vec3(0.65, 0.84, 1.0), smoothstep(0.45, 1.0, temp));
    return col;
}

// Deep space background: pure inky black space, crisp pinpoint stars & subtle Milky Way band
vec3 renderSky(vec3 dir, float dopplerSkyShift) {
    // Milky Way galactic coordinate tilt
    vec3 mwDir = vec3(
        dir.x * 0.866 - dir.y * 0.5,
        dir.x * 0.5 + dir.y * 0.866,
        dir.z
    );
    
    // Subtle Milky Way dust band (fades to pure zero black outside the plane)
    float galacticLat = abs(mwDir.y);
    float mwBand = exp(-galacticLat * 14.0); // Tight, clean galactic plane
    float mwDust = fbmDisk(mwDir.xz * 3.5 + vec2(1.2, 4.3));
    float mwGlow = mwBand * smoothstep(0.2, 0.85, mwDust);
    vec3 mwColor = vec3(0.06, 0.045, 0.035) * mwGlow * 1.8;

    // Razor-sharp Pinpoint Stars on Pure Black Background
    vec3 starCol = vec3(0.0);
    
    // 1. Dense fine background stars
    vec3 p1 = dir * 280.0;
    vec3 id1 = floor(p1);
    vec3 f1 = fract(p1) - 0.5;
    float h1 = hash3(id1);
    if (h1 > 0.86) {
        float d = length(f1);
        float brightness = pow(hash3(id1 + 1.1), 14.0) * 2.8;
        vec3 col = starColor(hash3(id1 + 2.3));
        starCol += col * brightness * smoothstep(0.35, 0.0, d);
    }

    // 2. Medium stars
    vec3 p2 = dir * 120.0;
    vec3 id2 = floor(p2);
    vec3 f2 = fract(p2) - 0.5;
    float h2 = hash3(id2 + 5.7);
    if (h2 > 0.93) {
        float d = length(f2);
        float brightness = pow(hash3(id2 + 3.2), 7.0) * 3.5;
        vec3 col = starColor(hash3(id2 + 4.9));
        starCol += col * brightness * exp(-d * 18.0);
    }

    // 3. Occasional prominent bright stars with 4-point diffraction spikes
    vec3 p3 = dir * 38.0;
    vec3 id3 = floor(p3);
    vec3 f3 = fract(p3) - 0.5;
    float h3 = hash3(id3 + 9.3);
    if (h3 > 0.972) {
        float d = length(f3);
        float brightness = pow(hash3(id3 + 7.1), 3.5) * 4.2;
        vec3 col = starColor(hash3(id3 + 8.4));
        float core = exp(-d * 20.0);
        float spikes = (exp(-abs(f3.x) * 45.0) * exp(-abs(f3.y) * 4.0) +
                        exp(-abs(f3.y) * 45.0) * exp(-abs(f3.x) * 4.0)) * 0.4;
        starCol += col * brightness * (core + spikes);
    }

    vec3 sky = mwColor + starCol;
    
    // Relativistic Doppler sky shift
    sky *= dopplerSkyShift;
    return sky;
}

// Accretion disk emission profile and Doppler boosting
vec4 sampleDisk(vec3 pos, vec3 rayDir) {
    float r = length(pos.xz);
    if (r < DISK_R_IN || r > DISK_R_OUT) return vec4(0.0);

    // Normalized radial parameter [0, 1]
    float rNorm = (r - DISK_R_IN) / (DISK_R_OUT - DISK_R_IN);

    // Keplerian orbital velocity in equatorial plane: v = sqrt(M / r)
    float vOrb = sqrt(M / r);
    // Tangential unit vector (counter-clockwise rotation in XZ plane)
    vec3 vTangential = normalize(vec3(-pos.z, 0.0, pos.x));

    // Relativistic Doppler beaming:
    // Ray travels along rayDir, so photons arrived along -rayDir
    float cosTheta = dot(vTangential, -rayDir);
    float gamma = 1.0 / sqrt(max(0.001, 1.0 - vOrb * vOrb));
    // Doppler shift factor D = 1 / (gamma * (1 - v * cosTheta))
    float doppler = 1.0 / (gamma * (1.0 - vOrb * cosTheta));
    // Gravitational redshift: g = sqrt(1 - Rs / r)
    float gGrav = sqrt(max(0.01, 1.0 - RS / r));
    float netShift = gGrav * doppler;

    // Relativistic beaming power (I_obs = I_emit * (netShift)^3.8)
    float beaming = pow(netShift, 3.8);

    // Dynamic spiral matter texture: differential Keplerian rotation
    // Angular velocity omega = sqrt(M / r^3)
    float omega = sqrt(M / (r * r * r));
    float angle = atan(pos.z, pos.x);
    // Differential shear over time
    float rotAngle = angle - omega * u_time * 1.6;
    
    // Fine wispy matter filaments and spiral density waves
    float fineTurbulence = fbmDisk(vec2(rotAngle * 2.8, r * 1.6));
    float spiral1 = sin(4.0 * rotAngle + 4.5 * log(r));
    float spiral2 = sin(8.0 * rotAngle - 3.2 * log(r) + fineTurbulence * 2.5);
    float filaments = smoothstep(-0.4, 0.75, spiral1 * 0.6 + spiral2 * 0.4);
    float matterDensity = mix(0.35, 1.0, fineTurbulence) * (0.55 + 0.45 * filaments);

    // Radial temperature & intensity profile
    // Peaks near 2.2 - 2.8 Rs, sharp cutoff inside ISCO, soft fade at outer rim
    float radialProfile = smoothstep(DISK_R_IN, DISK_R_IN + 0.35, r) * 
                         pow(1.0 - rNorm, 1.25) * 
                         (1.0 - smoothstep(DISK_R_OUT - 1.4, DISK_R_OUT, r));

    // Base temperature color gradient
    // Inner disk: searing white-cyan-gold (~25,000K)
    // Mid disk: brilliant golden-amber (~7,000K)
    // Outer disk: deep ruby-crimson / smoky infrared (~2,500K)
    vec3 innerCol = vec3(0.96, 0.97, 1.0);
    vec3 midCol   = vec3(1.0, 0.62, 0.18);
    vec3 outerCol = vec3(0.85, 0.18, 0.04);

    vec3 baseColor = mix(innerCol, midCol, smoothstep(0.0, 0.3, rNorm));
    baseColor = mix(baseColor, outerCol, smoothstep(0.3, 1.0, rNorm));

    // Apply Doppler chromatic shift:
    // Approaching side (blue-shifted): electric blue-white
    // Receding side (red-shifted): dark amber-red
    vec3 dopplerCol = mix(vec3(0.55, 0.82, 1.0), vec3(1.0, 0.28, 0.08), smoothstep(1.25, 0.75, netShift));
    vec3 finalColor = baseColor * dopplerCol * beaming * matterDensity * radialProfile * 3.8;

    // Optical density / alpha
    float alpha = clamp(radialProfile * matterDensity * 0.88 * u_disk_intensity, 0.0, 0.98);

    return vec4(finalColor, alpha);
}

// Relativistic Aberration (Lorentz transformation of photon directions)
// As observer approaches speed of light beta = v/c:
// Incoming photon angle theta transforms as cos(theta') = (cos(theta) - beta) / (1 - beta * cos(theta))
vec3 applyRelativisticAberration(vec3 rayDir, vec3 beta) {
    float betaMag = length(beta);
    if (betaMag < 0.0001) return rayDir;
    
    // Cap beta safely below 1.0 to prevent numerical singularity
    betaMag = min(betaMag, 0.998);
    vec3 betaDir = beta / betaMag;
    float gamma = 1.0 / sqrt(1.0 - betaMag * betaMag);
    
    // Incoming ray towards observer
    vec3 n = -rayDir;
    float nDotBeta = dot(n, betaDir);
    
    // Lorentz transformed incoming ray
    float denom = gamma * (1.0 + betaMag * nDotBeta);
    vec3 nPrime = (n + ((gamma - 1.0) * nDotBeta + gamma * betaMag) * betaDir) / denom;
    
    return -normalize(nPrime);
}

void main() {
    // Normalized Screen Coordinates [-1, 1] with aspect ratio correction
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // Construct Camera Ray in observer reference frame
    vec3 camRight = normalize(cross(u_cam_dir, u_cam_up));
    vec3 camUp = cross(camRight, u_cam_dir);
    
    float halfFovTan = tan(radians(u_fov * 0.5));
    vec3 rayDir = normalize(u_cam_dir + uv.x * halfFovTan * camRight + uv.y * halfFovTan * camUp);

    // Apply Relativistic Aberration if moving at relativistic speeds
    rayDir = applyRelativisticAberration(rayDir, u_cam_vel);

    // Raymarching State
    vec3 rayPos = u_cam_pos;
    vec3 rayVel = rayDir; // Unit light direction
    
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedAlpha = 0.0;
    bool hitHorizon = false;
    
    // Gravitational lensing raymarching in curved Schwarzschild spacetime
    // Null geodesic equation: d^2x/dlambda^2 = - (3 M / 2 r^5) * (x x v)^2 * x
    for (int step = 0; step < MAX_STEPS; step++) {
        float r = length(rayPos);

        // Check if ray has entered the Event Horizon (Schwarzschild radius Rs = 1.0)
        if (r <= RS * 1.008) {
            hitHorizon = true;
            break;
        }

        // Check if ray has escaped to deep celestial sphere
        if (r >= ESCAPE_R) {
            break;
        }

        // Adaptive step size:
        // When near photon sphere / event horizon, take fine steps for maximum sharpness.
        // When crossing the equatorial disk plane, refine step to avoid missing disk thinness.
        float dt = clamp(0.045 * r, 0.015, 0.42);
        
        // Refine step near accretion disk plane (y = 0)
        if (abs(rayPos.y) < 0.35 && r < DISK_R_OUT * 1.1) {
            dt = min(dt, max(0.012, abs(rayPos.y) * 0.35 + 0.015));
        }

        // Schwarzschild geodesic deflection calculation
        // Specific angular momentum L = x cross v
        vec3 L = cross(rayPos, rayVel);
        float L2 = dot(L, L);
        
        // Relativistic acceleration vector on light ray
        // Magnitude = - 3 * M * L^2 / (2 * r^5)
        float accelMag = -1.5 * M * L2 / (r * r * r * r * r);
        vec3 accel = accelMag * rayPos * u_lensing_strength;

        // Leapfrog / Verlet numerical integration
        vec3 nextPos = rayPos + rayVel * dt + 0.5 * accel * (dt * dt);
        vec3 nextVel = normalize(rayVel + accel * dt);

        // Accretion disk plane intersection test (detect crossing y = 0)
        if (rayPos.y * nextPos.y <= 0.0 && abs(nextPos.y - rayPos.y) > 0.0001) {
            // Linear interpolation to exact plane crossing point
            float t = -rayPos.y / (nextPos.y - rayPos.y);
            vec3 hitPos = mix(rayPos, nextPos, clamp(t, 0.0, 1.0));
            
            vec4 diskSample = sampleDisk(hitPos, rayVel);
            if (diskSample.a > 0.001) {
                // Volumetric front-to-back alpha compositing
                accumulatedColor += (1.0 - accumulatedAlpha) * diskSample.rgb;
                accumulatedAlpha += (1.0 - accumulatedAlpha) * diskSample.a;
                
                if (accumulatedAlpha > 0.98) {
                    // Ray fully absorbed by dense accretion gas
                    break;
                }
            }
        }

        // Advance ray
        rayPos = nextPos;
        rayVel = nextVel;
    }

    // Background sky contribution if ray escaped and was not blocked
    if (!hitHorizon && accumulatedAlpha < 0.99) {
        // Relativistic Doppler shift for deep space background
        float vCam = length(u_cam_vel);
        float cosView = (vCam > 0.001) ? dot(normalize(u_cam_vel), rayVel) : 0.0;
        float dopplerSky = (vCam > 0.001) ? (1.0 / (sqrt(1.0 - vCam * vCam) * (1.0 - vCam * cosView))) : 1.0;
        dopplerSky = pow(clamp(dopplerSky, 0.1, 4.0), 1.5);

        vec3 skyColor = renderSky(rayVel, dopplerSky);
        accumulatedColor += (1.0 - accumulatedAlpha) * skyColor;
    }

    // Photon Ring enhancement:
    // Rays looping near the photon sphere (r ~ 1.5 Rs) receive an ethereal glow
    float rFinal = length(rayPos);
    if (!hitHorizon && rFinal < DISK_R_IN * 1.35) {
        float photonGlow = exp(-pow((rFinal - 1.5 * RS) * 5.0, 2.0)) * 0.55 * u_disk_intensity;
        accumulatedColor += vec3(0.95, 0.85, 0.65) * photonGlow;
    }

    // Singularity Impact / Horizon Flash Transition:
    // When the camera plunges into the singularity, spacetime breaks down
    if (u_infall_progress > 1.0 || u_singularity_flash > 0.001) {
        float flash = u_singularity_flash;
        vec3 flashCol = mix(vec3(0.08, 0.35, 0.85), vec3(1.0, 0.98, 0.92), smoothstep(0.0, 0.8, flash));
        accumulatedColor = mix(accumulatedColor, flashCol * (1.0 + flash * 2.0), flash);
    }

    // High Dynamic Range (HDR) Tone Mapping (Reinhard Extended)
    vec3 mappedColor = accumulatedColor / (accumulatedColor + vec3(1.0));
    
    // Subtle cinematic vignette
    float vignette = 1.0 - 0.22 * dot(uv, uv);
    mappedColor *= clamp(vignette, 0.0, 1.0);

    // Gamma correction (sRGB approx)
    mappedColor = pow(mappedColor, vec3(1.0 / 2.2));

    fragColor = vec4(mappedColor, 1.0);
}
`;
