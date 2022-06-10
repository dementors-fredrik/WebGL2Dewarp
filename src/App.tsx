import React, {useCallback, useEffect, useRef} from 'react';
import {WebGL2Component} from "./WebGL2Component/WebGL2Component";
import videoSrc from './assets/video.mp4';


const VideoComponent : React.FC<{onFrame: any}>= ({onFrame}) => {
    const videoEl = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoEl.current) {
            const vi = videoEl.current as HTMLVideoElement;
            vi.ontimeupdate = () => {
                onFrame(vi);
            }
        }
    }, [onFrame, videoEl]);

    return (<video ref={videoEl} loop={true} autoPlay={true} muted={true} src={videoSrc} width={'100%'}
                   height={'100%'}></video>);
}

function App() {
    const glueCallback = useRef<{processFrame: (v:any) => void}>(null);

    const processFrame = useCallback((v: HTMLVideoElement) => {
        if(glueCallback.current) {
            glueCallback.current.processFrame(v);
        } else {
            console.error('No callback yet');
        }

    }, [glueCallback]);

    return (
        <div style={{width: '100%', height: '100%'}}>
            <WebGL2Component ref={glueCallback}>
                <VideoComponent onFrame={processFrame}/>
            </WebGL2Component>
        </div>
    );
}

export default App;
