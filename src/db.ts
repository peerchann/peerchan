'use-strict'; //todo: use strict throughout?

// const secrets = require(__dirname+'/../configs/secrets.js') //todo: address these
// 	, { migrateVersion } = require(__dirname+'/../package.json');
import { Peerbit, createLibp2pExtended } from "peerbit"
import { Program } from "@peerbit/program"
import { createLibp2p, Libp2p} from 'libp2p'
import { Documents, DocumentIndex, SearchRequest, StringMatch, IsNull, Sort, SortDirection } from "@peerbit/document"
import { webSockets } from '@libp2p/websockets'
import { all } from '@libp2p/websockets/filters'
import { tcp } from "@libp2p/tcp"
// import { mplex } from "@libp2p/mplex";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from '@dao-xyz/libp2p-noise'
import { Ed25519Keypair, toBase64, fromBase64, sha256Sync } from "@peerbit/crypto"
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
    }
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

//todo: add sage
//todo: optimize more
//todo: consider getting more than one post at a time?
//note that there may be edge cases where a reply was made with a timestamp identical to or earlier than the timestamp of the op, potentially due to desynced clocks, where such replies wont be retreived 
	//todo: revisit this, possibly automically adjust timestamp to be on/after the op timestamp when posting through the ui 
export async function getThreadsWithReplies(whichBoard: string, numThreads: number = 10, numPreviewPostsPerThread: number = 5, whichPage: number = 1) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }

    const totalThreadsToGet = numThreads * whichPage

	const iterator = openedBoards[whichBoard].documents.index.iterate(
	    new SearchRequest({
	        sort: [
	            new Sort({ key: 'date', direction: SortDirection.DESC })
	        ]
	    }),
	    { local: true, remote: remoteQueryPosts }
	);

    function bigIntMax(a: bigint, b: bigint) {
    	if (a > b) {
    		return a
    	} else {
    		return b
    	}
    }

    //we go back through each post, until totalThreadsToGet unique thread ops have been seen.
	const threadPosts: any[] = [];
	const repliesByThread: Record<string, any[]> = {};
	const lastbumpedByThread: Record<string, bigint> = {};
	// const omittedrepliesByThread: Record<string, number> = {};

	var totalThreadCount = 0
    // var lastTimeStamp = 0
    do {
    	const currentPost = await iterator.next(1).then((results: Post[]) => results.length ? results[0] : null);
    	if (!currentPost) { //just in case
    		continue
    	}
    	currentPost.board = whichBoard
    	// if (lastTimeStamp) {
	    // 	if (lastTimeStamp <= currentPost.date) {
	    // 		console.log("ERROR: timestamps aint descending")
    	// 	}
    	// }
    	// lastTimeStamp = currentPost.date
    	// console.log(`${currentPost.date}|${currentPost.replyto}`)
    	//check if it's a reply or a thread op
    	if (true) {
    		if (!repliesByThread[currentPost.replyto || currentPost.hash]) repliesByThread[currentPost.replyto || currentPost.hash] = [] 
    		if (currentPost.replyto) {
    			repliesByThread[currentPost.replyto].unshift(currentPost) //do it this way to avoid having to reverse(), the newest should be last in the array
    			lastbumpedByThread[currentPost.replyto] = bigIntMax(lastbumpedByThread[currentPost.replyto], currentPost.date)
    		} else {
    			threadPosts.push(currentPost)
    			lastbumpedByThread[currentPost.hash] = bigIntMax(lastbumpedByThread[currentPost.hash], currentPost.date)
    			totalThreadCount += 1
    		}
    	} else {
    		if (!currentPost.replyto) {
    			totalThreadCount += 1
    		}
    	}
    } while (!iterator.done())

    await iterator.close() //todo: don't need to await this?

	const numToSkip = (whichPage - 1) * numThreads;

	const sortedThreads = threadPosts.sort((a: any, b: any) => {
		if (lastbumpedByThread[b.hash] > lastbumpedByThread[a.hash]) {
			return 1
		} else if (lastbumpedByThread[a.hash] - lastbumpedByThread[b.hash]) {
			return -1
		} else {
			return 0
		}
	}).slice(numToSkip, numThreads + numToSkip);

	for (let t of sortedThreads) {
		t.lastbumped = lastbumpedByThread[t.hash]
	}

    // console.log("threadPosts:",threadPosts)
    // console.log("sortedThreads:",sortedThreads)
    // console.log("repliesByThread:",repliesByThread)
    // console.log("lastbumpedByThread:",lastbumpedByThread)

	// Process threads and replies
	return {
	    threads: sortedThreads,
	    replies: sortedThreads.map((t: any) => numPreviewPostsPerThread ? repliesByThread[t.hash].slice(-numPreviewPostsPerThread) : []),
	    omittedreplies: sortedThreads.map((t: any) => Math.max(0,repliesByThread[t.hash].length - numPreviewPostsPerThread)),
	    totalpages: Math.max(1, Math.ceil(totalThreadCount / numThreads)) //still have an index page even if its empty
	};

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
//todo: use iterator instead of fetching
export async function queryPosts(whichBoards: string[], queryObj: any, queryLimit: number = 0) {
    // console.log('DEBUG 077:',whichBoards,queryObj)

    let results: { [key: string]: any } = {}
    for (let thisBoard of whichBoards) {
    	// console.log("DEBUG 078:", thisBoard)
        //todo: optimize
		// const iterator = openedBoards[whichBoard].documents.index.iterate(
		//     new SearchRequest({ query: queryObj, fetch: queryLimit || searchResultsLimit }), { local: true, remote: remoteQueryPosts }
		// );
        let thisBoardResults = await openedBoards[thisBoard].documents.index.search(new SearchRequest({ query: queryObj, fetch: queryLimit || searchResultsLimit }), { local: true, remote: remoteQueryPosts })
    	if (thisBoardResults.length) {
	    	results[thisBoard] = thisBoardResults	
    	}
    	// console.log("DEBUG 079 (length):",thisBoardResults.length)
    }
    return results
}

//todo: revisit in light of per-board fileDbs, iterator
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
			// await openedBoards[whichBoard].fileDb.files.put(fileDocument)
		} else {
			await fileDocument.writeChunks(Files.chunks, fileData, randomKey)
		    if (randomKey) {
		    	const newKeyPair = await Ed25519Keypair.create()
		    	await Files.files.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
		    } else {
		    	await Files.files.put(fileDocument);
		    }
			// await Files.files.put(fileDocument)
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
