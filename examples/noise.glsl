// NOISE FIELD — domain-warped fractal noise.
// octaves is an int knob: it steps in whole numbers.

float hash(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
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

// Knobs are only visible inside mainImage, so octaves is passed in.
float fbm(vec2 p, int octaves)
{
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < octaves; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float zoom, in float warp, in float flow,
               in int octaves, in float bright)
{
    vec2 uv = fragCoord / iResolution.y;
    vec2 p = uv * zoom;

    vec2 q = vec2(fbm(p + iTime * 0.05, octaves), fbm(p + vec2(5.2, 1.3), octaves));
    vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + iTime * flow, octaves),
                  fbm(p + warp * q + vec2(8.3, 2.8), octaves));
    float f = fbm(p + 3.5 * r, octaves);

    vec3 col = mix(vec3(0.05, 0.10, 0.20), vec3(0.90, 0.55, 0.20), clamp(f * f * 2.0, 0.0, 1.0));
    col = mix(col, vec3(0.10, 0.65, 0.80), clamp(length(q), 0.0, 1.0) * 0.6);
    col *= 0.6 + bright * f;

    fragColor = vec4(col, 1.0);
}
