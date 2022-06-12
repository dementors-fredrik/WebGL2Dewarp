import {FCAGLBindingMap, FCAGLProgramBundle, FCAGLUniformType, shaderCompiler} from "./FCAShaderCompiler";
import {AXISDewarpFragmentShaderWebGL2, AXISDewarpVertexShaderWebGL2} from "../Shaders/AXISDewarpShader";
import {AMDFidelityFXCAS} from "../Shaders/AMDFidelityFXCAS";
import {mat4,glMatrix} from "gl-matrix";

const TUNING_CONSTANTS = {
    workaroundSlowTexSubImage: false,
    textureFiltering: true
};

let DOWNSCALE_FACTOR = 1.0;
const BUFFER_SIZE = 2048 / DOWNSCALE_FACTOR;

export type FCAGLTextureObject = {
    tex: WebGLTexture | null;
    width: number;
    height: number;
}

export type FCAGLPipeline = {
    setFOV: (fov: number) => void;
    start: (frame: HTMLVideoElement) => void;
    stop: () => void;
    shutdown: () => void;
};

export const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap, forFBO: boolean) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vaoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vaoBuffer);

    const screenQuad = [
        -1.0, -1.0,  0.0,
        1.0, -1.0,  0.0,
        1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0,
        1.0,  1.0,  0.0,
        -1.0,  1.0,  0.0
    ];

    const texQuad = [
        0.0,  0.0,
        1.0,  0.0,
        1.0,  1.0,
        0.0,  0.0,
        1.0,  1.0,
        0.0,  1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(screenQuad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 3, gl.FLOAT, false, 0, 0);

    const texBuffer = gl.createBuffer();
    if (bindings!.in!.a_texcoord) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texQuad), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
        gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    } else {
        gl.deleteBuffer(texBuffer);
    }
    return {vao: vao, vertices: screenQuad.length / 3, buffers: [vaoBuffer]};
}
/*
export type FCADewarpHandle =
    {
        setRotationVectors: (rotationVector: Array<number>) => void; stop: () => void; start: (frame: HTMLVideoElement) => void; shutdown: () => void
    }
*/
let rotationAngle = 0.0;

export const FCAGLConfigurePipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement, opticProfile: Float32Array, uniformBuffer : { rotation: Array<number>, FOV: number}): FCAGLPipeline => {
    let FOV = 1.4;//Math.tan(90 * Math.PI/180.0);
    glMatrix.setMatrixArrayType(Array);
    const compiler = shaderCompiler(gl);
    const AXISDewarp = compiler.compileProgram({
        vertexShader: AXISDewarpVertexShaderWebGL2,
        fragmentShader: AXISDewarpFragmentShaderWebGL2
    });
    const AMDFidelityCAS = compiler.compileProgram({
        fragmentShader: AMDFidelityFXCAS
    });

    /*
        OpenGL coordinate system starts at the bottom left,
        when we render to FBOs this means the output will be flipped.
        This shader flips it back.
     */
    const TextureFlipShader = compiler.compileProgram({
        fragmentShader: `#version 300 es
        precision highp float;
         
        in vec2 v_texcoord;
        uniform sampler2D u_texture;
        out vec4 color;
         
        void main() {
           vec2 tex = v_texcoord;
           tex.y = 1.0 - tex.y;
           color = texture(u_texture,tex);   
        }`
    });
    const vaoObj = createVAO(gl, AXISDewarp.bindings, true);
    const solid = createVAO(gl, TextureFlipShader.bindings, false);

    let frameCounter = 0;

    const drawVAO = (vao: any, programObject: FCAGLProgramBundle, renderSetup: (gl: WebGL2RenderingContext, bindings: FCAGLUniformType) => void, fbo: FAGLFBOObject | null = null) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
        if (fbo?.texObject) {
            gl.viewport(0, 0, fbo.texObject.width, fbo.texObject.height);
        } else {
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        }
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(programObject.program);
        renderSetup(gl, programObject.bindings.uniform!);

        gl.bindVertexArray(vao.vao);
        gl.drawArrays(gl.TRIANGLES, 0, vao.vertices);
    }

    const createTexture = (w: number, h: number) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const filter = TUNING_CONSTANTS.textureFiltering ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return {tex: tex, width: w, height: h};
    }

    type FAGLFBOObject = { fbo: WebGLFramebuffer, texObject: FCAGLTextureObject };

    const createFBO = (w: number, h: number): FAGLFBOObject => {
        const textureObject = createTexture(w, h);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureObject.tex, 0)
        return {fbo: fb!, texObject: textureObject};
    };

    const downsampleCtx = document.createElement('canvas');
    const downsample = downsampleCtx.getContext("2d");
    downsampleCtx.width = BUFFER_SIZE;
    downsampleCtx.height = BUFFER_SIZE;

    const frameTexture = createTexture(downsampleCtx.width, downsampleCtx.height);
    const dewarpFBO = createFBO(downsampleCtx.width, downsampleCtx.height);
    const postProcessFBO = createFBO(downsampleCtx.width, downsampleCtx.height);

    const sampleVideoFrame = (v: HTMLVideoElement | HTMLCanvasElement) => {
        let offsetX = 0;
        let offsetY = 0;

        gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);

        if (TUNING_CONSTANTS.workaroundSlowTexSubImage) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, v.width, v.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, offsetX, offsetY,
                frameTexture.width - offsetX, frameTexture.height - offsetY, gl.RGBA, gl.UNSIGNED_BYTE, v);
        }
    }

    let frameSource: HTMLVideoElement | null = null;
    const updateFramebufferSize = () => {
        const bbox = container.getBoundingClientRect();
        const w = bbox.width - bbox.left;
        const h = bbox.height - bbox.top;
        gl.canvas.width = w;
        gl.canvas.height = h;
    }

    let temp = 2000;
    let capturedFrames = 0;
    const updateRender = () => {
        frameCounter++;
        temp += 10;
        rotationAngle += (Math.PI / 180.0);
        if (frameSource) {
            updateFramebufferSize();
            downsample!.drawImage(frameSource!, 0, 0, downsampleCtx.width, downsampleCtx.height);

            // The render loop runs at screen refresh speed
            // this means we likely refresh at least 60 times a second
            // the camera stream is unlikely to have an fps higher than 30
            // so we sample every other frame (30 fps effective speed)
            if ((frameCounter & 0x1) === 0) {
                capturedFrames++;
                sampleVideoFrame(downsampleCtx);
            }

            drawVAO(vaoObj, AXISDewarp, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);
                gl.uniform1i(uniform.u_texture.address, 0);

                gl.uniform3fv(uniform.rotateData.address, uniformBuffer.rotation);
                gl.uniform1f(uniform.tangentOfFieldOfView.address, uniformBuffer.FOV);

                gl.uniform4fv(uniform.LensProfile.address, opticProfile);
                gl.uniform2fv(uniform.video_size.address, [downsampleCtx.width, downsampleCtx.height]);

                const projection = mat4.create();
                mat4.identity(projection);
                mat4.ortho(projection, 0, BUFFER_SIZE, BUFFER_SIZE, 0, -1, 1);
                mat4.scale(projection, projection, [downsampleCtx.width, downsampleCtx.height, 1]);
                mat4.translate(projection, projection, [.5, .5, 0]);
                gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                const view = mat4.create();
                mat4.identity(view);
                gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                const model = mat4.create();
                mat4.identity(model);
                mat4.scale(model, model, [1, -1, 1]);

                gl.uniformMatrix4fv(uniform.u_model.address, false, model);
            }, dewarpFBO);

            drawVAO(vaoObj, AMDFidelityCAS, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE2);
                gl.uniform1i(uniform.u_texture.address, 2);
                gl.bindTexture(gl.TEXTURE_2D, dewarpFBO.texObject.tex);

                const projection = mat4.create();
                mat4.identity(projection);
                gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                const view = mat4.create();
                mat4.identity(view);
                gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                const model = mat4.create();
                mat4.identity(model);
                gl.uniformMatrix4fv(uniform.u_model.address, false, model);

            }, postProcessFBO);

            drawVAO(solid, TextureFlipShader, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, postProcessFBO.texObject.tex);
                gl.uniform1i(uniform.u_texture.address, 3);

                const projection = mat4.create();
                mat4.identity(projection);
                mat4.perspective(projection, 90 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.0, 100);
                gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                const view = mat4.create();
                mat4.identity(view);
                mat4.lookAt(view, [0, 0, 0.5], [0, 0, 0], [0, 1, 0]);
                gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                const model = mat4.create();
                mat4.identity(model);
                //mat4.rotateX(model, model, frameCounter * Math.PI / 180)
                gl.uniformMatrix4fv(uniform.u_model.address, false, model);
            }, null);

            if (capturedFrames % 60 === 0) {
                console.log('Capture fps:', 60 * capturedFrames / frameCounter);
            }

            requestAnimationFrame(() => {
                updateRender()
            });
        } else {
            console.log('No frameSource');
        }
    }

    return {
        start: (frame: HTMLVideoElement) => {
            if (frameSource == null) {
                console.log('Starting dewarp');
                frameSource = frame;
                updateRender();
            }
        },

        setFOV : (fov: number) => {
            FOV = Math.tan(fov);
        },

        stop: () => {
            console.log('Stopping dewarp');
            frameSource = null;
        },

        shutdown: () => {
            console.log('Terminating gl context');
            frameSource = null;
            gl.deleteTexture(frameTexture.tex!);
        }
    }
}