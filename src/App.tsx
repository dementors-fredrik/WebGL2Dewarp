import React, {useCallback, useEffect, useRef} from 'react';
import {DewarpComponent, FCADewarpHandle} from "./DewarpComponent/DewarpComponent";
import videoSrc from './assets/video.mp4';


const VideoComponent: React.FC<{ onPlaybackStarted: any }> = ({onPlaybackStarted}) => {
    const videoEl = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoEl.current) {
            const vi = videoEl.current as HTMLVideoElement;
            vi.onplaying = () => {
                onPlaybackStarted(vi);
            }
        }
    }, [onPlaybackStarted, videoEl]);

    return (<video controls={true} ref={videoEl} loop autoPlay={true} muted={true} src={videoSrc} width={'100%'}
                   height={'100%'}></video>);
}

function App() {
    const glueCallback = useRef<FCADewarpHandle>(null);

    const lensProfile = [113.889694,-60.882477,751.488831];
    const ptzSetting = {x: 4.109286700809463, y: -0.9885839816668688, fov: 0.8351400470792861};

    const processFrame = useCallback((v: HTMLVideoElement) => {
        if (glueCallback.current) {
            setTimeout(() => {
                glueCallback.current!.startDewarp(v);
            },100);
        } else {
            console.error('No callback yet');
        }

    }, [glueCallback]);

        useEffect(() => {
            console.log("trigger");
            const v = document.createElement('video');
            processFrame(v);
        },[processFrame])

    return (
        <div style={{width: '100%', height: '100%'}}>
            <DewarpComponent ref={glueCallback} lensProfile={lensProfile}>
                {/*   <VideoComponent onPlaybackStarted={processFrame}/> */}
            </DewarpComponent>)
        </div>
    );
}

export default App;
