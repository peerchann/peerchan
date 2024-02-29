'use strict';

////////////////////////////////////////

//todo: change this/remove unneccesary stuff/reduce it down/merge with above

//todo: possibly put these all into their own section/file or something and place things in appropriate places/possibly put this below into the async
//todo: module exports and such?
//todo: async/await or not?
//todo: todo: address return values add it to somewhere or something or not or something, error throwing, etc.
module.exports = {


// clientId: async () => {
// 	const Peerbit = await import('/../dbm/dist/db.js') //todo: rename/move folder/get working
	
// 	let debug1 = await Peerbit.client.clientId
// 	console.log('6001 querier results in find():')
// 	console.log(debug1)
// 	if (results) {
// 		return results
// 	} else {
// 		return '' //todo: revisit this (enum?) and also simplify the statement?
// 	}
// 	// return await pb.find(Peerbit.rpcDeserialize(query), Peerbit.rpcDeserialize(projection), Peerbit.rpcDeserialize(options))
// },


// rpcTest: async (query, projection, options) => {
// 	console.log("RPC function call successful.")
// 	// const Peerbit = await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	// await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check
// 	// const pb = await import(__dirname+'/../dbm/dist/index.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working 
// 	// return await pb.find(query, projection, options)
// },

// find: async (query, projection, options) => {
// 	console.log("find")
// 	const Peerbit = await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check which of these is necessary/remove if applicable?
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')
// 	const results = Peerbit.rpcSerializeResults(await pb.find(Peerbit.rpcDeserializeQuery(query), projection, options))
	
// 	let debug1 = await pb.find(Peerbit.rpcDeserializeQuery(query), projection, options)
// 	console.log('6001 querier results in find():')
// 	console.log(debug1)
// 	if (results) {
// 		return results
// 	} else {
// 		return '' //todo: revisit this (enum?) and also simplify the statement?
// 	}
// 	// return await pb.find(Peerbit.rpcDeserialize(query), Peerbit.rpcDeserialize(projection), Peerbit.rpcDeserialize(options))
// },

// findOne: async (query, projection, options) => {
// 	console.log("findOne")
// 	console.log("findOne options:")
// 	console.log(options)
// 	const Peerbit = await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check which of these is necessary/remove if applicable?
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')

// 	//todo: make this into one step
// 	let results = Peerbit.rpcSerializeResults(await pb.findOne(Peerbit.rpcDeserializeQuery(query), projection, options))
	
// 	let myRes = await pb.findOne(Peerbit.rpcDeserializeQuery(query), projection, options)
// 	console.log('6002 querier results in findOne():')
// 	console.log(myRes)

// 	if (results) {
// 		// results.results = results.results.map(r => new ResultWithSource({source: serialize(r.value), context: r.context, value: r.value }))
// 		return results
// 		// return Peerbit.rpcSerialize(results)
// 	} else {
// 		return '' //todo: revisit this (enum?) and also simplify the statement?
// 	}
// 	// return await pb.findOne(Peerbit.rpcDeserialize(query), Peerbit.rpcDeserialize(projection), Peerbit.rpcDeserialize(options))
// },

// insertOne: async (documentData, options) => {
// 	console.log("insertOne")
// 	// console.log("insertOne() in querier:")
// 	// console.log(postData)
// 	// await import { Posts, BaseDocument, pbInitClient, pbInitDbs, pbStopClient, pbLoadDbs, JschanDatabase } from "./db.js" //todo: revisit (//todo: '' vs "" throughout) //todo: revisit/remove redundancy
	
// 	const Peerbit = await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check which of these is necessary/remove if applicable?
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')

// 	console.log("documentData:")
// 	console.log(documentData)
// 	console.log('options:')
// 	console.log(options)

// 	await pb.insertOne(Peerbit.rpcDeserializeDocument(documentData, options), options)

// 	// const Peerbit = await import(__dirname+'/../dbm/dist/db.js')
// 	// let db = Peerbit.Posts //todo: revisit naming? here and elsewhere?
// 	// await db.documents.put(Peerbit.rpcDeserializePost(postData)) //todo: need to return id?
// 	// // await db.documents.put(postData) //todo: need to return id?
// 	return true
// 	// return await db.documents.put(postData)
// },

// //todo: change to use insertOne() with options
// insertOnePostModeration: async (postModerationData) => {
// 	console.log("insertOnePostModeration")
// 	// console.log("insertOne() in querier:")
// 	// console.log(postData)
// 	// await import { Posts, BaseDocument, pbInitClient, pbInitDbs, pbStopClient, pbLoadDbs, JschanDatabase } from "./db.js" //todo: revisit (//todo: '' vs "" throughout) //todo: revisit/remove redundancy
	
// 	const Peerbit = await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check which of these is necessary/remove if applicable?
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')

// 	console.log("postModerationData:")
// 	console.log(postModerationData)

// 	await pb.insertOnePostModeration(Peerbit.rpcDeserializePostModeration(postModerationData))

// 	// const Peerbit = await import(__dirname+'/../dbm/dist/db.js')
// 	// let db = Peerbit.Posts //todo: revisit naming? here and elsewhere?
// 	// await db.documents.put(Peerbit.rpcDeserializePost(postData)) //todo: need to return id?
// 	// // await db.documents.put(postData) //todo: need to return id?
// 	return true
// 	// return await db.documents.put(postData)
// },


// //todo: implement deleteOne and also delete corresponding postmoderationdocument
// // deleteOne = async (filter, options) => {
// // 	console.log('deleteOne:')
// // 	const pb = await import(__dirname+'/../dbm/dist/index.js')
// // 	return await pb.deleteOne(filter, options)
// // }

// //todo: consider async stuff here/prior/after (and consider/implement this concept throughout)
// //todo: revisit return value?
// //todo: consider making more congruous with other queries and use a query/filter instead
// deleteMany: async (ids, options) => {
// 	console.log("deleteMany:")
// 	console.log("ids:"); console.log(ids)
// 	//todo: revisit/check which of these are actually necessary here and throughout
// 	await import(__dirname+'/../dbm/dist/db.js') //todo: rename/move folder/get working
// 	await import(__dirname+'/../dbm/dist/posts.js') //We don't have to actually use this directly, but we need to load the classes in the background. //todo: rename/move folder/get working //todo: check which of these is necessary/remove if applicable?
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')

// 	return await pb.deleteMany(ids)
// },

// getDbAddresses: async () => {
// 	console.log('getDbAddresses:')
// 	const db = await import(__dirname+'/../dbm/dist/db.js')
// 	return await db.getDbAddresses()
// },

// putFile: async (fileData) => {
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')
// 	console.log("putFile fileData in querier.js:")
// 	// console.log(fileData)
// 	console.log(new Uint8Array(Buffer.from(fileData, 'base64')))
// 	// console.log(fileData.data)
// 	return await pb.putFile(new Uint8Array(Buffer.from(fileData, 'base64'))) //todo: revisit this and possibly make it into a uint8array earlier?
// },

// getFile: async (fileHash) => {
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')
// 	console.log("getFile fileHash in querier.js:")
// 	console.log(fileHash)
// 	let fileData = await pb.getFile(fileHash)
// 	console.log("fileData in in getFile() in querier.js:")
// 	console.log(fileData)
// 	// console.log(Buffer.from(await pb.getFile(fileHash)).toString('base64'))
// 	if (fileData) {
// 		return Buffer.from(await pb.getFile(fileHash)).toString('base64')
// 	} else {
// 		return false
// 	}
// },

// delFile: async (fileHash) => {
// 	const pb = await import(__dirname+'/../dbm/dist/index.js')
// 	console.log("delFile fileHash in querier.js:")
// 	console.log(fileHash)
// 	return await pb.delFile(fileHash)
// },

}