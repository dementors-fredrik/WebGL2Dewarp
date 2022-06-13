import React, {useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import videoSrc from './assets/video.mp4';
import {VirtualPtzHandle, VirtualPtzComponent} from './DewarpComponent/VirtualPtzComponent';


function App() {
    const virtualPtz = useRef<VirtualPtzHandle>(null);
    const videoTag = useRef<HTMLVideoElement>(null);
    const [dewarping, setDewarping] = useState(false);
    const lensProfile = [113.889694,-60.882477,751.488831];
    const ptzSetting = [4.109286700809463, -0.9885839816668688, 0.8351400470792861];

    /*
    useEffect(() => {
        if(virtualPtz.current) {
            virtualPtz.current.setPtz(ptzSetting);
        }
    },[ptzSetting, virtualPtz]);*/

    return (
        <div style={{width: '100%', height: '100%'}}>
            <button onClick={() => setDewarping(!dewarping)}>{dewarping ? 'Disable dewarp' : 'Enable dewarp'}</button>
            <VirtualPtzComponent ref={virtualPtz} videoElement={videoTag} lensProfile={lensProfile} performDewarp={dewarping}>
                <video ref={videoTag} loop autoPlay={true} muted={true} src={videoSrc} width={'100%'}
                       height={'100%'}></video>
            </VirtualPtzComponent>)
        </div>
    );
}

export default App;
