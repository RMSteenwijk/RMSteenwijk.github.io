import { Tile } from "../Models/Tile";
import { Vector2, float, Mesh } from "babylonjs";
export declare class TileMapState {
    TileWidth: float;
    private internalMap;
    private meshes;
    constructor(dimensions: Vector2, tileSize: float);
    GetTileAtPosition(position: Vector2): Tile;
    GetMap(): Tile[][];
    SetMeshForInstancing(mesh: Mesh): void;
    GetInstanceOfMesh(name: string): any;
}
