import React, {useEffect, useRef} from "react";
import {shaderCompiler} from "./FCAShaderCompiler";
import {mat4} from 'gl-matrix';

async function loadImageAndCreateTextureInfo(gl: WebGL2RenderingContext, url: string) : Promise<any> {
    return new Promise((resolve, reject) => {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Fill the texture with a 1x1 blue pixel.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 255, 255]));

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        var textureInfo = {
            width: 1,   // we don't know the size until it loads
            height: 1,
            texture: tex,
        };
        var img = new Image();
        img.crossOrigin = "true";
        img.addEventListener('load', function() {
            textureInfo.width = img.width;
            textureInfo.height = img.height;

            gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            resolve(textureInfo);
        });
        img.src = url;
    })
}

const boostrapWebGL2 = (gl: WebGL2RenderingContext, container: HTMLDivElement) => {
    const compiler = shaderCompiler(gl);
    const { program, bindings} = compiler.compileProgram();

    var vao = gl.createVertexArray();

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        0, 1,
        1, 0,
        1, 0,
        0, 1,
        1, 1,
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings.in!.a_position.address!);
    gl.vertexAttribPointer(bindings.in!.a_position.address!, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        0, 1,
        1, 0,
        1, 0,
        0, 1,
        1, 1,
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(bindings!.in!.a_texcoord.address!);
    gl.vertexAttribPointer(bindings!.in!.a_texcoord.address!, 2, gl.FLOAT, true, 0, 0);

    loadImageAndCreateTextureInfo( gl,'https://i.imgur.com/fHyEMsl.jpg').then((star) => {
        drawImage(program, star.texture!, star.width, star.height, gl.canvas.width-40,0);
    });

    function drawImage(program: WebGLProgram, tex: WebGLTexture, texWidth: number, texHeight: number, dstX: number, dstY: number) {
        const bbox = container.getBoundingClientRect();
        gl.canvas.width=bbox.width-bbox.left;
        gl.canvas.height=bbox.height-bbox.top;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);

        gl.bindVertexArray(vao);

        var textureUnit = 0;
        gl.uniform1i(bindings.uniform!.u_texture.address, textureUnit);

        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        let projection = mat4.create();
        mat4.ortho(projection,0,gl.canvas.clientWidth,gl.canvas.clientHeight,0,-1,1);
        mat4.translate(projection, projection, [dstX, dstY,0]);
        mat4.scale( projection, projection, [texWidth, texHeight, 1] );
        gl.uniformMatrix4fv(bindings.uniform!.u_matrix.address, false, projection);

        var offset = 0;
        var count = 6;
        gl.drawArrays(gl.TRIANGLES, offset, count);
    }
}

export const WebGL2Component : React.FC<React.PropsWithChildren<any>> = ({children}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if(canvasRef.current && containerRef.current) {
            const canvas = canvasRef.current;
            const container = containerRef.current;

            const glContext = canvas.getContext("webgl2");

            if(!glContext) {
                console.log('No gl for you');
                return;
            }
            boostrapWebGL2(glContext, container);
        }
    },[canvasRef, containerRef]);

    return (<div ref={containerRef} style={{width: "100%", height: "100%", overflow:'hidden'}}>
        <canvas ref={canvasRef}></canvas>
        {children}
    </div>)
}