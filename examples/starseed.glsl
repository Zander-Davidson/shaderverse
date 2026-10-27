// STARSEED — a living chrome seed pod around a pulsar.
// The shell is a sphere carved by a crawling gyroid lattice; the core's light
// leaks through the holes, its beams sweep the nebula like a lighthouse, and
// now and then a nova flares in the dust. Drag on the portal to orbit.

float hash(vec3 p)
{
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 p)
{
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = smoothstep(0.0, 1.0, f);
    vec2 o = vec2(0.0, 1.0);
    return mix(mix(mix(hash(i), hash(i + o.yxx), u.x), mix(hash(i + o.xyx), hash(i + o.yyx), u.x), u.y),
               mix(mix(hash(i + o.xxy), hash(i + o.yxy), u.x), mix(hash(i + o.xyy), hash(i + o.yyy), u.x), u.y), u.z);
}

float fbm(vec3 p)
{
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.07 + vec3(1.7, 9.2, 4.1);
        a *= 0.5;
    }
    return v;
}

// Turns a color around the gray axis; turn = 1 is a full trip round the hues.
vec3 hueShift(vec3 c, float turn)
{
    float a = 6.2831 * turn;
    vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

mat2 rot(float a)
{
    return mat2(cos(a), -sin(a), sin(a), cos(a));
}

float smax(float a, float b, float k)
{
    float h = max(k - abs(a - b), 0.0) / k;
    return max(a, b) + square(h) * k * 0.25;
}

// Nebula, dust and stars in direction d.
vec3 sky(vec3 d, float hue)
{
    float f = fbm(d * 1.8 + vec3(0.0, 0.0, iTime * 0.01));
    float g = fbm(d * 3.5 + f * 1.6 + 3.1);
    float dust = smoothstep(0.25, 0.65, fbm(d * 5.0 - 1.7 + g));
    vec3 col = hueShift(vec3(0.30, 0.04, 0.55), hue) * smoothstep(0.35, 0.8, f) * 0.7;
    col += hueShift(vec3(0.03, 0.45, 0.85), hue) * smoothstep(0.45, 0.85, g) * 0.5;
    col += hueShift(vec3(1.00, 0.40, 0.20), hue) * pow(f * g * 2.2, 4.0) * 0.8;
    col *= 0.25 + 0.75 * dust;

    // Two layers of stars, twinkling.
    for (int i = 0; i < 2; i++) {
        vec3 q = d * (110.0 + 170.0 * float(i));
        vec3 c = floor(q);
        float h = hash(c + float(i) * 13.0);
        if (h > 0.97) {
            float s = length(q - c - 0.5);
            float tw = 0.6 + 0.4 * sin(iTime * (2.0 + 3.0 * h) + h * 90.0);
            col += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.8, 0.6), fract(h * 37.0)) * gaussian(s * 3.5) * tw * (h - 0.97) * 60.0 * dust;
        }
    }

    // A nova: a random direction every few seconds, a flash and a long fade,
    // with diffraction spikes.
    float era = floor(iTime / 7.0);
    float life = fract(iTime / 7.0);
    vec3 nd = normalize(vec3(hash(vec3(era, 1.0, 2.0)), hash(vec3(era, 5.0, 3.0)), hash(vec3(era, 9.0, 7.0))) - 0.5);
    vec3 side = normalize(cross(nd, vec3(0.0, 1.0, 0.0)));
    vec2 off = vec2(dot(d, side), dot(d, cross(side, nd)));
    float flash = smoothstep(0.0, 0.02, life) * exp(-life * 5.0) * step(0.0, dot(d, nd));
    float spikes = gaussian(off.x * 400.0) * gaussian(off.y * 18.0) + gaussian(off.y * 400.0) * gaussian(off.x * 18.0);
    col += hueShift(vec3(0.7, 0.85, 1.0), hue) * flash * (0.02 * reciprocal(length(off) * 60.0 + 0.02) + spikes * 0.8);
    return col;
}

// The seed: a twisted shell with a gyroid lattice carved through it.
float seed(vec3 p, float lattice, float struts, float twist, float spin)
{
    p.xz = rot(iTime * spin) * p.xz;
    p.xz = rot(twist * p.y) * p.xz;
    float breathe = 1.0 + 0.03 * sin(iTime * 1.3);
    float shell = abs(length(p) - breathe) - 0.13;
    vec3 q = p * lattice + vec3(0.0, iTime * 0.35, 0.0);
    float gyroid = (abs(dot(sin(q), cos(q.yzx))) - struts) / lattice * 0.7;
    return smax(shell, gyroid, 0.04);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float lattice, in float struts, in float twist,
               in float core, in float pulsar, in float iridescence,
               in float hue, in float spin)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    float yaw = iTime * 0.08 + (iMouse.z > 0.0 ? 6.2831 * iMouse.x / iResolution.x : 0.0);
    float pitch = 0.25 + (iMouse.z > 0.0 ? 1.2 * (iMouse.y / iResolution.y - 0.5) : 0.15 * sin(iTime * 0.1));
    vec3 ro = 3.3 * vec3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.9 + rt * uv.x + up * uv.y);

    // March only inside the seed's bounding sphere.
    float b = dot(ro, rd);
    float disc = b * b - dot(ro, ro) + 1.44;
    float dist = 1e5;
    if (disc > 0.0) {
        float t = -b - sqrt(disc);
        float tEnd = -b + sqrt(disc);
        for (int i = 0; i < 110; i++) {
            float d = seed(ro + rd * t, lattice, struts, twist, spin);
            if (d < 0.0008) { dist = t; break; }
            t += d * 0.8;
            if (t > tEnd) break;
        }
    }

    vec3 col = sky(rd, hue);
    vec3 heat = hueShift(vec3(1.0, 0.55, 0.2), hue);
    float pulse = 0.8 + 0.2 * sin(iTime * 2.4) * sin(iTime * 0.7);

    if (dist < 1e4) {
        vec3 p = ro + rd * dist;
        vec2 e = vec2(0.0015, -0.0015);
        vec3 n = normalize(e.xyy * seed(p + e.xyy, lattice, struts, twist, spin) +
                           e.yyx * seed(p + e.yyx, lattice, struts, twist, spin) +
                           e.yxy * seed(p + e.yxy, lattice, struts, twist, spin) +
                           e.xxx * seed(p + e.xxx, lattice, struts, twist, spin));
        float ao = 0.4 + 0.6 * clamp(seed(p + n * 0.08, lattice, struts, twist, spin) / 0.08, 0.0, 1.0);
        vec3 v = -rd;
        float nv = max(dot(n, v), 0.0);
        // Chrome reflecting the nebula, through a thin iridescent film.
        vec3 film = wave(6.2831 * (nv * 1.3 + hue + vec3(0.0, 0.33, 0.67)));
        vec3 metal = mix(vec3(0.9), film * 1.2, iridescence);
        vec3 r = reflect(rd, n);
        vec3 env = sky(r, hue) * 2.5 + vec3(0.9) * pow(max(dot(r, normalize(vec3(-0.5, 0.8, 0.3))), 0.0), 30.0);
        col = metal * env * (0.35 + 0.65 * pow(1.0 - nv, 2.0) + 0.3) * ao;
        // The core lights the inner faces of the lattice.
        float lit = max(dot(n, -normalize(p)), 0.0);
        col += heat * core * pulse * lit * exp(-2.2 * length(p)) * 4.0;
    }

    // The core, seen through the holes.
    float tc = -dot(ro, rd);
    if (tc < dist) {
        float dmin = length(ro + rd * tc);
        col += core * pulse * (vec3(1.0, 0.95, 0.9) * gaussian(dmin * 9.0) + heat * gaussian(dmin * 2.6) * 0.5);
    }

    // Pulsar beams along a tilted axis that sweeps round.
    vec3 axis = normalize(vec3(0.55 * sin(iTime * 0.9), 1.0, 0.55 * cos(iTime * 0.9)));
    float ab = dot(rd, axis);
    float denom = max(1.0 - ab * ab, 1e-4);
    float t2 = (ab * dot(axis, ro) - dot(rd, ro)) / denom;
    float s2 = (dot(axis, ro) - ab * dot(rd, ro)) / denom;
    if (t2 > 0.0 && t2 < dist) {
        float dBeam = length(ro + rd * t2 - axis * s2);
        float reach = smoothstep(0.9, 1.4, abs(s2)) * exp(-abs(s2) * 0.3);
        vec3 gamma = mix(vec3(0.75, 0.85, 1.0), hueShift(vec3(0.55, 0.2, 1.0), hue), smoothstep(0.0, 0.08, dBeam));
        col += gamma * pulsar * reach * (gaussian(dBeam * 45.0) + 0.25 * gaussian(dBeam * 7.0)) * (0.85 + 0.15 * sin(iTime * 31.0));
    }

    fragColor = vec4(tonemap(col * 1.2), 1.0);
}
