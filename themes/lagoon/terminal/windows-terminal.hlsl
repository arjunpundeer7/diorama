Texture2D shaderTexture;
SamplerState samplerState;

cbuffer PixelShaderSettings {
    float  Time;
    float  Scale;
    float2 Resolution;
    float4 Background;
};

float caustic(float2 p, float t)
{
    float v = sin(p.x * 7.0 + t * 0.7 + sin(p.y * 5.0 + t * 0.5));
    v += sin(p.y * 6.0 - t * 0.6 + sin(p.x * 4.0 - t * 0.4));
    return saturate(v * 0.25 + 0.5);
}

float4 main(float4 pos : SV_POSITION, float2 tex : TEXCOORD) : SV_TARGET
{
    float4 color = shaderTexture.Sample(samplerState, tex);
    float ink = saturate(distance(color.rgb, Background.rgb) * 4.0);

    float3 water = lerp(float3(0.03, 0.16, 0.20), float3(0.02, 0.27, 0.33), saturate(tex.x * 0.4 + tex.y * 0.6));
    float c = caustic(tex * float2(Resolution.x / Resolution.y, 1.0), Time);
    water += float3(0.03, 0.08, 0.08) * pow(c, 3.0);

    float2 cell = frac(pos.xy / (14.0 * max(Scale, 1.0))) - 0.5;
    water += (1.0 - smoothstep(0.05, 0.09, length(cell))) * 0.035;

    return float4(lerp(water, color.rgb, ink), 1.0);
}
