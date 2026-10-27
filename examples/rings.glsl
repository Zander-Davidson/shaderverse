// RINGS — concentric interference field.
// Every parameter after fragCoord is a knob: turn them around the portal.

// Turns a color around the gray axis; turn = 1 is a full trip round the hues.
vec3 hueShift(vec3 c, float turn)
{
    float a = 6.2831 * turn;
    vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float ringFreq, in float speed, in float wobble,
               in int lobes, in float falloff,
               in float ringHue, in float crestHue, in float crest)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float wave = sin(r * ringFreq - iTime * speed + sin(a * float(lobes)) * wobble);
    float glow = 0.02 * reciprocal(abs(wave * 0.15 + 0.02 * r));

    vec3 col = hueShift(vec3(0.10, 0.55, 1.00), ringHue) * glow;
    col += hueShift(vec3(1.00, 0.35, 0.10), crestHue) * smoothstep(0.9, 1.0, wave) * crest;
    col *= smoothstep(falloff, 0.2, r);

    fragColor = vec4(tonemap(max(col, 0.0)), 1.0);
}
