import { Peerbit } from "peerbit";
import { Libp2p } from 'libp2p';
import { Ed25519Keypair } from "@peerbit/crypto";
import { Post, PostDatabase } from './posts.js';
import { BoardDatabase } from './boards.js';
import { File, FileDatabase } from './files.js';
export declare let node: Libp2p;
export declare let keypair: Ed25519Keypair;
export declare let client: Peerbit;
export declare let Posts: PostDatabase;
export declare let Boards: BoardDatabase;
export declare let Files: FileDatabase;
export declare let currentModerators: string[];
export declare let openedBoards: any;
export declare let remoteQueryPosts: boolean;
export declare let remoteQueryFileRefs: boolean;
export declare let remoteQueryFileChunks: boolean;
export declare const searchResultsLimit = 4294967295;
export declare function pbInitClient(createSettings: any): Promise<void>;
export declare function clientId(): Promise<string>;
export type OpenArgs = {
    replicate?: {
        factor: any;
    };
    existing: any;
    compatibility?: any;
};
export declare function openPostsDb(postsDbId: string | undefined, options: any): Promise<void>;
export declare function getBoardStats(whichBoard: string): Promise<{
    boardStatus: number;
    rfStatus: null[];
}>;
export declare function bootstrap(): Promise<void>;
export declare function closePostsDb(postsDbId?: string): Promise<void>;
export declare function dropPostsDb(postsDbId?: string): Promise<void>;
export declare function openFilesDb(filesDbId: string | undefined, options: any): Promise<void>;
export declare function makeNewPost(postDocument: Post, whichBoard: string, randomKey?: boolean): Promise<void>;
export declare function listPeers(): Promise<import("@multiformats/multiaddr").Multiaddr[]>;
export declare function delPost(whichPost: string, whichBoard: string, randomKey?: boolean): Promise<void>;
export declare function removeSinglePost(thisHash: string, whichBoard: string, randomKey?: boolean, hardDelete?: boolean): Promise<void>;
export declare function removeSingleFileRef(thisHash: string, whichBoard: string, randomKey?: boolean, hardDelete?: boolean): Promise<void>;
export declare function removeSingleFileChunk(thisHash: string, whichBoard: string, randomKey?: boolean, hardDelete?: boolean): Promise<void>;
export declare function getAllPosts(query?: any): Promise<any>;
export declare function getPosts(whichBoard: string): Promise<any>;
export declare function getFileRefs(whichBoard: string): Promise<any>;
export declare function getFileChunks(whichBoard: string): Promise<any>;
export declare function getThreadsWithReplies(whichBoard: string, numThreads?: number, numPreviewPostsPerThread?: number, whichPage?: number): Promise<{
    threads: any[];
    replies: any[];
    omittedreplies: number[];
    totalpages: number;
}>;
export declare function getAllBumpSortedThreads(whichBoard: string): Promise<{
    omittedreplies: number[];
    threads: any[];
    replies: never[][];
}>;
export declare function getThreadsWithRepliesForOverboard(whichBoard: string, numThreads?: number, numPreviewPostsPerThread?: number, whichPage?: number): Promise<{
    threads: any[];
    replies: any[][];
    omittedreplies: number[];
    totalpages: number;
}>;
export declare function getSpecificPost(whichBoard: string, whichPost: string): Promise<any>;
export declare function getRepliesToSpecificPost(whichBoard: string, whichThread: string): Promise<any>;
export declare function queryPosts(whichBoards: string[], queryObj: any, queryLimit?: number): Promise<{
    [key: string]: any;
}>;
export declare function getAllFileDocuments(): Promise<File[]>;
export declare function putFile(fileData: Uint8Array, whichBoard: string, randomKey?: boolean): Promise<string>;
export declare function getFile(fileHash: string, whichBoard: string): Promise<any>;
export declare function fileExists(fileHash: string, whichBoard: string): Promise<boolean>;
export declare function delFile(fileHash: string, whichBoard: string, randomKey?: boolean): Promise<unknown>;
export declare function setModerators(moderators?: string[]): void;
export declare function setRemoteQuery(rqPosts: boolean, rqFileRefs: boolean, rqFileChunks: boolean): void;
export declare function pbStopClient(): Promise<void>;
export declare function resetDb(): void;
export declare function connectToPeer(peerAddress: string): Promise<void>;
