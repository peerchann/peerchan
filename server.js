import express from 'express';
import { compileFile } from 'pug';
import fs from 'fs';
import open from 'open';

import multer from 'multer';
import bodyParser from 'body-parser';

import Stream from 'stream';

// import Validate from './validation/validation.js';


const app = express();



//todo: change from debug values

const storageDir = 'storage' //todo: make this storage later
const configDir = 'config'

if (!fs.existsSync(configDir)) {
	fs.mkdirSync(configDir, { recursive: true });
}

function loadConfig() {
    const configFile = configDir+'/config.json';
    
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        } else {
            const defaultConfig = {
                browserPort: 8000,
                peerbitPort: 8500,
                browserHost: "127.0.0.1",
				replicationFactor: 0,
                threadsPerPage: 5,
                previewReplies: 3,
                defaultName: "Anonymous",
                openHomeOnStartup: true
            };
			fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, '\t'), 'utf8');
            return defaultConfig;
        }
    } catch (err) {
        console.error('Error loading or creating config file:', err);
        return null;
    }
}

const cfg = loadConfig();

function loadWatchedBoards() {
    const configFile = configDir+'/watchedBoards.json';
    
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8')).watchedBoards;
        } else {
            const defaultConfig = {
                watchedBoards: [
                	"landing",
                	"help"
                ],
            };
			fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, '\t'), 'utf8');
            return defaultConfig.watchedBoards;
        }
    } catch (err) {
        console.error('Error loading or creating config file:', err);
        return null;
    }
}

function saveWatchedBoards() {
    const configFile = configDir+'/watchedBoards.json';
    
    try {
        const config = {
            watchedBoards: watchedBoards
        };
        fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'), 'utf8');
        console.log('Watched boards saved successfully.');
    } catch (err) {
        console.error('Error saving watched boards:', err);
    }
}

const watchedBoards = loadWatchedBoards()


// Middleware to parse JSON bodies
app.use(express.json());


// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Multer storage configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


//Compile pug templates to memory to speed up rendering.
const rt={};//object to hold render templates
rt['home'] = compileFile('./views/boardmanage.pug');
rt['board'] = compileFile('./views/board.pug');


//const query = require(__dirname+'/db/query.js') //todo: rename?/reorg?

// // Function to generate a random substring of length 16
// function generateRandomSubstring() {
//   const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//   let randomString = '';
//   for (let i = 0; i < 16; i++) {
//     randomString += characters.charAt(Math.floor(Math.random() * characters.length));
//   }
//   return randomString;
// }

// Call db.makeNewPost() with random strings

function makeRenderSafe(inputObj = {}) {
    for (let thisKey of Object.keys(inputObj)) {
        if (typeof inputObj[thisKey] === 'bigint') { // Check if the value is a BigInt
            inputObj[thisKey] = inputObj[thisKey].toString(); // Convert BigInt to string
        } else if (typeof inputObj[thisKey] === 'object' && inputObj[thisKey] !== null) { // Check if the value is an object (and not null)
            // If the value is an object, recursively call makeRenderSafe on it
            inputObj[thisKey] = makeRenderSafe(inputObj[thisKey]);
        }
    }
    return inputObj;
}

//todo: make more efficient/combine with above?
async function addFileStatuses (inputObj = {}) {
	const db = await import('./dbm/dist/db.js')
    for (let thisKey of Object.keys(inputObj)) {
        if (thisKey == 'files') {
        	for (let thisFile of inputObj[thisKey]) {
				thisFile.fileStatus = await db.fileExists(thisFile.hash)
        	}
        } else if (typeof inputObj[thisKey] === 'object') {
        	inputObj[thisKey] = await addFileStatuses(inputObj[thisKey])
        } 
    }
    return inputObj;
}

//todo: make this configurable
//todo: get this working
//todo: quotes, backlinks etc.
function applyMarkup(inputObj = {}) {
	console.log(inputObj)
	if (inputObj.message) {
		inputObj.message = inputObj.message.replace(/^>/gm, '<span class="green">$&</span>'); // Matches lines starting with ">"
        inputObj.message = inputObj.message.replace(/==([^=]+)==/g, '<span class="red">$1</span>'); //
	}
	console.log(inputObj)
	return inputObj
}

app.use(express.static('./themes'));

let bufferSize = 128 * 1024 //todo: find an ideal value for this, for now we do 128 kb at a time //todo: revisit this?

function formatFileSize(size) {
	if (size < 1024) {
	  return size + ' bytes';
	} else if (size < 1024 * 1024) {
	  return (size / 1024).toFixed(2) + ' kB';
	} else if (size < 1024 * 1024 * 1024) {
	  return (size / (1024 * 1024)).toFixed(2) + ' MB';
	} else if (size < 1024 * 1024 * 1024 * 1024) {
	  return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
	} else {
	  return (size / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' TB';
	}
}

//todo: make this into a post req.
app.get('/:board/deletepost=:posthash', async (req, res, next) => {
  try {
  	console.log(`Deleting post: ${req.params.posthash}.`);
	const db = await import('./dbm/dist/db.js')
	await db.delPost(req.params.posthash, req.params.board)

  } catch (err) {
  	console.log(`Failed to delete post: ${req.params.posthash}.`)
  	lastError = err //todo: get this working
  }

	res.redirect(req.headers.referer); //todo: check propriety
});

app.get('/mymultiaddr', async (req, res, next) => {
  try {
	const db = await import('./dbm/dist/db.js')
	res.send(db.client.libp2p.getMultiaddrs()[0])
  } catch (err) {
  	console.log(`Failed to delete file: ${params.params.fileHash}.`)
  	lastError = err //todo: get this working
  	res.redirect('/home')
  }

	// res.redirect(req.headers.referer); //todo: check propriety
});

//todo: make this into a post req.
app.get('/deletefile=:filehash', async (req, res, next) => {
  try {
  	const fileHash = req.params.filehash
  	console.log(`Deleting file: ${fileHash}.`);
	const db = await import('./dbm/dist/db.js')
	await db.delFile(fileHash)

  } catch (err) {
  	console.log(`Failed to delete file: ${params.params.fileHash}.`)
  	lastError = err //todo: get this working
  }

	res.redirect(req.headers.referer); //todo: check propriety
});

app.post('/connectToPeer', upload.any(), async (req, res, next) => {
  // Here you can write the logic to delete the file corresponding to the imageUrl
  try {
  	const peerMultiAddr = req.body.peerMultiAddr
  	// console.log(req)
  	console.log(req.body)
  	console.log(`Connecting to peer: ${peerMultiAddr}.`);
	const db = await import('./dbm/dist/db.js')
	await db.connectToPeer(peerMultiAddr)

  } catch (err) {
  	console.log(`Failed to connect to peer.`)
  	lastError = err //todo: get this working
  }

	res.redirect(req.headers.referer); //todo: check propriety
});

//todo: consolidate duplicated functionality
app.post('/addWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    // Extract the board ID from the request body
    const boardId = req.body.boardId;

    // Add the board ID to the watchedBoards array
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
		const db = await import('./dbm/dist/db.js')
	    await db.openPostsDb(boardId, {replicationFactor: cfg.replicationFactor})
	    // Invoke the saveWatchedBoards function to save the updated watchedBoards array
	    console.log("watchedBoards:")
	    console.log(watchedBoards)
	    saveWatchedBoards(watchedBoards);
    }
    // Redirect back to the previous page
  } catch (err) {
	    console.error('Error adding watched board:', err);
	    // Handle the error appropriately
  }
    res.redirect(req.headers.referer);
});

app.post('/removeWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    // Extract the board ID from the request body
    const boardId = req.body.boardId;

    // Check if the board ID is in the watchedBoards array
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
      // Remove the board ID from the watchedBoards array
		const db = await import('./dbm/dist/db.js')
		await db.closePostsDb(boardId)
		watchedBoards.splice(index, 1);

		saveWatchedBoards(watchedBoards);
	}

    // Redirect back to the previous page
  } catch (err) {
    console.error('Error removing watched board:', err);
    res.redirect(req.headers.referer);
  }
});

app.get('/function/addBoard/:boardId',  async (req, res, next) => {
	console.log('ping')
  try {
    const boardId = req.params.boardId;
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
		const db = await import('./dbm/dist/db.js')
	    await db.openPostsDb(boardId)
	    saveWatchedBoards(watchedBoards);
    }
  } catch (err) {
	    console.error('Error adding watched board:', err);
  }
  res.send('')
});

app.get('/function/removeBoard/:boardId', async (req, res, next) => {
  try {
    const boardId = req.params.boardId;
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
		const db = await import('./dbm/dist/db.js')
		await db.closePostsDb(boardId)
		watchedBoards.splice(index, 1);
		console.log("watchedBoards:")
		console.log(watchedBoards)
		saveWatchedBoards(watchedBoards);
	}

  } catch (err) {
    console.error('Error removing watched board:', err);
  }
  res.send('')
});

const moderators = loadModerators()

async function addModerator(moderatorId) {
	if (!moderatorId || moderatorId.length != 44) {
		throw new Error('Moderator ID should be 44-characters long.')
	}
    // Add the board ID to the watchedBoards array
    if (moderators.indexOf(moderatorId) === -1) {
    	moderators.push(moderatorId);
    	await updateModerators()
    }
} 

async function removeModerator(moderatorId) {
    const index = moderators.indexOf(moderatorId);
    if (index !== -1) {
		moderators.splice(index, 1);
		await updateModerators()
	}
} 

async function updateModerators() {
		saveModerators()
		const db = await import('./dbm/dist/db.js')
	    db.setModerators(moderators) 
} 

function loadModerators() {
    const configFile = configDir+'/moderators.json';
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8')).moderators;
        } else {
            const defaultConfig = {
                moderators: [
                ],
            };
			fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, '\t'), 'utf8');
            return defaultConfig.moderators;
        }
    } catch (err) {
        console.error('Error loading or creating moderators file:', err);
        return null;
    }
}

function saveModerators() {
    const configFile = configDir+'/moderators.json';
    console.log("saveModerators called with moderators:")
    console.log(moderators)
    try {
        const config = {
            moderators: moderators
        };
        fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'), 'utf8');
        console.log('Moderators saved successfully.');
    } catch (err) {
        console.error('Error saving moderators:', err);
    }
}

app.post('/addModerator', upload.any(), async (req, res, next) => {
  try {
    await addModerator(req.body.moderatorId)
  } catch (err) {
	    console.error('Error adding moderator:', err);
		lastError = err
  }
  res.redirect(req.headers.referer);
});

app.post('/removeModerator', upload.any(), async (req, res, next) => {
	console.log('removeModerator called')
	console.log(req.body.moderatorId)
  try {
    await removeModerator(req.body.moderatorId)
  } catch (err) {
		console.error('Error adding moderator:', err);
		lastError = err
  }
  res.redirect(req.headers.referer);
});

app.get('/function/addModerator/:moderatorId'),  async (req, res, next) => {
  try {
    await addModerator(req.params.moderatorId)
  } catch (err) {
	    console.error('Error adding moderator:', err);
		lastError = err
  }
  res.redirect(req.headers.referer);
}

app.get('/function/removeModerator/:moderatorId', async (req, res, next) => {
  try {
    await removeModerator(req.params.moderatorId)
  } catch (err) {
		console.error('Error adding moderator:', err);
		lastError = err
  }
    res.redirect(req.headers.referer);
});
























//todo: test without filename
app.get('/download/file/:filename.:fileext', async (req, res, next) => {
	// console.log('debug 1: GET filename with extension')
	// console.log(req.params.filename)
	// console.log(req.params.fileext)
	try {
		const db = await import('./dbm/dist/db.js')
		let fileData = await db.getFile(req.params.filename)
		// console.log("returned fileData:")
		// console.log(fileData)
		if (fileData) {
			// return fileData
			let fileStream = new Stream.Readable()
			let i = 0
			fileStream._read = function (size) {
				let pushed = true
				while (pushed && i < fileData.length) {
					pushed = this.push(fileData.subarray(i, i + bufferSize))
					i += bufferSize
					// pushed = this.push(fileData.subarray(i, ++i))
				}
				if (i >= fileData.length) {
					this.push(null)
				}
			}
			fileStream.pipe(res)		
		} else {
			res.send(null)
		}

	} catch (error) {
		console.log('Failed to get file '+req.params.filename)
		console.log(error)
	}
	// return res.json(req.params)
});



app.get('/:board/:pagenumber.html', async (req, res, next) => {

	try {
		//todo: change this
		var whichPage = parseInt(req.params.pagenumber)
		if (req.params.pagenumber == 'index') {
			whichPage = 1
		}
		const db = await import('./dbm/dist/db.js')

		let indexPosts = await addFileStatuses(makeRenderSafe(await db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies, whichPage)))
		// let allPosts = makeRenderSafe(db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies))

		boardPagesCache[req.params.board] = indexPosts.totalpages

		// for (let thisPostIndex in indexPosts) {
		// 	indexPosts[thisPostIndex] = applyMarkup(indexPosts[thisPostIndex])
		// 	for (let thisReplyIndex in indexPosts.replies) {
		// 		indexPosts.replies[thisReplyIndex] = applyMarkup(indexPosts.replies[thisReplyIndex])
		// 	}
		// }

    	console.time('buildIndex');
		for(let threadPost in indexPosts.threads) {
			indexPosts.threads[threadPost].replies = indexPosts.replies[threadPost]
			indexPosts.threads[threadPost].omittedreplies = indexPosts.omittedreplies[threadPost]
		}
    	console.timeEnd('buildIndex');

//		console.log(indexPosts)
//		console.log(indexPosts.replies)
		const options = {
			clientId: await db.clientId(),
			board: req.params.board,
			watchedBoards: watchedBoards,
			currentBoard: req.params.board,
			posts: indexPosts.threads,
			alert: lastError,
			formatFileSize: formatFileSize,
			defaultName: cfg.defaultName,
			moderators: moderators,
			numPages: boardPagesCache[req.params.board],
			myMultiAddr: db.client.libp2p.getMultiaddrs()[0],
			indexMode: true,
			// replies: indexPosts.replies,
			// omittedcounts: indexPosts.omittedreplies //todo: implement
			} //todo: make dynamic
		console.log(indexPosts.totalpages + " pages total")
		const html = await rt['board'](options)
		resetError()
		res.send(html)
		//res.json(allPosts)

//		res.send('Welcome.<br>Client id: '+(await pb.clientId()))

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		lastError = err
	}

})


const boardPagesCache = {}; //todo: reconsider

//todo: remove redundancy with currentBoard, watchedBoards, etc throughout?

app.get('/:board/thread/:thread.html', async (req, res, next) => {

	try {
		const db = await import('./dbm/dist/db.js')
		
		// let allPosts = makeRenderSafe(await db.getPosts(req.params.board))
		let threadPost = await await db.getSpecificPost(req.params.board, req.params.thread)
		// threadPost.replies = []
		if(threadPost.length) {
			threadPost[0].replies = await db.getRepliesToSpecificPost(req.params.board, req.params.thread)
			threadPost[0] = await addFileStatuses(makeRenderSafe(threadPost[0]))
		}


		// console.log(threadPost)
		// for (let thisPostIndex in threadPost) {
		// 	threadPost[thisPostIndex] = applyMarkup(threadPost[thisPostIndex])
		// 	for (let thisReplyIndex in threadPost.replies) {
		// 		threadPost.replies[thisReplyIndex] = applyMarkup(threadPost.replies[thisReplyIndex])
		// 	}
		// }

		// console.log('Replies:')
		// console.log(replyPosts)
		const options = {
			clientId: await db.clientId(),
			threadId: req.params.thread,
			board: req.params.board,
			watchedBoards: watchedBoards,
			alert: lastError,
			numPages: boardPagesCache[req.params.board],
			defaultName: cfg.defaultName,
			moderators: moderators,
			formatFileSize: formatFileSize,
			alert: lastError,
			currentBoard: req.params.board,
			myMultiAddr: db.client.libp2p.getMultiaddrs()[0],
			posts: threadPost,

			} //todo: make dynamic
		const html = await rt['board'](options)
		resetError()
		res.send(html)
		//res.json(allPosts)

//		res.send('Welcome.<br>Client id: '+(await pb.clientId()))

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		lastError = err
	}

})

function resetError() {
	lastError = undefined
}

var lastError

//todo: different dependng on new thread/reply
//todo: files
//todo: validation
//todo: hook up
//todo: projected post etc
app.post('/submit', upload.any(), async (req, res, next) => {
	try {
		// console.log('req.files:') //todo: remove debug
		// console.log(req.files)
		// console.log(req.body.message)
		// let lastbumps = new Array(threads.length)
		const db = await import('./dbm/dist/db.js');
		const dbPosts = await import('./dbm/dist/posts.js')
		let postFiles = []
		for (let thisFile of req.files) {
	  		postFiles.push(
	  			new dbPosts.PostFile ( //todo: consider what needs to be included in this
		  			await db.putFile(thisFile.buffer), //puts the file and returns the hash
		  			thisFile.originalname, //original filename
		  			thisFile.originalname.split('.').pop(),
		  			thisFile.size,
	  			)
	  		)
		  }
		  //todo: consolidate
		  const newPost = new dbPosts.Post(
				BigInt(Date.now()),
				req.body.replyto,
				req.body.name,
				req.body.replyto ? undefined : req.body.subject,
				req.body.email,
				req.body.message,
				postFiles
		  	)
		  const Validate = await import('./dbm/dist/validation.js')
		  // console.log(Validate)
		  Validate.default.post(newPost)
		  //todo: make pass post document
		  await db.makeNewPost(newPost, req.body.whichBoard)
		  // await db.makeNewPost({
		  //   date:  BigInt(Date.now()),
		  //   replyto: req.body.replyto,
		  //   // replyto: undefined,
		  //   // replyto: `replyto ${generateRandomSubstring()}`,
		  //   name: req.body.name,
		  //   subject: req.body.replyto ? undefined : req.body.subject,
		  //   message: req.body.message,
		  //   email: req.body.email,
		  //   files: postFiles
		  // }, req.body.whichBoard); //todo: make dynamic, change var name?
		  console.log('Post submitted successfully')
		  // res.redirect(req.headers.referer)
	} catch (err) {
	  console.log('Failed to submit new post')
	  console.log(err)
	  lastError = err
	}
	res.redirect(req.headers.referer);
    // res.send({ reload: true });
});

app.get('', async (req, res, next) => { //todo: merge with above functionality or filegateway
	res.redirect('/home')
});

//todo: fix redundancy with boards
app.get('/home', async (req, res, next) => { //todo: merge with above functionality or filegateway
	try {
		const db = await import('./dbm/dist/db.js')
		const options = {
			clientId: await db.clientId(),
			boards: watchedBoards,
			alert: lastError,
			watchedBoards: watchedBoards,
			moderators: moderators,
			myMultiAddr: db.client.libp2p.getMultiaddrs()[0],
			posts: []} //todo: make dynamic
		const html = await rt['home'](options)
		resetError()
		res.send(html)

//		res.send('Welcome.<br>Client id: '+(await pb.clientId()))

	} catch (error) {
		console.log('Failed to open homepage')
		console.log(error)
	} finally {
	}
});


// Start the Server
app.listen(cfg.browserPort, cfg.browserHost, () => {
	console.log(`Starting Server at ${cfg.browserPort}:${cfg.browserHost}`);
});

(async () => {

	const db = await import('./dbm/dist/db.js');
	// console.log('db:')
	// console.log(db)

	try {

		await db.pbInitClient(cfg.peerbitPort)
		console.log("Successfully initialized Peerbit node.")
		console.log(await db.clientId())
		await db.bootstrap()

		// console.log(db.client)
		// console.log(db.client.libp2p)

		// db.client.libp2p.addEventListener('peer:connect', (peerMultiHash) => {
		//     console.log('ping 0 debug');
		//     console.log(peerMultiHash)
		//     console.log(peerMultiHash.detail)
		//     console.log(Object.keys(peerMultiHash.detail));
		//     for (let thisKey of Object.keys(peerMultiHash.detail)) {
		//     	console.log(thisKey)
		//     	console.log(peerMultiHash.detail[thisKey])
		//     }

		//     // Add your logic here to handle the peer connection
		// });


	    // db.client.libp2p.addEventListener('peer:discovery', async peerMultiHash => {
		    // // Recursive function to log properties
		    // const logProperties = (obj, depth = 0) => {
		    //     const indent = ' '.repeat(depth * 4);
		    //     for (const [key, value] of Object.entries(obj)) {
		    //         console.log(`${indent}${key}: ${value}`);
		    //         if (typeof value === 'object' && value !== null) {
		    //             logProperties(value, depth + 1);
		    //         }
		    //     }
		    // };
		    // console.log('hi test peer:discovery')
		    // console.log(peerMultiHash.detail.id.toString());
		    // console.log('beep')
		    // console.log(await db.client.libp2p.peerStore.get(peerMultiHash.detail.id))
	 	// })

	} catch (err) {

		console.log('Failed to initialize Peerbit node:')
		console.log(err)

	}

	//try to connect to known peers
	//todo: test default behavior

	// try {
	// 	console.log("Attempting to connect to known peers...")
	// 	//create an object to hold all databases so they can be referenced by name string:

	// 	//todo: shutdown all connections when the application closes here and throughout
	// 	module.exports.store = new sqlite3.Database('./storage/peers.db')

	// 	await module.exports.store.serialize(function() {
	// 		module.exports.store.run('CREATE TABLE IF NOT EXISTS peers(multiaddr TEXT PRIMARY KEY)');
	// 		module.exports.store.all('SELECT multiaddr FROM peers', async (err,rows) => { //todo: is err neeeded?
	// 			rows.forEach(async (row) => {
	// 				if(newPeerMultiAddrList && !newPeerMultiAddrList.includes(row.multiaddr)) {
	// 					db.connectToPeer(row.multiaddr)
	// 				}
	// 			})
			
	// 		}) 



	// 	})
	// } catch (err) {
	// 	console.log(err)
	// }


	try {
		await db.openFilesDb("", {factor: cfg.replicationFactor})
		console.log("Successfully opened Files Database.")
		// await db.openFileChunksDb()
		// console.log("Successfully opened FileChunks Database.")	
		// await db.openBoardsDb()
		// console.log("Successfully opened Boards Database.")
		for (let thisBoard of watchedBoards) {
			await db.openPostsDb(thisBoard, {replicationFactor: cfg.replicationFactor})
			console.log("Successfully open Posts Database for \""+thisBoard+"\".")

		}
		db.setModerators(moderators)

	} catch (err) {
		console.log("Failed to open Databases.")
		console.log(err)
	}

//open the boardlist:
if (cfg.openHomeOnStartup) {
	open('http://'+cfg.browserHost+':'+cfg.browserPort+'/home');
}


})();