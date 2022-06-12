export namespace AxisVirtualPtz {
    const QUADRANT = Math.PI / 2;

    export const toRad = (deg: number) => deg * Math.PI / 180.0;
    export const toDeg = (rad: number) => rad / Math.PI * 180.0;

    export const MAX_ZOOM = toRad(60);
    export const MIN_ZOOM = toRad(2);

    export enum MOUNT_POINT {
        CEILING,
        DESK,
        WALL
    }

    /*
     * Given a camera orientation mode and a ptz vector,
     * return the rotateData that is used by the shader.
     */
    export const getRotateData = (mode: MOUNT_POINT, ptz: Array<number>) => {
        const [pan, tilt] = ptz;
        console.log(pan,tilt);
        const {WALL, DESK, CEILING} = MOUNT_POINT;
        switch (mode) {
            case CEILING:
                console.log('Ceiling');
                return [-(tilt + QUADRANT), pan + QUADRANT,0];
            case DESK:
                console.log('Deskt');
                return [-(tilt - QUADRANT), -pan - QUADRANT,0];
            case WALL:
                console.log('Wall');
                return [0,-tilt, pan];
        }
    }

    /*
     * Given an orientation mode, return the lambda offset (vertical axis
     * orientation) around which pan/tilt revolves in the shader.
     */
    export const getLambdaOffset = (mode : MOUNT_POINT) => {
        const {WALL, DESK, CEILING} = MOUNT_POINT;
        switch (mode) {
            case CEILING:
            case DESK:
                return Math.PI / 2;
            case WALL:
                return Math.PI;
        }
    }

}