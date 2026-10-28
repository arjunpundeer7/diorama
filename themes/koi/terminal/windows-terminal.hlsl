Texture2D shaderTexture;
SamplerState samplerState;

cbuffer PixelShaderSettings {
    float  Time;
    float  Scale;
    float2 Resolution;
    float4 Background;
};

float4 main(float4 pos : SV_POSITION, float2 tex : TEXCOORD) : SV_TARGET
{
    float4 color = shaderTexture.Sample(samplerState, tex);
    float ink = saturate(distance(color.rgb, Background.rgb) * 4.0);

    float cell = 12.0 * max(Scale, 1.0);
    float2 grid = pos.xy / cell;
    float2 center = (floor(grid) + 0.5) * cell;
    float2 c = center / cell;

    float v = 0.5 + 0.25 * sin(c.x * 0.32 + Time * 0.55 + sin(c.y * 0.21 + Time * 0.35) * 1.4);
    v += 0.25 * sin(c.y * 0.27 - Time * 0.45 + cos(c.x * 0.17) * 1.2);
    float radius = sqrt(saturate(0.06 + v * 0.26)) * 0.55;
    float dotMask = 1.0 - smoothstep(radius - 0.06, radius, length(frac(grid) - 0.5));

    float3 pond = float3(0.02, 0.07, 0.055);
    pond = lerp(pond, float3(0.12, 0.42, 0.37), dotMask * 0.55);

    return float4(lerp(pond, color.rgb, ink), 1.0);
}
