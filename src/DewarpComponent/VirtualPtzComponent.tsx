import React, {
    MutableRefObject,
    Ref,
    RefObject,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from "react";

import {FCAGLConfigurePipeline} from "./FCAGLDewarpEngine/FCAPipeline";
import { vec2 } from "gl-matrix";

export const toRad = (deg: number) => deg * Math.PI / 180.0;
export const toDeg = (rad: number) => rad / Math.PI * 180.0;

export type VirtualPtzHandle = {
    start: (v: HTMLVideoElement) => void;
    stop: () => void;
    setPtz: (ptz : Array<number>) => void;
    setFOV: (fov: number) => void;
};

const uniformBuffer = {
    rotation: [0,Math.PI/2,0],
    FOV: Math.PI/2
};

export const VirtualPtzComponent: React.FC<React.PropsWithChildren<{ ref: Ref<VirtualPtzHandle>, videoElement: RefObject<HTMLVideoElement>, lensProfile?: Array<number>, performDewarp?: boolean }>> =
    React.forwardRef(({children, lensProfile, performDewarp, videoElement}, ref) => {
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

        const glPipe = useMemo(()  => {
            if (canvasRef.current && containerRef.current && opticProfile) {
                console.info('Setting up rendering pipeline');
                const canvas = canvasRef.current;
                const container = containerRef.current;
                let sampleMouse = false;
                let dx = 0, dy = 0;
                let targetFov = uniformBuffer.FOV;

                const updateFov = () => {
                    const delta = wheelEvents.reduce((acc, ev) => {
                        return acc + ev.deltaY;
                    }, 0) * 0.001;

                    if(delta>0) {
                        targetFov= toRad(toDeg(uniformBuffer.FOV)/1.4);
                        if(targetFov<2*Math.PI/180.0) {
                            targetFov=2*Math.PI/180.0;
                        }
                    } else if(delta<0) {
                        targetFov = toRad(toDeg(uniformBuffer.FOV)*1.3);
                        if(targetFov>90*Math.PI/180.0) {
                            targetFov=90*Math.PI/180.0;
                        }
                    }
                    wheelEvents = [];
                    const step = Math.abs(targetFov-uniformBuffer.FOV)/100;
                    if (targetFov < uniformBuffer.FOV) {
                        if (uniformBuffer.FOV - step < 2 * Math.PI / 180.0) {
                            uniformBuffer.FOV = 2 * Math.PI / 180.0;
                            targetFov = uniformBuffer.FOV;
                        } else {
                            uniformBuffer.FOV -= step;
                        }
                    } else if (targetFov > uniformBuffer.FOV) {
                        if (uniformBuffer.FOV + step > 360 * Math.PI / 180.0) {
                            uniformBuffer.FOV = 360 * Math.PI / 180.0;
                            targetFov = uniformBuffer.FOV;
                        } else {
                            uniformBuffer.FOV += step;
                        }
                    }

                    if(Math.abs(toDeg(targetFov)-toDeg(uniformBuffer.FOV))*10.0 < 1)  {
                        targetFov = uniformBuffer.FOV;
                        return;
                    }
                   requestAnimationFrame(updateFov);
                }

                let wheelTimer : NodeJS.Timeout | number | null = null;
                let wheelEvents : Array<any> = [];
                container.onwheel = (ev) => {
                    ev.preventDefault();
                    if(!wheelEvents.length) {
                        wheelEvents.push(ev);
                        setTimeout(() => {
                            requestAnimationFrame(updateFov);
                        },20);
                    }
                }

                const calcRotationSpeed = (vec: vec2, scale: number) => {
                    const aspect = canvas.height/canvas.width;
                    const scaledVector = vec2.create();
                    vec2.scale(scaledVector, vec, scale);

                    dx = -((scaledVector[0]/(canvas.width*aspect))*uniformBuffer.FOV);
                    dy = -((scaledVector[1]/canvas.height)*uniformBuffer.FOV);
                    return vec2.fromValues(dx, dy);
                }


                let mouseSample = Date.now();
                let clickVector = vec2.create();
                let velocityVector = vec2.create();

                container.onmousedown = (ev) => {
                    mouseSample = Date.now();
                    ev.preventDefault();
                    clickVector = vec2.fromValues((canvas.width / 2) - ev.clientX,(canvas.height/ 2) - ev.clientY);

                    velocityVector = calcRotationSpeed(clickVector, Math.sqrt(uniformBuffer.FOV*vec2.length(clickVector)));

                    const updatePtz = () => {
                        const c = uniformBuffer.rotation;
                        uniformBuffer.rotation = [toRad(velocityVector[0])+c[0], toRad(velocityVector[1])+c[1],c[2]];
                        if(sampleMouse) {
                            requestAnimationFrame(updatePtz);
                        }
                    }
                    sampleMouse = true;
                    requestAnimationFrame(updatePtz);
                }

                container.onmouseup = (ev) => {
                    sampleMouse = false;
                    clickVector = vec2.fromValues((canvas.width / 2) - ev.clientX, (canvas.height/ 2) - ev.clientY);

                    if(Date.now() - mouseSample < 130) {
                        const clickToCenter = () => {
                            vec2.scale(clickVector, clickVector, 0.9);
                            const c = uniformBuffer.rotation;
                            velocityVector = calcRotationSpeed(clickVector, Math.sqrt(uniformBuffer.FOV*vec2.length(clickVector)));
                            uniformBuffer.rotation = [(toRad(velocityVector[0]))+c[0], (toRad(velocityVector[1]))+c[1],c[2]];
                            if(vec2.squaredLength(clickVector) > 1) {
                                requestAnimationFrame(clickToCenter);
                            }
                        }
                        clickToCenter();
                    }

                    ev.preventDefault();
                }

                container.onmouseleave = (ev) => {
                    sampleMouse = false;
                    ev.preventDefault();
                }

                container.onmousemove = (ev) => {
                    ev.preventDefault();
                    if (sampleMouse) {
                        const aspect = canvas.height/canvas.width;
                        clickVector = vec2.fromValues((canvas.width / 2) - ev.clientX,(canvas.height/ 2) - ev.clientY);
                        velocityVector = calcRotationSpeed(clickVector,Math.sqrt(uniformBuffer.FOV*vec2.length(clickVector)));
                    }
                }

                const glContext = canvas.getContext("webgl2");

                if (!glContext) {
                    console.error('WebGL2 is not available unable to start!');
                    return;
                }

                return FCAGLConfigurePipeline(glContext, container, opticProfile, uniformBuffer);
            }
        }, [canvasRef, containerRef, opticProfile]);

        useEffect(() => {
            console.log('Trying to bootstrap', glPipe, videoElement.current);

            if(glPipe && videoElement.current) {
                console.log('Bootstrap glPipe');
                const c = uniformBuffer.rotation;
                uniformBuffer.rotation = [c[0], c[1], c[2]];
                //Starta
                glPipe.start(videoElement.current);
                return () => {
                    console.log('Shutting down glPipe');
                    glPipe!.shutdown()
                }
            }
        }, [glPipe, videoElement])

        useEffect(() => {
            if(glPipe && performDewarp !== undefined) {
                console.log('Dewarp is now ', performDewarp);
                glPipe.setDewarpEnabled(performDewarp);
            }
        },[glPipe, performDewarp]);

        useImperativeHandle(ref, () => ({
            start: () => {

            },
            stop: () => {
                glPipe!.stop();
            },
            setPtz: (ptzParams: Array<number>) => {
                uniformBuffer.rotation = [ptzParams[0], ptzParams[1]];
              //  glPipe!.setFOV(ptzParams[2]);
            },
            setFOV: (fov: number) => {
                glPipe!.setFOV(fov);
            }
        }), [glPipe]);

        return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow: 'hidden'}}>
            <div style={{position: 'relative'}}>
                <canvas ref={canvasRef} style={{left: '0px', top: '0px', position: 'absolute'}}></canvas>
                <div style={{left: '0px', top: '0px'}}>
                    {children}
                </div>
            </div>
        </div>)
    })