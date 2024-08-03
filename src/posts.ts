'use strict';
import { Peerbit } from "peerbit"
import { field, variant, vec, option, serialize, deserialize } from "@dao-xyz/borsh"
import { Program, OpenOptions } from "@peerbit/program"
import { Documents, DocumentIndex, 	SearchRequest, StringMatch, IntegerCompare, Compare } from "@peerbit/document" //todo: remove address redundancy
// import { nanoid } from 'nanoid'
import { currentModerators, OpenArgs } from './db.js'


import { sha256Sync, toBase64, toHexString, PublicSignKey } from "@peerbit/crypto"
import { FileDatabase } from './files.js'


import Validate from "./validation.js"

// import { RPC } from "@peerbit/rpc";

// import { Posts } from "./db.js" //todo: revisit (//todo: '' vs "" throughout)

import { equals } from "uint8arrays";


//todo: consolidate/move to validation file along with files.ts one
function isModerator(theSigner: PublicSignKey, theIdentity: PublicSignKey, moderators: string[] = []) {
	if (theSigner && theIdentity) {
		if(theSigner.equals(theIdentity)) {
			return true;
		}
	} 
	if (moderators.includes(toBase64(sha256Sync(theSigner.bytes)))) {
		return true
	}
	return false
}

// Abstract document definition we can create many kinds of document types from
export class BasePostDocument { } //todo: revisit name, and export

//todo: revisit spoiler etc
@variant(0) 
export class PostFile {
	// @field({type: option('bool')})
	// spoiler?: boolean
	@field({type: 'string'})
	hash: string
	@field({type: 'string'})
	filename: string
	// @field({type: 'string'})
	// originalFilename: string
	// @field({type: 'string'})
	// mimetype: string
	@field({type: option('string')}) //todo: optionally allow no extensions?
	extension?: string
	@field({type: 'u64'})
	size: bigint
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
	constructor( hash: string, filename: string, extension: string, size: bigint) {

	// constructor(spoiler: boolean, hash: string, filename: string, originalFilename: string, mimetype: string, size: bigint, extension: string, sizeString: string, thumbextension: string, thumbhash: string, geometry: JschanPostFileGeometry, geometryString: string, hasThumb: boolean, attachment: boolean) {
		// this.spoiler = spoiler
		this.hash = hash
		this.filename = filename
		// this.originalFilename = originalFilename
		// this.mimetype = mimetype
		this.extension = extension
		this.size = size
		// this.sizeString = sizeString
		// this.thumbextension = thumbextension
		// this.thumbhash = thumbhash
		// this.geometry = geometry
		// this.geometryString = geometryString
		// this.hasThumb = hasThumb
		// this.attachment = attachment
	}
}

//todo: change _id to hash
//todo: signing posts as a particular identity? (tripcode/capcode)
//todo: different way of email? sage etc (options?)
//todo: spoilers
//todo: handle sticky, locked. etc?
//todo: handle id (should be exact hash of content maybe?)
//todo: files
@variant(0)
export class Post extends BasePostDocument {
	@field({type: 'string'})
	hash: string = ''
	@field({type: 'u64'})
	date: bigint
	@field({type: option('string')})
	replyto?: string
	@field({type: option('string')})
	name?: string
	// @field({type: option('string')})
	// tripcode?: string
	// @field({type: option('string')})
	// capcode?: string
	@field({type: option('string')})
	subject?: string
	@field({type: option('string')})
	email?: string
	@field({type: option('string')})
	message?: string
	@field({type: vec(PostFile)})
	files: PostFile[]

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
		date: bigint,
		replyto: string | undefined,
		name: string | undefined,
		// tripcode: string,
		// capcode: string,
		subject: string | undefined,
		email: string | undefined,
		message: string | undefined,
		files: PostFile[],
		// sticky, 

//		spoiler: string[],
//		spoiler_all: boolean,
		// strip_filename: string[],
		// files: PostSubmitFile[],
		// postpassword: string
		// editing: string
		) {
		super()
		this.date = date
		this.replyto = replyto
		this.name = name
		this.subject = subject
		this.email = email
		this.message = message
		// this.spoiler = spoiler
		// this.spoiler_all = spoiler_all
		// this.strip_filename = strip_filename
		this.files = files
		// this.postpassword = postpassword
		// this.editing = editing
		this.hash = toHexString(sha256Sync(serialize(this)))
	}

}

//todo: consistency with the document type 
@variant("postdatabase") //todo: consider renaming/modifying as appropriate
export class PostDatabase extends Program<OpenArgs> {

	@field({ type: Documents })
	documents: Documents<Post>
	@field({ type: FileDatabase })
	fileDb: FileDatabase

	constructor(properties?: { id?: Uint8Array }) {
		super()
		// this.id = properties?.id
		this.fileDb = new FileDatabase({ id: properties?.id })
		this.documents = new Documents({ id: properties?.id }) //
		// this.documents = new Documents({ index: new DocumentIndex({ indexBy: '_id' }) })
	}

	async open(properties?: OpenArgs) {
		await this.documents.open({
			type: Post,
			index: { idProperty: 'hash' },
			replicate: properties?.replicate,
			canPerform: async (operation) => {
				if (operation.type === 'put') {
					try {
						const post = operation.value
						Validate.post(post)
						let newCopy = new Post(
							post.date,
							post.replyto,
							post.name,
							post.subject,
							post.email,
							post.message,
							post.files
							)
						if (newCopy.hash != post.hash) {
							console.log('Post document hash didn\'t match expected.')
							console.log(newCopy)
							console.log(post)
							return false
						}
						return true
					//todo: remove (or dont write in the first place) blocks of invalid file
					} catch (err) {
						console.log(err)
						return false
					}
				} else if (operation.type === 'delete') {
					const signers = operation.entry.signatures.map(s => s.publicKey);
					for (var signer of signers) {
						if (isModerator(signer, this.node.identity.publicKey, currentModerators)) {//todo: board specific, more granularcontrol, etc.
							return true;
						}
					}
				}
				return false
			}
		})

	}
}
