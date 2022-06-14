import {FCAGLBindingMap, shaderCompiler} from "./FCAShaderCompiler";
import {AXISDewarpFragmentShaderWebGL2, AXISDewarpVertexShaderWebGL2} from "../Shaders/AXISDewarpShader";
import {AMDFidelityFXCAS} from "../Shaders/AMDFidelityFXCAS";
import {glMatrix, mat4} from "gl-matrix";
import {createPlaneVAO, drawVAO, FAGLFBOObject} from "./FCAWebGL2Toolkit";
import {SobelFilter} from "../Shaders/SobelFilter";
import {GrainFilter} from "../Shaders/GrainFilter";

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
    setDewarpEnabled: (performDewarp: boolean) => void;
};


export const FCAGLConfigurePipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement, opticProfile: Float32Array, uniformBuffer: { rotation: Array<number>, FOV: number }): FCAGLPipeline => {
    glMatrix.setMatrixArrayType(Array);
    const compiler = shaderCompiler(gl);

    const AXISDewarp = compiler.compileProgram({
        vertexShader: AXISDewarpVertexShaderWebGL2,
        fragmentShader: AXISDewarpFragmentShaderWebGL2
    });
    const AMDFidelityCAS = compiler.compileProgram({
        fragmentShader: AMDFidelityFXCAS
    });

    const Sobel = compiler.compileProgram({
        fragmentShader: SobelFilter
    })

    const Grain = compiler.compileProgram({
        fragmentShader: GrainFilter
    })
    /*
        OpenGL coordinate system starts at the bottom left,
        when we render to FBOs this means the output will be flipped.
        This shader flips it back.
     */
    const ProjectionShader = compiler.compileProgram({
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
    const vaoObj = createPlaneVAO(gl, AXISDewarp.bindings);
    const solid = createPlaneVAO(gl, ProjectionShader.bindings);

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

    const createFBO = (w: number, h: number): FAGLFBOObject => {
        const textureObject = createTexture(w, h);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureObject.tex, 0)
        return {fbo: fb!, texObject: textureObject};
    };

    const downsample = document.createElement('canvas');
    const downsampleCtx = downsample.getContext("2d");
    downsample.width = BUFFER_SIZE;
    downsample.height = BUFFER_SIZE;

    const frameTexture = createTexture(downsample.width, downsample.height);
    const ptzFBO = createFBO(downsample.width, downsample.height);
    const postProcessFBO = createFBO(downsample.width, downsample.height);
    const casFBO = createFBO(downsample.width, downsample.height);

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
    let dewarpEnabled: boolean = false;

    const updateFramebufferSize = () => {
        const bbox = container.getBoundingClientRect();
        const w = bbox.width - bbox.left;
        const h = bbox.height - bbox.top;
        gl.canvas.width = w;
        gl.canvas.height = h;
    }

    let frameCounter = 0;
    console.log('Creating new pipeline', dewarpEnabled);

    const updateRender = () => {
        frameCounter++;
        if (frameSource) {
            requestAnimationFrame(() => {
                updateRender()
            });

            updateFramebufferSize();

            downsampleCtx!.drawImage(frameSource!, downsample.width / 4, downsample.height / 4, downsample.width / 2, downsample.height / 2);
            sampleVideoFrame(downsample);

            if (dewarpEnabled) {
                drawVAO(gl, vaoObj, AXISDewarp, (gl, uniform) => {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);
                    gl.uniform1i(uniform.u_texture.address, 0);

                    const r = uniformBuffer.rotation;
                    gl.uniform3fv(uniform.rotateData.address, [0, (r[1] + Math.PI / 2), r[0] + Math.PI / 2]);
                    gl.uniform1f(uniform.tangentOfFieldOfView.address, uniformBuffer.FOV);

                    gl.uniform4fv(uniform.LensProfile.address, opticProfile);
                    gl.uniform2fv(uniform.video_size.address, [frameSource!.videoWidth, frameSource!.videoHeight]);

                    const projection = mat4.create();
                    mat4.identity(projection);

                    mat4.ortho(projection, -downsample.width / 2, downsample.width / 2, downsample.height / 2, -downsample.height / 2, -1, 1);
                    mat4.scale(projection, projection, [downsample.width / 2, downsample.height / 2, 1]);
                    mat4.scale(projection, projection, [1, -1, 1]);

                    gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                    const view = mat4.create();
                    mat4.identity(view);
                    gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                    const model = mat4.create();
                    mat4.identity(model);
                    mat4.scale(model, model, [-1, -1, 1]);
                    gl.uniformMatrix4fv(uniform.u_model.address, false, model);

                }, ptzFBO);
            } else {
                drawVAO(gl, solid, ProjectionShader, (gl, uniform) => {
                    gl.activeTexture(gl.TEXTURE3);
                    gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);
                    gl.uniform1i(uniform.u_texture.address, 3);

                    const projection = mat4.create();
                    mat4.identity(projection);
                    mat4.perspective(projection, uniformBuffer.FOV, ptzFBO.texObject.height / ptzFBO.texObject.width, 0.0, 100);
                    gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                    const view = mat4.create();
                    mat4.identity(view);

                    const a = uniformBuffer.rotation[0];
                    const b = uniformBuffer.rotation[1];
                    const c = uniformBuffer.rotation[2];


                    mat4.lookAt(view, [0, 0, .57],  [0, 0, 0], [0, 1, 0]);
                    mat4.scale(view,view,[-1,1,1]);
                    gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                    const model = mat4.create();
                    mat4.identity(model);
                    mat4.translate(model, model, [a/10.0,(Math.PI/2-b)/10.0,0]);
//                    mat4.rotateZ(model, model, frameCounter*.1 * Math.PI / 180)
                    // mat4.rotateY(model, model, frameCounter*.1 * Math.PI / 180)
                    gl.uniformMatrix4fv(uniform.u_model.address, false, model);
                }, ptzFBO);
            }

            drawVAO(gl, solid, ProjectionShader, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, ptzFBO.texObject.tex);
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
                mat4.translate(model, model, [0, 0, -.5]);
                // mat4.rotateX(model, model, frameCounter*.1 * Math.PI / 180)
                // mat4.rotateY(model, model, frameCounter*.1 * Math.PI / 180)
                gl.uniformMatrix4fv(uniform.u_model.address, false, model);
            }, postProcessFBO);

            drawVAO(gl, vaoObj, Grain, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE2);
                gl.uniform1i(uniform.u_texture.address, 2);
                gl.bindTexture(gl.TEXTURE_2D, postProcessFBO.texObject.tex);

                const projection = mat4.create();
                mat4.identity(projection);
                mat4.perspective(projection, 90 * Math.PI / 180, postProcessFBO.texObject.height / postProcessFBO.texObject.width, 0.0, 100);
                gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                const view = mat4.create();
                mat4.identity(view);
                mat4.lookAt(view, [0, 0, 1], [0, 0, 0], [0, 1, 0]);
                gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                const model = mat4.create();
                mat4.identity(model);
                gl.uniformMatrix4fv(uniform.u_model.address, false, model);
                gl.uniform1ui(uniform.u_frame_counter.address, frameCounter);
            }, casFBO);

            drawVAO(gl, vaoObj, AMDFidelityCAS, (gl, uniform) => {
                gl.activeTexture(gl.TEXTURE2);
                gl.uniform1i(uniform.u_texture.address, 2);
                gl.bindTexture(gl.TEXTURE_2D, casFBO.texObject.tex);

                const projection = mat4.create();
                mat4.identity(projection);
                mat4.perspective(projection, 90 * Math.PI / 180, postProcessFBO.texObject.height / postProcessFBO.texObject.width, 0.0, 100);
                gl.uniformMatrix4fv(uniform.u_projection.address, false, projection);
                const view = mat4.create();
                mat4.identity(view);
                mat4.lookAt(view, [0, 0, 1], [0, 0, 0], [0, 1, 0]);
                gl.uniformMatrix4fv(uniform.u_view.address, false, view);

                const model = mat4.create();
                mat4.identity(model);
                gl.uniformMatrix4fv(uniform.u_model.address, false, model);

            }, null);

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
            } else {
                console.log('Already started');
            }
        },

        setFOV: (fov: number) => {
            uniformBuffer.FOV = Math.tan(fov);
        },

        stop: () => {
            console.log('Stopping dewarp');
            frameSource = null;
        },

        shutdown: () => {
            console.log('Terminating gl context');
            frameSource = null;
            gl.deleteTexture(frameTexture.tex!);
            gl.deleteProgram(AXISDewarp.program);
            gl.deleteProgram(AMDFidelityCAS.program);
            gl.deleteProgram(ProjectionShader.program);
        },

        setDewarpEnabled: (enabled) => {
            console.log('Setting dewarp to ', enabled, frameCounter);
            dewarpEnabled = enabled;
        }
    }
}