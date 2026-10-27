// GEL CONSOLE — glossy green gel, Frutiger-era LCD skins.
// Metaball blobs are raised into rounded domes: the LCD shows through them
// bent and tinted, a studio softbox reflects in the clear coat, and light
// pools on the far side of each blob the way it does in real gel.

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

// Dome height: 0 at the gel's edge, 1 at a blob's heart. A lone blob's field
// falls off as 1/r², so this makes it an exact hemisphere.
float dome(vec2 p, int blobs, float flow, float goo)
{
    return sqrt(clamp(1.0 - goo * reciprocal(field(p, blobs, flow)), 0.0, 1.0));
}

// Backplate: dark LCD with a fine pixel grid, a coarser panel grid and scan
// stripes. grid turns the lines from a hint up to lit panel seams.
vec3 backplate(vec2 uv, float grid, vec3 tint)
{
    vec2 px = (uv * iResolution.y + iResolution.xy) * 0.5;
    vec2 g = fract(px / 4.0);
    float pixel = step(0.25, g.x) * step(0.25, g.y);
    vec3 bg = vec3(0.01, 0.05, 0.03) * (1.0 - min(0.25 * grid, 0.9) * (1.0 - pixel));
    vec2 c = abs(fract(uv * 4.0 + 0.5) - 0.5) * 0.125 * iResolution.y;
    float seam = 1.0 - smoothstep(0.0, 1.2, min(c.x, c.y));
    float node = gaussian(length(c) * 0.25);
    bg += tint * (0.05 * seam + 0.12 * node) * square(grid);
    bg += vec3(0.0, 0.08, 0.04) * smoothstep(0.98, 1.0, sin(uv.y * 60.0 - iTime * 2.0));
    return bg;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in int blobs, in float goo, in float gloss,
               in float flow, in float hue, in float grid,
               in float refraction)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    // hue slides the gel from acid green toward cyan.
    vec3 gel = mix(vec3(0.1, 1.0, 0.3), vec3(0.0, 0.75, 1.0), hue);
    vec3 l = normalize(vec3(-0.5, 0.7, 0.6));

    float f = field(uv, blobs, flow);
    float edge = smoothstep(goo - 0.06, goo + 0.06, f);

    // Soft shadow the blobs cast down-right onto the panel.
    float shadow = smoothstep(goo * 0.4, goo * 1.1, field(uv + vec2(0.05, -0.07), blobs, flow));
    vec3 bg = backplate(uv, grid, gel) * (1.0 - 0.65 * shadow);

    // Dome normal by finite differences.
    float h = dome(uv, blobs, flow, goo);
    vec2 e = vec2(0.004, 0.0);
    vec2 dh = vec2(dome(uv + e.xy, blobs, flow, goo) - dome(uv - e.xy, blobs, flow, goo),
                   dome(uv + e.yx, blobs, flow, goo) - dome(uv - e.yx, blobs, flow, goo)) / (2.0 * e.x);
    vec3 n = normalize(vec3(-dh * 0.3, 1.0));
    vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
    float diff = max(dot(n, l), 0.0);
    float fres = pow(1.0 - n.z, 2.5);

    // The panel seen through the gel: bent by the dome, tinted by its depth.
    vec3 through = backplate(uv - n.xy * refraction * 0.25, grid, gel);
    vec3 col = through * 3.0 * gel * exp(-(1.0 - gel) * 3.0 * h);
    col += gel * (0.12 + 0.45 * diff) * (0.4 + 0.6 * h);
    // Light focused through the dome pools on its shadow side.
    col += gel * gaussian(length(n.xy - l.xy * 0.35) * 4.0) * h * 0.9;
    col += gel * fres * 0.9;

    // Clear coat: a tight hot spot, a broad sheen, and a softbox window.
    float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 140.0);
    float sheen = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 10.0);
    vec2 w = abs(r.xy - vec2(-0.32, 0.42)) - vec2(0.14, 0.07);
    float window = smoothstep(0.05, 0.0, max(w.x, w.y));
    // The bright band across the top of every Aqua-era button.
    float band = smoothstep(0.15, 0.35, r.y) * smoothstep(0.75, 0.4, r.y) * (1.0 - h) * 0.35;
    col += vec3(0.92, 1.0, 0.96) * gloss * (1.6 * spec + 0.15 * sheen + 0.7 * window + band);

    fragColor = vec4(tonemap(mix(bg, col, edge) * 1.25), 1.0);
}
