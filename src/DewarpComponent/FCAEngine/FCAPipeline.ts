export type FCAGLPipeline = { startDewarp: (video: HTMLVideoElement) => void, stopRender: () => void };

export type FCAGLTextureObject = {
    tex: WebGLTexture | null;
    width: number;
    height: number;
}