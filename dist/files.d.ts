import { Program } from "@peerbit/program";
import { Documents } from "@peerbit/document";
export declare class FileChunkDatabase extends Program {
    documents: Documents<FileChunk>;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(): Promise<void>;
}
export declare class FileDatabase extends Program {
    files: Documents<File>;
    chunks: FileChunkDatabase;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(): Promise<void>;
    createFile(data: Uint8Array): Promise<File>;
    getFile(hash: string): Promise<Uint8Array | null>;
    deleteFile(hash: string): Promise<{
        entry: import("@peerbit/log").Entry<import("@peerbit/document").Operation<File>>;
        removed: import("@peerbit/log").Entry<import("@peerbit/document").Operation<File>>[];
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
    writeChunks(fileChunks: FileChunkDatabase, fileContents: Uint8Array): Promise<void>;
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
export {};
