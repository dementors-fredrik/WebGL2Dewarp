export const GrainFilter = `#version 300 es
precision highp float;
 
in vec2 v_texcoord;
uniform uint u_frame_counter;
uniform sampler2D u_texture;
out vec4 color;

float noise(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(){
    vec2 uv = v_texcoord;
    vec4 incolor = texture(u_texture, uv.xy);
    float offset = float(u_frame_counter)/15.;
    color = vec4(mix(incolor.rgb,vec3(noise(vec2(uv.x+offset, uv.y-offset))),0.1),1.0);
}
`;