/*
    Sobel filter implementation from ShaderToy

    https://www.shadertoy.com/view/Xdf3Rf
 */

export const SobelFilter = `#version 300 es
precision highp float;
 
in vec2 v_texcoord;
uniform sampler2D u_texture;
out vec4 color;

// Basic sobel filter implementation
// Jeroen Baert - jeroen.baert@cs.kuleuven.be
// 
// www.forceflow.be


// Use these parameters to fiddle with settings
float step = 1.0;

float intensity(in vec4 color){
    return sqrt((color.x*color.x)+(color.y*color.y)+(color.z*color.z));
}

vec3 sobel(float stepx, float stepy, vec2 center){
    // get samples around pixel
    float tleft = intensity(texture(u_texture,center + vec2(-stepx,stepy)));
    float left = intensity(texture(u_texture,center + vec2(-stepx,0)));
    float bleft = intensity(texture(u_texture,center + vec2(-stepx,-stepy)));
    float top = intensity(texture(u_texture,center + vec2(0,stepy)));
    float bottom = intensity(texture(u_texture,center + vec2(0,-stepy)));
    float tright = intensity(texture(u_texture,center + vec2(stepx,stepy)));
    float right = intensity(texture(u_texture,center + vec2(stepx,0)));
    float bright = intensity(texture(u_texture,center + vec2(stepx,-stepy)));

    // Sobel masks (see http://en.wikipedia.org/wiki/Sobel_operator)
    //        1 0 -1     -1 -2 -1
    //    X = 2 0 -2  Y = 0  0  0
    //        1 0 -1      1  2  1

    // You could also use Scharr operator:
    //        3 0 -3        3 10   3
    //    X = 10 0 -10  Y = 0  0   0
    //        3 0 -3        -3 -10 -3

    float x = tleft + 2.0*left + bleft - tright - 2.0*right - bright;
    float y = -tleft - 2.0*top - tright + bleft + 2.0 * bottom + bright;
    float color = sqrt((x*x) + (y*y));
    return vec3(color,color,color);
}

void main(){
    vec2 uv = v_texcoord;
    vec4 incolor = texture(u_texture, uv.xy);
    vec3 sobel = sobel(step/1024.0, step/1024.0, uv);
    vec3 comp = incolor.rgb - (sobel*.5);
    color = vec4(comp, 1.0); //vec3(.rg, 1.0);
}
`;