import {FCAGLBindingMap, FCAGLProgramBundle, FCAGLUniformType} from "./FCAShaderCompiler";
import {FCAGLTextureObject} from "./FCAPipeline";

export type FAGLFBOObject = { fbo: WebGLFramebuffer, texObject: FCAGLTextureObject };

export const drawVAO = (gl: WebGL2RenderingContext, vao: any, programObject: FCAGLProgramBundle, renderSetup: (gl: WebGL2RenderingContext, bindings: FCAGLUniformType) => void, fbo: FAGLFBOObject | null = null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
    if (fbo?.texObject) {
        gl.viewport(0, 0, fbo.texObject.width, fbo.texObject.height);
    } else {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(programObject.program);
    renderSetup(gl, programObject.bindings.uniform!);

    gl.bindVertexArray(vao.vao);
    gl.drawArrays(gl.TRIANGLES, 0, vao.vertices);
}

export const createPlaneVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vaoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vaoBuffer);

    const screenQuad = [1, -1, 0,
        -1, 1, 0,
        1, 1, 0,
        1, -1, 0,
        -1, -1, 0,
        -1, 1, 0];

    const texQuad = [1, 0,
        0, 1,
        1, 1,
        1, 0,
        0, 0,
        0, 1];


    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(screenQuad), gl.STATIC_DRAW);

    if (bindings.in!.a_position) {
        gl.enableVertexAttribArray(bindings.in!.a_position.address!);
        gl.vertexAttribPointer(bindings.in!.a_position.address!, 3, gl.FLOAT, false, 0, 0);
    }

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