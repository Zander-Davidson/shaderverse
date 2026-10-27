// RED MACHINE — maximal red lacquer machinery.
// Lacquered pipes grow along a 3D lattice, turn at ball joints, retract and
// are laid again somewhere else, while the camera drifts through the works.

float hash(vec3 p)
{
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

// Edge i of one lattice line: the pipe's radius (0 where bare), the stretch
// of the edge it has grown over, [a, b], and its ball joints (1 at node i,
// 2 at node i + 1). Pipes run in runs of whole edges; frenzy shortens the
// runs and speeds their growth.
vec4 edge(vec2 line, float axis, float i, float fill, float frenzy, float thickness)
{
    vec3 key = vec3(line, axis * 31.0);
    float len = floor(mix(7.0, 1.0, frenzy) * (0.5 + hash(key)) + 1.0);
    float off = floor(hash(key + 1.3) * len);
    float k = floor((i + off) / len);
    float start = k * len - off;

    // Each run grows, holds, retracts, and is dealt again.
    float phase = iTime * (0.04 + 0.3 * frenzy) * (0.7 + 0.6 * hash(key + k)) + hash(key + k + 7.7);
    float life = fract(phase);
    vec3 run = key + vec3(k * 3.1, floor(phase) * 1.7, 0.0);
    if (hash(run) > fill) return vec4(0.0);
    float head = start + len * smoothstep(0.0, 0.35, life);
    float tail = start + len * smoothstep(0.8, 1.0, life);
    float a = max(i, tail);
    float b = min(i + 1.0, head);
    if (b - a < 0.001) return vec4(0.0);

    float joints = (i == start && a == i ? 1.0 : 0.0) + (i + 1.0 == start + len && b == i + 1.0 ? 2.0 : 0.0);
    // Somewhat random widths: every run gets its own.
    return vec4(thickness * (0.4 + 0.6 * hash(run + 4.2)), a, b, joints);
}

// Pipes along one axis: s is the coordinate along it, q the two across it.
// Only the nearest line's two nearest edges are checked; the march step is
// capped so nothing farther can be skipped.
vec2 pipes(float s, vec2 q, float axis, float fill, float frenzy, float thickness)
{
    vec2 line = floor(q + 0.5);
    float across = length(q - line);
    float j = floor(s + 0.5);
    vec2 best = vec2(1e5, 0.0);
    for (int n = 0; n < 2; n++) {
        float i = j - 1.0 + float(n);
        vec4 e = edge(line, axis, i, fill, frenzy, thickness);
        if (e.x <= 0.0) continue;
        float d = length(vec2(s - clamp(s, e.y, e.z), across)) - e.x;
        // Machined grooves around the pipe.
        d += 0.004 * smoothstep(0.6, 1.0, cos(s * 25.13));
        if (mod(e.w, 2.0) > 0.5) d = min(d, length(vec2(s - i, across)) - e.x * 1.3);
        if (e.w > 1.5) d = min(d, length(vec2(s - i - 1.0, across)) - e.x * 1.3);
        if (d < best.x) best = vec2(d, e.x / thickness);
    }
    return best;
}

// Distance to the works, and a shade per pipe.
vec2 machine(vec3 p, float fill, float frenzy, float thickness)
{
    vec2 h = pipes(p.x, p.yz, 0.0, fill, frenzy, thickness);
    vec2 hy = pipes(p.y, p.xz, 1.0, fill, frenzy, thickness);
    vec2 hz = pipes(p.z, p.xy, 2.0, fill, frenzy, thickness);
    if (hy.x < h.x) h = hy;
    if (hz.x < h.x) h = hz;
    return h;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float thickness, in float frenzy, in float density,
               in float lacquer, in float speed, in float sway)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    // Fly down a gap in the lattice, clear of every pipe, looking around.
    float t = iTime * speed;
    vec3 ro = vec3(0.5 + 0.08 * sin(t * 0.4), 0.5 + 0.08 * cos(t * 0.33), t);
    vec3 fw = normalize(vec3(0.6 * sin(iTime * 0.11 * sway + 0.8), 0.35 * sin(iTime * 0.07 * sway + 0.3), 1.0));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.5 + rt * uv.x + up * uv.y);

    float cap = 0.48 - thickness * 1.3;
    float dist = 0.0;
    vec2 h = vec2(1.0, 0.0);
    for (int i = 0; i < 140; i++) {
        h = machine(ro + rd * dist, density, frenzy, thickness);
        if (h.x < 0.0008 * dist || dist > 16.0) break;
        dist += min(h.x, cap);
    }

    vec3 fogColor = vec3(0.07, 0.0, 0.004);
    vec3 col = fogColor;
    if (dist < 16.0) {
        vec3 p = ro + rd * dist;
        vec2 e = vec2(0.0015, -0.0015);
        vec3 n = normalize(e.xyy * machine(p + e.xyy, density, frenzy, thickness).x +
                           e.yyx * machine(p + e.yyx, density, frenzy, thickness).x +
                           e.yxy * machine(p + e.yxy, density, frenzy, thickness).x +
                           e.xxx * machine(p + e.xxx, density, frenzy, thickness).x);
        float ao = 0.35 + 0.65 * clamp(machine(p + n * 0.12, density, frenzy, thickness).x / 0.12, 0.0, 1.0);

        vec3 l = normalize(vec3(-0.4, 0.8, -0.3));
        float diff = max(dot(n, l), 0.0);
        float lamp = max(dot(n, -rd), 0.0);
        vec3 r = reflect(rd, n);
        float spec = pow(max(dot(r, l), 0.0), 80.0);
        // A long studio strip reflected in the lacquer.
        float strip = smoothstep(0.9, 0.97, dot(r, normalize(vec3(-0.3, 1.0, 0.2))));
        float fres = square(square(1.0 - max(dot(-rd, n), 0.0)));
        vec3 red = mix(vec3(0.42, 0.005, 0.01), vec3(0.9, 0.03, 0.02), h.y);
        col = red * (0.08 + 0.75 * diff + 0.3 * lamp) * ao;
        col += (vec3(spec) * 1.2 + vec3(1.0, 0.75, 0.7) * strip * 0.6) * lacquer * ao;
        col += vec3(1.0, 0.35, 0.35) * fres * 0.3 * lacquer;
    }
    col = mix(col, fogColor, 1.0 - exp(-dist * 0.18));
    fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
