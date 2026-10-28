Texture2D shaderTexture;
SamplerState samplerState;

cbuffer PixelShaderSettings {
    float  Time;
    float  Scale;
    float2 Resolution;
    float4 Background;
};

float hash21(float2 p)
{
    p = frac(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return frac(p.x * p.y);
}

float4 main(float4 pos : SV_POSITION, float2 tex : TEXCOORD) : SV_TARGET
{
    float4 color = shaderTexture.Sample(samplerState, tex);
    float ink = saturate(distance(color.rgb, Background.rgb) * 4.0);

    float3 sky = lerp(float3(0.02, 0.03, 0.06), float3(0.05, 0.07, 0.17), tex.y);
    float nebula = saturate(sin(tex.x * 3.0 + Time * 0.02) * sin(tex.y * 4.0 + 1.3));
    sky += float3(0.18, 0.12, 0.35) * nebula * 0.25;

    float2 grid = pos.xy / (6.0 * max(Scale, 1.0));
    grid.x += Time * 0.3;
    float2 id = floor(grid);
    float h = hash21(id);
    float star = step(0.985, h) * (1.0 - smoothstep(0.12, 0.3, length(frac(grid) - 0.5)));
    float twinkle = 0.6 + 0.4 * sin(Time * (1.0 + h * 3.0) + h * 40.0);
    sky += star * twinkle * float3(0.85, 0.9, 1.0);

    return float4(lerp(sky, color.rgb, ink), 1.0);
}
