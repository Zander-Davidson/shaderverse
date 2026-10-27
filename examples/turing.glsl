// TURING — the spots, stripes and mazes of reaction-diffusion.
// A Turing instability amplifies one wavelength in every direction and the
// reaction saturates it, so the pattern is drawn here as exactly that: a sum
// of plane waves of one wavelength, pushed through tanh. morph tips the
// balance from spots to mazes to holes; drag on the portal to pour activator.

float hash(float n)
{
    return fract(sin(n * 91.3458) * 47453.5453);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = smoothstep(0.0, 1.0, f);
    float n = i.x + i.y * 57.0;
    return mix(mix(hash(n), hash(n + 1.0), u.x), mix(hash(n + 57.0), hash(n + 58.0), u.x), u.y);
}

// Turns a color around the gray axis; turn = 1 is a full trip round the hues.
vec3 hueShift(vec3 c, float turn)
{
    float a = 6.2831 * turn;
    vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

// The morphogen before the reaction saturates it, and its gradient. Evenly
// spaced directions tile (3 waves make hexagons); chaos scatters them.
vec3 morphogen(vec2 p, int waves, float chaos, float t)
{
    vec3 m = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (i >= waves) break;
        float fi = float(i);
        float a = 3.14159 * (fi + chaos * hash(fi + 0.5)) / float(waves);
        vec2 k = 6.2831 * vec2(cos(a), sin(a));
        float x = dot(k, p) + 6.2831 * hash(fi + 17.0) + t * (hash(fi + 5.0) - 0.5);
        m += vec3(cos(x), -k * sin(x));
    }
    return m * inversesqrt(0.5 * float(waves));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float scale, in float morph, in int waves,
               in float chaos, in float flow, in float variety,
               in float hue, in float gloss)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float t = iTime * flow;

    // Bend the wavefronts and vary the wavelength, as a living dish would.
    vec2 w = vec2(noise(uv * 1.3 + t * 0.05), noise(uv * 1.3 + vec2(7.3, 2.1) - t * 0.04)) - 0.5;
    vec2 p = uv * scale * (1.0 + 0.25 * variety * w.y) + w * 1.6 * variety;
    vec3 m = morphogen(p, waves, chaos, t * 2.0);

    // The reaction: saturate, with the balance drifting across the dish.
    float bias = morph + variety * (noise(uv * 0.9 - 3.1) - 0.5) * 1.2;
    if (iMouse.z > 0.0) {
        vec2 ms = (2.0 * iMouse.xy - iResolution.xy) / iResolution.y;
        bias -= 1.5 * gaussian(length(uv - ms) * 3.0);
    }
    float u = tanh(2.5 * (m.x + bias));
    vec2 grad = 2.5 * (1.0 - square(u)) * m.yz;

    // Shade the pattern as a raised, wet membrane.
    vec3 n = normalize(vec3(-grad * 0.05, 1.0));
    vec3 l = normalize(vec3(-0.5, 0.6, 0.65));
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
    float fres = pow(1.0 - n.z, 2.0);

    vec3 substrate = hueShift(vec3(0.03, 0.01, 0.07), hue);
    vec3 fill = hueShift(vec3(0.12, 0.95, 0.80), hue);
    vec3 front = hueShift(vec3(1.00, 0.30, 0.85), hue);
    float body = smoothstep(-0.2, 0.5, u);
    vec3 col = mix(substrate * (0.6 + 0.6 * diff), fill * (0.25 + 0.75 * diff), body);
    // The reaction front glows where activator meets inhibitor.
    col += front * gaussian(u * 2.2) * 0.45;
    col += fill * fres * 0.8 * body + vec3(1.0) * spec * gloss * body;
    col *= 1.0 - 0.35 * square(length(uv) * 0.6);

    fragColor = vec4(max(col, 0.0), 1.0);
}
