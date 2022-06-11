export const AXISDewarpFragmentShaderWebGL2 = `#version 300 es
precision highp float;
const float PI = 3.1415926535897932384626433832795;

uniform sampler2D u_texture;
uniform vec2 video_size;                       /// native resolution, x is width, y is height
uniform float tangentOfFieldOfView; /// The desired field of view (zoom level)
float lambdaOffset = PI/2.0;        /// Offset for the lambda value
uniform vec3 rotateData;            /// Data used for rotating the image depending on pan, tilt and placement
uniform vec4 LensProfile;           /// The profile for the current lens

in vec2 uv;

out vec4 fragColor;

float CalcTheta(vec2 sep)
{
  return atan(length(sep) / (video_size.y * 0.5) * tangentOfFieldOfView);
}

float GetLensRadiusProfile(float theta)
{
  float t2 = theta * theta;
  float t3 = t2 * theta;
  float t4 = t3 * theta;
  return LensProfile.x * t4 + LensProfile.y * t3 + LensProfile.z * t2 + LensProfile.w * theta;
}

// Convert spherical coordinates with unit radius to cartesian coordinates
vec3 SphericalToCartesian(float theta, float lambda)
{
  return vec3(
    sin(theta) * cos(lambda),
    sin(theta) * sin(lambda),
    abs(cos(theta))
  );
}

// Convert cartesian coordinates to spherical coordinates with unit radius
// x == theta, y == lambda
vec2 CartesianToSpherical(vec3 cartesian)
{
  return vec2(
    acos(min(cartesian.z, 1.0)),
    atan(cartesian.y, cartesian.x)
  );
}

vec2 CalcRotate(float theta, float lambda)
{
  vec3 cart = SphericalToCartesian(theta, lambda);
  vec2 abscos = abs(cos(rotateData.xy));

  // rotate around x-axis
  if (rotateData.x != 0.0)
  {
    cart.yz = vec2(
      cart.y * abscos.x + cart.z * sin(rotateData.x),
      cart.z * abscos.x - cart.y * sin(rotateData.x)
    );
  }

  // rotate around y-axis
  if (rotateData.y != 0.0)
  {
    cart.xz = vec2(
      cart.x * abscos.y + cart.z * sin(rotateData.y),
      cart.z * abscos.y - cart.x * sin(rotateData.y)
    );
  }

  vec2 spherical = CartesianToSpherical(cart);

  // rotate around z axis
  spherical.y += rotateData.z;

  return spherical;
}

void main(void)
{
  vec2 sep = (uv - 0.5) * video_size.x;

  // The theta and lambda of a ray passing from the eye through the near plane
  float theta = CalcTheta(sep);
  float lambda = lambdaOffset - atan(sep.y, -sep.x);

  //Rotate
  vec2 rotated = CalcRotate(theta, lambda);
  theta = rotated.x;
  lambda = -rotated.y;

  float radiusProfile = GetLensRadiusProfile(theta);

  float tabx = .5 + (radiusProfile * cos(lambda)) / video_size.x;
  float taby = .5 + (radiusProfile * sin(lambda)) / video_size.y;

  if(tabx >= 1.0 || taby >= 1.0 || tabx <= 0.0 || taby <= 0.0) {
    fragColor = vec4(0,0,0, 1.0);
  } else {
    fragColor = vec4(texture(u_texture, vec2(tabx, taby) ).rgb, 1.0);
  }
}`;

export const AXISDewarpVertexShaderWebGL2 = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;
uniform mat4 u_matrix;
uniform sampler2D u_texture;
uniform float height;
uniform float width;

out vec2 uv;
//out vec2 size;

void main() {
//  size = vec2(textureSize(u_texture, 0));


/*  vec2 rscale = vec2(size.x / size.y, size.y / size.x);
  vec2 aspectScale = vec2(0.0);
  float check = float(height * rscale.x < width);

  aspectScale += check * vec2(height * rscale.x, height);
  aspectScale += (1.0 - check) * vec2(width, width * rscale.y);
  aspectScale /= vec2(width, height);

  vec2 scaled = a_position.xy * aspectScale;

  scaled += (1.0 - aspectScale) / 2.0;*/

  uv = a_texcoord;

  vec2 pos = a_position.xy;
  gl_Position = u_matrix * a_position; 
}
`;
