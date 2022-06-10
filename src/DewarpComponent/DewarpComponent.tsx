import React, {useEffect, useImperativeHandle, useRef, useState} from "react";
import {FCAGLBindingMap, shaderCompiler} from "./FCAShaderCompiler";
import {mat4} from 'gl-matrix';
type FCAGLPipeline = { submitFrame: (video: HTMLVideoElement) => void, stopRender: () => void};

const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const quad = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
    gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    return {vao: vao, verticies: quad.length / 2};
}

const createProjectionMatrix = (w: number, h: number, x?: number, y?: number) => {
    let m = mat4.create();
    mat4.ortho(m, 0, w, h, 0, -1, 1);
    mat4.translate(m, m, [x || 0, y || 0, 0]);
    mat4.scale(m, m, [w, h, 1]);
    return m;
}


const configureWebGL2Pipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement):{ stopRender: () => void; submitFrame: (frame: HTMLVideoElement) => void; shutdown: () => void } => {
    const compiler = shaderCompiler(gl);
    const {program, bindings} = compiler.compileProgram();

    const vaoObj = createVAO(gl, bindings);

    const drawQuad = (tex: WebGLTexture) => {
        const bbox = container.getBoundingClientRect();
        const w = bbox.width - bbox.left;
        const h = bbox.height - bbox.top;
        gl.canvas.width = w;
        gl.canvas.height = h;

        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);

        gl.bindVertexArray(vaoObj.vao);

        gl.uniform1i(bindings.uniform!.u_texture.address, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        const matrix = createProjectionMatrix(w, h);
        gl.uniformMatrix4fv(bindings.uniform!.u_matrix.address, false, matrix);

        gl.drawArrays(gl.TRIANGLES, 0, vaoObj.verticies);
    }

    const frameTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const updateTexture = (v: HTMLVideoElement) => {
        gl.bindTexture(gl.TEXTURE_2D, frameTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, v.videoWidth, v.videoHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
    }

    let frameSource : HTMLVideoElement | null = null;

    const updateRender = () => {
        if(frameSource) {
            updateTexture(frameSource!);
            drawQuad(frameTexture!);
            requestAnimationFrame(updateRender);
        } else {
            console.log('No frameSource');
        }
    }

    return {
        submitFrame: (frame: HTMLVideoElement) => {
            //if(frameSource !== frame) {
                frameSource = frame;
                updateRender();
            //}
        },
        stopRender: () => {
            frameSource = null;
        },
        shutdown: () => {
            frameSource = null;
            gl.deleteTexture(frameTexture!);
        }
    }
}

export const DewarpComponent: React.FC<React.PropsWithChildren<any>> =
    React.forwardRef(({children}, ref) => {
        const [glPipe, setGlPipeline] = useState<FCAGLPipeline | null>(null);

        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

        useImperativeHandle(ref, () => ({
            processFrame: (video: HTMLVideoElement) => {
                if (glPipe) {
                    glPipe.submitFrame(video);
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
                    // Scroll in/out;
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

                const glPipeline = configureWebGL2Pipeline(glContext, container);

                setGlPipeline(glPipeline);

                return () => {
                    console.info('Shutting down pipeline');
                    if(glPipeline) {
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