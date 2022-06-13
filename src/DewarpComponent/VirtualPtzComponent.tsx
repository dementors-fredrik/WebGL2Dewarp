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
                    if(targetFov===uniformBuffer.FOV) {
                        return;
                    }
                    const step = (Math.PI / 180.0) * 0.5 * uniformBuffer.FOV;
                    if (targetFov < uniformBuffer.FOV) {
                        if (uniformBuffer.FOV - step < 2 * Math.PI / 180.0) {
                            uniformBuffer.FOV = 2 * Math.PI / 180.0;
                            targetFov = uniformBuffer.FOV;
                        } else {
                            uniformBuffer.FOV -= step;
                        }
                    } else if (targetFov > uniformBuffer.FOV) {
                        if (uniformBuffer.FOV + step > 720 * Math.PI / 180.0) {
                            uniformBuffer.FOV = 720 * Math.PI / 180.0;
                            targetFov = uniformBuffer.FOV;
                        } else {
                            uniformBuffer.FOV += step;
                        }
                    }
                }

                let wheelTimer : NodeJS.Timeout | number | null = null;
                let wheelEvents : Array<any> = [];
                container.onwheel = (ev) => {
                    ev.preventDefault();
                    if(wheelTimer) {
                        clearTimeout(wheelTimer);
                        wheelTimer=null;
                    } else {
                        updateFov();
                    }
                    wheelTimer=setTimeout(() => {
                        wheelTimer=null;
                        targetFov = uniformBuffer.FOV;
                        const delta = wheelEvents.reduce((acc, ev) => {
                            return acc + ev.deltaY;
                        }, 0);
                        if(delta>0) {
                            targetFov-=(Math.PI/180.0)*delta*uniformBuffer.FOV*uniformBuffer.FOV;
                            if(targetFov<2*Math.PI/180.0) {
                                targetFov=2*Math.PI/180.0;
                            }
                        } else if(delta<0) {
                            targetFov += (Math.PI / 180.0)*delta*uniformBuffer.FOV;
                            if(targetFov<720*Math.PI/180.0) {
                                targetFov=720*Math.PI/180.0;
                            }
                        }

                        wheelEvents = [];
                        updateFov();
                    },1);
                    wheelEvents.push(ev);
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