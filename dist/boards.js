'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { field, variant, vec, serialize } from "@dao-xyz/borsh";
import { Program } from "@peerbit/program";
import { Documents } from "@peerbit/document"; //todo: remove address redundancy
// import { nanoid } from 'nanoid'
import { sha256Sync, toBase64, toHexString } from "@peerbit/crypto";
import { currentModerators } from './db.js';
// import {
// 	updateOne,
// 	insertOne,
// 	findOne
// } from "./index.js" //todo: consider not importing everything 
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
export class BaseBoardDocument {
} //todo: revisit name, and export
//todo: change _id to hash
//todo: signing posts as a particular identity? (tripcode/capcode)
//todo: different way of email? sage etc (options?)
//todo: spoilers
//todo: handle sticky, locked. etc?
//todo: handle id (should be exact hash of content maybe?)
//todo: files
let Board = class Board extends BaseBoardDocument {
    hash = '';
    id;
    title;
    desc;
    tags;
    constructor(id, title, desc, tags) {
        super();
        this.id = id;
        this.title = title;
        this.desc = desc;
        this.tags = tags;
        this.hash = toHexString(sha256Sync(serialize(this)));
    }
};
__decorate([
    field({ type: 'string' })
], Board.prototype, "hash", void 0);
__decorate([
    field({ type: 'string' })
], Board.prototype, "id", void 0);
__decorate([
    field({ type: 'string' })
], Board.prototype, "title", void 0);
__decorate([
    field({ type: 'string' })
], Board.prototype, "desc", void 0);
__decorate([
    field({ type: vec('string') })
], Board.prototype, "tags", void 0);
Board = __decorate([
    variant(0)
], Board);
export { Board };
//todo: consistency with the document type 
let BoardDatabase = class BoardDatabase extends Program {
    documents;
    constructor(properties) {
        super();
        // this.id = properties?.id
        this.documents = new Documents({ id: properties?.id }); //
        // this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })
    }
    async open(properties) {
        await this.documents.open({
            type: Board,
            index: { idProperty: 'hash' },
            // canPerform: async (operation) => {
            // 	const signers = await entry.getPublicKeys();
            // 	if (props.type === 'put') {
            // 		try {
            // 			const board = operation.value
            // 			let new
            // 		} catch (err) {
            // 			console.log(err)
            // 			return false
            // 		}
            // 	} 
            // }
            replicate: properties?.replicate,
            canPerform: async (operation) => {
                if (operation.type === 'put') {
                    try {
                        const board = operation.value;
                        // if (operation.value.chunkCids.length > 16) {
                        // 	throw new Error('Expected file size greater than configured maximum of ' + 16 * fileChunkingSize + ' bytes.')
                        // }
                        let newCopy = new Board(board.id, board.title, board.desc, board.tags);
                        if (newCopy.hash != board.hash) {
                            console.log('Board document hash didn\'t match expected.');
                            console.log(newCopy);
                            console.log(board);
                            return false;
                        }
                        return true;
                        //todo: remove (or dont write in the first place) blocks of invalid file
                    }
                    catch (err) {
                        console.log(err);
                        return false;
                    }
                }
                else if (operation.type === 'delete') {
                    const signers = operation.entry.signatures.map(s => s.publicKey);
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
], BoardDatabase.prototype, "documents", void 0);
BoardDatabase = __decorate([
    variant("boarddatabase") //todo: consider renaming/modifying as appropriate
], BoardDatabase);
export { BoardDatabase };
