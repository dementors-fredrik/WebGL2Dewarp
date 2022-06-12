import {FCAGLBindingMap} from "./FCAShaderCompiler";

export type FCAGLPipeline = { startDewarp: (video: HTMLVideoElement) => void, stopRender: () => void };

export type FCAGLTextureObject = {
    tex: WebGLTexture | null;
    width: number;
    height: number;
}

export const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap, forFBO: boolean) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vaoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vaoBuffer);

    const screenQuad = [
        -1.0, -1.0,  0.0,
        1.0, -1.0,  0.0,
        1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0,
        1.0,  1.0,  0.0,
        -1.0,  1.0,  0.0
    ];

    const texQuad = [
        0.0,  0.0,
        1.0,  0.0,
        1.0,  1.0,
        0.0,  0.0,
        1.0,  1.0,
        0.0,  1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(screenQuad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 3, gl.FLOAT, false, 0, 0);

    const texBuffer = gl.createBuffer();
    if (bindings!.in!.a_texcoord) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texQuad), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
        gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    } else {
        gl.deleteBuffer(texBuffer);
    }
    return {vao: vao, vertices: screenQuad.length / 3, buffers: [vaoBuffer]};
}