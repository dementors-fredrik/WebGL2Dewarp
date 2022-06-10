export const dewarpFragmentShader = `#version 300 es
precision highp float;
const float PI = 3.1415926535897932384626433832795;

uniform sampler2D u_texture;
in vec2 size;                 /// native resolution, x is width, y is height
float tangentOfFieldOfView = 0.4; /// The desired field of view (zoom level)
uniform float lambdaOffset;         /// Offset for the lambda value
uniform vec3 rotateData;            /// Data used for rotating the image depending on pan, tilt and placement
//uniform vec4 LensProfile;           /// The profile for the current lens
//uniform mat4 u_matrix;

vec4 LensProfile = vec4(113.889694, -60.882477, 751.488831, 0.0);
//vec3 rotateData = vec3(5.8,0.25,0.8); //vec3(4.109286700809463, -0.9885839816668688, 0.8351400470792861);
in vec2 uv;
//vec3(5.8,0.25,0.8); //

out vec4 fragColor;

float CalcTheta(vec2 sep)
{
  return atan(length(sep) / (size.y * 0.5) * tangentOfFieldOfView);
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
  vec2 sep = (uv - 0.5) * size;

  // The theta and lambda of a ray passing from the eye through the near plane
  float theta = CalcTheta(sep);
  float lambda = lambdaOffset - atan(sep.y, -sep.x);

  //Rotate
  vec2 rotated = CalcRotate(theta, lambda);
  theta = rotated.x;
  lambda = rotated.y;

  float radiusProfile = GetLensRadiusProfile(theta);

  float tabx = .5 + radiusProfile * cos(lambda) / size.x;
  float taby = .5 + radiusProfile * sin(lambda) / size.y;

  if(tabx >= 1.0 || taby >= 1.0 || tabx < 0.0 || taby < 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    fragColor = vec4(texture(u_texture, vec2(tabx, taby) /*uv*/).rgb, 1.0);
  }
}`;

export const dewarpVertexShader = `#version 300 es

in vec4 a_position;
in vec2 a_texcoord;

uniform mat4 u_matrix;
uniform sampler2D u_texture;

out vec2 uv;
out vec2 size;

void main() {
  uv = a_texcoord;
  size = vec2(textureSize(u_texture, 0));

  gl_Position = u_matrix * a_position;
  
}
`;
