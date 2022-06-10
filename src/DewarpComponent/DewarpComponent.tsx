import React, {useEffect, useImperativeHandle, useRef, useState} from "react";
import {FCAGLBindingMap, shaderCompiler} from "./FCAShaderCompiler";
import {mat4} from 'gl-matrix';
import {dewarpFragmentShader, dewarpVertexShader} from "./DewarpShader";

type FCAGLPipeline = { startDewarp: (video: HTMLVideoElement) => void, stopRender: () => void };
const DOWNSCALE_FACTOR = 2;
const BUFFER_SIZE = 1024/DOWNSCALE_FACTOR;

const postProcessFragmentShader = `#version 300 es
    in vec4 a_position;
    in vec2 a_texcoord;
    
    uniform mat4 u_matrix;
    
    out vec2 v_texcoord;
    
    void main() {
      v_texcoord = a_texcoord;
      gl_Position = u_matrix * a_position;
    }
`;

const postProcessVertexShader = `#version 300 es
    precision highp float;
     
    in vec2 v_texcoord;
    uniform sampler2D u_texture;
    out vec4 color;
     
    void main() {
       color = vec4(texture(u_texture, v_texcoord).rgb,1);
    }
`;

let ang = 0;

const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const quad = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 2, gl.FLOAT, false, 0, 0);
    if (bindings!.in!.a_texcoord) {
        gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
        gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    }
    return {vao: vao, verticies: quad.length / 2};
}

const createProjectionMatrix = (w: number, h: number, x?: number, y?: number) => {
    let m = mat4.create();
    mat4.ortho(m, 0, w, h, 0, -1, 1);
    mat4.translate(m, m, [x || 0, y || 0, 0]);
    return m;
}


type FCAGLTextureObject = {
    tex: WebGLTexture | null;
    width: number;
    height: number;
}

export type FCADewarpHandle =
    { stopRender: () => void; startDewarp: (frame: HTMLVideoElement) => void; shutdown: () => void }


const configureWebGL2Pipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement): FCADewarpHandle => {
    const compiler = shaderCompiler(gl);
    const {
        program: dewarpProgram,
        bindings: dewarpBindings
    } = compiler.compileProgram({vertexShader: dewarpVertexShader, fragmentShader: dewarpFragmentShader});
    const {program: postProcessProgram, bindings: postProcessBindings} = compiler.compileProgram({vertexShader: postProcessFragmentShader, fragmentShader: postProcessVertexShader});

    const vaoObj = createVAO(gl, dewarpBindings);
    const vaoObj2 = createVAO(gl, postProcessBindings);

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
            const matrix = createProjectionMatrix(downsampleBuffer.width, downsampleBuffer.height, 0, 0);
            mat4.scale(matrix, matrix, [downsampleBuffer.width, downsampleBuffer.height, 1]);

            gl.uniformMatrix4fv(bindings.uniform!.u_matrix.address, false, matrix);
        }

        gl.drawArrays(gl.TRIANGLES, 0, vao.verticies);
    }

    const createTexture = (w: number, h:number) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

    const downsampleBuffer = document.createElement('canvas');
    const downsampleContext = downsampleBuffer.getContext("2d");
    downsampleBuffer.width = BUFFER_SIZE;
    downsampleBuffer.height = BUFFER_SIZE;

    const frameTexture = createTexture(downsampleBuffer.width, downsampleBuffer.height);
    const dewarpFBO = createFBO(downsampleBuffer.width, downsampleBuffer.height);

    const updateTexture = (v: HTMLVideoElement | HTMLCanvasElement, w: number, h: number) => {
        gl.bindTexture(gl.TEXTURE_2D, frameTexture.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
    }

    let frameSource: HTMLVideoElement | null = null;

    const updateRender = () => {
        if (frameSource) {
            const bbox = container.getBoundingClientRect();
            const w = bbox.width - bbox.left;
            const h = bbox.height - bbox.top;
            gl.canvas.width = w;
            gl.canvas.height = h;

            downsampleContext!.drawImage(frameSource!, 0,0, downsampleBuffer.width, downsampleBuffer.height);
           // downsampleContext!.fillStyle = "#FF0000";

           // downsampleContext!.fillRect(0,0,256,256);

            updateTexture(downsampleBuffer, downsampleBuffer.width, downsampleBuffer.height);

            drawQuad(vaoObj, dewarpBindings, (gl) => {
                gl.useProgram(dewarpProgram);

                if(dewarpBindings.uniform!.rotateData) {
                    ang+=0.01; //3.14159256/180.0;
                    gl.uniform3fv(dewarpBindings.uniform!.rotateData.address,
                        new Float32Array([ang % (2.0 * Math.PI),
                            1.5, 1.5+Math.sin(-ang)]));
                    console.log(ang);
                    //    new Float32Array([Math.cos(ang), -Math.sin(ang += 0.001), Math.cos(-ang)]));
                }

                gl.uniform1f(dewarpBindings.uniform!.tangentOfFieldOfView.address, Math.sin(ang));
                gl.uniform1i(dewarpBindings.uniform!.width.address, gl.canvas.clientWidth/5.0);
                gl.uniform1i(dewarpBindings.uniform!.height.address, gl.canvas.clientHeight/5.0);
                if(dewarpBindings.uniform!.u_texture) {
                    gl.uniform1i(dewarpBindings.uniform!.u_texture.address, 0);
                }
            }, frameTexture, dewarpFBO, gl.TEXTURE0);
            drawQuad(vaoObj2, postProcessBindings, (gl) => {
                gl.useProgram(postProcessProgram);

                if (postProcessBindings.uniform!.u_texture) {
                    gl.uniform1i(postProcessBindings.uniform!.u_texture.address, 1);
                }
            }, dewarpFBO.texObject, null, gl.TEXTURE1);

            requestAnimationFrame(updateRender);
        } else {
            console.log('No frameSource');
        }
    }

    return {
        startDewarp: (frame: HTMLVideoElement) => {
            //if(frameSource !== frame) {
            console.log('Starting dewarp');
            frameSource = frame;
            updateRender();
            //}
        },
        stopRender: () => {
            frameSource = null;
        },
        shutdown: () => {
            frameSource = null;
            gl.deleteTexture(frameTexture.tex!);
        }
    }
}

export const DewarpComponent: React.FC<React.PropsWithChildren<any>> =
    React.forwardRef(({children}, ref) => {
        const [glPipe, setGlPipeline] = useState<FCAGLPipeline | null>(null);

        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

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
                /*
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
                                }*/

                const glContext = canvas.getContext("webgl2");

                if (!glContext) {
                    console.error('WebGL2 is not available unable to start!');
                    return;
                }

                const glPipeline = configureWebGL2Pipeline(glContext, container);

                setGlPipeline(glPipeline);

                return () => {
                    console.info('Shutting down pipeline');
                    if (glPipeline) {
                        glPipeline.shutdown();
                    }
                }
            }

        }, [canvasRef, containerRef]);

        return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow: 'hidden'}}>
            <div style={{position: 'relative'}}>
                <canvas ref={canvasRef} style={{left: '0px', top: '0px', position: 'absolute'}}></canvas>
                <div style={{left: '0px', top: '0px'}}>
                    {children}
                </div>
            </div>
        </div>)
    })