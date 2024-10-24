'use-strict'; //todo: use strict throughout?
// const secrets = require(__dirname+'/../configs/secrets.js') //todo: address these
// 	, { migrateVersion } = require(__dirname+'/../package.json');
import { Peerbit } from "peerbit";
import { SearchRequest, StringMatch } from "@peerbit/document";
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { tcp } from "@libp2p/tcp";
// import { mplex } from "@libp2p/mplex";
import { yamux } from "@chainsafe/libp2p-yamux";
//temporarily using the slower version for compatibility
// import { noise } from '@dao-xyz/libp2p-noise'
import { noise } from '@chainsafe/libp2p-noise';
import { Ed25519Keypair, sha256Sync } from "@peerbit/crypto";
import { multiaddr } from '@multiformats/multiaddr';
//for simple (in-memory) index
import { create } from '@peerbit/indexer-simple';
import Validate from "./validation.js";
import fs from "fs";
import { PostDatabase } from './posts.js';
import { File, FileDatabase } from './files.js';
// import { PeerchanFile, PeerchanFileChunk, PeerchanFileDatabase, PeerchanFileChunkDatabase } from './files.js'
// import { PeerchanAccount, PeerchanAccountDatabase } from './accounts.js'
export let node;
export let keypair;
export let client;
export let Posts; //todo: consider renaming here and throughout
// export let PostModerations: PeerchanPostModerationDatabase
export let Boards;
export let Files;
// export let FileChunks: FileChunkDatabase
// export let Accounts: PeerchanAccountDatabase
export let currentModerators = [];
export let openedBoards = {};
// export let PostSubmissionService: PeerchanPostSubmissionService
let directory = './storage'; //todo: change path/address this etc.
export let remoteQueryPosts = false;
export let remoteQueryFileRefs = false;
export let remoteQueryFileChunks = false;
export const searchResultsLimit = 0xffffffff; //large number; get all results
export async function pbInitClient(createSettings) {
    client = await Peerbit.create({
        directory: directory,
        indexer: createSettings.inMemoryIndex ? create : undefined,
        libp2p: {
            connectionManager: {
                maxConnections: Infinity,
                // minConnections: 5
            },
            connectionMonitor: {
                enabled: false
            },
            transports: [tcp(), webSockets({ filter: all })],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()], // Make connections encrypted
            addresses: {
                listen: [
                    '/ip4/127.0.0.1/tcp/' + createSettings.peerbitPort,
                    '/ip4/127.0.0.1/tcp/' + (createSettings.peerbitPort + 1) + '/ws'
                ]
            },
        },
    });
}
export async function clientId() {
    return client.identity.publicKey.hashcode();
}
//todo: move the config to a different spot
//todo: consider finding a way to open files, chunks, posts async
export async function openPostsDb(postsDbId = "my_post_db", options) {
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
export async function getBoardStats(whichBoard) {
    const thisBoard = openedBoards[whichBoard];
    let boardStatus = 0; //0 means the board object isn't instatiated
    if (thisBoard && thisBoard.fileDb && thisBoard.fileDb.chunks) { //todo: more granularity to see which dbs are loading still
        if (thisBoard.closed || thisBoard.fileDb.closed || thisBoard.fileDb.chunks.closed) { //todo: ditto
            boardStatus = 1; //1 means the board is still loading
        }
        else {
            boardStatus = 2; //2 means the board is opened successfully
        }
    }
    let rfStatus = [null, null, null];
    //if the board is opened, we get the replication factors, corresponding to posts, files, and fileChunks
    if (boardStatus == 2) {
        rfStatus = [(await thisBoard.documents.log.getMyReplicationSegments())[0]?.widthNormalized || 0, (await thisBoard.fileDb.documents.log.getMyReplicationSegments())[0]?.widthNormalized || 0, (await thisBoard.fileDb.chunks.documents.log.getMyReplicationSegments())[0]?.widthNormalized || 0];
    }
    return { boardStatus, rfStatus };
}
export async function bootstrap() {
    await client.bootstrap();
}
export async function closePostsDb(postsDbId = "my_post_db") {
    let thisBoard = openedBoards[postsDbId];
    if (thisBoard) {
        if (thisBoard.fileDb) {
            if (thisBoard.fileDb.chunks) {
                await thisBoard.fileDb.chunks.close();
            }
            await thisBoard.fileDb.close();
        }
        await thisBoard.close();
    }
}
export async function dropPostsDb(postsDbId = "my_post_db") {
    let thisBoard = openedBoards[postsDbId];
    if (thisBoard) {
        if (thisBoard.fileDb) {
            if (thisBoard.fileDb.chunks) {
                await thisBoard.fileDb.chunks.drop();
            }
            await thisBoard.fileDb.drop();
        }
        await thisBoard.drop();
    }
}
//only used for pan-boards files db, the others board-specific ones are openend in openPostsDb
export async function openFilesDb(filesDbId = "", options) {
    Files = new FileDatabase({ id: sha256Sync(Buffer.from(filesDbId)) });
    if (options.replicationFactor) {
        console.log(`Opening files database...`, options);
        await client.open(Files.chunks, {
            args: {
                replicate: {
                    factor: options.replicationFactor
                },
                existing: 'reuse',
                compatibility: 6
            }
        });
        await client.open(Files, {
            args: {
                replicate: {
                    factor: options.replicationFactor
                },
                existing: 'reuse',
                compatibility: 6
            }
        });
    }
    else {
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
export async function makeNewPost(postDocument, whichBoard, randomKey = true) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (!postDocument) {
        throw new Error('No post document provided.');
    }
    if (randomKey) {
        const newKeyPair = await Ed25519Keypair.create();
        await openedBoards[whichBoard].documents.put(postDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
    }
    else {
        await openedBoards[whichBoard].documents.put(postDocument);
    }
    //todo: need to return id?
}
export async function listPeers() {
    let peerMultiAddrs = client.libp2p.getMultiaddrs();
    //todo: fix this to actually list peers
    console.log(peerMultiAddrs);
    return peerMultiAddrs;
}
export async function delPost(whichPost, whichBoard, randomKey = true) {
    if (!whichPost) {
        throw new Error('No post specified.');
    }
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let theseReplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: whichPost })], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts });
    //delete post itself
    if (randomKey) {
        var newKeyPair = await Ed25519Keypair.create();
        await openedBoards[whichBoard].documents.del(whichPost, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        //then delete replies
        for (let thisReply of theseReplies) {
            newKeyPair = await Ed25519Keypair.create();
            await openedBoards[whichBoard].documents.del(thisReply.hash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
    }
    else {
        await openedBoards[whichBoard].documents.del(whichPost);
        //then delete replies
        for (let thisReply of theseReplies) {
            await openedBoards[whichBoard].documents.del(thisReply.hash);
        }
    }
    //todo: need to return ids of what was deleted?
}
export async function removeSinglePost(thisHash, whichBoard, randomKey = true, hardDelete = false) {
    if (!thisHash) {
        throw new Error('No hash specified.');
    }
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (randomKey) {
        var newKeyPair = await Ed25519Keypair.create();
        if (hardDelete) {
            await openedBoards[whichBoard].documents.del(thisHash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
        else {
            await openedBoards[whichBoard].documents.log.log.remove({ hash: thisHash });
        }
    }
    else {
        if (hardDelete) {
            await openedBoards[whichBoard].documents.del(thisHash);
        }
        {
            await openedBoards[whichBoard].documents.log.log.remove({ hash: thisHash });
        }
    }
    //todo: need to return id of what was deleted or boolean or something?
}
export async function removeSingleFileRef(thisHash, whichBoard, randomKey = true, hardDelete = false) {
    if (!thisHash) {
        throw new Error('No hash specified.');
    }
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (randomKey) {
        var newKeyPair = await Ed25519Keypair.create();
        if (hardDelete) {
            await openedBoards[whichBoard].fileDb.documents.del(thisHash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
        else {
            await openedBoards[whichBoard].fileDb.documents.log.log.remove({ hash: thisHash });
        }
    }
    else {
        if (hardDelete) {
            await openedBoards[whichBoard].fileDb.documents.del(thisHash);
        }
        {
            await openedBoards[whichBoard].fileDb.documents.log.log.remove({ hash: thisHash });
        }
    }
    //todo: need to return id of what was deleted or boolean or something?
}
export async function removeSingleFileChunk(thisHash, whichBoard, randomKey = true, hardDelete = false) {
    if (!thisHash) {
        throw new Error('No hash specified.');
    }
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (randomKey) {
        var newKeyPair = await Ed25519Keypair.create();
        if (hardDelete) {
            await openedBoards[whichBoard].fileDb.chunks.documents.del(thisHash, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
        else {
            await openedBoards[whichBoard].fileDb.chunks.documents.log.log.remove({ hash: thisHash });
        }
    }
    else {
        if (hardDelete) {
            await openedBoards[whichBoard].fileDb.chunks.documents.del(thisHash);
        }
        {
            await openedBoards[whichBoard].fileDb.chunks.documents.log.log.remove({ hash: thisHash });
        }
    }
    //todo: need to return id of what was deleted or boolean or something?
}
//todo: allow selectivity in post dbs to be queried from
//todo: revisit remote
//todo: revisit async
export async function getAllPosts(query = {}) {
    //todo: add query?
    let results = [];
    for (let thisBoard of Object.keys(openedBoards)) {
        results = results.concat(await openedBoards[thisBoard].documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts }));
    }
    // Sort the results by the 'date' property in descending order
    results.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on top
    return results;
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
}
//todo: revisit remote
export async function getPosts(whichBoard) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
    // // Sort the results by the 'date' property in descending order
    // results.sort((a: any, b: any) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)) //newest on top
    return results;
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
}
//todo: revisit remote
export async function getFileRefs(whichBoard) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let results = await openedBoards[whichBoard].fileDb.documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
    return results;
}
//todo: revisit remote
export async function getFileChunks(whichBoard) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let results = await openedBoards[whichBoard].fileDb.chunks.documents.index.search(new SearchRequest, { local: true, remote: remoteQueryPosts });
    return results;
}
//todo: add sage
//todo: optimize more
export async function getThreadsWithReplies(whichBoard, numThreads = 10, numPreviewPostsPerThread = 5, whichPage = 1) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    const allPosts = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts });
    const threadPosts = [];
    const repliesByThread = {};
    for (const post of allPosts) {
        if (post.replyto) {
            if (!repliesByThread[post.replyto])
                repliesByThread[post.replyto] = [];
            repliesByThread[post.replyto].push(post);
        }
        else {
            threadPosts.push(post);
        }
    }
    const numToSkip = (whichPage - 1) * numThreads;
    const sortedThreadsWithReplies = threadPosts.map(thread => {
        const replies = repliesByThread[thread.hash] || [];
        const maxDate = replies.reduce((max, reply) => reply.date > max ? reply.date : max, thread.date);
        thread.lastbumped = maxDate;
        return { thread, replies, maxDate };
    }).sort((a, b) => {
        if (a.maxDate > b.maxDate)
            return -1;
        if (a.maxDate < b.maxDate)
            return 1;
        return 0;
    }).slice(numToSkip, numThreads + numToSkip);
    for (const t of sortedThreadsWithReplies) {
        t.thread.board = whichBoard;
        for (const r of t.replies) {
            r.board = whichBoard;
        }
    }
    return {
        threads: sortedThreadsWithReplies.map((t) => t.thread),
        replies: sortedThreadsWithReplies.map((t) => numPreviewPostsPerThread ? t.replies
            .sort((a, b) => {
            if (a.date > b.date)
                return 1;
            if (a.date < b.date)
                return -1;
            return 0;
        })
            .slice(-numPreviewPostsPerThread) : []),
        omittedreplies: sortedThreadsWithReplies.map((t) => Math.max(0, t.replies.length - numPreviewPostsPerThread)),
        totalpages: Math.max(1, Math.ceil(threadPosts.length / numThreads)) //still have an index page even if its empty
    };
}
//todo: revisit remote
//todo: revisit async
export async function getSpecificPost(whichBoard, whichPost) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (!whichPost) {
        throw new Error('No post specified.');
    }
    //todo: add query?
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: whichPost })] }), { local: true, remote: remoteQueryPosts });
    return results;
    // return results.length ? results[0] : []
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
}
//todo: revisit remote
//todo: revisit async
export async function getRepliesToSpecificPost(whichBoard, whichThread) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    if (!whichThread) {
        throw new Error('No thread specified.');
    }
    //todo: add query?
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: whichThread })], fetch: searchResultsLimit }), { local: true, remote: remoteQueryPosts });
    results.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on bottom
    results.forEach((r) => { r.board = whichBoard; });
    return results;
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
export async function queryPosts(whichBoards, queryObj, queryLimit = 0) {
    // console.log('DEBUG 077:',whichBoards,queryObj)
    let results = {};
    for (let thisBoard of whichBoards) {
        // console.log("DEBUG 078:", thisBoard)
        //todo: optimize
        // const iterator = openedBoards[whichBoard].documents.index.iterate(
        //     new SearchRequest({ query: queryObj, fetch: queryLimit || searchResultsLimit }), { local: true, remote: remoteQueryPosts }
        // );
        let thisBoardResults = await openedBoards[thisBoard].documents.index.search(new SearchRequest({ query: queryObj, fetch: queryLimit || searchResultsLimit }), { local: true, remote: remoteQueryPosts });
        if (thisBoardResults.length) {
            results[thisBoard] = thisBoardResults;
        }
        // console.log("DEBUG 079 (length):",thisBoardResults.length)
    }
    return results;
}
//todo: revisit in light of per-board fileDbs, iterator
export async function getAllFileDocuments() {
    return await Files.documents.index.search(new SearchRequest({ query: [], fetch: searchResultsLimit }), { local: true, remote: remoteQueryFileRefs });
}
export async function putFile(fileData, whichBoard, randomKey = true) {
    //todo: maybe validate size in advance here or in writeChunks to avoid putting chunks and then exiting 
    let fileDocument = await new File(fileData);
    Validate.file(fileDocument); //check the file isn't too big before starting to write the chunks
    if (whichBoard) {
        await fileDocument.writeChunks(openedBoards[whichBoard].fileDb.chunks, fileData, randomKey);
        if (randomKey) {
            const newKeyPair = await Ed25519Keypair.create();
            await openedBoards[whichBoard].fileDb.documents.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
        else {
            await openedBoards[whichBoard].fileDb.documents.put(fileDocument);
        }
        // await openedBoards[whichBoard].fileDb.documents.put(fileDocument)
    }
    else {
        await fileDocument.writeChunks(Files.chunks, fileData, randomKey);
        if (randomKey) {
            const newKeyPair = await Ed25519Keypair.create();
            await Files.documents.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
        }
        else {
            await Files.documents.put(fileDocument);
        }
        // await Files.documents.put(fileDocument)
    }
    // await Promise.all([ //todo: can move out of await
    // 	// fileDocument.writeChunks(fileData, fileDocument.hash),
    // 	db.documents.put(fileDocument)
    // 	])
    return fileDocument.hash;
}
export async function getFile(fileHash, whichBoard) {
    if (whichBoard) {
        let foundResults = await openedBoards[whichBoard].fileDb.documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs }).then((results) => results[0]);
        if (foundResults) {
            return await openedBoards[whichBoard].fileDb.getFile(foundResults.hash); //todo: revisit for efficiency?
        }
    }
    else {
        let foundResults = await Files.documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs }).then((results) => results[0]);
        if (foundResults) {
            return await Files.getFile(foundResults.hash);
        }
    }
    return false;
}
//todo: consider making more efficient with above
export async function fileExists(fileHash, whichBoard) {
    if (whichBoard) {
        let foundResults = await openedBoards[whichBoard].fileDb.documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs });
        if (foundResults.length) {
            return true;
        }
    }
    else {
        let foundResults = await Files.documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQueryFileRefs });
        if (foundResults.length) {
            return true;
        }
    }
    return false;
}
//todo: need to get this also deleting the file chunks whenever anyone deletes, not just us
export async function delFile(fileHash, whichBoard, randomKey = true) {
    try {
        if (whichBoard) {
            await openedBoards[whichBoard].fileDb.deleteFile(fileHash, randomKey);
        }
        else {
            await Files.deleteFile(fileHash, randomKey);
        }
    }
    catch (err) {
        console.log(err);
        return err; //todo: revisit return value
    }
}
//todo: revisit? make into keys?
//todo: have all post dbs reference a given thing?
export function setModerators(moderators = []) {
    currentModerators = moderators || []; //sanity
}
export function setRemoteQuery(rqPosts, rqFileRefs, rqFileChunks) {
    remoteQueryPosts = rqPosts;
    remoteQueryFileRefs = rqPosts;
    remoteQueryFileChunks = rqFileChunks;
}
export async function pbStopClient() {
    await client.stop();
    console.log("Peerbit client stopped.");
}
export function resetDb() {
    fs.existsSync(directory) && fs.rmSync(directory, { recursive: true });
}
export async function connectToPeer(peerAddress) {
    try {
        await client.libp2p.dial(multiaddr(peerAddress));
        console.log('Connected to peer at ' + peerAddress + '.');
    }
    catch (error) {
        console.log('Failed to connect to peer at ' + peerAddress + '.');
        console.log(error);
    }
}
