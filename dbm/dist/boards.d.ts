import { Program } from "@peerbit/program";
import { Documents } from "@peerbit/document";
export declare class BaseBoardDocument {
}
export declare class Board extends BaseBoardDocument {
    hash: string;
    id: string;
    title: string;
    desc: string;
    tags: string[];
    constructor(id: string, title: string, desc: string, tags: string[]);
}
export declare class BoardDatabase extends Program {
    documents: Documents<Board>;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(): Promise<void>;
}
