// BIOMECH — chrome conduits, after early-2000s alien Winamp skins.
// Raymarched helical tubes with ribbed collars; chrome reflects a studio
// environment with a thin-film sheen.

mat2 rot(float a)
{
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Distance to the conduits: three twisting tubes bound by ribbed rings.
float conduits(vec3 p, float twist, float thick, float ribGap)
{
    float d = 1e9;
    for (int i = 0; i < 3; i++) {
        float a = float(i) * 2.0944 + p.z * twist;
        vec2 c = vec2(cos(a), sin(a)) * 0.62;
        d = smin(d, length(p.xy - c) - thick, 0.3);
    }
    // Ribs: tori around the bundle, spaced along z.
    float z = mod(p.z, ribGap) - 0.5 * ribGap;
    vec2 q = vec2(length(p.xy) - 0.66, z);
    float rib = length(q) - 0.07;
    d = smin(d, rib, 0.12);
    // Outer sleeve, hollow, so the camera flies inside it.
    float sleeve = abs(length(p.xy) - 1.9) - 0.08;
    return min(d, sleeve);
}

vec3 studio(vec3 r, float sheen, float fres)
{
    // Dark teal room with bright softbox strips.
    vec3 c = mix(vec3(0.03, 0.05, 0.06), vec3(0.45, 0.62, 0.64), smoothstep(-0.7, 0.8, r.y));
    c += vec3(1.0) * smoothstep(0.06, 0.0, abs(r.y - 0.35)) * 1.8;
    c += vec3(0.6, 1.0, 0.9) * smoothstep(0.12, 0.0, abs(r.x + 0.55)) * 0.9;
    c += vec3(1.0, 0.85, 0.7) * smoothstep(0.1, 0.0, abs(r.x - 0.6)) * 0.5;
    // Thin-film iridescence toward grazing angles.
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (fres * 1.6 + vec3(0.0, 0.33, 0.67)));
    return c * mix(vec3(1.0), film, sheen * fres);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float twist, in float thickness, in float speed,
               in int ribs, in float sheen)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float t = iTime * speed;
    vec3 ro = vec3(0.0, 0.0, t);
    vec3 rd = normalize(vec3(uv, 1.6));
    rd.xy *= rot(t * 0.15);
    float ribGap = 4.0 / float(max(ribs, 1));

    float dist = 0.0;
    float d = 1.0;
    for (int i = 0; i < 96; i++) {
        d = conduits(ro + rd * dist, twist, thickness, ribGap);
        if (d < 0.001 || dist > 30.0) break;
        dist += d * 0.8;
    }

    vec3 col = vec3(0.0);
    if (d < 0.01) {
        vec3 p = ro + rd * dist;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(
            conduits(p + e.xyy, twist, thickness, ribGap) - conduits(p - e.xyy, twist, thickness, ribGap),
            conduits(p + e.yxy, twist, thickness, ribGap) - conduits(p - e.yxy, twist, thickness, ribGap),
            conduits(p + e.yyx, twist, thickness, ribGap) - conduits(p - e.yyx, twist, thickness, ribGap)));
        vec3 r = reflect(rd, n);
        float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
        col = studio(r, sheen, fres) * mix(0.8, 1.2, fres);
    }
    // Depth haze: the far end of the tunnel dissolves into teal.
    col = mix(col, vec3(0.03, 0.09, 0.1), smoothstep(8.0, 28.0, dist));
    fragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
