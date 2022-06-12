import React, {useEffect, useImperativeHandle, useRef, useState} from "react";
import {FCAGLBindingMap, shaderCompiler} from "./FCAEngine/FCAShaderCompiler";
import {mat4, mat2, glMatrix} from 'gl-matrix';
import {AXISDewarpFragmentShaderWebGL2, AXISDewarpVertexShaderWebGL2} from "./Shaders/AXISDewarpShader";
import {createVAO, FCAGLPipeline, FCAGLTextureObject} from "./FCAEngine/FCAPipeline";
import {AMDFidelityFXCAS} from "./Shaders/AMDFidelityFXCAS";
glMatrix.setMatrixArrayType(Array);

export type FCADewarpHandle =
    { stopRender: () => void; startDewarp: (frame: HTMLVideoElement) => void; shutdown: () => void }

const TUNING_CONSTANTS = {
    workaroundSlowTexSubImage: false
};

let DOWNSCALE_FACTOR = 1.0;
const BUFFER_SIZE = 2048 / DOWNSCALE_FACTOR;

let rotationAngle = 0.7;
let depth=0;

/*
const createProjectionMatrix = (w: number, h: number, x?: number, y?: number) => {
    const projectionMatrix = mat4.create();
    const cameraMatrix = mat4.create();
    const viewMatrix = mat4.create();
    const viewProjection = mat4.create();
    //mat4.ortho(m, 0, w, h, 0, -10, 10);

    mat4.identity(projectionMatrix);
    mat4.perspective(projectionMatrix,Math.PI/4,w/h,1/256,1000);

    mat4.copy(cameraMatrix,projectionMatrix);
   // mat4.translate(cameraMatrix, cameraMatrix,[ 0, 0, depth+=0.1  ]);

    mat4.rotateX(cameraMatrix, projectionMatrix,rotationAngle);// Math.PI/180.0 * 40);
    mat4.rotateY(cameraMatrix, cameraMatrix,rotationAngle);// Math.PI/180.0 * 40);
    mat4.rotateZ(cameraMatrix, cameraMatrix,rotationAngle);// Math.PI/180.0 * 40);

    console.log(depth);

    mat4.invert(viewMatrix, cameraMatrix);
    mat4.translate(viewMatrix, viewMatrix,[ 0, 0, 0]);

    mat4.multiply(viewProjection, projectionMatrix, viewMatrix);

   // mat4.translate(projectionMatrix, projectionMatrix, [x || 0, y || 0, 0]);

  //  mat4.rotateY(m,m,rotationAngle);//(Math.PI/180.0) * 10.0 );
    //mat4.frustum(m, 0, w, h, 0, -0, 1);
    //mat4.perspectiveFromFieldOfView(m, 90, 0, 10);

    return viewProjection;
}*/

const configureWebGL2Pipeline = (gl: WebGL2RenderingContext, container: HTMLDivElement, opticProfile: Float32Array): FCADewarpHandle => {
    const compiler = shaderCompiler(gl);
    const AXISDewarp =  compiler.compileProgram({
        vertexShader: AXISDewarpVertexShaderWebGL2,
        fragmentShader: AXISDewarpFragmentShaderWebGL2
    });
    const AMDFidelityCAS = compiler.compileProgram({
        fragmentShader: AMDFidelityFXCAS
    });
    const SimpleCopy = compiler.compileProgram();

    const Solid = compiler.compileProgram({
vertexShader:`#version 300 es
    precision highp float;

    in vec4 a_position;
    in vec2 a_texcoord;
    in float a_flip;
    uniform mat4 u_projection;
    uniform mat4 u_view;
    uniform mat4 u_model;
    
    out vec2 v_texcoord;
    
    void main() {
      gl_Position = u_projection * u_view * u_model * vec4(a_position.xyz,1.0);
      v_texcoord = a_texcoord;
    }
`,

  fragmentShader: `#version 300 es
    precision highp float;
     
    in vec2 v_texcoord;
    uniform sampler2D u_texture;
    out vec4 color;
     
    void main() {
       color = vec4(1.,0.,0.,1.);
    }
`
    });
    const vaoObj = createVAO(gl, AXISDewarp.bindings, true);
    const vaoObj2 = createVAO(gl, AMDFidelityCAS.bindings, true);
    const vaoObj3 = createVAO(gl, SimpleCopy.bindings, true);
    const solid = createVAO(gl, Solid.bindings, false);

    let frameCounter = 0;

    const drawQuad = (vao: any, bindings: FCAGLBindingMap, programSetup: (gl: WebGL2RenderingContext) => void, tex: FCAGLTextureObject, fbo: FAGLFBOObject | null, textureUnit: GLenum) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
        if (fbo?.texObject) {
            gl.viewport(0, 0, fbo.texObject.width, fbo.texObject.height);
        } else {
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        }
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        //gl.enable(gl.DEPTH_TEST);

        // tell webgl to cull faces
        //gl.enable(gl.CULL_FACE);

        programSetup(gl);

        gl.bindVertexArray(vao.vao);

        gl.activeTexture(textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex.tex);

            //let matrix = createProjectionMatrix(gl.canvas.width, gl.canvas.height, downsampleCtx.width, downsampleCtx.height);
            //mat4.scale(matrix, matrix, [downsampleCtx.width, downsampleCtx.height, 1]);

        const projection = mat4.create();
        mat4.identity(projection);
        mat4.perspective(projection,90 * Math.PI/180,gl.canvas.width/gl.canvas.height,0.0,100);
        //mat4.ortho(projection, -10,10,-10,10,-10,10);
        gl.uniformMatrix4fv(bindings.uniform!.u_projection.address, false, projection);
        const view = mat4.create();
        mat4.identity(view);
        mat4.lookAt(view,[0,0,10],[0,0,0],[0,1,0]);
        gl.uniformMatrix4fv(bindings.uniform!.u_view.address, false, view);

        const model = mat4.create();
        mat4.identity(model);
      //  mat4.fromScaling(model,[20,20,20]);
        //mat4.fromScaling(model, [.5,.5,.5]);
       // mat4.translate(model,model,[0,0,9]);
        depth++;
        mat4.rotateZ(model,model,depth * Math.PI/180 )
        gl.uniformMatrix4fv(bindings.uniform!.u_model.address, false, model);

     //   console.log(bindings.uniform!.u_model.get());

        gl.drawArrays(gl.TRIANGLES, 0, vao.vertices);
    }

    const createTexture = (w: number, h: number) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    downsample!.imageSmoothingEnabled = true;
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
        gl.canvas.width = window.innerWidth;//w;
        gl.canvas.height = window.innerHeight;//h;
    }

    const updateRender = () => {
        frameCounter++;
        rotationAngle += (Math.PI / 180.0);
        if (frameSource) {
            updateFramebufferSize();
            drawQuad(solid, Solid.bindings, (gl) => {
                gl.useProgram(Solid.program);
//                gl.uniform1i(Solid.bindings.uniform!.u_texture.address, 1);
            }, frameTexture, null, gl.TEXTURE0);
/*
            drawQuad(vaoObj, AXISDewarp.bindings, (gl) => {
                gl.useProgram(AXISDewarp.program);

                gl.uniform3fv(AXISDewarp.bindings.uniform!.rotateData.address,
                    [0.0, (Math.PI / 180.0) * 55,
                        -(Math.PI / 180.0) * 120]);

                gl.uniform1f(AXISDewarp.bindings.uniform!.tangentOfFieldOfView.address, Math.tan((Math.PI / 180.0) * 30.0));
                gl.uniform4fv(AXISDewarp.bindings.uniform!.LensProfile.address, opticProfile);
                gl.uniform2fv(AXISDewarp.bindings.uniform!.video_size.address, [frameSource!.videoWidth, frameSource!.videoHeight]);
                gl.uniform1i(AXISDewarp.bindings.uniform!.u_texture.address, 0);

            }, frameTexture, dewarpFBO, gl.TEXTURE0);


            //if ((frameCounter++ & 0x3) === 0) {
                downsample!.drawImage(frameSource!, 0, 0, downsampleCtx.width, downsampleCtx.height);
                sampleVideoFrame(downsampleCtx);
            //}

            drawQuad(vaoObj, AMDFidelityCAS.bindings, (gl) => {
                gl.useProgram(AMDFidelityCAS.program);
                gl.uniform1i(AMDFidelityCAS.bindings.uniform!.u_texture.address, 1);
            }, dewarpFBO.texObject, postProcessFBO, gl.TEXTURE1);

            drawQuad(vaoObj, SimpleCopy.bindings, (gl) => {
                gl.useProgram(SimpleCopy.program);
                gl.uniform1i(SimpleCopy.bindings.uniform!.u_texture.address, 2);
            }, postProcessFBO.texObject, null, gl.TEXTURE2);
*/
            requestAnimationFrame(() => {
                updateRender()
            });
        } else {
            console.log('No frameSource');
        }
    }

    return {
        startDewarp: (frame: HTMLVideoElement) => {
            if (frameSource == null) {
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
        const [opticProfile, setOpticProfile] = useState<Float32Array>(new Float32Array([0, 0, 0, 0]));

        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

        useEffect(() => {
            if (lensProfile) {
                while (lensProfile.length < 4) {
                    lensProfile.unshift(0);
                }
                setOpticProfile(new Float32Array(lensProfile));
            }
        }, [lensProfile]);

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
                    if (sampleMouse) {
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