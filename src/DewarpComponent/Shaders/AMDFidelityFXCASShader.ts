/*
    Fragment shader
 */
export const AMDFidelityCASFShaderWebGL2 = `#version 300 es
precision highp float;
 
in vec2 v_texcoord;
uniform sampler2D u_texture;
uniform float divider;
out vec4 color;
 
void main() {
    ivec2 itexres = textureSize(u_texture, 0);

    vec2 uv = v_texcoord;
    vec2 muv;
    muv = vec2(divider,0.7);
    
    vec3 col = texture(u_texture, uv).xyz;

    float max_g = col.y;
    float min_g = col.y;
    vec4 uvoff = vec4(1,0,1,-1)/vec2(itexres).xxyy;
    vec3 colw;
    vec3 col1 = texture(u_texture, uv+uvoff.yw).xyz;
    max_g = max(max_g, col1.y);
    min_g = min(min_g, col1.y);
    colw = col1;
    col1 = texture(u_texture, uv+uvoff.xy).xyz;
    max_g = max(max_g, col1.y);
    min_g = min(min_g, col1.y);
    colw += col1;
    col1 = texture(u_texture, uv+uvoff.yz).xyz;
    max_g = max(max_g, col1.y);
    min_g = min(min_g, col1.y);
    colw += col1;
    col1 = texture(u_texture, uv-uvoff.xy).xyz;
    max_g = max(max_g, col1.y);
    min_g = min(min_g, col1.y);
    colw += col1;
    float d_min_g = min_g;
    float d_max_g = 1.-max_g;
    float A;
    if (d_max_g < d_min_g) {
        A = d_max_g / max_g;
    } else {
        A = d_min_g / max_g;
    }
    A = sqrt(A);
    A *= mix(-.125, -.2, muv.y);
    vec3 col_out = (col + colw * A) / (1.+4.*A);
    if (uv.x > (muv.x-.002)) {
        if (uv.x > (muv.x+.002)) {
            col_out = col;
        } else {
            col_out = vec3(0);
        }
    }
    color = vec4(col_out,1);
}
`;