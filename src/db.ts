'use-strict'; //todo: use strict throughout?

// const secrets = require(__dirname+'/../configs/secrets.js') //todo: address these
// 	, { migrateVersion } = require(__dirname+'/../package.json');
import { Peerbit, createLibp2pExtended } from "peerbit"
import { Program } from "@peerbit/program"
import { createLibp2p, Libp2p} from 'libp2p'
import { Documents, DocumentIndex, SearchRequest, StringMatch, IsNull } from "@peerbit/document"
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
import { type ReplicationOptions } from "@peerbit/shared-log";

import Validate from "./validation.js"

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
export let remoteQueryPosts: boolean = false
export let remoteQueryFileRefs: boolean = false
export let remoteQueryFileChunks: boolean = false 

export const searchResultsLimit = 0xffffffff //large number; get all results

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
	return client.identity.publicKey.hashcode()
}

// export type OpenArgs = { replicate: ReplicationOptions };
export type OpenArgs = {
	replicate?: {factor: any},
	existing: any,
	compatibility: any
}

//todo: move the config to a different spot
//todo: consider finding a way to open files, chunks, posts async
export async function openPostsDb(postsDbId = "my_post_db", options: any) {
    console.log(`Opening database for /${postsDbId}/...`, options);
    if (!openedBoards[postsDbId]) {
    	openedBoards[postsDbId] = new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) });
    }
    if (options?.replicationFactor) {
        if (openedBoards[postsDbId].fileDb.chunks.closed) {
            await client.open(openedBoards[postsDbId].fileDb.chunks, {
                // replicate: {factor: options.replicationFactor},
                args: {
                    replicate: {
                        factor: options.replicationFactor
                    },
                    existing: "reuse",
                    compatibility: 6
                },
            });
        }
        if (openedBoards[postsDbId].fileDb.closed) {
             await client.open(openedBoards[postsDbId].fileDb, {
                args: {
                    replicate: {
                        factor: options.replicationFactor
                    },
                    existing: "reuse",
                    compatibility: 6
                },
            });
        }
        if (openedBoards[postsDbId].closed) {
            await client.open(openedBoards[postsDbId], {
                args: {
                    replicate: {
                        factor: options.replicationFactor
                    },
                    existing: "reuse",
                    compatibility: 6
                },
            });
        }
    }
    else {
        if (openedBoards[postsDbId].fileDb.chunks.closed) {
            await client.open(openedBoards[postsDbId].fileDb.chunks, {
            	args: {
            		existing: "reuse",
            		compatibility: 6	
            	}  
            });
        }
        if (openedBoards[postsDbId].fileDb.closed) {
            await client.open(openedBoards[postsDbId].fileDb, {
            	args: {
            		existing: "reuse",
            		compatibility: 6	
            	}  
            });
        }
        if (openedBoards[postsDbId].closed) {
            await client.open(openedBoards[postsDbId], {
            	args: {
            		existing: "reuse",
            		compatibility: 6	
            	}  
            });
        }
        // await client.open(openedBoards[postsDbId].fileDb.chunks)
        // await client.open(openedBoards[postsDbId].fileDb)
    }
    //Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
}

//todo: use enums or whatever
export async function getBoardStats (whichBoard: string) {
	const thisBoard = openedBoards[whichBoard]
	let boardStatus = 0 //0 means the board object isn't instatiated
	if (thisBoard && thisBoard.fileDb && thisBoard.fileDb.chunks) { //todo: more granularity to see which dbs are loading still
		if (thisBoard.closed || thisBoard.fileDb.closed || thisBoard.fileDb.chunks.closed) { //todo: ditto
			boardStatus = 1 //1 means the board is still loading
		} else {
			boardStatus = 2 //2 means the board is opened successfully
		}
	}
	let rfStatus = [null, null, null]
	//if the board is opened, we get the replication factors, corresponding to posts, files, and fileChunks
	if (boardStatus == 2) {
	        rfStatus = [(await thisBoard.documents.log.getMyReplicationSegments())[0]?.widthNormalized || 0, (await thisBoard.fileDb.files.log.getMyReplicationSegments())[0]?.widthNormalized || 0, (await thisBoard.fileDb.chunks.documents.log.getMyReplicationSegments())[0]?.widthNormalized || 0]
		 // rfStatus = [thisBoard.documents.log.role.segments[0].factor, thisBoard.fileDb.files.log.role.segments[0].factor, thisBoard.fileDb.chunks.documents.log.role.segments[0].factor]
	}

	return {boardStatus, rfStatus}
}

export async function bootstrap () {

	await client.bootstrap()
	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

}

export async function closePostsDb (postsDbId = "my_post_db") {
	let thisBoard = openedBoards[postsDbId]
	if (thisBoard) {
		if (thisBoard.fileDb) {
			if (thisBoard.fileDb.chunks) {
				await thisBoard.fileDb.chunks.close()
			}	
			await thisBoard.fileDb.close()
		}
		await thisBoard.close()
	}

}

export async function dropPostsDb (postsDbId = "my_post_db") {
	let thisBoard = openedBoards[postsDbId]
	if (thisBoard) {
		if (thisBoard.fileDb) {
			if (thisBoard.fileDb.chunks) {
				await thisBoard.fileDb.chunks.drop()
			}	
			await thisBoard.fileDb.drop()
		}
		await thisBoard.drop()
	}
}

// //only one for now
// export async function openBoardsDb (boardsDbId = "") {

// 	Boards = await client.open(new BoardDatabase({ id: sha256Sync(Buffer.from(boardsDbId)) }))
// 	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))

// }

//only used for pan-boards files db, the others board-specific ones are openend in openPostsDb
export async function openFilesDb (filesDbId = "", options: any ) {
	Files = new FileDatabase({ id: sha256Sync(Buffer.from(filesDbId)) })
	if (options.replicationFactor) {
		console.log(`Opening files database...`, options)
		await client.open(Files.chunks, {
			args: {
				replicate: {
					factor: options.replicationFactor
				},
				existing: 'reuse',
				compatibility: 6
			}
		})
		await client.open(Files, {
			args: {
				replicate: {
					factor: options.replicationFactor
				},
				existing: 'reuse',
				compatibility: 6
			}
		})
	} else {
		await client.open(Files.chunks, {
        	args: {
        		existing: "reuse",
        		compatibility: 6	
        	}  
        });
		await client.open(Files, {
        	args: {
        		existing: "reuse",
        		compatibility: 6	
        	}  
        });
	}

}

// //only one db for now
// //todo: remove?
// export async function openFileChunksDb (fileChunksDbId = "") {
// 	FileChunks = await client.open(new FileChunkDatabase({ id: sha256Sync(Buffer.from(fileChunksDbId)) }))
// }

//todo: allow arbitrary post dbs to be posted to
//todo: store the signing keys locally and make them selectable for posting post, deleting post, putting file, deleting file, etc.
export async function makeNewPost (postDocument: Post, whichBoard: string, randomKey: true) {
	
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	if (!postDocument) {
    	throw new Error('No post document provided.');
    }

    if (randomKey) {
    	const newKeyPair = await Ed25519Keypair.create()
    	await openedBoards[whichBoard].documents.put(postDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
    } else {
    	await openedBoards[whichBoard].documents.put(postDocument);
    }
	//todo: need to return id?

}

export async function listPeers () {
	let peerMultiAddrs = client.libp2p.getMultiaddrs()
	//todo: remove debug
	// console.log(openedBoards['test'], openedBoards['test'].fileDb, openedBoards['test'].fileDb.chunks)
	//todo: fix this to actually list peers
	console.log(peerMultiAddrs)
	return peerMultiAddrs
}

//todo: allow arbitrary post dbs to be posted to
export async function delPost (whichPost: string, whichBoard: string, randomKey: true) {
	if (!whichPost) {
		throw new Error('No post specified.');
	}
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
	let theseReplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: whichPost })], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts })
	//delete post itself

	if (randomKey) {
    	var newKeyPair = await Ed25519Keypair.create()
		await openedBoards[whichBoard].documents.del(whichPost, { signers: [newKeyPair.sign.bind(newKeyPair)] });
		//then delete replies
		for (let thisReply of theseReplies) {
			newKeyPair = await Ed25519Keypair.create()
			await openedBoards[whichBoard].documents.del(thisReply.hash, { signers: [newKeyPair.sign.bind(newKeyPair)] })
		}
	} else {
		await openedBoards[whichBoard].documents.del(whichPost);
		//then delete replies
		for (let thisReply of theseReplies) {
			await openedBoards[whichBoard].documents.del(thisReply.hash)
		}
	}

	//todo: need to return ids of what was deleted?

}

//todo: allow arbitrary post dbs to be posted to
//todo: revisit remote
//todo: revisit async
export async function getAllPosts (query: any = {}) {
	
	//todo: add query?
	let results: any = []
	for (let thisBoard of Object.keys(openedBoards)) {
		results = results.concat(await openedBoards[thisBoard].documents.index.search(new SearchRequest({ fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts }))
	}

    // Sort the results by the 'date' property in descending order
    results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on top

	return results
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
}

//todo: revisit remote
//todo: revisit async
export async function getPosts (whichBoard: string) {
	
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

	//todo: add query?
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts })

    // Sort the results by the 'date' property in descending order
    results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on top

	return results
}



//todo: add sage
//todo: optimize more
export async function getThreadsWithReplies(whichBoard: string, numThreads: number = 10, numPreviewPostsPerThread: number = 5, whichPage: number = 1) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

    const allPosts = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts })

    const threadPosts: any[] = [];
    const repliesByThread: Record<string, any[]> = {};

    for (const post of allPosts) {
        if (post.replyto) {
            if (!repliesByThread[post.replyto]) repliesByThread[post.replyto] = [];
            repliesByThread[post.replyto].push(post);
        } else {
            threadPosts.push(post);
        }
    }

    const numToSkip = (whichPage - 1) * numThreads

    const sortedThreadsWithReplies = threadPosts.map(thread => {
        const replies = repliesByThread[thread.hash] || [];
        const maxDate = replies.reduce((max: bigint, reply: any) => reply.date > max ? reply.date : max, thread.date);
        thread.lastbumped = maxDate;
        return { thread, replies, maxDate };
    }).sort((a, b) => {
        if (a.maxDate > b.maxDate) return -1;
        if (a.maxDate < b.maxDate) return 1;
        return 0;
    }).slice(numToSkip, numThreads + numToSkip);

    for (const t of sortedThreadsWithReplies) {
        t.thread.board = whichBoard;
        for (const r of t.replies) {
            r.board = whichBoard;
        }
    }

    return {
    	threads: sortedThreadsWithReplies.map((t: any) => t.thread),
    	replies: sortedThreadsWithReplies.map((t: any) => numPreviewPostsPerThread ? t.replies
    		.sort((a: any, b: any) => {
    			if (a.date > b.date) return 1;
    			if (a.date < b.date) return -1;
    			return 0;
    		})
    		.slice(-numPreviewPostsPerThread) : []),
    	omittedreplies: sortedThreadsWithReplies.map((t: any) => Math.max(0, t.replies.length - numPreviewPostsPerThread)),
    	totalpages: Math.max(1,Math.ceil(threadPosts.length / numThreads)) //still have an index page even if its empty
    }
}

//todo: revisit remote
//todo: revisit async
export async function getSpecificPost (whichBoard: string, whichPost: string) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

     if (!whichPost) {
        throw new Error('No post specified.');
    }

	//todo: add query?
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'hash', value: whichPost })]}), { local: true, remote: remoteQueryPosts })
	return results
	// return results.length ? results[0] : []
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
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
	let	results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({query: [new StringMatch({ key: 'replyto', value: whichThread })], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts })
	results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on bottom
	results.forEach((r: any) => {r.board = whichBoard})
	return results
	//return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
}

// export async function initializeEventListeners (whichBoard: string) {
//     if (!whichBoard) {
//         throw new Error('No board specified.');
//     }

//     openedBoards[whichBoard].documents.events.addEventListener("change", (event: any) => {
//     	console.log('DEBUG event triggered:')
//     	console.log(event.detail)
//     })
// }

//todo: how to handle files, file chunks, etc.
//todo: async queries across boards
//todo: more efficient way of concatting results?
export async function queryPosts(whichBoards: string[], queryObj: any) {
    // console.log('DEBUG 077:',whichBoards,queryObj)
    let results: { [key: string]: any } = {}
    for (let thisBoard of whichBoards) {
    	// console.log("DEBUG 078:", thisBoard)
        //todo: optimize
        let thisBoardResults = await openedBoards[thisBoard].documents.index.search(new SearchRequest({ query: queryObj, fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts })
    	if (thisBoardResults.length) {
	    	results[thisBoard] = thisBoardResults	
    	}
    	// console.log("DEBUG 079 (length):",thisBoardResults.length)
    }
    return results
}

//todo: revisit in light of per-board fileDbs
export async function getAllFileDocuments () {
		return await Files.files.index.search(new SearchRequest({ query: [], fetch: searchResultsLimit  }), { local: true, remote: remoteQueryFileRefs })

}

export async function putFile (fileData: Uint8Array, whichBoard: string, randomKey: true) {
		//todo: maybe validate size in advance here or in writeChunks to avoid putting chunks and then exiting 
		let fileDocument = await new File(fileData)
		Validate.file(fileDocument) //check the file isn't too big before starting to write the chunks
		if (whichBoard) {
			await fileDocument.writeChunks(openedBoards[whichBoard].fileDb.chunks, fileData, randomKey)
		    if (randomKey) {
		    	const newKeyPair = await Ed25519Keypair.create()
		    	await openedBoards[whichBoard].fileDb.files.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
		    } else {
		    	await openedBoards[whichBoard].fileDb.files.put(fileDocument);
		    }
			await openedBoards[whichBoard].fileDb.files.put(fileDocument)
		} else {
			await fileDocument.writeChunks(Files.chunks, fileData, randomKey)
		    if (randomKey) {
		    	const newKeyPair = await Ed25519Keypair.create()
		    	await Files.files.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
		    } else {
		    	await Files.files.put(fileDocument);
		    }
			await Files.files.put(fileDocument)
		}

		// await Promise.all([ //todo: can move out of await
		// 	// fileDocument.writeChunks(fileData, fileDocument.hash),
		// 	db.documents.put(fileDocument)
		// 	])
		return fileDocument.hash
}

export async function getFile (fileHash: string, whichBoard: string) {
	if (whichBoard) {
		let foundResults = await openedBoards[whichBoard].fileDb.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs }).then((results: File[]) => results[0])
		if (foundResults) {
			return await openedBoards[whichBoard].fileDb.getFile(foundResults.hash) //todo: revisit for efficiency?
		}
	} else {
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs }).then((results: File[] )=> results[0])
		if (foundResults) {
			return await Files.getFile(foundResults.hash)
		}
	}
	return false
}

//todo: consider making more efficient with above
export async function fileExists (fileHash: string, whichBoard: string) {
	if (whichBoard) {
		let foundResults = await openedBoards[whichBoard].fileDb.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs })
		if (foundResults.length) {
			return true
		}	
	} else {
		let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs })
		if (foundResults.length) {
			return true
		}		
	}
	return false
}

//todo: need to get this also deleting the file chunks whenever anyone deletes, not just us
export async function delFile (fileHash: string, whichBoard: string, randomKey: true) {
	try {
		if (whichBoard) {
			await openedBoards[whichBoard].fileDb.deleteFile(fileHash, randomKey)
		} else {
			await Files.deleteFile(fileHash, randomKey)
		}
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

export function setRemoteQuery(rqPosts: boolean, rqFileRefs: boolean, rqFileChunks: boolean) {
	remoteQueryPosts = rqPosts
	remoteQueryFileRefs = rqPosts
	remoteQueryFileChunks = rqFileChunks 
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
