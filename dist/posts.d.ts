import { Program } from "@peerbit/program";
import { Documents } from "@peerbit/document";
import { OpenArgs } from './db.js';
import { FileDatabase } from './files.js';
export declare class BasePostDocument {
}
export declare class PostFile {
    hash: string;
    filename: string;
    extension?: string;
    size: bigint;
    constructor(hash: string, filename: string, extension: string, size: bigint);
}
export declare class Post extends BasePostDocument {
    hash: string;
    date: bigint;
    replyto?: string;
    name?: string;
    subject?: string;
    email?: string;
    message?: string;
    files: PostFile[];
    constructor(date: bigint, replyto: string | undefined, name: string | undefined, subject: string | undefined, email: string | undefined, message: string | undefined, files: PostFile[]);
}
export declare class PostDatabase extends Program<OpenArgs> {
    documents: Documents<Post>;
    fileDb: FileDatabase;
    constructor(properties?: {
        id?: Uint8Array;
    });
    open(properties?: OpenArgs): Promise<void>;
}
