import React, {useCallback, useEffect, useRef} from 'react';
import {DewarpComponent} from "./DewarpComponent/DewarpComponent";
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

    return (<video controls={true} ref={videoEl} loop autoPlay={true} muted={true} src={videoSrc} width={'50%'}
                   height={'50%'}></video>);
}

function App() {
    const glueCallback = useRef<{processFrame: (v:any) => void}>(null);

    const lensProfile = { x: 113.889694, y: -60.882477, z: 751.488831 };
    const ptzSetting = { x: 4.109286700809463, y: -0.9885839816668688, fov: 0.8351400470792861 };

    const processFrame = useCallback((v: HTMLVideoElement) => {
        if(glueCallback.current) {
            glueCallback.current.processFrame(v);
        } else {
            console.error('No callback yet');
        }

    }, [glueCallback]);

    return (
        <div style={{width: '100%', height: '100%'}}>
            <DewarpComponent ref={glueCallback}>
                <VideoComponent onFrame={processFrame} />
            </DewarpComponent>
        </div>
    );
}

export default App;
