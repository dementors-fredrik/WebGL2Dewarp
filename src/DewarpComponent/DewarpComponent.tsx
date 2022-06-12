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
    rotation: [0,0,0],
    FOV: 360*Math.PI/180.0
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

                container.onwheel = (ev) => {
                    if(ev.deltaY>0) {
                        if(uniformBuffer.FOV>2*Math.PI/180.0) {
                            uniformBuffer.FOV-=Math.PI/180.0;
                        }
                    } else {
                        if(uniformBuffer.FOV < 720*Math.PI/180.0) {
                            uniformBuffer.FOV+=Math.PI/180.0;
                        }
                    }
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

                container.onmouseleave = (ev) => {
                    sampleMouse = false;
                    ev.preventDefault();
                }
                container.onmousemove = (ev) => {
                    ev.preventDefault();
                    if (sampleMouse) {
                        const c = uniformBuffer.rotation;
                        uniformBuffer.rotation = [toRad(ev.movementX/10.0)+c[0], toRad(ev.movementY/10.0)+c[1],0];
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

        return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow: 'hidden'}}>
            <div style={{position: 'relative'}}>
                <canvas ref={canvasRef} style={{left: '0px', top: '0px', position: 'absolute'}}></canvas>
                <div style={{left: '0px', top: '0px'}}>
                    {children}
                </div>
            </div>
        </div>)
    })