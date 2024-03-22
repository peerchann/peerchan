'use-strict'; //todo: use strict throughout?
// const secrets = require(__dirname+'/../configs/secrets.js') //todo: address these
// 	, { migrateVersion } = require(__dirname+'/../package.json');
import { Peerbit } from "peerbit";
import { SearchRequest, StringMatch, MissingField } from "@peerbit/document";
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { tcp } from "@libp2p/tcp";
// import { mplex } from "@libp2p/mplex";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from '@dao-xyz/libp2p-noise';
import { Ed25519Keypair, sha256Sync } from "@peerbit/crypto";
import { multiaddr } from '@multiformats/multiaddr';
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
const remoteQuery = true;
export async function pbInitClient(listenPort = 8500) {
    // setMaxListeners(0) //todo: revisit
    client = await Peerbit.create({
        //todo: need identity
        //		identity: keypair,
        directory: directory,
        libp2p: {
            connectionManager: {
                maxConnections: Infinity,
                minConnections: 5
            },
            transports: [tcp(), webSockets({ filter: all })],
            streamMuxers: [yamux()],
            // peerId: peerId, //todo: revisit this
            connectionEncryption: [noise()],
            addresses: {
                listen: [
                    '/ip4/127.0.0.1/tcp/' + listenPort,
                    '/ip4/127.0.0.1/tcp/' + (listenPort + 1) + '/ws'
                ]
            },
        },
    });
}
export async function clientId() {
    return client.identity.publicKey.hashcode();
}
//todo: move the config to a different spot
export async function openPostsDb(postsDbId = "my_post_db", options) {
    if (options?.replicationFactor) {
        console.log(`Opening posts database for /${postsDbId}/...`, options);
        openedBoards[postsDbId] = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }), {
            args: {
                role: {
                    type: "replicator",
                    factor: options.replicationFactor
                }
            }
        });
    }
    else {
        openedBoards[postsDbId] = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }));
    }
    //Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
}
export async function bootstrap() {
    await client.bootstrap();
    //Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
}
export async function closePostsDb(postsDbId = "my_post_db") {
    await openedBoards[postsDbId].close();
    //Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
}
// //only one for now
// export async function openBoardsDb (boardsDbId = "") {
// 	Boards = await client.open(new BoardDatabase({ id: sha256Sync(Buffer.from(boardsDbId)) }))
// 	//Posts = await client.open(new PostDatabase({ id: sha256Sync(Buffer.from(postsDbId)) }))
// }
//only one db for now
export async function openFilesDb(filesDbId = "", options) {
    Files = new FileDatabase({ id: sha256Sync(Buffer.from(filesDbId)) });
    if (options.replicationFactor) {
        console.log(`Opening files database...`, options);
        await client.open(Files.chunks, {
            args: {
                role: {
                    type: "replicator",
                    factor: options.replicationFactor
                }
            }
        });
        await client.open(Files, {
            args: {
                role: {
                    type: "replicator",
                    factor: options.replicationFactor
                }
            }
        });
    }
    else {
        await client.open(Files.chunks);
        await client.open(Files);
    }
}
// //only one db for now
// //todo: remove?
// export async function openFileChunksDb (fileChunksDbId = "") {
// 	FileChunks = await client.open(new FileChunkDatabase({ id: sha256Sync(Buffer.from(fileChunksDbId)) }))
// }
//todo: allow arbitrary post dbs to be posted to
//todo: store the signing keys locally and make them selectable for posting post, deleting post, putting file, deleting file, etc.
export async function makeNewPost(postDocument, whichBoard, randomKey) {
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
//todo: allow arbitrary post dbs to be posted to
export async function delPost(whichPost, whichBoard, randomKey) {
    if (!whichPost) {
        throw new Error('No post specified.');
    }
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let theseReplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: whichPost })] }), { local: true, remote: remoteQuery });
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
//todo: allow arbitrary post dbs to be posted to
//todo: revisit remote
//todo: revisit async
export async function getAllPosts(query = {}) {
    //todo: add query?
    let results = [];
    for (let thisBoard of Object.keys(openedBoards)) {
        results = results.concat(await openedBoards[thisBoard].documents.index.search(new SearchRequest, { local: true, remote: remoteQuery }));
    }
    // Sort the results by the 'date' property in descending order
    results.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on top
    return results;
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
}
//todo: revisit remote
//todo: revisit async
export async function getPosts(whichBoard) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    //todo: add query?
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
    // Sort the results by the 'date' property in descending order
    results.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on top
    return results;
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
}
//todo: add sage
//todo: optimize
export async function getThreadsWithReplies(whichBoard, numThreads = 10, numPreviewPostsPerThread = 5, whichPage = 1) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let threads = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new MissingField({ key: 'replyto' })] }), { local: true, remote: remoteQuery });
    const totalpages = Math.max(1, Math.ceil(threads.length / numThreads)); //still have an index page even if its empty
    let lastbumps = new Array(threads.length);
    let replies = new Array(threads.length);
    let omittedreplies = new Array(threads.length);
    for (let i = 0; i < threads.length; i++) {
        let thesereplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: threads[i]['hash'] })] }), { local: true, remote: remoteQuery });
        threads[i].lastbumped = thesereplies.reduce((max, reply) => reply.date > max ? reply.date : max, threads[i].date);
        threads[i].index = i;
        omittedreplies[i] = Math.max(0, thesereplies.length - numPreviewPostsPerThread);
        thesereplies.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on bottom
        replies[i] = thesereplies.slice(-numPreviewPostsPerThread);
    }
    threads.sort((a, b) => (a.lastbumped > b.lastbumped) ? -1 : ((a.lastbumped < b.lastbumped) ? 1 : 0)); //newest on top
    // Return only the numThreads newest results
    var numToSkip = (whichPage - 1) * numThreads;
    threads = threads.slice(numToSkip, numThreads + numToSkip);
    omittedreplies = threads.map((t) => omittedreplies[t.index]);
    replies = threads.map((t) => replies[t.index]);
    return { threads, replies, omittedreplies, totalpages };
}
//todo: order by bumped
//todo: deal with this (unused now)
export async function getThreadsWithReplies_prev(whichBoard, numThreads = 10, numPreviewPostsPerThread = 5) {
    if (!whichBoard) {
        throw new Error('No board specified.');
    }
    let threads = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new MissingField({ key: 'replyto' })] }), { local: true, remote: remoteQuery });
    // Sort the results by the 'date' property in descending order
    threads.sort((a, b) => (a.date > b.date) ? -1 : ((a.date < b.date) ? 1 : 0)); //newest on top
    // Return only the 10 newest results
    threads = threads.slice(0, numThreads);
    let replies = new Array(threads.length);
    let omittedreplies = new Array(threads.length);
    for (let i = 0; i < threads.length; i++) {
        let thesereplies = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: threads[i]['hash'] })] }), { local: true, remote: remoteQuery });
        thesereplies.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on bottom
        omittedreplies[i] = Math.max(0, thesereplies.length - numPreviewPostsPerThread);
        replies[i] = thesereplies.slice(-numPreviewPostsPerThread);
    }
    // Return only the 10 newest results
    return { threads, replies, omittedreplies };
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
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: whichPost })] }), { local: true, remote: remoteQuery });
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
    let results = await openedBoards[whichBoard].documents.index.search(new SearchRequest({ query: [new StringMatch({ key: 'replyto', value: whichThread })] }), { local: true, remote: remoteQuery });
    results.sort((a, b) => (a.date < b.date) ? -1 : ((a.date > b.date) ? 1 : 0)); //newest on bottom
    return results;
    //return await Posts.documents.index.search(new SearchRequest, { local: true, remote: remoteQuery });
}
export async function getAllFileDocuments() {
    return await Files.files.index.search(new SearchRequest({ query: [] }), { local: true, remote: remoteQuery });
}
export async function putFile(fileData, randomKey) {
    //todo: maybe validate size in advance here or in writeChunks to avoid putting chunks and then exiting 
    let fileDocument = await new File(fileData);
    Validate.file(fileDocument); //check the file isn't too big before starting to write the chunks
    await fileDocument.writeChunks(Files.chunks, fileData, randomKey);
    if (randomKey) {
        const newKeyPair = await Ed25519Keypair.create();
        await Files.files.put(fileDocument, { signers: [newKeyPair.sign.bind(newKeyPair)] });
    }
    else {
        await Files.files.put(fileDocument);
    }
    await Files.files.put(fileDocument);
    // await Promise.all([ //todo: can move out of await
    // 	// fileDocument.writeChunks(fileData, fileDocument.hash),
    // 	db.documents.put(fileDocument)
    // 	])
    return fileDocument.hash;
}
export async function getFile(fileHash) {
    // console.log("debug 1 in db.ts getFile():")
    // console.log(fileHash)
    // let db = Files //todo: revisit this here and elsewhere
    // console.log("FileChunks.documents.index.size:")
    // console.log(FileChunks.documents.index.size)
    let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQuery }).then(results => results[0]);
    // console.log("debug 2 in db.ts getFile():")
    // console.log(foundResults)
    if (foundResults) {
        return await Files.getFile(foundResults.hash); //todo: revisit for missing files/etc. //todo: revisit for efficiency?
        //			return await foundResults?.results[0].value.getFile() //todo: revisit for missing files/etc.
    }
    else {
        return false;
    }
}
//todo: consider making more efficient with above
export async function fileExists(fileHash) {
    let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({ key: 'hash', value: fileHash })] }), { local: true, remote: remoteQuery });
    if (foundResults.length) {
        return true;
    }
    else {
        return false;
    }
}
//todo: need to get this also deleting the file chunks whenever anyone deletes, not just us
export async function delFile(fileHash, randomKey) {
    //todo:
    // let foundResults = await Files.files.index.search(new SearchRequest({ query: [new StringMatch({key: 'hash', value: fileHash })] }), { local: true, remote: remoteQuery }).then(results => results[0])
    //first delete all the chunks of the file we may have
    // for (let chunkCid in foundResults.chunkCids) {
    // 	await FileChunks.documents.del(chunkCid)
    // }
    //then delete the file document itself
    try {
        await Files.deleteFile(fileHash, randomKey);
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
