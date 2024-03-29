'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { field, variant, vec, option, serialize } from "@dao-xyz/borsh";
import { Program } from "@peerbit/program";
import { Documents, PutOperation, DeleteOperation } from "@peerbit/document"; //todo: remove address redundancy
// import { nanoid } from 'nanoid'
import { currentModerators } from './db.js';
import { sha256Sync, toBase64, toHexString } from "@peerbit/crypto";
import { FileDatabase } from './files.js';
import Validate from "./validation.js";
//todo: consolidate/move to validation file along with files.ts one
function isModerator(theSigner, theIdentity, moderators = []) {
    if (theSigner && theIdentity) {
        if (theSigner.equals(theIdentity)) {
            return true;
        }
    }
    if (moderators.includes(toBase64(sha256Sync(theSigner.bytes)))) {
        return true;
    }
    return false;
}
// Abstract document definition we can create many kinds of document types from
export class BasePostDocument {
} //todo: revisit name, and export
//todo: revisit spoiler etc
let PostFile = class PostFile {
    // @field({type: option('bool')})
    // spoiler?: boolean
    hash;
    filename;
    // @field({type: 'string'})
    // originalFilename: string
    // @field({type: 'string'})
    // mimetype: string
    extension;
    size;
    // @field({type: 'string'})
    // sizeString: string
    // @field({type: option('string')})
    // thumbextension?: string
    // @field({type: option('string')})
    // thumbhash? :string
    // @field({type: JschanPostFileGeometry})
    // geometry: JschanPostFileGeometry
    // @field({type: option('string')})
    // geometryString?: string
    // @field({type: 'bool'})
    // hasThumb: boolean
    // @field({type: option('bool')}) //todo: revisit optionality of this
    // attachment?: boolean
    //todo: reconsider this (initialize instead)?
    constructor(hash, filename, extension, size) {
        // constructor(spoiler: boolean, hash: string, filename: string, originalFilename: string, mimetype: string, size: bigint, extension: string, sizeString: string, thumbextension: string, thumbhash: string, geometry: JschanPostFileGeometry, geometryString: string, hasThumb: boolean, attachment: boolean) {
        // this.spoiler = spoiler
        this.hash = hash;
        this.filename = filename;
        // this.originalFilename = originalFilename
        // this.mimetype = mimetype
        this.extension = extension;
        this.size = size;
        // this.sizeString = sizeString
        // this.thumbextension = thumbextension
        // this.thumbhash = thumbhash
        // this.geometry = geometry
        // this.geometryString = geometryString
        // this.hasThumb = hasThumb
        // this.attachment = attachment
    }
};
__decorate([
    field({ type: 'string' })
], PostFile.prototype, "hash", void 0);
__decorate([
    field({ type: 'string' })
], PostFile.prototype, "filename", void 0);
__decorate([
    field({ type: option('string') }) //todo: optionally allow no extensions?
], PostFile.prototype, "extension", void 0);
__decorate([
    field({ type: 'u64' })
], PostFile.prototype, "size", void 0);
PostFile = __decorate([
    variant(0)
], PostFile);
export { PostFile };
//todo: change _id to hash
//todo: signing posts as a particular identity? (tripcode/capcode)
//todo: different way of email? sage etc (options?)
//todo: spoilers
//todo: handle sticky, locked. etc?
//todo: handle id (should be exact hash of content maybe?)
//todo: files
let Post = class Post extends BasePostDocument {
    hash = '';
    date;
    replyto;
    name;
    // @field({type: option('string')})
    // tripcode?: string
    // @field({type: option('string')})
    // capcode?: string
    subject;
    email;
    message;
    files;
    // @field({type: 'u32'})
    // sticky: number
    // @field({type: 'bool'}) //todo: double check these arent bools
    // locked: boolean
    // @field({type: 'u32'})
    // bumplocked: number
    // @field({type: 'u32'})
    // cyclic: number
    constructor(
    // _id: string,
    date, replyto, name, 
    // tripcode: string,
    // capcode: string,
    subject, email, message, files) {
        super();
        this.date = date;
        this.replyto = replyto;
        this.name = name;
        this.subject = subject;
        this.email = email;
        this.message = message;
        // this.spoiler = spoiler
        // this.spoiler_all = spoiler_all
        // this.strip_filename = strip_filename
        this.files = files;
        // this.postpassword = postpassword
        // this.editing = editing
        this.hash = toHexString(sha256Sync(serialize(this)));
    }
};
__decorate([
    field({ type: 'string' })
], Post.prototype, "hash", void 0);
__decorate([
    field({ type: 'u64' })
], Post.prototype, "date", void 0);
__decorate([
    field({ type: option('string') })
], Post.prototype, "replyto", void 0);
__decorate([
    field({ type: option('string') })
], Post.prototype, "name", void 0);
__decorate([
    field({ type: option('string') })
], Post.prototype, "subject", void 0);
__decorate([
    field({ type: option('string') })
], Post.prototype, "email", void 0);
__decorate([
    field({ type: option('string') })
], Post.prototype, "message", void 0);
__decorate([
    field({ type: vec(PostFile) })
], Post.prototype, "files", void 0);
Post = __decorate([
    variant(0)
], Post);
export { Post };
//todo: consistency with the document type 
let PostDatabase = class PostDatabase extends Program {
    documents;
    fileDb;
    constructor(properties) {
        super();
        // this.id = properties?.id
        this.fileDb = new FileDatabase({ id: properties?.id });
        console.log('DEBUG: opening pdb with id ', properties?.id);
        this.documents = new Documents({ id: properties?.id }); //
        // this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })
    }
    async open(properties) {
        await this.documents.open({
            type: Post,
            index: { key: 'hash' },
            role: properties?.role,
            canPerform: async (operation, { entry }) => {
                const signers = await entry.getPublicKeys();
                if (operation instanceof PutOperation) {
                    try {
                        if (operation.value) {
                            // if (operation.value.chunkCids.length > 16) {
                            // 	throw new Error('Expected file size greater than configured maximum of ' + 16 * fileChunkingSize + ' bytes.')
                            // }
                            try {
                                Validate.post(operation.value);
                                let newCopy = new Post(operation.value.date, operation.value.replyto, operation.value.name, operation.value.subject, operation.value.email, operation.value.message, operation.value.files);
                                if (newCopy.hash != operation.value.hash) {
                                    console.log('Post document hash didn\'t match expected.');
                                    console.log(newCopy);
                                    console.log(operation.value);
                                    return false;
                                }
                                return true;
                            }
                            catch (err) {
                                return false;
                            }
                        }
                        //todo: remove (or dont write in the first place) blocks of invalid file
                    }
                    catch (err) {
                        console.log(err);
                        return false;
                    }
                }
                else if (operation instanceof DeleteOperation) {
                    for (var signer of signers) {
                        if (isModerator(signer, this.node.identity.publicKey, currentModerators)) { //todo: board specific, more granularcontrol, etc.
                            return true;
                        }
                    }
                }
                return false;
            }
        });
    }
};
__decorate([
    field({ type: Documents })
], PostDatabase.prototype, "documents", void 0);
__decorate([
    field({ type: FileDatabase })
], PostDatabase.prototype, "fileDb", void 0);
PostDatabase = __decorate([
    variant("postdatabase") //todo: consider renaming/modifying as appropriate
], PostDatabase);
export { PostDatabase };
