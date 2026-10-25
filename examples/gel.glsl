// GEL CONSOLE — glossy green gel, Frutiger-era LCD skins.
// Metaball blobs are treated as a height field: normals from the field give
// a wet specular highlight and a soft inner glow.

float field(vec2 p, int blobs, float flow)
{
    float f = 0.0;
    for (int i = 0; i < 16; i++) {
        if (i >= blobs) break;
        float fi = float(i);
        vec2 c = vec2(sin(iTime * flow * (0.6 + 0.13 * fi) + fi * 1.7),
                      cos(iTime * flow * (0.5 + 0.11 * fi) + fi * 2.3)) * vec2(0.9, 0.55);
        // Stretched horizontally, like pill-shaped buttons.
        vec2 d = (p - c) * vec2(0.7, 1.0);
        f += 0.09 * reciprocal(dot(d, d));
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in int blobs, in float goo, in float gloss,
               in float flow, in float hue)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    // Backplate: dark green LCD with fine pixel grid and scan stripes.
    vec2 g = fract(fragCoord / 4.0);
    vec3 bg = vec3(0.01, 0.05, 0.03) * (0.75 + 0.25 * step(0.25, g.x) * step(0.25, g.y));
    bg += vec3(0.0, 0.08, 0.04) * smoothstep(0.98, 1.0, sin(uv.y * 60.0 - iTime * 2.0));

    float f = field(uv, blobs, flow);
    float edge = smoothstep(goo - 0.15, goo + 0.15, f);

    // Height from the field; normal by finite differences.
    float h = 0.004;
    float fx = field(uv + vec2(h, 0.0), blobs, flow) - field(uv - vec2(h, 0.0), blobs, flow);
    float fy = field(uv + vec2(0.0, h), blobs, flow) - field(uv - vec2(0.0, h), blobs, flow);
    vec3 n = normalize(vec3(-fx, -fy, 0.06 * f));
    vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * gloss;
    float rim = square(1.0 - n.z);

    // hue slides the gel from acid green toward cyan.
    vec3 gel = mix(vec3(0.1, 1.0, 0.3), vec3(0.0, 0.75, 1.0), hue);
    vec3 col = gel * (0.35 + 0.8 * diff) + gel * rim * 0.9 + vec3(0.9, 1.0, 0.95) * spec;
    // Light trapped inside the gel.
    col += gel * 0.35 * smoothstep(goo, goo * 3.0, f);

    fragColor = vec4(mix(bg, col, edge), 1.0);
}
