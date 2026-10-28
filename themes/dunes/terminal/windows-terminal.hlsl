Texture2D shaderTexture;
SamplerState samplerState;

cbuffer PixelShaderSettings {
    float  Time;
    float  Scale;
    float2 Resolution;
    float4 Background;
};

static const float bayer[16] = {
    0.0 / 16.0, 8.0 / 16.0, 2.0 / 16.0, 10.0 / 16.0,
    12.0 / 16.0, 4.0 / 16.0, 14.0 / 16.0, 6.0 / 16.0,
    3.0 / 16.0, 11.0 / 16.0, 1.0 / 16.0, 9.0 / 16.0,
    15.0 / 16.0, 7.0 / 16.0, 13.0 / 16.0, 5.0 / 16.0
};

float ridge(float x, float seed, float t)
{
    return sin(x * 3.1 + seed + t) * 0.5 + sin(x * 7.3 + seed * 2.0 + t * 1.7) * 0.25;
}

float4 main(float4 pos : SV_POSITION, float2 tex : TEXCOORD) : SV_TARGET
{
    float4 color = shaderTexture.Sample(samplerState, tex);
    float ink = saturate(distance(color.rgb, Background.rgb) * 4.0);

    float2 pixel = floor(pos.xy / (3.0 * max(Scale, 1.0)));
    int index = int(fmod(pixel.y, 4.0)) * 4 + int(fmod(pixel.x, 4.0));
    float threshold = bayer[index];

    float density = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float crest = 0.55 + fi * 0.13 + ridge(tex.x, fi * 2.3, Time * (0.02 + fi * 0.03)) * (0.05 + fi * 0.02);
        if (tex.y > crest) density = 0.25 + fi * 0.18 + (tex.y - crest) * 0.6;
    }

    float2 sun = float2(0.72, 0.3);
    float2 d = (tex - sun) * float2(Resolution.x / Resolution.y, 1.0);
    bool inSun = length(d) < 0.09 && density == 0.0;

    float3 paper = float3(0.06, 0.06, 0.05);
    float3 dune = float3(0.24, 0.22, 0.19);
    float3 accent = float3(0.55, 0.30, 0.12);
    float3 field = density > threshold ? dune : paper;
    if (inSun) field = accent;

    return float4(lerp(field, color.rgb, ink), 1.0);
}
