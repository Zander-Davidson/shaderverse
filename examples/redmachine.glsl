// RED MACHINE — maximal red lacquer machinery.
// A wall of glossy spheres seated in machined panels, under hard studio light.

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

// Distance to the wall: grooved panels plus a sphere per cell.
vec2 machine(vec3 p, float density, float ballSize, float t)
{
    vec2 cell = floor(p.xy * density);
    vec2 local = (fract(p.xy * density) - 0.5) / density;
    float r = hash(cell);
    float size = ballSize * (0.45 + 0.55 * r) / density;
    // Balls bob gently in their sockets.
    float z = -size * 0.4 + 0.02 * sin(t * 2.0 + r * 30.0) / density;
    float ball = length(vec3(local, p.z - z)) - size;
    // Panel with grooves along cell borders.
    vec2 b = abs(local) * density;
    float groove = smoothstep(0.46, 0.5, max(b.x, b.y)) * 0.04 / density;
    float panel = p.z + groove;
    return ball < panel ? vec2(ball, 1.0) : vec2(panel, 0.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float density, in float ballSize, in float spin,
               in float lacquer, in float depth)
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float t = iTime;
    // Look across the wall at an angle that slowly swings.
    float a = 0.35 * sin(t * spin);
    vec3 ro = vec3(sin(a) * depth, 0.4, cos(a) * depth);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.8 + rt * uv.x + up * uv.y);

    float dist = 0.0;
    vec2 h = vec2(1.0, 0.0);
    for (int i = 0; i < 100; i++) {
        h = machine(ro + rd * dist, density, ballSize, t);
        if (h.x < 0.0005 || dist > 20.0) break;
        dist += h.x * 0.7;
    }

    vec3 col = vec3(0.03, 0.0, 0.0);
    if (h.x < 0.01) {
        vec3 p = ro + rd * dist;
        vec2 e = vec2(0.0008, 0.0);
        vec3 n = normalize(vec3(
            machine(p + e.xyy, density, ballSize, t).x - machine(p - e.xyy, density, ballSize, t).x,
            machine(p + e.yxy, density, ballSize, t).x - machine(p - e.yxy, density, ballSize, t).x,
            machine(p + e.yyx, density, ballSize, t).x - machine(p - e.yyx, density, ballSize, t).x));
        vec3 l = normalize(vec3(-0.4, 0.8, 0.6));
        float diff = max(dot(n, l), 0.0);
        vec3 r = reflect(rd, n);
        float spec = pow(max(dot(r, l), 0.0), 60.0) * lacquer;
        float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
        vec3 red = h.y > 0.5 ? vec3(0.85, 0.02, 0.02) : vec3(0.55, 0.01, 0.015);
        col = red * (0.12 + 0.9 * diff) + vec3(spec) + vec3(1.0, 0.4, 0.4) * fres * 0.25 * lacquer;
        // Occlusion in the grooves and under the balls.
        col *= 0.5 + 0.5 * smoothstep(-0.05, 0.02, p.z);
    }
    col = mix(col, vec3(0.08, 0.0, 0.0), smoothstep(4.0, 14.0, dist));
    fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
