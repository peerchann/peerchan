import { Program } from "@peerbit/program";
import { Documents } from "@peerbit/document";
import { OpenArgs } from './db.js';
export declare class FileChunkDatabase extends Program<OpenArgs> {
    documents: Documents<FileChunk, IndexedFileChunk>;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(properties?: OpenArgs): Promise<void>;
}
export declare class FileDatabase extends Program<OpenArgs> {
    documents: Documents<File>;
    chunks: FileChunkDatabase;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(properties?: OpenArgs): Promise<void>;
    getFile(hash: string): Promise<Uint8Array | null>;
    deleteFile(hash: string, randomKey?: boolean): Promise<{
        entry: import("@peerbit/log").Entry<import("@peerbit/document").Operation>;
        removed: import("@peerbit/log").ShallowOrFullEntry<import("@peerbit/document").Operation>[];
    } | null>;
}
declare class BaseFileDocument {
}
export declare class File extends BaseFileDocument {
    hash: string;
    fileSize: number;
    fileHash: string;
    chunkSize: number;
    chunkCids: string[];
    constructor(fileContents: Uint8Array);
    getFile(fileChunks: FileChunkDatabase): Promise<Uint8Array>;
    writeChunks(fileChunks: FileChunkDatabase, fileContents: Uint8Array, randomKey?: boolean): Promise<void>;
}
declare class BaseFileChunkDocument {
}
export declare class FileChunk extends BaseFileChunkDocument {
    hash: string;
    fileHash: string;
    chunkIndex: number;
    chunkSize: number;
    chunkData: Uint8Array;
    constructor(fileHash: string, chunkIndex: number, chunkSize: number, chunkData: Uint8Array);
}
export declare class IndexedFileChunk extends BaseFileChunkDocument {
    hash: string;
    fileHash: string;
    chunkIndex: number;
    chunkSize: number;
    constructor(originalFileChunk: FileChunk);
}
export {};
