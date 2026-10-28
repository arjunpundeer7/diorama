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

    float t = Time * 0.15;
    float wave = 0.5 + 0.5 * sin(tex.x * 3.0 + t) * cos(tex.y * 2.0 - t * 0.7);
    float3 field = lerp(float3(0.02, 0.08, 0.10), float3(0.06, 0.22, 0.26), wave);

    return float4(lerp(field, color.rgb, ink), 1.0);
}
