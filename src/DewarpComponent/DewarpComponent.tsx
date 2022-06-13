import React, {useEffect, useImperativeHandle, useRef, useState} from "react";

import {FCAGLConfigurePipeline, FCAGLPipeline} from "./FCAGLDewarpEngine/FCAPipeline";

export const toRad = (deg: number) => deg * Math.PI / 180.0;
export const toDeg = (rad: number) => rad / Math.PI * 180.0;

export type DewarpComponentHandle = {
    start: (v: HTMLVideoElement) => void;
    stop: () => void;
    setPtz: (ptz : Array<number>) => void;
    setFOV: (fov: number) => void;
};

const uniformBuffer = {
    rotation: [0,Math.PI/2,0],
    FOV: 45*Math.PI/180.0
};

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
            start: (video: HTMLVideoElement) => {
                if (glPipe) {
                    const c = uniformBuffer.rotation;
                    uniformBuffer.rotation = [c[0], c[1], c[2]];

                    glPipe.start(video);
                } else {
                    console.error('glpipeline is not ready yet!');
                }
            },
            stop: () => {
                glPipe!.stop();
            },
            setPtz: (rotationVector: Array<number>) => {
                uniformBuffer.rotation = rotationVector;
            },
            setFOV: (fov: number) => {
                glPipe!.setFOV(fov);
            }
        }), [glPipe]);

        useEffect(() => {
            if (canvasRef.current && containerRef.current) {
                console.info('Setting up rendering pipeline');
                const canvas = canvasRef.current;
                const container = containerRef.current;
                let sampleMouse = false;
                let dx = 0, dy = 0;
                let targetFov = uniformBuffer.FOV;
                let zooming = false;

                const updateFov = () => {
                    if(Math.abs(toDeg(targetFov)-toDeg(uniformBuffer.FOV)) > 1) {
                        zooming=true;
                        if(targetFov>uniformBuffer.FOV) {
                            uniformBuffer.FOV+=(Math.PI/180.0)/3.;
                        }else {
                            uniformBuffer.FOV-=(Math.PI/180.0)/3.;
                        }
                        requestAnimationFrame(updateFov);
                    } else {
                        targetFov=uniformBuffer.FOV;
                        zooming=false;
                    }
                }

                container.onwheel = (ev) => {
                    ev.preventDefault();

                    if(ev.deltaY>0) {
                        if(targetFov>2*Math.PI/180.0) {
                            targetFov-=(Math.PI/180.0*5)/Math.abs(ev.deltaY);
                        }
                    } else if(ev.deltaY<0) {
                        if (targetFov < 720 * Math.PI / 180.0) {
                            targetFov += (Math.PI / 180.0 * 5) / Math.abs(ev.deltaY);
                        }
                    } else {
                        return;
                    }
                    if(!zooming){
                        zooming=true;
                        requestAnimationFrame(updateFov);
                    }
                }


                const calcRotationSpeed = (ev: MouseEvent) => {
                    const aspect = canvas.height/canvas.width;
                    dx = -((canvas.width / 2) - ev.clientX)/(((canvas.width*aspect)/4)/uniformBuffer.FOV);
                    dy = -((canvas.height/ 2) - ev.clientY)/((canvas.height/4)/uniformBuffer.FOV);
                    return { cDx: dx, cDy: dy};
                }
                container.onmousedown = (ev) => {
                    ev.preventDefault();
                    sampleMouse = true;
                    const {cDx, cDy} = calcRotationSpeed(ev);
                    dx = cDx;
                    dy = cDy;
                    const updatePtz = () => {
                        const c = uniformBuffer.rotation;
                        uniformBuffer.rotation = [toRad(dx)+c[0], toRad(dy)+c[1],c[2]];
                        if(sampleMouse) {
                            requestAnimationFrame(updatePtz);
                        }
                    }
                    requestAnimationFrame(updatePtz);
                }

                container.onmouseup = (ev) => {
                    ev.preventDefault();
                    sampleMouse = false;
                }

                container.onmouseleave = (ev) => {
                    sampleMouse = false;
                    ev.preventDefault();
                }

                container.onmousemove = (ev) => {
                    ev.preventDefault();
                    if (sampleMouse) {
                        const {cDx, cDy} = calcRotationSpeed(ev);
                        dx = cDx;
                        dy = cDy;
                    }
                }



                const glContext = canvas.getContext("webgl2");

                if (!glContext) {
                    console.error('WebGL2 is not available unable to start!');
                    return;
                }

                const glPipeline = FCAGLConfigurePipeline(glContext, container, opticProfile, uniformBuffer);

                setGlPipeline(glPipeline);

                return () => {
                    console.info('Shutting down pipeline');
                    if (glPipeline) {
                        glPipeline.shutdown();
                    }
                }
            }

        }, [canvasRef, containerRef, opticProfile]);

        return (<div ref={containerRef} style={{width: "90%", height: "90%", overflow: 'hidden'}}>
            <div style={{position: 'relative'}}>
                <canvas ref={canvasRef} style={{left: '0px', top: '0px', position: 'absolute'}}></canvas>
                <div style={{left: '0px', top: '0px'}}>
                    {children}
                </div>
            </div>
        </div>)
    })