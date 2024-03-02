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
import { Ed25519Keypair, toBase64, fromBase64, sha256Sync, toHexString, PublicSignKey, Ed25519PublicKey, Secp256k1PublicKey } from "@peerbit/crypto"
import { field, variant, vec, option, serialize, deserialize } from "@dao-xyz/borsh"
import { multiaddr } from '@multiformats/multiaddr'
import fs from "fs"

import { Post, PostDatabase, PostFile } from './posts.js'
// import { PeerchanPostSubmissionService, Responder, Requester } from './posts.js' //todo: revist roles
import { Board, BoardDatabase } from './boards.js'
import { File, FileDatabase, FileChunk, FileChunkDatabase } from './files.js'
// import { PeerchanFile, PeerchanFileChunk, PeerchanFileDatabase, PeerchanFileChunkDatabase } from './files.js'
// import { PeerchanAccount, PeerchanAccountDatabase } from './accounts.js'


export let node: Libp2p
export let keypair: Ed25519Keypair
export let client: Peerbit
export let Posts: PostDatabase //todo: consider renaming here and throughout
// export let PostModerations: PeerchanPostModerationDatabase
export let Boards: BoardDatabase
export let Files: FileDatabase
// export let FileChunks: FileChunkDatabase
// export let Accounts: PeerchanAccountDatabase

export let currentModerators: string[] = []

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
}

export async function clientId () {

	return toBase64(sha256Sync(client.identity.publicKey.publicKey))
}

export async function openPostsDb (postsDbId = "my_post_db", options: any) {

	if (options.replicationFactor) {
		openedBoards[postsDbId] = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }), {
			args: {
				role: {
					type: "replicator",
					factor: 1
				}
			}})
	} else {
		openedBoards[postsDbId] = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
	}

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
export async function openFilesDb (filesDbId = "", options: any) {

	Files = new FileDatabase({ id: sha256Sync(Buffer.from(filesDbId)) })
	if (options.replicationFactor) {
		await client.open(Files.chunks, {
			args: {
				role: {
					type: "replicator",
					factor: 1
				}
			}})
		await client.open(Files, {
			args: {
				role: {
					type: "replicator",
					factor: 1
				}
			}})
	} else {
		await client.open(Files.chunks)
		await client.open(Files)
	}

}

// //only one db for now
// //todo: remove?
// export async function openFileChunksDb (fileChunksDbId = "") {
// 	FileChunks = await client.open(new FileChunkDatabase({ id: sha256Sync(Buffer.from(fileChunksDbId)) }))
// }

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
		// console.log("debug 1 in db.ts getFile():")
		// console.log(fileHash)
		// let db = Files //todo: revisit this here and elsewhere
		// console.log("FileChunks.documents.index.size:")
		// console.log(FileChunks.documents.index.size)
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: true }).then(results => results[0])
		// console.log("debug 2 in db.ts getFile():")
		// console.log(foundResults)
		if (foundResults) {
			return await Files.getFile(foundResults.hash) //todo: revisit for missing files/etc. //todo: revisit for efficiency?
//			return await foundResults?.results[0].value.getFile() //todo: revisit for missing files/etc.
		} else {
			return false
		}
}

//todo: consider making more efficient with above
export async function fileExists (fileHash: string) {
		
		// console.log('fileExist:')
		// console.log(fileHash)
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: true })
		// console.log('foundResults:')
		// console.log(foundResults)
		// console.log(foundResults.length)
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
}

//todo: revisit? make into keys?
//todo: have all post dbs reference a given thing?
export function setModerators(moderators: string[] = []) {
	 currentModerators = moderators || [] //sanity
}


export async function pbStopClient () {
	await client.stop()
	console.log("Peerbit client stopped.")
}

export function resetDb () {
	fs.existsSync(directory) && fs.rmSync(directory, { recursive: true })




 }

export async function connectToPeer (peerAddress: string) { //todo: make more flexible? //todo: consider pass multiaddr object?
	try {
		await client.libp2p.dial(multiaddr(peerAddress))
		console.log('Connected to peer at ' + peerAddress + '.')
	} catch (error) {
		console.log('Failed to connect to peer at ' + peerAddress + '.')
		console.log(error)
	}
}
