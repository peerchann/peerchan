'use strict';

//note: this file is currently unused

import { Peerbit } from "peerbit"
import { field, variant, vec, option, serialize, deserialize } from "@dao-xyz/borsh"
import { Program } from "@peerbit/program"
import { Documents, DocumentIndex, 	SearchRequest, StringMatch, IntegerCompare, Compare, Results, PutOperation, DeleteOperation } from "@peerbit/document" //todo: remove address redundancy
// import { nanoid } from 'nanoid'

import { sha256Sync, toHexString, PublicSignKey } from "@peerbit/crypto"
;

// import { RPC } from "@peerbit/rpc";

// import { Posts } from "./db.js" //todo: revisit (//todo: '' vs "" throughout)

import { equals } from "uint8arrays";

// import {
// 	updateOne,
// 	insertOne,
// 	findOne
// } from "./index.js" //todo: consider not importing everything 


//todo: consolidate/move to validation file along with files.ts one
function isModerator(theSigner: PublicSignKey, theIdentity: PublicSignKey) {
	if (theSigner && theIdentity) {
		if(theSigner.equals(theIdentity)) {
			return true;
		}
	}
	return false
}



// Abstract document definition we can create many kinds of document types from
export class BaseBoardDocument { } //todo: revisit name, and export

//todo: change _id to hash
//todo: signing posts as a particular identity? (tripcode/capcode)
//todo: different way of email? sage etc (options?)
//todo: spoilers
//todo: handle sticky, locked. etc?
//todo: handle id (should be exact hash of content maybe?)
//todo: files
@variant(0)
export class Board extends BaseBoardDocument {
	@field({type: 'string'})
	hash: string = ''
	@field({type: 'string'})
	id: string
	@field({type: 'string'})
	title: string
	@field({type: 'string'})
	desc: string
	@field({type: vec('string')})
	tags: string[]


	constructor(
		id: string,
		title: string,
		desc: string,
		tags: string[],
		) {
		super()
		this.id = id
		this.title = title
		this.desc = desc
		this.tags = tags
		this.hash = toHexString(sha256Sync(serialize(this)))
	}

}

//todo: consistency with the document type 
@variant("boarddatabase") //todo: consider renaming/modifying as appropriate
export class BoardDatabase extends Program {

	@field({ type: Documents })
	documents: Documents<Board>

	constructor(properties?: { id?: Uint8Array }) {
		super()
		// this.id = properties?.id
		this.documents = new Documents({ id: properties?.id }) //
		// this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })
	}

	async open() {
		await this.documents.open({
			type: Board,
			index: { key: 'hash' },
			canPerform: async (operation, { entry }) => {
				const signers = await entry.getPublicKeys();
				if (operation instanceof PutOperation) {
					try {
						if (operation.value) {
							// if (operation.value.chunkCids.length > 16) {
							// 	throw new Error('Expected file size greater than configured maximum of ' + 16 * fileChunkingSize + ' bytes.')
							// }
							let newCopy = new Board(
								operation.value.id,
								operation.value.title,
								operation.value.desc,
								operation.value.tags
								)
							if (newCopy.hash != operation.value.hash) {
								console.log('Board document hash didn\'t match expected.')
								console.log(newCopy)
								console.log(operation.value)
								return false
							}
							return true	
						} 
						//todo: remove (or dont write in the first place) blocks of invalid file

					} catch (err) {
						console.log(err)
						return false
					}
				} else if (operation instanceof DeleteOperation) {
					for (var signer of signers) {
						if (isModerator(signer, this.node.identity.publicKey)) {//todo: more granularcontrol, etc.
							return true;
						}
					}
				}
				return false

			}
		})

	}
}
