float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float ink = smoothstep(0.08, 0.25, luma);

    vec3 sky = mix(vec3(0.05, 0.07, 0.17), vec3(0.02, 0.03, 0.06), uv.y);
    float nebula = clamp(sin(uv.x * 3.0 + iTime * 0.02) * sin(uv.y * 4.0 + 1.3), 0.0, 1.0);
    sky += vec3(0.18, 0.12, 0.35) * nebula * 0.25;

    vec2 grid = fragCoord / 12.0;
    grid.x += iTime * 0.3;
    vec2 id = floor(grid);
    float h = hash21(id);
    float star = step(0.985, h) * (1.0 - smoothstep(0.12, 0.3, length(fract(grid) - 0.5)));
    float twinkle = 0.6 + 0.4 * sin(iTime * (1.0 + h * 3.0) + h * 40.0);
    sky += star * twinkle * vec3(0.85, 0.9, 1.0);

    fragColor = vec4(mix(sky, color.rgb, ink), color.a);
}
