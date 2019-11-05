import { Scene, ArcRotateCamera } from "babylonjs";
import { KeyEvent } from './models/KeyEvent';
export declare class InputHandler {
    private map;
    private scene;
    private camera;
    private eventDictionary;
    constructor(scene: Scene, camera: ArcRotateCamera);
    private AfterRender;
    AddKeyEvent(event: KeyEvent): void;
}
