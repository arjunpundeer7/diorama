void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 color = texture(iChannel0, uv);

    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float ink = smoothstep(0.08, 0.25, luma);

    float t = iTime * 0.15;
    float wave = 0.5 + 0.5 * sin(uv.x * 3.0 + t) * cos(uv.y * 2.0 - t * 0.7);
    vec3 field = mix(vec3(0.02, 0.08, 0.10), vec3(0.06, 0.22, 0.26), wave);

    fragColor = vec4(mix(field, color.rgb, ink), color.a);
}
