// WISP — symmetrical wisps on cream paper, iridescent, in fine halftone.
// Mirrored, domain-warped noise is drawn as thin contour filaments; color
// comes from a spectral ramp, then the whole image is printed as halftone.

float hash(vec2 p)
{
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p)
{
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.1 + 3.7;
        a *= 0.5;
    }
    return v;
}

vec3 spectrum(float x)
{
    return clamp(0.5 + 0.55 * cos(6.2831 * (x + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in int folds, in float wisp, in float bloom,
               in float dotSize, in float drift)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    // Fold into a kaleidoscope of `folds` mirrored wedges around a vertical axis.
    float a = atan(uv.x, uv.y);
    float r = length(uv);
    float wedge = 3.14159 / float(max(folds, 1));
    a = abs(mod(a, 2.0 * wedge) - wedge);
    vec2 p = r * vec2(sin(a), cos(a));

    float t = iTime * drift;
    vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 4.0));
    float f = fbm(p * 2.0 + q * 2.5);
    // Thin filaments along the field's contours, fading out from the center.
    float lines = abs(fract(f * wisp) - 0.5);
    float fil = smoothstep(0.11, 0.0, lines) * smoothstep(1.3, 0.1, r);
    float halo = smoothstep(bloom, 0.0, r) * (0.4 + 0.6 * f);

    vec3 ink = spectrum(f * 1.7 + r * 0.6 - t * 0.5);
    float amount = clamp(fil + halo * 0.3, 0.0, 1.0);

    // Halftone: dot radius follows ink amount on a rotated grid.
    float s = dotSize;
    vec2 g = mat2(0.866, -0.5, 0.5, 0.866) * fragCoord / s;
    vec2 cell = fract(g) - 0.5;
    float dotR = sqrt(amount) * 0.62;
    float dotMask = smoothstep(dotR + 0.08, dotR - 0.08, length(cell));

    vec3 paper = vec3(0.93, 0.91, 0.86) - 0.05 * hash(fragCoord);
    vec3 col = mix(paper, ink * 0.8, dotMask);
    // Dark core where the filaments gather, like ink bleed.
    col = mix(col, vec3(0.05, 0.03, 0.06), smoothstep(0.85, 1.0, amount) * 0.6);
    fragColor = vec4(col, 1.0);
}
