var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { field, variant, vec, serialize } from "@dao-xyz/borsh";
import { Program, } from "@peerbit/program";
//import { createBlock, getBlockValue } from "@peerbit/libp2p-direct-block"
import { Ed25519Keypair, sha256Sync, toBase64, toHexString } from "@peerbit/crypto";
import { Documents, SearchRequest, StringMatch, Or } from "@peerbit/document"; //todo: remove address redundancy
import { currentModerators, remoteQueryFileChunks, searchResultsLimit } from './db.js';
import Validate from "./validation.js";
//todo: consider removing receivedHash check
//todo: reconsider how to handle when number of chunks doesn't match
//todo: consider chunk size being dynamic? and also a field in the File data
//todo: storing the filesize in advance would allow directly splicing the chunks into the file array asynchronously?
//todo: revisit files functionality for filecontents vs chunkcontents etc
//todo: greater filesizers where cidstrings is excessive (nested/recursive; string | (reference to list of chunks)?)
//todo: consider increasing size
const fileChunkingSize = 1 * 1024 ** 2; //1MB
//todo: consolidate/move to validation file along with posts.ts one
//todo: avoid needing as many args?
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
let FileChunkDatabase = class FileChunkDatabase extends Program {
    documents;
    constructor(properties) {
        super();
        // this.id = properties?.id
        // this.rootKeys = properties ? properties.rootKeys : []
        //note: done this way for backwards-compatibility with pan-board files database
        if (properties?.id) {
            if (!Buffer.compare(sha256Sync(Buffer.from("")), properties?.id)) {
                this.documents = new Documents({ id: properties?.id });
            }
            else {
                this.documents = new Documents({ id: sha256Sync(Buffer.concat([properties.id, Buffer.from("FileChunks")])) });
            }
        }
        else {
            this.documents = new Documents({ id: properties?.id });
        }
        // this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })
    }
    async open(properties) {
        await this.documents.open({
            type: FileChunk,
            index: {
                idProperty: 'hash',
                type: IndexedFileChunk,
                transform: (fileChunk, context) => {
                    return new IndexedFileChunk(fileChunk);
                }
            },
            replicate: properties?.replicate,
            compatibility: properties?.compatibility,
            canPerform: async (operation) => {
                if (operation.type === 'put') {
                    //Get the file chunk and do some checks on it.
                    //todo: size validation
                    try {
                        // if (operation.value.chunkCids.length > 16) {
                        // 	throw new Error('Expected file size greater than configured maximum of ' + 16 * fileChunkingSize + ' bytes.')
                        // }
                        const file = operation.value;
                        let newCopy = new FileChunk(file.fileHash, file.chunkIndex, file.chunkSize, file.chunkData);
                        if (newCopy.hash != file.hash) {
                            console.log('File chunk document hash didn\'t match expected.');
                            console.log(newCopy);
                            console.log(file);
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
            },
        });
        // this.documents.events.addEventListener('change',(change)=> {
        //	  for (let fileChunk of change.detail.added) {
        //	  this.node.services.blocks.get(fileChunk.chunkCid, { replicate: true })
        //	  }
        //	  for (let fileChunk of change.detail.removed) {
        //				this.node.services.blocks.rm(fileChunk.chunkCid)
        //	  }
        // })
    }
};
__decorate([
    field({ type: Documents })
], FileChunkDatabase.prototype, "documents", void 0);
FileChunkDatabase = __decorate([
    variant('FileChunks')
], FileChunkDatabase);
export { FileChunkDatabase };
let FileDatabase = class FileDatabase extends Program {
    documents;
    chunks;
    constructor(properties) {
        super();
        // this.id = properties?.id
        // this.rootKeys = properties ? properties.rootKeys : []
        this.chunks = new FileChunkDatabase({ id: properties?.id });
        this.documents = new Documents({ id: sha256Sync(this.chunks.documents.log.log.id) }); //
        // this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })s
    }
    async open(properties) {
        //for some reason this proceeds to the next without finishing so it has to be declared elsewhere (in .db .ts) //todo: revisit
        // 	await this.chunks.open();
        await this.documents.open({
            type: File,
            index: { idProperty: 'hash' },
            replicate: properties?.replicate,
            compatibility: properties?.compatibility,
            canPerform: async (operation) => {
                if (operation.type === 'put') {
                    //Get the file and do some checks on it.
                    //todo: revisit this/simplify since hashes are used?
                    //todo: fix up/ensure working robustly
                    try {
                        Validate.file(operation.value); //todo: consider necessity
                        //todo: validate file hash as with posts?
                        // let fileData = await operation.value.getFile(this.chunks) //todo: revisit/check eg. for dynamic/variable chunking sizes
                        // let checkFile = new File(fileData)
                        // checkFile.chunkCids = operation.value.chunkCids
                        // checkFile.fileHash = toHexString(sha256Sync(fileData))
                        // if (toHexString(sha256Sync(serialize(checkFile))) != operation.value.hash) {
                        // 	console.log(checkFile)
                        // 	console.log(operation.value.hash)
                        // 	throw new Error('File document hash didn\'t match expected.')
                        // }
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
    // async createFile(data: Uint8Array) {
    // 	let file = new File(data)
    // 	await file.writeChunks(this.chunks, data)
    // 	await this.files.put(file)
    // 	return file
    // }
    async getFile(hash) {
        let file = await this.documents.index.get(hash);
        if (file) {
            return await file.getFile(this.chunks);
        }
        return null;
    }
    async deleteFile(hash, randomKey = true) {
        let file = await this.documents.index.get(hash);
        if (file) {
            if (randomKey) {
                var newKeyPair = await Ed25519Keypair.create();
                for (let chunkHash of file.chunkCids) {
                    await this.chunks.documents.del(chunkHash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
                    newKeyPair = await Ed25519Keypair.create();
                }
                return await this.documents.del(hash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
            }
            else {
                for (let chunkHash of file.chunkCids) {
                    await this.chunks.documents.del(chunkHash);
                }
                return await this.documents.del(hash);
            }
        }
        return null;
    }
};
__decorate([
    field({ type: Documents })
], FileDatabase.prototype, "documents", void 0);
__decorate([
    field({ type: FileChunkDatabase })
], FileDatabase.prototype, "chunks", void 0);
FileDatabase = __decorate([
    variant('Files')
], FileDatabase);
export { FileDatabase };
//inside your "open()" function you have defined on your database do
// this.posts.events.addEventListener('change',(change)=> {
//  for(const post of change.detail.added)
//  {
//   this.node.services.blocks.get(post.fileCID,{replicate: true})
//  }
//  for(const post of change.detail.removed)
//  {
//   this.node.services.blocks.rm(post.fileCID)
//  }
// })
class BaseFileDocument {
} //todo: revisit the names of these throughout
let File = class File extends BaseFileDocument {
    hash = '';
    fileSize; //in bytes
    fileHash;
    chunkSize; //in bytes
    chunkCids = [];
    constructor(fileContents) {
        super();
        this.fileSize = fileContents.length;
        this.fileHash = toHexString(sha256Sync(fileContents));
        this.chunkSize = fileChunkingSize;
    }
    //todo: do this in a single query using Or
    async getFile(fileChunks) {
        let fileArray = new Uint8Array(this.fileSize);
        let allChunksQuery = new Or(this.chunkCids.map(chunkHash => new StringMatch({ key: 'hash', value: chunkHash })));
        await fileChunks.documents.index.search(new SearchRequest({ query: allChunksQuery, fetch: searchResultsLimit }), { local: true, remote: remoteQueryFileChunks }).then(results => results.sort((a, b) => a.chunkIndex - b.chunkIndex)
            .forEach(chunk => {
            fileArray.set(new Uint8Array(chunk.chunkData), chunk.chunkIndex * this.chunkSize);
        }));
        return fileArray;
    }
    async writeChunks(fileChunks, fileContents, randomKey = true) {
        // let chunkWrites = Array(Math.ceil(fileContents.length / this.chunkSize))
        let chunkStartIndex = 0;
        let newFileHash = toHexString(sha256Sync(fileContents));
        let chunkIndex = 0;
        if (randomKey) {
            var newKeyPair;
            while (chunkStartIndex < fileContents.length) { //todo: double check <= or <
                // constructor(fileHash: string, chunkIndex: number, chunkSize: number, chunkData: Uint8Array)
                let newFileChunk = new FileChunk(newFileHash, chunkIndex, Math.min(fileChunkingSize, fileContents.length - chunkStartIndex), fileContents.slice(chunkStartIndex, chunkStartIndex += fileChunkingSize));
                newKeyPair = await Ed25519Keypair.create();
                await fileChunks.documents.put(newFileChunk, { signers: [newKeyPair.sign.bind(newKeyPair)] });
                // console.log("newFileChunk added")
                // console.log(newFileChunk)
                this.chunkCids.push(newFileChunk.hash);
                // await client.services.blocks.put(fileContents.slice(chunkStartIndex, chunkStartIndex += this.chunkSize))
                // .then(resultHash => this.chunkCids.push(newFileChunk.hash))
                chunkIndex += 1;
            }
        }
        else {
            while (chunkStartIndex < fileContents.length) { //todo: double check <= or <
                // constructor(fileHash: string, chunkIndex: number, chunkSize: number, chunkData: Uint8Array)
                let newFileChunk = new FileChunk(newFileHash, chunkIndex, Math.min(fileChunkingSize, fileContents.length - chunkStartIndex), fileContents.slice(chunkStartIndex, chunkStartIndex += fileChunkingSize));
                await fileChunks.documents.put(newFileChunk);
                // console.log("newFileChunk added")
                // console.log(newFileChunk)
                this.chunkCids.push(newFileChunk.hash);
                // await client.services.blocks.put(fileContents.slice(chunkStartIndex, chunkStartIndex += this.chunkSize))
                // .then(resultHash => this.chunkCids.push(newFileChunk.hash))
                chunkIndex += 1;
            }
        }
        // this.chunkCids = await Promise.all(chunkWrites)
        this.hash = toHexString(sha256Sync(serialize(this)));
    }
};
__decorate([
    field({ type: 'string' })
], File.prototype, "hash", void 0);
__decorate([
    field({ type: 'u32' })
], File.prototype, "fileSize", void 0);
__decorate([
    field({ type: 'string' })
], File.prototype, "fileHash", void 0);
__decorate([
    field({ type: 'u32' })
], File.prototype, "chunkSize", void 0);
__decorate([
    field({ type: vec('string') })
], File.prototype, "chunkCids", void 0);
File = __decorate([
    variant(0)
], File);
export { File };
//todo: remove unnecessary (chunkSize? etc.)
class BaseFileChunkDocument {
}
let FileChunk = class FileChunk extends BaseFileChunkDocument {
    hash = '';
    fileHash;
    // @field({type: 'string'}) //todo: revisit these names
    // chunkCid: string
    chunkIndex;
    chunkSize;
    chunkData;
    constructor(fileHash, chunkIndex, chunkSize, chunkData) {
        super();
        this.fileHash = fileHash;
        // this.chunkCid = toHexString(sha256Sync(chunkData))
        this.chunkIndex = chunkIndex;
        this.chunkSize = chunkSize;
        this.chunkData = chunkData;
        this.hash = toHexString(sha256Sync(serialize(this)));
    }
};
__decorate([
    field({ type: 'string' })
], FileChunk.prototype, "hash", void 0);
__decorate([
    field({ type: 'string' })
], FileChunk.prototype, "fileHash", void 0);
__decorate([
    field({ type: 'u32' })
], FileChunk.prototype, "chunkIndex", void 0);
__decorate([
    field({ type: 'u32' })
], FileChunk.prototype, "chunkSize", void 0);
__decorate([
    field({ type: Uint8Array }) //todo: consider type (buffer or uint8array?)
], FileChunk.prototype, "chunkData", void 0);
FileChunk = __decorate([
    variant(0)
], FileChunk);
export { FileChunk };
let IndexedFileChunk = class IndexedFileChunk extends BaseFileChunkDocument {
    hash = '';
    fileHash;
    // @field({type: 'string'}) //todo: revisit these names
    // chunkCid: string
    chunkIndex;
    chunkSize;
    // @field({ type: Uint8Array }) //todo: consider type (buffer or uint8array?)
    // chunkData: Uint8Array
    constructor(originalFileChunk) {
        super();
        this.fileHash = originalFileChunk.fileHash;
        // this.chunkCid = toHexString(sha256Sync(chunkData))
        this.chunkIndex = originalFileChunk.chunkIndex;
        this.chunkSize = originalFileChunk.chunkSize;
        // this.chunkData = chunkData
        this.hash = originalFileChunk.hash;
    }
};
__decorate([
    field({ type: 'string' })
], IndexedFileChunk.prototype, "hash", void 0);
__decorate([
    field({ type: 'string' })
], IndexedFileChunk.prototype, "fileHash", void 0);
__decorate([
    field({ type: 'u32' })
], IndexedFileChunk.prototype, "chunkIndex", void 0);
__decorate([
    field({ type: 'u32' })
], IndexedFileChunk.prototype, "chunkSize", void 0);
IndexedFileChunk = __decorate([
    variant(1)
], IndexedFileChunk);
export { IndexedFileChunk };
// import { Peerbit } from 'peerbit'
// describe('tests', () => {
// 	let client: Peerbit;
// 	beforeEach(async () => {
// 		client = await Peerbit.create({ directory: './tmp/file-chunks/' + (+new Date) })
// 	})
// 	afterEach(async () => {
// 		await client.stop()
// 	})
// 	it('can perform', async () => {
// 		let fileDB = await client.open(new FileDatabase())
// 		const file = await fileDB.createFile(new Uint8Array(1024 * 1024 * 2))
// 		expect(await fileDB.getFile(file.hash)).toEqual(new Uint8Array(1024 * 1024 * 2))
// 		// check persistance and loading
// 		const address = fileDB.address
// 		await fileDB.close();
// 		fileDB = await client.open<FileDatabase>(address)
// 		expect(await fileDB.getFile(file.hash)).toEqual(new Uint8Array(1024 * 1024 * 2)) // getting a file should still work
// 	})
// })
