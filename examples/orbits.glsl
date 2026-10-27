// ORBITS — a small system of glowing bodies around a central sun.

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in int bodies, in float spread, in float orbitSpeed,
               in float glow, in float sunSize)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    vec2 sun = vec2(0.0);

    vec3 col = vec3(0.0);
    col += vec3(1.0, 0.7, 0.3) * sunSize * reciprocal(length(uv - sun));

    for (int i = 0; i < bodies; i++) {
        float fi = float(i);
        float radius = 0.25 + fi * spread;
        float speed = orbitSpeed / (1.0 + fi * 0.6);
        vec2 pos = sun + radius * vec2(cos(iTime * speed + fi), sin(iTime * speed + fi));
        vec3 tint = wave(fi * 0.9 + vec3(0.0, 2.0, 4.0));
        col += tint * glow * reciprocal(pow(length(uv - pos), 1.6));
        col += tint * 0.002 * smoothstep(0.004, 0.0, abs(length(uv - sun) - radius));
    }

    fragColor = vec4(tonemap(col * 1.5), 1.0);
}
