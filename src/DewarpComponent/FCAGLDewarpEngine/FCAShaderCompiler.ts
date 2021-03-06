type FCAGLAttributeProps = { set: (value: any) => void, address: GLenum | null, get: () => unknown }
type FCAGLAttributeType = Record<string, FCAGLAttributeProps>;

type FCAGLUniformProps = { set: (value: any) => void, address: WebGLUniformLocation | null, get: () => unknown }
export type FCAGLUniformType = Record<string, FCAGLUniformProps>;

enum FCAGLShaderTypes {
    uniform = 'uniform',
    attribute = 'in',
}

export type FCAGLBindingMap = { [FCAGLShaderTypes.uniform]?: FCAGLUniformType, [FCAGLShaderTypes.attribute]?: FCAGLAttributeType };
type FCAGLGenericType = FCAGLUniformType | FCAGLAttributeType;
export type FCAGLProgramBundle = {program: WebGLProgram, bindings: FCAGLBindingMap};

const linkBindings = (bindings: FCAGLBindingMap, type: FCAGLShaderTypes, resolver: (name: string, atype: string) => FCAGLAttributeProps | FCAGLUniformProps | null) => {
    for (const name in bindings[type]) {
        const binding = bindings[type];
        if (binding) {
            const atype = Object.keys(binding[name])[0];
            const resolved = resolver(name, atype);
            if (resolved) {
                bindings[type]![name] = resolved;
            } else {
                delete bindings[type]![name];
            }
        }
    }
};

export const shaderCompiler = (ctx: WebGL2RenderingContext) => {
    const vsSource = `#version 300 es
    precision highp float;

    in vec4 a_position;
    in vec2 a_texcoord;
    
    out vec2 v_texcoord;

    uniform mat4 u_projection;
    uniform mat4 u_view;
    uniform mat4 u_model;
    
    void main() {
      gl_Position = u_projection * u_view * u_model * vec4(a_position.xyz,1.0);
      v_texcoord = a_texcoord;
    }
`;

    const fsSource = `#version 300 es
    precision highp float;
     
    in vec2 v_texcoord;
    uniform sampler2D u_texture;
    out vec4 color;
     
    void main() {
       color = texture(u_texture, v_texcoord);
    }
`;

    const compileShaderFromSource = (shaderType: GLenum, source: string) => {
        const shader = ctx.createShader(shaderType);
        if (!shader) {
            throw new Error('Unable to compile shader');
        }
        ctx.shaderSource(shader, source)
        ctx.compileShader(shader);
        const log = ctx.getShaderInfoLog(shader);
        if(log?.length) {
            console.error(log);
            source.split('\n').forEach((v, idx) => console.log(idx,'',v))
        }
        return shader;
    }

    const createProgram = (bindings: FCAGLBindingMap, shaders: WebGLShader[]) : FCAGLProgramBundle => {
        const program = ctx.createProgram()!;

        for (const shader of shaders) {
            ctx.attachShader(program, shader);
        }

        ctx.linkProgram(program);

        if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
            throw new Error('Linking failed: ' + ctx.getProgramInfoLog(program));
        }

        linkBindings(bindings, FCAGLShaderTypes.attribute, (name, type) => {
            const loc = ctx.getAttribLocation(program, name)
            return loc >= 0 ? {set: () => 0, get: () => 0, address: loc} : null;
        });

        linkBindings(bindings, FCAGLShaderTypes.uniform, (name, type) => {
            const loc = ctx.getUniformLocation(program, name)
            const target = type;
            const ictx = ctx as any;

            return loc ? {
                set: (value: any) => {
                    ictx[target](loc, value);
                }, address: loc, get: () => ctx.getUniform(program, loc!)
            } : null;
        });

        return {program: program, bindings: bindings};
    }

    enum PARSED_OFFSET {
        INPUT_TYPE = 1,
        ARGUMENT_TYPE = 2,
        ARGUMENT_NAME = 3
    }

    const parseBindings = (bindings: FCAGLBindingMap, source: string) => {
        const res = source.matchAll(/\W+(in|uniform)\W+(\w+)\W+(\w+)/g);
        const result: FCAGLBindingMap = bindings;
        for (const entry of res) {
            const input_type = entry[PARSED_OFFSET.INPUT_TYPE] as FCAGLShaderTypes;
            const newEntry = {[entry[PARSED_OFFSET.ARGUMENT_NAME]]: {[entry[PARSED_OFFSET.ARGUMENT_TYPE]]: null}} as unknown as FCAGLGenericType;
            (result[input_type] as any) = {...result[input_type as FCAGLShaderTypes], ...newEntry};
        }
    }

    const compileProgram = (options?: { vertexShader?: string, fragmentShader?: string }) => {
        let vss = options?.vertexShader ?? vsSource;
        let fss = options?.fragmentShader ?? fsSource;

        const bindings: FCAGLBindingMap = {};

        const vs = compileShaderFromSource(ctx.VERTEX_SHADER, vss);
        const fs = compileShaderFromSource(ctx.FRAGMENT_SHADER, fss);

        parseBindings(bindings, vss);
        parseBindings(bindings, fss);

        return createProgram(bindings, [vs, fs]);
    }

    return {compileProgram};
}
