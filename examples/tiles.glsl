// TILES — rotating truchet lattice.
// Select another number inside mainImage in the editor and press Cmd/Ctrl+K.

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float scale, in float drift, in float thickness,
               in float hueSpread, in float pulse)
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    uv *= scale;
    uv += vec2(0.3, 0.1) * iTime * drift;

    vec2 cell = floor(uv);
    vec2 f = fract(uv) - 0.5;
    if (hash(cell) > 0.5) f.x = -f.x;

    float d = abs(abs(f.x + f.y) - 0.5) / 1.4142;
    float line = smoothstep(0.08, 0.0, d - thickness);

    vec3 base = 0.5 + 0.5 * cos(6.2831 * (hash(cell + 3.0) * hueSpread + vec3(0.0, 0.33, 0.67)) + iTime * pulse);
    vec3 col = mix(vec3(0.02, 0.03, 0.05), base, line);

    fragColor = vec4(col, 1.0);
}
