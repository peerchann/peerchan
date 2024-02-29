'use-strict'; //todo: use strict throughout?

// const secrets = require(__dirname+'/../configs/secrets.js') //todo: address these
// 	, { migrateVersion } = require(__dirname+'/../package.json');
import { Peerbit, createLibp2pExtended } from "peerbit"
import { Program } from "@peerbit/program"
import { createLibp2p, Libp2p} from 'libp2p'
import { Documents, DocumentIndex, SearchRequest, StringMatch, MissingField, Results, ResultWithSource } from "@peerbit/document"
import { webSockets } from '@libp2p/websockets'
import { all } from '@libp2p/websockets/filters'
import { tcp } from "@libp2p/tcp"
// import { mplex } from "@libp2p/mplex";
import { yamux } from "@chainsafe/libp2p-yamux";
import { peerIdFromKeys } from "@libp2p/peer-id";
import { supportedKeys } from "@libp2p/crypto/keys";
import { noise } from '@dao-xyz/libp2p-noise'
import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Ed25519Keypair, toBase64, fromBase64, sha256Sync, PublicSignKey, Ed25519PublicKey, Secp256k1PublicKey } from "@peerbit/crypto"
import { field, variant, vec, option, serialize, deserialize } from "@dao-xyz/borsh"
import { multiaddr } from '@multiformats/multiaddr'
import fs from "fs"

import { Post, PostDatabase, PostFile } from './posts.js'
// import { PeerchanPostSubmissionService, Responder, Requester } from './posts.js' //todo: revist roles
import { Board, BoardDatabase } from './boards.js'
import { File, FileDatabase, FileChunk, FileChunkDatabase } from './files.js'
// import { PeerchanFile, PeerchanFileChunk, PeerchanFileDatabase, PeerchanFileChunkDatabase } from './files.js'
// import { PeerchanAccount, PeerchanAccountDatabase } from './accounts.js'
// import { postShallowCopy } from './index.js'

export let node: Libp2p
export let keypair: Ed25519Keypair
export let client: Peerbit
export let Posts: PostDatabase //todo: consider renaming here and throughout
// export let PostModerations: PeerchanPostModerationDatabase
export let Boards: BoardDatabase
export let Files: FileDatabase
export let FileChunks: FileChunkDatabase
// export let Accounts: PeerchanAccountDatabase

export let openedBoards: any = {}

// export let PostSubmissionService: PeerchanPostSubmissionService

let directory = './storage'; //todo: change path/address this etc.

export async function pbInitClient (listenPort = 8500) {

	// setMaxListeners(0) //todo: revisit

	client = await Peerbit.create({
//todo: need identity
//		identity: keypair,
		directory: directory,
		libp2p: {
			connectionManager: { //todo: revisit this
				maxConnections: Infinity,
				minConnections: 5
			},
			
			transports: [tcp(), webSockets({filter: all})],
			streamMuxers: [yamux()],
			// peerId: peerId, //todo: revisit this
			connectionEncryption: [noise()], // Make connections encrypted
			addresses: {
				listen: [
					'/ip4/127.0.0.1/tcp/'+listenPort,
					'/ip4/127.0.0.1/tcp/'+(listenPort+1)+'/ws'
				]
			},

		},

	})
	// console.log(client)
	// console.log(client.libp2p)
	// console.log(client.libp2p.getMultiaddrs())
	// console.log(client.libp2p.getMultiaddrs()[0])
	// console.log("Peerbit client initialized.")
	// console.log("Client id:")
	// console.log(client.identity)
	// console.log(Object.keys(client))
	// console.log(client.libp2p)
	// console.log(client.identity)
	// console.log(client.keychain)
	// console.log(client)
}

export async function clientId () {

	return toBase64(sha256Sync(client.identity.publicKey.publicKey))
}

export async function openPostsDb (postsDbId = "my_post_db") {

	openedBoards[postsDbId] = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

}

export async function bootstrap () {

	await client.bootstrap()
	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

}

export async function closePostsDb (postsDbId = "my_post_db") {

	await openedBoards[postsDbId].close()
	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

}

// //only one for now
// export async function openBoardsDb (boardsDbId = "") {

// 	Boards = await client.open(new BoardDatabase({ id: sha256Sync(Buffer.from(boardsDbId)) }))
// 	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

// }

//only one db for now
export async function openFilesDb (filesDbId = "") {
	Files = new FileDatabase({ id: sha256Sync(Buffer.from(filesDbId)) })
	await client.open(Files.chunks)
	await client.open(Files)
}

//only one db for now
//todo: remove?
export async function openFileChunksDb (fileChunksDbId = "") {
	FileChunks = await client.open(new FileChunkDatabase({ id: sha256Sync(Buffer.from(fileChunksDbId)) }))
}


//todo: allow arbitrary post dbs to be posted to
export async function makeNewPost (postDocument: Post, whichBoard: string) {
	
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	if (!postDocument) {
    	throw new Error('No post document provided.');
    }

	await openedBoards[whichBoard].documents.put(postDocument); //todo: need to return id?
//	await Posts.documents.put(newPostDocument); //todo: need to return id?

}

//todo: allow arbitrary post dbs to be posted to
export async function delPost (whichPost: string, whichBoard: string) {
	
	if (!whichPost) {
		throw new Error('No post specified.');
	}
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	let theseReplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: whichPost })]}), { local: true, remote: true })
	//delete post itself
	await openedBoards[whichBoard].documents.del(whichPost); //todo: need to return id?
	//then delete replies
	for (let thisReply of theseReplies) {
		await openedBoards[whichBoard].documents.del(thisReply.hash)
	}
}

//todo: allow arbitrary post dbs to be posted to
//todo: revisit remote
//todo: revisit async
export async function getAllPosts (query: any = {}) {
	
	//todo: add query?
	let results: any = []
	for (let thisBoard of Object.keys(openedBoards)) {
		results = results.concat(await openedBoards[thisBoard].documents.index.search(new SearchRequest, { local: true, remote: true }))
	}

    // Sort the results by the 'date' property in descending order
    results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on top

	return results
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: true });
}

//todo: revisit remote
//todo: revisit async
export async function getPosts (whichBoard: string) {
	
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

	//todo: add query?
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest, { local: true, remote: true })

    // Sort the results by the 'date' property in descending order
    results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on top

	return results
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: true });
}

//todo: add sage
//todo: optimize
export async function getThreadsWithReplies(whichBoard: string, numThreads: number = 10, numPreviewPostsPerThread: number = 5, whichPage: number = 1) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	let	threads = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new MissingField({ key: 'replyto' })]}), { local: true, remote: true })

    const totalpages = Math.max(1,Math.ceil(threads.length / numThreads)); //still have an index page even if its empty

	let lastbumps = new Array(threads.length)

	let replies = new Array(threads.length)
    let omittedreplies = new Array(threads.length)

	for (let i = 0; i < threads.length; i++) {
		let thesereplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: threads[i]['hash'] })]}), { local: true, remote: true })
		threads[i].lastbumped = thesereplies.reduce((max: bigint, reply: any) => reply.date > max ? reply.date : max, threads[i].date);
		threads[i].index = i
		omittedreplies[i] = Math.max(0, thesereplies.length - numPreviewPostsPerThread);
		thesereplies.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on bottom
		replies[i] = thesereplies.slice(-numPreviewPostsPerThread);
	}

    threads.sort((a: any, b: any) => (a.lastbumped > b.lastbumped) ? -1 : ((a.lastbumped < b.lastbumped) ? 1 : 0)) //newest on top

    // Return only the numThreads newest results
    var numToSkip = (whichPage - 1) * numThreads
    threads = threads.slice(numToSkip, numThreads + numToSkip);

	omittedreplies = threads.map((t: any) => omittedreplies[t.index]);
	replies = threads.map((t: any) => replies[t.index]);

    return { threads, replies, omittedreplies, totalpages }
}



//todo: order by bumped
//todo: deal with this (unused now)
export async function getThreadsWithReplies_prev(whichBoard: string, numThreads: number = 10, numPreviewPostsPerThread: number = 5) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	let	threads = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new MissingField({ key: 'replyto' })]}), { local: true, remote: true })
	
    // Sort the results by the 'date' property in descending order
    threads.sort((a: any, b: any) => (a.date > b.date) ? -1 : ((a.date < b.date) ? 1 : 0)) //newest on top

    // Return only the 10 newest results
    threads = threads.slice(0, numThreads);
    let replies = new Array(threads.length)
    let omittedreplies = new Array(threads.length)

	for (let i = 0; i < threads.length; i++) {
		let thesereplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: threads[i]['hash'] })]}), { local: true, remote: true })
		thesereplies.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on bottom
		omittedreplies[i] = Math.max(0, thesereplies.length - numPreviewPostsPerThread);
		replies[i] = thesereplies.slice(-numPreviewPostsPerThread);
	}

    // Return only the 10 newest results
    return { threads, replies, omittedreplies }
}

//todo: revisit remote
//todo: revisit async
export async function getSpecificPost (whichBoard: string, whichThread: string) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

     if (!whichThread) {
        throw new Error('No thread specified.');
    }


	//todo: add query?
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'hash', value: whichThread })]}), { local: true, remote: true })
	return results
	// return results.length ? results[0] : []
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: true });
}

//todo: revisit remote
//todo: revisit async
export async function getRepliesToSpecificPost (whichBoard: string, whichThread: string) {
	
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

     if (!whichThread) {
        throw new Error('No thread specified.');
    }


	//todo: add query?
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: whichThread })]}), { local: true, remote: true })
	results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on bottom
	return results
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: true });
}

export async function putFile (fileData: Uint8Array) {
		let fileDocument = await new File(fileData)
		await fileDocument.writeChunks(Files.chunks, fileData)
		await Files.files.put(fileDocument)
		// await Promise.all([ //todo: can move out of await
		// 	// fileDocument.writeChunks(fileData, fileDocument.hash),
		// 	db.documents.put(fileDocument)
		// 	])
		return fileDocument.hash

}

export async function getFile (fileHash: string) {
		console.log("debug 1 in db.ts getFile():")
		console.log(fileHash)
		// let db = Files //todo: revisit this here and elsewhere
		// console.log("FileChunks.documents.index.size:")
		// console.log(FileChunks.documents.index.size)
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: true }).then(results => results[0])
		console.log("debug 2 in db.ts getFile():")
		console.log(foundResults)
		if (foundResults) {
			return await Files.getFile(foundResults.hash) //todo: revisit for missing files/etc. //todo: revisit for efficiency?
//			return await foundResults?.results[0].value.getFile() //todo: revisit for missing files/etc.
		} else {
			return false
		}
}

//todo: consider making more efficient with above
export async function fileExists (fileHash: string) {
		
		console.log('fileExist:')
		console.log(fileHash)
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: true })
		console.log('foundResults:')
		console.log(foundResults)
		console.log(foundResults.length)
		if (foundResults.length) {
			return true
		} else {
			return false
		}
}

//todo: need to get this also deleting the file chunks whenever anyone deletes, not just us
export async function delFile (fileHash: string) {
	//todo:
	// let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: true }).then(results => results[0])
	//first delete all the chunks of the file we may have
	// for (let chunkCid in foundResults.chunkCids) {
	// 	await FileChunks.documents.del(chunkCid)
	// }
	//then delete the file document itself
	try {
		await Files.deleteFile(fileHash)
	} catch (err) {
		console.log(err)
		return err //todo: revisit return value
	}


	//need to delete file, filechunks, and directblocks of file contents
	// console.log("delFile fileHash in index.ts delFile():")
	// console.log(fileHash)
	// //todo: make this more async?
	// let chunksOfFile: Results<PeerchanFileChunk> | undefined;
	// await FileChunks.documents.index.query(new SearchRequest({ queries: [new StringMatch({key: 'fileHash', value: fileHash })] }), (results, from) => {
	// 	chunksOfFile = results
	// }, { local: true, remote: true }) //todo: revisit remote search here and elsewhere
	// console.log("chunksOfFile to delete:")
	// console.log(chunksOfFile)

	// if (chunksOfFile) {
	// 	chunksOfFile.map(async result => await FileChunks.documents.del(result.value.hash))
	// }
	// await Files.documents.del(fileHash)
}

// //todo: option()ality of this?
// //todo: add additional info to this
// @variant(0)
// export class PeerchanDatabaseInfo {
// 	@field({type: PublicSignKey})
// 	rootKey: PublicSignKey	
// 	@field({type: 'string'})
// 	multiAddr: string
// 	@field({type: Uint8Array})
// 	postsId: Uint8Array
// 	@field({type: Uint8Array})
// 	postModerationsId: Uint8Array
// 	@field({type: Uint8Array})
// 	boardsId: Uint8Array
// 	@field({type: Uint8Array})
// 	filesId: Uint8Array
// 	// @field({type: Uint8Array})
// 	// fileChunksId: Uint8Array
// 	@field({type: Uint8Array})
// 	accountsId: Uint8Array

// 	// @field({type: Uint8Array})
// 	// proposedPostsId: Uint8Array
// 	constructor(rootKey: PublicSignKey, multiAddr: string, postsString: string, postModerationsString: string, boardsString: string, filesString: string, accountsString: string) {
// 		this.rootKey = rootKey
// 		this.multiAddr = multiAddr
// 		this.postsId = sha256Sync(Buffer.from(postsString))
// 		this.postModerationsId = sha256Sync(Buffer.from(postModerationsString))
// 		this.boardsId = sha256Sync(Buffer.from(boardsString))
// 		this.filesId = sha256Sync(Buffer.from(filesString))
// 		// this.fileChunksId = sha256Sync(Buffer.from(fileChunksString))
// 		this.accountsId = sha256Sync(Buffer.from(accountsString))
// 		// this.proposedPostsId = sha256Sync(Buffer.from(proposedPostsString))
// 	}
// }
// //todo: check await
// //todo: get these from another file
// //consider not sending moderations?
// let dbInfo: PeerchanDatabaseInfo


// export async function pbInitRPCServices () {
// 	PostSubmissionService = await client.open(new PeerchanPostSubmissionService(Posts, PostModerations), { args: { role: new Responder } }) //todo: need to have the role determined by a config somewhere so peerchan-peer chan default to Observer (or new role name)
// }

// //todo: move the rest into these as necessary
// export async function openAccountsDb() { //this is here so it can be called by gulp scripts without also doing everything else
// 	Accounts = await client.open(new PeerchanAccountDatabase({ id: sha256Sync(Buffer.from("PeerchanAccounts")), rootKeys: [client.identity.publicKey] }))
// }

// //for debugging.. //todo: remove
// export async function showAccounts() {
// 	let allAccounts = await Accounts.documents.index.search(new SearchRequest({query: []}))
// 	console.log('allAccounts:')
// 	console.log(allAccounts)
// }

// export async function pbInitDbs () {
// 	// More info about configs here https://github.com/libp2p/js-libp2p/blob/master/doc/GETTING_STARTED.md#configuring-libp2p
// 	// console.log(client)
// 	//todo: revisit these if they need ids specified

// 	console.log('debug signkeystuff')
// 	console.log(client.identity.publicKey)

// 	dbInfo = new PeerchanDatabaseInfo(
// 		client.identity.publicKey,
// 		await client.libp2p.getMultiaddrs()[0].toString(),
// 		"PeerchanPosts",
// 		"PeerchanPostModerations",
// 		"PeerchanBoards",
// 		"PeerchanFiles",
// 		// "PeerchanFileChunks",
// 		"PeerchanAccounts"
// 	)
// 	console.log(dbInfo)
// 	console.log(serialize(dbInfo))

// 	// Posts = await client.open(new PeerchanPostDatabase({ id: dbInfo.postsId })) //todo: revisit these in context of async
// 	// PostModerations = await client.open(new PeerchanPostModerationDatabase({ id: dbInfo.postModerationsId }))
// 	// Boards = await client.open(new PeerchanBoardDatabase({ id: dbInfo.boardsId }))
// 	// Files = await client.open(new PeerchanFileDatabase({ id: dbInfo.filesId }))
// 	// FileChunks = await client.open(new PeerchanFileChunkDatabase({ id: dbInfo.fileChunksId }))


// 	//todo: get strings from dbInfo

// 	Posts = await client.open(new PeerchanPostDatabase({ id: sha256Sync(Buffer.from("PeerchanPosts")), rootKeys: [client.identity.publicKey] })) //todo: revisit these in context of async
// 	PostModerations = await client.open(new PeerchanPostModerationDatabase({ id: sha256Sync(Buffer.from("PeerchanPostModerations")), rootKeys: [client.identity.publicKey] }))
// 	Boards = await client.open(new PeerchanBoardDatabase({ id: sha256Sync(Buffer.from("PeerchanBoards")), rootKeys: [client.identity.publicKey] }))
// 	Files = await client.open(new PeerchanFileDatabase({ id: sha256Sync(Buffer.from("PeerchanFiles")), rootKeys: [client.identity.publicKey] }))
// 	// FileChunks = await client.open(new PeerchanFileChunkDatabase({ id: sha256Sync(Buffer.from("PeerchanFileChunks")), rootKeys: [client.identity.publicKey] }))
// 	Accounts = await client.open(new PeerchanAccountDatabase({ id: sha256Sync(Buffer.from("PeerchanAccounts")), rootKeys: [client.identity.publicKey] }))

// 	await showAccounts()


// 	//start post submission rpc service
// 	await pbInitRPCServices()


// 	// ProposedPosts = await client.open(new PeerchanProposedPostDatabase({ id: sha256Sync(Buffer.from("PeerchanProposedPosts")), rootKeys: [client.identity.publicKey] }))
// 	// Posts = await client.open(new PeerchanPostDatabase({ id: "PeerchanPosts" })), //todo: revisit these in context of async
// 	// PostModerations = await client.open(new PeerchanPostModerationDatabase({ id: "PeerchanPostModerations" })),
// 	// Boards = await client.open(new PeerchanBoardDatabase({ id: "PeerchanBoards"})),
// 	// Files = await client.open(new PeerchanFileDatabase({ id: "PeerchanFiles" })),
// 	// FileChunks = await client.open(new PeerchanFileChunkDatabase({ id: "PeerchanFileChunks" }))
// 	console.log("Posts address:")
// 	console.log(Posts.address.toString())
// 	console.log("PostModerations address:")
// 	console.log(PostModerations.address.toString())
// 	console.log("Boards address:")
// 	console.log(Boards.address.toString())
// 	console.log("Files address:")
// 	console.log(Files.address.toString())
// 	// console.log("FileChunks address:")
// 	// console.log(FileChunks.address.toString())
// 	console.log("Accounts address:")
// 	console.log(Accounts.address.toString())	

// 	// console.log("ProposedPosts address:")
// 	// console.log(ProposedPosts.address.toString())

// 	//todo: broadcast topic of PostSubmissionsService?


// 	// console.log(Posts)
// 	// await Posts.load()
// 	// let staticDbNames = ["Posts"] //todo: extend to Boards, News, etc.
// 	// for (let staticDbName of staticDbNames ) {
// 	// 	console.log("Opening " + staticDbName)
// 	// 	DB[staticDbName] = await client.open(new MyDatabase({ id: "test-posts-id" })) //todo: revisit id, revisit MyDatabase?
// 	// 	console.log("Loading " + staticDbName)
// 	// 	await DB[staticDbName].load()
// 	// }
// 	console.log("Peerbit databases initialized.")
// }

// //todo: merge this with above/async considerations
// //todo: remove this or keep due to peerbit databases not being loaded anymore but keep modularity compatibility wise with other db modules?
// export async function pbLoadDbs () {
// 	return
// }

export async function pbStopClient () {
	await client.stop()
	console.log("Peerbit client stopped.")
}

// export async function getDbAddresses () {
// 	return serialize(dbInfo)
   
// 	let addresses: any = {};

//    console.log('Posts:')
//    console.log(Posts)
//    console.log('client')
//    console.log(client)
//    console.log(client.libp2p)
//    console.log(client.libp2p.getMultiaddrs())

//    //todo: store these in a db and get them via a query (consider?)
//    addresses['rootKey'] = client.identity.publicKey.toString(); //todo: revisit if this is proper format (identity vs idKey?)
//    addresses['multiAddr'] = await client.libp2p.getMultiaddrs()[0]
//    //todo: revisit these by adding ID
//    // addresses['postsId'] = Buffer.from(Posts.id).toString('base64') //consider making these dynamic/vary with site?
//    // addresses['postModerationsId'] = Buffer.from(PostModerations.id).toString('base64') //todo: consider including or not including this
//    // addresses['boardsId'] = Boards.id.toString('base64')
//    // addresses['filesId'] = Files.id
//    // addresses['fileChunksId'] = FileChunks.id


//    // addresses['postsId'] = Posts.id //consider making these dynamic/vary with site?
//    // addresses['postModerationsId'] = PostModerations.id //todo: consider including or not including this
//    // addresses['boardsId'] = Boards.id
//    // addresses['filesId'] = Files.id
//    // addresses['fileChunksId'] = FileChunks.id
//    addresses['postsAddress'] = Posts.address.toString()
//    addresses['postModerationsAddress'] = PostModerations.address.toString() //todo: consider including or not including this
//    addresses['boardsAddress'] = Boards.address.toString()
//    addresses['filesAddress'] = Files.address.toString()
//    addresses['fileChunksAddress'] = FileChunks.address.toString()
//    // addresses['posts'] = db['Posts'].address.toString()
//    // addresses['postmoderations'] = db['PostModerations'].address.toString() //todo: consider including or not including this
//    // addresses['boards'] = db['Boards'].address.toString()
//    // addresses['files'] = db['Files'].address.toString()
//    // addresses['filechunks'] = db['FileChunks'].address.toString()
//    return addresses
   
// }

// //todo: more efficient way of doing these?
// //todo: rename these(or just rpcDeserialize) to be post-specific (probably need serialize too as its for both query, post, etc.)
// export function rpcSerialize(data: any) {
// 	// return serialize(data)
// 	console.log("debugging rpcSerialize() in db.js:")
// 	console.log(data)

// 	// //re-add .source so it can be serialized properly: (might become unnecessary later on?)
// 	// //todo: might need to genericize this to deal with queries etc.
// 	// data.results = data.results.map((r: ResultWithSource<PeerchanPost>) => new ResultWithSource({source: serialize(r.value), context: r.context, value: r.value}))

// 	// for (let tK of Object.keys(data)) {
// 	// 	console.log(data[tK])
// 	// 	console.log(typeof data[tK])
// 	// }
// 	// console.log("serialize(data):")
// 	if (data) {
// 		// console.log(serialize(data))
// 		//todo: need to define the type of object (cant be any))
// 		return Buffer.from(serialize(data)).toString('base64');
// 	}
// }

// //todo: more efficient way of doing these?
// //todo: rename these(or just rpcDeserialize) to be post-specific (probably need serialize too as its for both query, post, etc.)
// export function rpcSerializeResults(data: any) {
// 	// return serialize(data)
// 	console.log("debugging rpcSerializeResults() in db.js:")
// 	console.log(data)

// 	// for (let tK of Object.keys(data)) {
// 	// 	console.log(data[tK])
// 	// 	console.log(typeof data[tK])
// 	// }
// 	if (data) {
// 		// //re-add .source so it can be serialized properly: (might become unnecessary later on?)
// 		// //todo: might need to genericize this to deal with queries etc. //todo: (can/should this be ResultWithSource<PeerchanPost>)
		
// 	//	data = data.map((r: ResultWithSource<PeerchanPost | PeerchanPostModeration | PeerchanBoard>) => new ResultWithSource({source: serialize(r.value), context: r.context, value: r.value}))
// 		console.log("serialize(data):")
// 		//todo: better way to do this?
// 		for (let i in data) {
// 			data[i] = serialize(data[i])
// 		}  
// 		console.log(data)
// 		//todo: need to define the type of object (cant be any))
// 		return data
// 		// return Buffer.from(serialize(data)).toString('base64');
// 	}
// }


// //todo: add proposedposts
// export function rpcDeserializeResults(data: any, options: any) {
// 	console.log('data in rpcDeserializeResults:')
// 	// console.log(Buffer.from(data, 'base64'))
// 	// console.log(new Uint8Array(Buffer.from(data, 'base64')))
// 	// let uint8Data = new Uint8Array(Buffer.from(data, 'base64'))
// 	if (data) {
// 		console.log("debug 7001")
// 		console.log(data)
// 		for (let i in data) {
// 			console.log(data[i])
// 			console.log(new Uint8Array(data[i]))
// 		}

// 		let documentType: any =  documentTypeFromOptionsString(options?.db)
// 		console.log(options?.db)
// 		console.log('documentType:')
// 		console.log(documentType)
// 		// return deserialize(new Uint8Array(Buffer.from(data, 'base64')), documentType)

// 		for (let i in data) {
// 			data[i] = deserialize(data[i].data ? new Uint8Array(data[i].data) : data[i], documentType)
// 		}
// 		console.log("data after:")
// 		console.log(data)
// 		return data

// 		// return data.map(r => rpcDeserializeDocument(r, options))
// 		// switch (options?.db) {
// 		// 	case 'boards':
// 		// 		return data.map(r: Uint8Array => deserialize(new Uint8Array(Buffer.from(r, 'base64')), PeerchanBoard))
// 		// 	case 'postmoderations':
// 		// 		return data.map(r: Uint8Array => deserialize(new Uint8Array(Buffer.from(r, 'base64')), PeerchanPostModeration))
// 		// 	case 'posts':
// 		// 	default:
// 		// 		return data.map(r: Uint8Array => deserialize(new Uint8Array(Buffer.from(r, 'base64')), PeerchanPost))

// 		// }
// 		// let myDeserializedData: Results<PeerchanPost | PeerchanPostModeration | PeerchanBoard> = deserialize(uint8Data, Results)
// 		// // console.log("debug 7002")
// 		// // console.log("myDeserializedData:")
// 		// // console.log(myDeserializedData)
// 		// // console.log("debug 7003")
// 		// // console.log(new Uint8Array(Buffer.from(data, 'base64')))
// 		// // console.log("debug 7004")
// 		// // deserialize(new Uint8Array(Buffer.from(data, 'base64')), Results)
// 		// return deserialize(new Uint8Array(Buffer.from(data, 'base64')), Results)
// 	}
// 	// return deserialize(data, PeerchanPost)
//  }

// //todo: consolidate functionality into this using options.db flag
// export function rpcDeserializeDocument(data: any, options: any) {
// 	console.log('data in rpcDeserializeDocument:')
// 	console.log(data)
// 	console.log(Buffer.from(data, 'base64'))
// 	console.log((new Uint8Array(Buffer.from(data, 'base64'))))
// 	if (data) {
// 		let documentType: any =  documentTypeFromOptionsString(options?.db)
// 		console.log('documentType:')
// 		console.log(documentType)
// 		return deserialize(new Uint8Array(Buffer.from(data, 'base64')), documentType)
// 	}

// }

// //todo: use this in more places
// function documentTypeFromOptionsString(optionsString: string) {
// 	switch (optionsString) {
// 		case 'file':
// 			return PeerchanFile
// 		case 'filechunk':
// 			return PeerchanFileChunk
// 		case 'boards':
// 			return PeerchanBoard
// 		case 'postmoderations':
// 			return PeerchanPostModeration
// 		case 'accounts':
// 			return PeerchanAccount
// 		// case 'proposedposts':
// 		// 	return PeerchanProposedPost
// 		case 'posts':
// 		default:
// 			return PeerchanPost
// 	}
// }

// export function rpcDeserializePost(data: any) {
// 	console.log('data in rpcDeserializePost:')
// 	console.log(data)
// 	console.log(Buffer.from(data, 'base64'))
// 	console.log((new Uint8Array(Buffer.from(data, 'base64'))))
// 	let test = (new Uint8Array(Buffer.from(data, 'base64')))

// 	if (data) {
// 		// return deserialize(test, PeerchanPost)
// 		return deserialize(new Uint8Array(Buffer.from(data, 'base64')), PeerchanPost)
// 	}
// 	// return deserialize(data, PeerchanPost)
// }

// export function rpcDeserializePostModeration(data: any) {
// 	console.log('data in rpcDeserializePostModeration:')
// 	console.log(data)
// 	console.log(Buffer.from(data, 'base64'))
// 	console.log((new Uint8Array(Buffer.from(data, 'base64'))))
// 	let test = (new Uint8Array(Buffer.from(data, 'base64')))

// 	if (data) {
// 		// return deserialize(test, PeerchanPost)
// 		return deserialize(new Uint8Array(Buffer.from(data, 'base64')), PeerchanPostModeration)
// 	}
// 	// return deserialize(data, PeerchanPost)
// }

// export function rpcDeserializeQuery(data: any) {
// 	if (data) {
// 		return deserialize(new Uint8Array(Buffer.from(data, 'base64')), SearchRequest)
// 	}
// 	// return deserialize(data, PeerchanPost)
// }

// //todo: remove this stuff as it's not necessary anymore
// //todo: revisit neater way to do this
// 	//might necessitate handling shallow copy options etc for resultsToPostModerationsArray
// export function resultsToCorrespondingArray(data: any, options: any) {
// 	return data
// 	switch (options?.db) {
// 		case 'postmoderations':
// 			return resultsToPostModerationsArray(data, options)
// 		case 'boards':
// 			return resultsToBoardsArray(data, options)
// 		case 'posts':
// 		default:
// 			return resultsToPostsArray(data, options)
// 	}
// }


// //todo: consider removing these as they aren't used anymore
// // take a Results and turn it into an array of [PeerchanPost, PeerchanPost, PeerchanPost...]
// export function resultsToPostsArray(data: any, options: any) {
// 	console.log("resultsToPostsArray")
// 	console.log(data)
// 	if (data) {
// 		return data.map((r: ResultWithSource<PeerchanPost>) => new ResultWithSource({source: r._source, context: r.context, value: deserialize(r._source as Uint8Array, PeerchanPost)})).map((r: ResultWithSource<PeerchanPost>) => (options?.shallow ? postShallowCopy(r.value) : r.value)) //todo: revisit
// 	} else {
// 		return []
// 	}
// }

// // take a Results and turn it into an array of [PeerchanPostModeration, PeerchanPostModeration, PeerchanPostModeration...]
// //todo: shallow copies arent implemented, revisit
// export function resultsToPostModerationsArray(data: any, options: any) {
// 	console.log("resultsToPostModerationsArray")
// 	console.log(data)
// 	if (data) {
// 		return data.map((r: ResultWithSource<PeerchanPostModeration>) => new ResultWithSource({source: r._source, context: r.context, value: deserialize(r._source as Uint8Array, PeerchanPostModeration)})).map((r: ResultWithSource<PeerchanPostModeration>) => r.value) //todo: revisit
// 	} else {
// 		return []
// 	}
// }

// export function resultsToBoardsArray(data: any, options: any) {
// 	if (data) {
// 		console.log("resultsToBoardsArray")
// 		console.log(data)
// 		return data.map((r: ResultWithSource<PeerchanBoard>) => new ResultWithSource({source: r._source, context: r.context, value: deserialize(r._source as Uint8Array, PeerchanBoard)})).map((r: ResultWithSource<PeerchanBoard>) => (options?.shallow ? postShallowCopy(r.value) : r.value)) //todo: revisit
// //		return data.results.map((r: ResultWithSource<PeerchanBoard>) => new ResultWithSource({source: r._source, context: r.context, value: deserialize(r._source as Uint8Array, PeerchanBoard)})).map((r: ResultWithSource<PeerchanBoard>) => (options?.shallow ? postShallowCopy(r.value) : r.value)) //todo: revisit
// 	} else {
// 		return []
// 	}
// }

// // //todo: remove/revisit
// // export function runTest () { //todo: use jschanpostdata instead?
// //	 console.log('Successfully imported peerbit posts module!')
// // }

export function resetDb () {
	fs.existsSync(directory) && fs.rmSync(directory, { recursive: true })




 }

// //todo: homogenize these with peerchan module (and make same overall so single one can be used)

// //todo: revisit (get these from mediator API and also store locally?)
// export async function openSpecificDbs (dbData: any) {
// 	// console.log('ping 1')
// 	// Posts = await client.open(new PeerchanPostDatabase({ id: "PeerchanPosts" }))
// 	// console.log('ping 2')
// 	// console.log(Posts.address.toString())
// 	console.log('dbData:')
// 	console.log(dbData)
// 	// dbData = deserialize(dbData, PeerchanDatabaseInfo)
// 	//todo: have these already be uint8arrays on the mediator side

// 	// let debug = dbData.rootKey
// 	// console.log(debug)
// 	// debug = debug.match(/\/.*$/g)[0].slice(1)
// 	// console.log(debug)
// 	// debug = Buffer.from(debug, 'hex')
// 	// console.log(debug)
// 	// debug = new Uint8Array(debug)
// 	// console.log(debug)

//     // let rootKeys = [new Uint8Array(Buffer.from(dbData.rootKey.match(/\/.*$/g)[0].slice(1), 'hex'))]

//     let rootKeys = [dbData.rootKey]  


// 	Posts = await client.open(new PeerchanPostDatabase({ id: dbData.postsId, rootKeys: rootKeys })) //todo: revisit these in context of async
// 	PostModerations = await client.open(new PeerchanPostModerationDatabase({ id: dbData.postModerationsId, rootKeys }))
// 	Boards = await client.open(new PeerchanBoardDatabase({ id: dbData.boardsId, rootKeys }))
// 	Files = await client.open(new PeerchanFileDatabase({ id: dbData.filesId, rootKeys }))
// 	// FileChunks = await client.open(new PeerchanFileChunkDatabase({ id: dbData.fileChunksId, rootKeys }))
// 	Accounts = await client.open(new PeerchanAccountDatabase({ id: dbData.accountsId, rootKeys }))
	

// 	//start post submission rpc service
// 	await pbInitRPCServices()

// 	// ProposedPosts = await client.open(new PeerchanProposedPostDatabase({ id: dbData.proposedPostsId, rootKeys }))
// 	// Posts = await client.open('/peerbit/zb2rhdcdxkYQv2YrXP18TD4UQB392dMzt8p1HRn9fBHb7C9Sx') as PeerchanPostDatabase
// 	// PostModerations = await client.open('/peerbit/zb2rhZ9fhrY4ygne42emJuwF65rN9LeH1XZhitFDuLmFpmTfr') as PeerchanPostModerationDatabase
// 	// Boards = await client.open('/peerbit/zb2rhkeBkf1QoiffwvF8ih7UbNAXMBKgDbwGQgkPieY7hR1rk') as PeerchanBoardDatabase
// 	// Files = await client.open('/peerbit/zb2rhaNs9sRzuHTH4NgFnaiZjndmA5VSA7VvHZBaajWDLuoSZ') as PeerchanFileDatabase
// 	// FileChunks = await client.open('/peerbit/zb2rhcN47juQ57fx7HsS5p4Ex1LDGn7VHATE9dzJJWqpCTSvP') as PeerchanFileChunkDatabase
// 	console.log("Peerbit databases initialized.")
// 	console.log('Posts:')
// 	console.log(Posts.address.toString())
// 	console.log('PostModerations:')
// 	console.log(PostModerations.address.toString())
// 	console.log('Boards:')
// 	console.log(Boards.address.toString())
// 	console.log('Files:')
// 	console.log(Files.address.toString())
// 	// console.log('FileChunks:')
// 	// console.log(FileChunks.address.toString())
// 	console.log('Accounts:')
// 	console.log(Accounts.address.toString())

// 	// console.log('ProposedPosts:')
// 	// console.log(ProposedPosts.address.toString())
// }

// //todo: consider changing change name from addresses.json here and in peerchan
// export function deserializeMediatorDatabaseInfo(mediatorDataBaseInfo: Uint8Array) {
// 	console.log('debugging deserializeMediatorDatabaseInfo')
// 	console.log(mediatorDataBaseInfo)
// 	return deserialize(mediatorDataBaseInfo, PeerchanDatabaseInfo)
// }

export async function connectToPeer (peerAddress: string) { //todo: make more flexible? //todo: consider pass multiaddr object?
	try {
		await client.libp2p.dial(multiaddr(peerAddress))
		console.log('Connected to peer at ' + peerAddress + '.')
	} catch (error) {
		console.log('Failed to connect to peer at ' + peerAddress + '.')
		console.log(error)
	}
}



//todo: consider this
// export class BasePeerchanDocument {
// 	canWriteTo(signers: any) {


// 	}





// }