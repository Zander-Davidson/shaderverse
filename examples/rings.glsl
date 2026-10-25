// RINGS — concentric interference field.
// Every parameter after fragCoord is a knob: turn them around the portal.

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float ringFreq, in float speed, in float wobble,
               in int lobes, in float falloff)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float wave = sin(r * ringFreq - iTime * speed + sin(a * float(lobes)) * wobble);
    float glow = 0.02 * reciprocal(abs(wave * 0.15 + 0.02 * r));

    vec3 col = vec3(0.10, 0.55, 1.00) * glow;
    col += vec3(1.00, 0.35, 0.10) * smoothstep(0.9, 1.0, wave) * 0.6;
    col *= smoothstep(falloff, 0.2, r);

    fragColor = vec4(tonemap(col), 1.0);
}
