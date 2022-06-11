import React, {useEffect, useImperativeHandle, useRef, useState} from "react";
import {FCAGLBindingMap, shaderCompiler} from "./FCAShaderCompiler";
import {mat4} from 'gl-matrix';
import {dewarpFragmentShader, dewarpVertexShader} from "./DewarpShader";

type FCAGLPipeline = { startDewarp: (video: HTMLVideoElement) => void, stopRender: () => void };

type FCAGLTextureObject = {
    tex: WebGLTexture | null;
    width: number;
    height: number;
}

export type FCADewarpHandle =
    { stopRender: () => void; startDewarp: (frame: HTMLVideoElement) => void; shutdown: () => void }

const TUNING_CONSTANTS = {
  workaroundSlowTexSubImage: true
};

let DOWNSCALE_FACTOR = 2.0;
const BUFFER_SIZE = 3072/DOWNSCALE_FACTOR;

// XXX: TBI
enum MOUNT_POSITION {
    CEILING,
    DESK,
    WALL
}

const amdFidelityCASVShader = `#version 300 es
    in vec4 a_position;
    in vec2 a_texcoord;
    
    uniform mat4 u_matrix;
    
    out vec2 v_texcoord;
    
    void main() {
      v_texcoord = a_texcoord;
      gl_Position = u_matrix * a_position;
    }
`;

const amdFidelityCASFShader = `#version 300 es
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

let rotationAngle = 0.7;

const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const screenQuad = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(screenQuad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 2, gl.FLOAT, false, 0, 0);
    if (bindings!.in!.a_texcoord) {
        gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
        gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    }
    return {vao: vao, verticies: screenQuad.length / 2};
}

const createProjectionMatrix = (w: number, h: number, x?: number, y?: number) => {
    let m = mat4.create();
    mat4.ortho(m, 0, w, h, 0, -1, 1);
    mat4.translate(m, m, [x || 0, y || 0, 0]);
    return m;
}

const configureWebGL2Pipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement, opticProfile: Float32Array): FCADewarpHandle => {
    const compiler = shaderCompiler(gl);
    const {
        program: dewarpProgram,
        bindings: dewarpBindings
    } = compiler.compileProgram({vertexShader: dewarpVertexShader, fragmentShader: dewarpFragmentShader});
    const {program: postProcessProgram, bindings: fidelityCASBindings} = compiler.compileProgram({vertexShader: amdFidelityCASVShader, fragmentShader: amdFidelityCASFShader});

    const vaoObj = createVAO(gl, dewarpBindings);
    const vaoObj2 = createVAO(gl, fidelityCASBindings);

    let frameCounter = 0;

    const drawQuad = (vao: any, bindings: FCAGLBindingMap, programSetup: (gl: WebGL2RenderingContext) => void, tex: FCAGLTextureObject, fbo: FAGLFBOObject | null, textureUnit: GLenum) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
        if(fbo?.texObject) {
            gl.viewport(0, 0, fbo.texObject.width, fbo.texObject.height);
        } else {
            gl.viewport(0,0,gl.canvas.width, gl.canvas.height);
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        programSetup(gl);

        gl.bindVertexArray(vao.vao);

        gl.activeTexture(textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex.tex);

        if (bindings.uniform!.u_matrix) {
            const matrix = createProjectionMatrix(downsampleCtx.width, downsampleCtx.height, 0, 0);
            mat4.scale(matrix, matrix, [downsampleCtx.width, downsampleCtx.height, 1]);

            gl.uniformMatrix4fv(bindings.uniform!.u_matrix.address, false, matrix);
        }

        gl.drawArrays(gl.TRIANGLES, 0, vao.verticies);
    }

    const createTexture = (w: number, h:number) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return {tex: tex, width: w, height: h};
    }

    type FAGLFBOObject = {fbo: WebGLFramebuffer, texObject: FCAGLTextureObject};

    const createFBO = (w: number, h: number) : FAGLFBOObject => {
        const textureObject = createTexture(w,h);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureObject.tex, 0)
        return {fbo: fb!, texObject: textureObject};
    };

    const downsampleCtx = document.createElement('canvas');
    const downsample = downsampleCtx.getContext("2d");
    downsample!.imageSmoothingEnabled = true;
    downsampleCtx.width = BUFFER_SIZE;
    downsampleCtx.height = BUFFER_SIZE;

    const frameTexture = createTexture(downsampleCtx.width, downsampleCtx.height);
    const dewarpFBO = createFBO(downsampleCtx.width, downsampleCtx.height);

    const sampleVideoFrame = (v: HTMLVideoElement | HTMLCanvasElement) => {
        let offsetX = 0;
        let offsetY = 0;

        gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);

        if(TUNING_CONSTANTS.workaroundSlowTexSubImage) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, v.width, v.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, offsetX, offsetY,
                frameTexture.width-offsetX, frameTexture.height-offsetY, gl.RGBA, gl.UNSIGNED_BYTE, v);
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

    const updateRender = () => {
        rotationAngle+=(Math.PI/180.0);
        if (frameSource) {
            updateFramebufferSize();

            drawQuad(vaoObj, dewarpBindings, (gl) => {
                gl.useProgram(dewarpProgram);

                gl.uniform3fv(dewarpBindings.uniform!.rotateData.address,
                  [0.0,(Math.PI/180.0)*55,
                      -(Math.PI/180.0)*120]);

                gl.uniform1f(dewarpBindings.uniform!.tangentOfFieldOfView.address, Math.tan((Math.PI/180.0)*30.0));
                gl.uniform4fv(dewarpBindings.uniform!.LensProfile.address, opticProfile );
                gl.uniform2fv(dewarpBindings.uniform!.video_size.address,[frameSource!.videoWidth,frameSource!.videoHeight]);
                gl.uniform1i(dewarpBindings.uniform!.u_texture.address, 0);

            }, frameTexture, dewarpFBO, gl.TEXTURE0);

            requestAnimationFrame(updateRender);

            if((frameCounter++ & 0x3) === 0) {
                downsample!.drawImage(frameSource!, 0,0, downsampleCtx.width, downsampleCtx.height);
                sampleVideoFrame(downsampleCtx);
            }

            drawQuad(vaoObj2, fidelityCASBindings, (gl) => {
                gl.useProgram(postProcessProgram);
                gl.uniform1i(fidelityCASBindings.uniform!.u_texture.address, 1);
                gl.uniform1f(fidelityCASBindings.uniform!.divider.address, .5+Math.sin((Math.PI/180.0)*frameCounter)*0.5);
            }, dewarpFBO.texObject, null, gl.TEXTURE1);

        } else {
            console.log('No frameSource');
        }
    }

    return {
        startDewarp: (frame: HTMLVideoElement) => {
            if(frameSource == null) {
                console.log('Starting dewarp');
                frameSource = frame;
                updateRender();
            }
        },
        stopRender: () => {
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

export const DewarpComponent: React.FC<React.PropsWithChildren<any>> =
    React.forwardRef(({children, lensProfile}, ref) => {
        const [glPipe, setGlPipeline] = useState<FCAGLPipeline | null>(null);
        const [opticProfile, setOpticProfile] = useState<Float32Array>(new Float32Array([0,0,0,0]));

        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

        useEffect(() => {
            if(lensProfile) {
                while(lensProfile.length<4) {
                    lensProfile.unshift(0);
                }
                setOpticProfile(new Float32Array(lensProfile));
            }
        },[lensProfile]);

        useImperativeHandle(ref, () => ({
            startDewarp: (video: HTMLVideoElement) => {
                if (glPipe) {
                    glPipe.startDewarp(video);
                } else {
                    console.error('glpipeline is not ready yet!');
                }
            }
        }), [glPipe]);

        useEffect(() => {
            if (canvasRef.current && containerRef.current) {
                console.info('Setting up rendering pipeline');
                const canvas = canvasRef.current;
                const container = containerRef.current;

                container.onwheel = (ev) => {
                    ev.preventDefault();
                }

                let sampleMouse = false;
                container.onmousedown = (ev) => {
                    ev.preventDefault();
                    sampleMouse = true;
                }

                container.onmouseup = (ev) => {
                    ev.preventDefault();
                    sampleMouse = false;
                }

                container.onmousemove = (ev) => {
                    ev.preventDefault();
                    if(sampleMouse) {
                        //console.log('Move', ev.movementX, ev.movementY);
                    }
                }

                const glContext = canvas.getContext("webgl2");

                if (!glContext) {
                    console.error('WebGL2 is not available unable to start!');
                    return;
                }

                const glPipeline = configureWebGL2Pipeline(glContext, container, opticProfile);

                setGlPipeline(glPipeline);

                return () => {
                    console.info('Shutting down pipeline');
                    if (glPipeline) {
                        glPipeline.shutdown();
                    }
                }
            }

        }, [canvasRef, containerRef, opticProfile]);

        return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow: 'hidden'}}>
            <div style={{position: 'relative'}}>
                <canvas ref={canvasRef} style={{left: '0px', top: '0px', position: 'absolute'}}></canvas>
                <div style={{left: '0px', top: '0px'}}>
                    {children}
                </div>
            </div>
        </div>)
    })