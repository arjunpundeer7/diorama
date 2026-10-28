float caustic(vec2 p, float t) {
    float v = sin(p.x * 7.0 + t * 0.7 + sin(p.y * 5.0 + t * 0.5));
    v += sin(p.y * 6.0 - t * 0.6 + sin(p.x * 4.0 - t * 0.4));
    return clamp(v * 0.25 + 0.5, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float ink = smoothstep(0.08, 0.25, luma);

    vec3 water = mix(vec3(0.03, 0.16, 0.20), vec3(0.02, 0.27, 0.33), clamp(uv.x * 0.4 + (1.0 - uv.y) * 0.6, 0.0, 1.0));
    float c = caustic(uv * vec2(iResolution.x / iResolution.y, 1.0), iTime);
    water += vec3(0.03, 0.08, 0.08) * pow(c, 3.0);

    vec2 cell = fract(fragCoord / 28.0) - 0.5;
    water += (1.0 - smoothstep(0.05, 0.09, length(cell))) * 0.035;

    fragColor = vec4(mix(water, color.rgb, ink), color.a);
}
