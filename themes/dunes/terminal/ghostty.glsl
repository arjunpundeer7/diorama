float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return float(m[y * 4 + x]) / 16.0;
}

float ridge(float x, float seed, float t) {
    return sin(x * 3.1 + seed + t) * 0.5 + sin(x * 7.3 + seed * 2.0 + t * 1.7) * 0.25;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float ink = smoothstep(0.08, 0.25, luma);

    vec2 p = vec2(uv.x, 1.0 - uv.y);
    float threshold = bayer4(floor(fragCoord / 6.0));

    float density = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float crest = 0.55 + fi * 0.13 + ridge(p.x, fi * 2.3, iTime * (0.02 + fi * 0.03)) * (0.05 + fi * 0.02);
        if (p.y > crest) density = 0.25 + fi * 0.18 + (p.y - crest) * 0.6;
    }

    vec2 d = (p - vec2(0.72, 0.3)) * vec2(iResolution.x / iResolution.y, 1.0);
    bool inSun = length(d) < 0.09 && density == 0.0;

    vec3 field = density > threshold ? vec3(0.24, 0.22, 0.19) : vec3(0.06, 0.06, 0.05);
    if (inSun) field = vec3(0.55, 0.30, 0.12);

    fragColor = vec4(mix(field, color.rgb, ink), color.a);
}
