void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float ink = smoothstep(0.08, 0.25, luma);

    float cell = 24.0;
    vec2 grid = fragCoord / cell;
    vec2 c = floor(grid) + 0.5;

    float v = 0.5 + 0.25 * sin(c.x * 0.32 + iTime * 0.55 + sin(c.y * 0.21 + iTime * 0.35) * 1.4);
    v += 0.25 * sin(c.y * 0.27 - iTime * 0.45 + cos(c.x * 0.17) * 1.2);
    float radius = sqrt(clamp(0.06 + v * 0.26, 0.0, 1.0)) * 0.55;
    float dotMask = 1.0 - smoothstep(radius - 0.06, radius, length(fract(grid) - 0.5));

    vec3 pond = mix(vec3(0.02, 0.07, 0.055), vec3(0.12, 0.42, 0.37), dotMask * 0.55);

    fragColor = vec4(mix(pond, color.rgb, ink), color.a);
}
