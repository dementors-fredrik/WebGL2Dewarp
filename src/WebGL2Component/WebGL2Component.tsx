import React, {useEffect, useRef} from "react";
import {FCAGLBindingMap, shaderCompiler} from "./FCAShaderCompiler";
import {mat4} from 'gl-matrix';
import arrow from '../Unknown.png';

async function loadImage(gl: WebGL2RenderingContext, url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "true";
        img.addEventListener('load', function () {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            resolve({
                width: img.width,
                height: img.height,
                texture: tex
            });
        });
        img.src = url;
    })
}
const createVAO = (gl: WebGL2RenderingContext, bindings: FCAGLBindingMap) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const quad = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
    gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);
    return { vao: vao, verticies: quad.length/2 };
}

const createProjectionMatrix = (w: number, h: number, x?: number, y?:number) => {
    let m = mat4.create();
    mat4.ortho(m, 0, w, h, 0, -1, 1);
    mat4.translate(m, m, [x || 0, y || 0, 0]);
    mat4.scale(m, m, [w, h, 1]);
    return m;
}

const boostrapWebGL2 = (gl: WebGL2RenderingContext, container: HTMLDivElement) => {
    const compiler = shaderCompiler(gl);
    const {program, bindings} = compiler.compileProgram();

    const vaoObj = createVAO(gl, bindings);

    let ang = 0;

    const drawQuad = (tex: WebGLTexture) => {
        const bbox = container.getBoundingClientRect();
        const w = bbox.width - bbox.left;
        const h = bbox.height - bbox.top;
        gl.canvas.width = w;
        gl.canvas.height = h;

        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);

        gl.bindVertexArray(vaoObj.vao);

        gl.uniform1i(bindings.uniform!.u_texture.address, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        const matrix = createProjectionMatrix(w,h, w/2, h/2);

        mat4.rotate(matrix,matrix,(3.14159/180)*(ang++),[0,0,1]);

        gl.uniformMatrix4fv(bindings.uniform!.u_matrix.address, false, matrix);

        gl.drawArrays(gl.TRIANGLES, 0, vaoObj.verticies);
    }

    loadImage(gl, arrow).then((tex) => {
        const draw = () => {
            drawQuad(tex.texture!);
            requestAnimationFrame(draw);
        }
        requestAnimationFrame(draw);
    });
}

export const WebGL2Component: React.FC<React.PropsWithChildren<any>> = ({children}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current && containerRef.current) {
            const canvas = canvasRef.current;
            const container = containerRef.current;

            const glContext = canvas.getContext("webgl2");

            if (!glContext) {
                console.error('No gl for you');
                return;
            }
            boostrapWebGL2(glContext, container);
        }
    }, [canvasRef, containerRef]);

    return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow: 'hidden'}}>
        <canvas ref={canvasRef}></canvas>
        {children}
    </div>)
}