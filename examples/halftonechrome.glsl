// HALFTONE CHROME — the two styles meet: a symmetrical ornament shaded as
// chrome (from the alien console skins) and printed as iridescent halftone
// on black (from the wispy symmetric prints).

float ornament(vec2 p, int folds, float petal, float twist, float t)
{
    // Kaleidoscope, then a lens-shaped petal plus a ring and a spine.
    // twist swirls the folds, more toward the rim, and sways with time.
    float r = length(p);
    float a = atan(p.x, p.y) + twist * r * (1.5 + 0.5 * sin(t * 0.4));
    float w = 3.14159 / float(max(folds, 1));
    a = abs(mod(a + w, 2.0 * w) - w);
    vec2 q = r * vec2(sin(a), cos(a));
    float lens = length(vec2(q.x * (2.6 - petal), q.y - 0.55 - 0.05 * sin(t))) - 0.32;
    float ring = abs(r - 0.72 - 0.03 * sin(t * 1.3)) - 0.018;
    float spine = max(abs(q.x) - 0.02 * (1.2 - r), r - 0.95);
    float d = min(min(lens, ring), spine);
    // A small orb at the heart.
    return min(d, r - 0.11);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in int folds, in float petal, in float chrome,
               in float dotSize, in float glow,
               in float hue, in float twist, in float separation)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float t = iTime;
    float d = ornament(uv, folds, petal, twist, t);

    // Treat the inside distance as height: a rounded chrome bulge.
    float h = clamp(-d * 6.0, 0.0, 1.0);
    vec2 e = vec2(0.003, 0.0);
    vec2 grad = vec2(ornament(uv + e.xy, folds, petal, twist, t) - ornament(uv - e.xy, folds, petal, twist, t),
                     ornament(uv + e.yx, folds, petal, twist, t) - ornament(uv - e.yx, folds, petal, twist, t)) / (2.0 * e.x);
    vec3 n = normalize(vec3(grad * sqrt(max(1.0 - h, 0.0)) * 1.5, h + 0.15));
    // Chrome: reflect a horizon with a bright band.
    float ry = reflect(vec3(0.0, 0.0, -1.0), n).y;
    float env = smoothstep(-0.2, 0.6, ry) + smoothstep(0.04, 0.0, abs(ry - 0.3)) * 1.5;
    vec3 film = wave(6.2831 * (n.x * 0.8 + n.y * 0.5 + t * 0.1 + hue + vec3(0.0, 0.33, 0.67)));
    vec3 metal = mix(vec3(env), film * (0.4 + env), chrome);

    float inside = smoothstep(0.004, -0.004, d);
    // Spectral glow around the outline.
    float edge = exp(-abs(d) * 30.0 / glow);
    vec3 halo = wave(6.2831 * (d * 4.0 - t * 0.2 + hue + vec3(0.0, 0.33, 0.67))) * edge;

    vec3 tone = metal * inside + halo * (1.0 - inside);
    float lum = dot(tone, vec3(0.299, 0.587, 0.114));

    // Halftone print: dots sized by luminance, colored by tone.
    vec2 g = mat2(0.707, -0.707, 0.707, 0.707) * fragCoord / dotSize;
    float dotR = sqrt(clamp(lum, 0.0, 1.0)) * 0.7;
    float dotMask = smoothstep(dotR + 0.1, dotR - 0.1, length(fract(g) - 0.5));
    vec3 col = tone / max(lum, 0.15) * dotMask * min(lum * 1.4, 1.0);

    // Color separation: each channel printed through its own screen, turned
    // to its own angle and slipped out of register, as on a cheap press.
    vec3 sep = vec3(0.0);
    for (int c = 0; c < 3; c++) {
        float ang = radians(15.0 + 30.0 * float(c));
        vec2 slip = 1.5 * separation * vec2(cos(float(c) * 2.1), sin(float(c) * 2.1));
        vec2 gc = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (fragCoord + slip) / dotSize;
        float rc = sqrt(clamp(tone[c], 0.0, 1.0)) * 0.75;
        sep[c] = smoothstep(rc + 0.1, rc - 0.1, length(fract(gc) - 0.5));
    }
    col = mix(col, sep, separation);
    fragColor = vec4(col, 1.0);
}
