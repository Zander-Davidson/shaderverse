// HALFTONE CHROME — the two styles meet: a symmetrical ornament shaded as
// chrome (from the alien console skins) and printed as iridescent halftone
// on black (from the wispy symmetric prints).

float ornament(vec2 p, int folds, float petal, float t)
{
    // Kaleidoscope, then a lens-shaped petal plus a ring and a spine.
    float a = atan(p.x, p.y);
    float r = length(p);
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
               in float dotSize, in float glow)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float t = iTime;
    float d = ornament(uv, folds, petal, t);

    // Treat the inside distance as height: a rounded chrome bulge.
    float h = clamp(-d * 6.0, 0.0, 1.0);
    vec2 e = vec2(0.003, 0.0);
    vec2 grad = vec2(ornament(uv + e.xy, folds, petal, t) - ornament(uv - e.xy, folds, petal, t),
                     ornament(uv + e.yx, folds, petal, t) - ornament(uv - e.yx, folds, petal, t)) / (2.0 * e.x);
    vec3 n = normalize(vec3(grad * sqrt(max(1.0 - h, 0.0)) * 1.5, h + 0.15));
    // Chrome: reflect a horizon with a bright band.
    float ry = reflect(vec3(0.0, 0.0, -1.0), n).y;
    float env = smoothstep(-0.2, 0.6, ry) + smoothstep(0.04, 0.0, abs(ry - 0.3)) * 1.5;
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (n.x * 0.8 + n.y * 0.5 + t * 0.1 + vec3(0.0, 0.33, 0.67)));
    vec3 metal = mix(vec3(env), film * (0.4 + env), chrome);

    float inside = smoothstep(0.004, -0.004, d);
    // Spectral glow around the outline.
    float edge = exp(-abs(d) * 30.0 / glow);
    vec3 halo = (0.5 + 0.5 * cos(6.2831 * (d * 4.0 - t * 0.2 + vec3(0.0, 0.33, 0.67)))) * edge;

    vec3 tone = metal * inside + halo * (1.0 - inside);
    float lum = dot(tone, vec3(0.299, 0.587, 0.114));

    // Halftone print: dots sized by luminance, colored by tone.
    vec2 g = mat2(0.707, -0.707, 0.707, 0.707) * fragCoord / dotSize;
    float dotR = sqrt(clamp(lum, 0.0, 1.0)) * 0.7;
    float dotMask = smoothstep(dotR + 0.1, dotR - 0.1, length(fract(g) - 0.5));
    vec3 col = tone / max(lum, 0.15) * dotMask * min(lum * 1.4, 1.0);
    fragColor = vec4(col, 1.0);
}
