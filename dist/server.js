import express from 'express';
import { compileFile } from 'pug';
import fs from 'fs';
import open from 'open';

import multer from 'multer';
import bodyParser from 'body-parser';

import Stream from 'stream';

import { DeliveryError } from '@peerbit/stream-interface';
import { randomBytes } from '@peerbit/crypto';

const app = express();

const storageDir = 'storage'
const configDir = 'config'

if (!fs.existsSync(configDir)) {
	fs.mkdirSync(configDir, { recursive: true });
}

const localhostIps = []
//todo: another form of authentication (for bypassing gateway mode permissions)
// const localhostIps = ['127.0.0.1', '::1']

//todo: automatically fix configs with missing fields
function loadConfig() {
    const configFile = configDir+'/config.json';
    
    try {
        if (fs.existsSync(configFile)) {
            const configObject = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            //todo: make this into a migration or something
            if (!configObject.postHashLength) {
                configObject.postHashLength = 16
                fs.writeFileSync(configFile, JSON.stringify(configObject, null, '\t'), 'utf8');
            }
            return configObject
        } else {
            const defaultConfig = {
                "browserPort": 8000,
                "peerbitPort": 8500,
                "browserHost": "127.0.0.1",
                "replicationFactor": 1,
                "threadsPerPage": 5,
                "previewReplies": 3,
                "defaultName": "Anonymous",
                "openHomeOnStartup": true,
                "defaultTheme": "chalk",
                "embedImageFileExtensions": [
                    "jpg",
                    "jpeg",
                    "png",
                    "gif",
                    "webp"
                ],
                "embedVideoFileExtensions": [
                    "webm",
                    "mp4"
                ],
                "hyperlinkSchemes": [
                    "http://",
                    "https://"
                ],
                "postPostRandomKey": true,
                "deletePostRandomKey": false,
                "postFileRandomKey": true,
                "deleteFileRandomKey": false,
                "queryFromPanBoardFilesDbIfFileNotFound": true,
                "postHashLength": 8
            }
			fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, '\t'), 'utf8');
            return defaultConfig;
        }
    } catch (err) {
        console.error('Error loading or creating config file:', err);
        return null;
    }
}

function saveConfig() {
    const configFile = configDir+'/config.json';
    try {
        fs.writeFileSync(configFile, JSON.stringify(cfg, null, '\t'), 'utf8');
        console.log('Configuration saved successfully.');
    } catch (err) {
        console.error('Error saving configuration:', err);
    }
}

const cfg = loadConfig();

function loadGatewayConfig() {
    const configFile = configDir+'/gatewayConfig.json';
    
    try {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (err) {
        console.error('Error loading gateway config file:', err);
        return null;
    }
}

const gatewayCfg = loadGatewayConfig();

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

app.use(express.static('./res')); //todo: revist to allow static icons and such, also change in home.pug

// Middleware to generate a nonce for each request to make inline script execution comply with CSP.
app.use((req, res, next) => {
  // Generate a random nonce value
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `script-src 'nonce-${nonce}' 'self'`);
  res.locals.nonce = nonce;
  next();
});


// Multer storage configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


//Compile pug templates to memory to speed up rendering.
const rt={};//object to hold render templates
rt['home'] = compileFile('./views/boardmanage.pug');
rt['board'] = compileFile('./views/board.pug');
rt['files'] = compileFile('./views/files.pug');
rt['gatewayHome'] = compileFile('./views/gatewayhome.pug');

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
async function addFileStatuses (inputObj = {}, whichBoard) {
	const db = await import('./db.js')
    for (let thisKey of Object.keys(inputObj)) {
        if (thisKey == 'files') {
        	for (let thisFile of inputObj[thisKey]) {
				thisFile.fileStatus = await db.fileExists(thisFile.hash, whichBoard)
                if (cfg.queryFromPanBoardFilesDbIfFileNotFound && !thisFile.fileStatus) {
                    thisFile.fileStatus = await db.fileExists(thisFile.hash, '')
                }
        	}
        } else if (typeof inputObj[thisKey] === 'object') {
        	inputObj[thisKey] = await addFileStatuses(inputObj[thisKey], whichBoard)
        } 
    }
    return inputObj;
}

//todo: use enums
function convertStringFormat(inputHex, format) {
  let result = '';
  switch (format) {
    case 'hex': // Hex (no change)
      return inputHex;
    case 'base64': // Base64
      return Buffer.from(inputHex, 'hex').toString('base64')
    case 'utf-16':
        return Buffer.from(inputHex, 'hex').toString('utf16le');
    default:
        throw new Error('Invalid conversion type.');
  }
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

//todo: make more efficient/combine with above?
function applyStyle (inputObj = {}) {
    console.log('ping 0000')
    console.log(inputObj)
    console.log(Object.keys(inputObj))
    for (let thisKey of Object.keys(inputObj)) {
        console.log(thisKey)
        if (thisKey == 'hash') {
            inputObj[thisKey] = convertStringFormat(inputObj[thisKey], cfg.hashStyle)
        } else if (typeof inputObj[thisKey] === 'object') {
            inputObj[thisKey] = applyStyle(inputObj[thisKey])
        } 
    }
    return inputObj;
}

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

var cssThemes = []

function loadCssThemes() {
	cssThemes = fs.readdirSync('./res/themes') //todo: make this configurable, and try-catch?
	.filter(file => file.endsWith('.css'))
	.map(file => file.slice(0, -4));
}

var currentCssTheme = null; 

app.get('/function/changeTheme/:themeName', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'changeTheme') //todo: revisit this if there can be themes in the session cookies
  	loadCssThemes() //todo: possible update this somewhere else or check every time?
  	var lowercaseTheme = req.params.themeName.toLowerCase()
  	if (cssThemes.includes(lowercaseTheme)) {
  		currentCssTheme = lowercaseTheme
  		cfg.defaultTheme = lowercaseTheme
  		saveConfig()
  	} else {
  		throw new Error(`Theme ${lowercaseTheme}.css not found.`)
  	}

  } catch (err) {
  	console.log(`Failed to change theme to: ${req.params.themeName}.`)
  	lastError = err
  }
  	res.redirect(req.headers.referer)
});

//todo: make this into a post req.
app.get('/:board/deletepost=:posthash', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delPost')
  	console.log(`Deleting post: ${req.params.posthash}.`);
	const db = await import('./db.js')
	await db.delPost(req.params.posthash, req.params.board, cfg.deletePostRandomKey)

  } catch (err) {
  	console.log(`Failed to delete post: ${req.params.posthash}.`)
  	lastError = err
  }

	res.redirect(req.headers.referer); //todo: check propriety
});


app.get('/myreplicationfactors', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'seeClientId') //todo: rename maybe throughout
	const db = await import('./db.js')
	res.send(makeRenderSafe([db.Files.files.log.role.segments[0].factor, db.Files.chunks.documents.log.role.segments[0].factor]))
  } catch (err) {
  	console.log('Failed to get replication factor.')
  	console.log(err)
  	lastError = err
  	res.redirect('/home')
  }

	// res.redirect(req.headers.referer); //todo: check propriety
});

app.get('/mymultiaddr', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'seeClientId')
	const db = await import('./db.js')
	res.send(db.client.libp2p.getMultiaddrs()[0])
  } catch (err) {
  	console.log('Failed to get multiAddr.')
  	console.log(err)
  	lastError = err
  	res.redirect('/home')
  }

	// res.redirect(req.headers.referer); //todo: check propriety
});

//todo: make this into a post req.
app.get('/deletefile=:filehash', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delFile')
  	const fileHash = req.params.filehash
  	console.log(`Deleting file: ${fileHash}.`);
	const db = await import('./db.js')
	await db.delFile(fileHash, cfg.deleteFileRandomKey)

  } catch (err) {
  	console.log(`Failed to delete file: ${params.params.fileHash}.`)
  	lastError = err
  }

	res.redirect(req.headers.referer); //todo: check propriety
});

app.post('/connectToPeer', upload.any(), async (req, res, next) => {
  // Here you can write the logic to delete the file corresponding to the imageUrl
  try {
    gatewayCanDo(req, 'dialPeer')
  	const peerMultiAddr = req.body.peerMultiAddr
  	// console.log(req)
  	console.log(req.body)
  	console.log(`Connecting to peer: ${peerMultiAddr}.`);
	const db = await import('./db.js')
	await db.connectToPeer(peerMultiAddr)

  } catch (err) {
  	console.log(`Failed to connect to peer.`)
  	lastError = err
  }

	res.redirect(req.headers.referer); //todo: check propriety
});

//todo: maybe have all settings go through a single form
app.post('/updateHashStyle', (req, res) => {
  try {

    cfg.hashStyle = req.body.hashStyle;
    // Invoke saveConfig to save the updated configuration
    saveConfig();

    // Send a success response
  } catch (err) {
    // Handle errors
    console.error('Error updating hash style:', err);
    lastError = err
  }
    res.redirect(req.headers.referer);
});

//todo: consolidate duplicated functionality
app.post('/addWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    // Extract the board ID from the request body
    const boardId = req.body.boardId;

    // Add the board ID to the watchedBoards array
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
		const db = await import('./db.js')
	    await db.openPostsDb(boardId, {replicationFactor: cfg.replicationFactor})
	    // Invoke the saveWatchedBoards function to save the updated watchedBoards array
	    console.log("watchedBoards:")
	    console.log(watchedBoards)
	    saveWatchedBoards(watchedBoards);
    }
    // Redirect back to the previous page
  } catch (err) {
	    console.error('Error adding watched board:', err);
	    lastError = err
  }
    res.redirect(req.headers.referer);
});

app.post('/removeWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    // Extract the board ID from the request body
    const boardId = req.body.boardId;

    // Check if the board ID is in the watchedBoards array
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
      // Remove the board ID from the watchedBoards array
		const db = await import('./db.js')
		await db.closePostsDb(boardId)
		watchedBoards.splice(index, 1);

		saveWatchedBoards(watchedBoards);
	}

    // Redirect back to the previous page
  } catch (err) {
    console.error('Error removing watched board:', err);
    lastError = err
  }
  res.redirect(req.headers.referer);
});

app.get('/function/addBoard/:boardId',  async (req, res, next) => {
	console.log('ping')
  try {
    gatewayCanDo(req, 'addBoard')
    const boardId = req.params.boardId;
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
		const db = await import('./db.js')
	    await db.openPostsDb(boardId)
	    saveWatchedBoards(watchedBoards);
    }
  } catch (err) {
	    console.error('Error adding watched board:', err);
  }
  res.send('') //todo: change this?
});

app.get('/function/removeBoard/:boardId', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    const boardId = req.params.boardId;
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
		const db = await import('./db.js')
		await db.closePostsDb(boardId)
		watchedBoards.splice(index, 1);
		console.log("watchedBoards:")
		console.log(watchedBoards)
		saveWatchedBoards(watchedBoards);
	}

  } catch (err) {
    console.error('Error removing watched board:', err);
  }
  res.send('') //todo: change this?
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
		const db = await import('./db.js')
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
    gatewayCanDo(req, 'addMod')
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
    gatewayCanDo(req, 'remMod')
    await removeModerator(req.body.moderatorId)
  } catch (err) {
		console.error('Error adding moderator:', err);
		lastError = err
  }
  res.redirect(req.headers.referer);
});

app.get('/function/addModerator/:moderatorId'),  async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addMod')
    await addModerator(req.params.moderatorId)
  } catch (err) {
	    console.error('Error adding moderator:', err);
		lastError = err
  }
  res.redirect(req.headers.referer);
}

app.get('/function/removeModerator/:moderatorId', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remMod')
    await removeModerator(req.params.moderatorId)
  } catch (err) {
		console.error('Error adding moderator:', err);
		lastError = err
  }
    res.redirect(req.headers.referer);
});

//todo: check extensionless files, nameless files, etc.
const downloadFileHandler = async (req, res, next) => {
    let fileStream
    try {
        gatewayCanDo(req, 'seeFile')
        const db = await import('./db.js')
        let fileData = await db.getFile(req.params.filehash, req.params.whichBoard)
        if (cfg.queryFromPanBoardFilesDbIfFileNotFound && !fileData) {
            fileData = await db.getFile(req.params.filehash, '')
        }
        if (fileData) {
            fileStream = new Stream.Readable()
            let i = 0

            fileStream._read = function (size) {
                let pushed = true
                while (pushed && i < fileData.length) {
                    pushed = this.push(fileData.subarray(i, i + bufferSize))
                    i += bufferSize
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
        console.log('Failed to get file ' + req.params.filehash)
        console.log(error)
        if (fileStream) {
            fileStream.destroy(); // Close the file stream if it's initialized
        }
        res.send(null);
    }
}

//todo: check for redundancy
app.get('/download/:whichBoard/:filehash/:filename.:fileext', downloadFileHandler);
app.get('/download/:whichBoard/:filehash.:fileext', downloadFileHandler);
app.get('/download/:whichBoard/:filehash/:filename', downloadFileHandler);
app.get('/download/:whichBoard/:filehash', downloadFileHandler);

const renderFunctions = {
    formatFileSize,
    gatewayCanDo
}


app.get('/:board/:pagenumber.html', async (req, res, next) => {

	try {
        console.time('buildIndex');
		gatewayCanSeeBoard(req.params.board)
	    if (watchedBoards.indexOf(req.params.board) === -1) {
	    	throw new Error(`Board /${req.params.board}/ not in watched board list.`)
	    }

		//todo: consider changing this/eschewing ".html"
		var whichPage = parseInt(req.params.pagenumber)
		if (req.params.pagenumber == 'index') {
			whichPage = 1
		}

		const db = await import('./db.js')

		let indexPosts = await addFileStatuses(makeRenderSafe(await db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies, whichPage)), req.params.board)
		// let allPosts = makeRenderSafe(db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies))

		boardPagesCache[req.params.board] = indexPosts.totalpages

		for(let threadPost in indexPosts.threads) {
			indexPosts.threads[threadPost].replies = indexPosts.replies[threadPost]
			indexPosts.threads[threadPost].omittedreplies = indexPosts.omittedreplies[threadPost]
		}

        const options = await standardRenderOptions(req,res)
		options.currentBoard = req.params.board
        options.posts = indexPosts.threads
		options.numPages = boardPagesCache[req.params.board]
		options.indexMode = true
		console.log(indexPosts.totalpages + " pages total")
		const html = await rt['board'](options)
		resetError()
        console.timeEnd('buildIndex');
        res.send(html)

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		lastError = err
		res.redirect('/home')
	}

})


const boardPagesCache = {}; //todo: reconsider

//todo: remove redundancy with currentBoard, watchedBoards, etc throughout?

app.get('/:board/thread/:thread.html', async (req, res, next) => {

	try {
        gatewayCanSeeBoard(req.params.board)
	    if (watchedBoards.indexOf(req.params.board) === -1) {
	    	throw new Error(`Board /${req.params.board}/ not in watched board list.`)
	    }
		const db = await import('./db.js')
		// let allPosts = makeRenderSafe(await db.getPosts(req.params.board))
		let threadPost = await await db.getSpecificPost(req.params.board, req.params.thread)
		// threadPost.replies = []
		if(threadPost.length) {
			threadPost[0].replies = await db.getRepliesToSpecificPost(req.params.board, req.params.thread)
			threadPost[0] = await addFileStatuses(makeRenderSafe(threadPost[0]), req.params.board)
		}


		// console.log(threadPost)
		// for (let thisPostIndex in threadPost) {
		// 	threadPost[thisPostIndex] = applyMarkup(threadPost[thisPostIndex])
		// 	for (let thisReplyIndex in threadPost.replies) {
		// 		threadPost.replies[thisReplyIndex] = applyMarkup(threadPost.replies[thisReplyIndex])
		// 	}
		// }
        const options = await standardRenderOptions(req,res)
        options.board = req.params.board
        options.threadId = req.params.thread
        options.numPages = boardPagesCache[req.params.board]
        options.posts = threadPost
        if (req.query.reply) {
            options.prefillMessageBox = '>>'+req.query.reply+'\n'
        }
        options.currentBoard = req.params.board
        const html = await rt['board'](options)
		resetError()
		res.send(html)

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		lastError = err
		res.redirect('/home')
	}

})

function resetError() {
	lastError = undefined
}

var lastError

//todo: different dependng on new thread/reply
//todo: files
//todo: validation
//todo: projected post etc
app.post('/submit', upload.any(), async (req, res, next) => {
	try {
        gatewayCanDo(req, 'post')
        gatewayCanSeeBoard(req.body.whichBoard)
		// console.log('req.files:') //todo: remove debug
		// console.log(req.files)
		// console.log(req.body.message)
		// let lastbumps = new Array(threads.length)
		const db = await import('./db.js');
		const dbPosts = await import('./posts.js')
		let postFiles = []
		for (let thisFile of req.files) {
            gatewayCanDo(req, 'postFile')
	  		postFiles.push(
	  			new dbPosts.PostFile ( //todo: consider what needs to be included in this
		  			await db.putFile(thisFile.buffer, req.body.whichBoard, cfg.postFileRandomKey), //puts the file and returns the hash
		  			thisFile.originalname, //original filename
                    thisFile.originalname.includes('.') ? thisFile.originalname.split('.').pop() : '',
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
		  const Validate = await import('./validation.js')
		  // console.log(Validate)
		  Validate.default.post(newPost)
		  //todo: make pass post document
		  await db.makeNewPost(newPost, req.body.whichBoard, cfg.postPostRandomKey)
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

//todo: revisit this
app.get('/function/findThreadContainingPost/:boardId/:postHash', async (req, res, next) => {
    try {
        gatewayCanSeeBoard(req.params.boardId)
        const db = await import('./db.js')
        const specificPost = await db.getSpecificPost(req.params.boardId, req.params.postHash)
        const hashRefIndex = req.params.postHash.indexOf('#');
        if (specificPost.length) { //post was found
            if (specificPost[0].replyto) { //post is a reply
                res.redirect(`/${req.params.boardId}/thread/${specificPost[0].replyto}.html${hashRefIndex === -1 ? '' : req.params.postHash.substring(hashRefIndex)}`)
            } else { //post is a thread OP
                res.redirect(`/${req.params.boardId}/thread/${req.params.postHash}.html`) //todo: do we need hash reference here?
            }
        } else { //post not found
            throw new Error(`Thread containing post with hash '${req.params.postHash}' not found.`) //todo: maybe don't make this an error or something, or pre-check the links?
        }
    } catch (err) {
        console.log(err)
        lastError = err
        res.redirect(req.headers.referer) //todo: check if this is working properly
    }
})

//todo: fix redundancy with boards
app.get('/home', async (req, res, next) => {
	try {
        if (!localhostIps.includes(req.ip) && gatewayCfg.gatewayMode) { //todo: make this go through gatewayCanDo function?
            res.redirect('/gateway')
            return
        }

		const db = await import('./db.js')
        const options = await standardRenderOptions(req,res)
		const html = await rt['home'](options)
		resetError()
		res.send(html)

	} catch (error) {
		console.log('Failed to open homepage')
		console.log(error)
        lastError = error
        //todo: redirect somewhere?
	}
});

app.get('/listPeers', async (req, res, next) => {
    try {
        gatewayCanDo(req)
        const db = await import('./db.js')
        res.json(await db.listPeers())

    } catch (error) {
        console.log('Failed to list peers')
        console.log(error)
        lastError = error
        res.redirect('home')
    }
});


app.get('/files', async (req, res, next) => {
    try {
        gatewayCanDo(req)
        const db = await import('./db.js')
        const options = await standardRenderOptions(req,res)
        options.files = await db.getAllFileDocuments()
        console.log(options.files)
        const html = await rt['files'](options)
        resetError()
        res.send(html)

    } catch (error) {
        console.log('Failed to open files page')
        console.log(error)
        lastError = error
        res.redirect('home')
    }
});

//todo: consider making this a route
function gatewayCanDo(req, whichPerm, throwErr = true) { //todo: revisit the name of this?
    if (localhostIps.includes(req.ip)) { //if we're not in gateway mode, allow anything.
        return true;
    } else if (gatewayCfg.gatewayMode) {
        if (gatewayCfg.can[whichPerm]) {
            return true
        } else {
            if (throwErr) {
                throw new Error (`Not permitted to "${whichPerm}".`)
            } else {
                return false
            }
        }
    } else {
        return true
    }
}

function gatewayCanSeeBoard(whichBoard) { //todo: add req processing for eg. localhost bypass (if implemented)
    if (gatewayCfg.gatewayMode && !gatewayCfg.can.seeAllBoards && !gatewayCfg.canSeeBoards.includes(whichBoard)) {
        throw new Error (`Not permitted to browse /${whichBoard}/.`)
    } else {
        return true
    }
}

function canSeeBoards() { //todo: add req processing for eg. localhost bypass (if implemented)
    if (gatewayCfg.gatewayMode && !gatewayCfg.can.seeAllBoards) {
        return gatewayCfg.canSeeBoards.filter(b => watchedBoards.includes(b))
    } else {
        return watchedBoards
    }
}

async function standardRenderOptions (req,res) { //todo: make this into a middleware?
    const db = await import('./db.js')
    return {
        clientId: await db.clientId(),
        req: req,
        prefillMessageBox: res.locals.prefillMessageBox,
        nonce: res.locals.nonce,
        boards: watchedBoards,
        alert: lastError,
        watchedBoards: canSeeBoards(),
        themes: cssThemes,
        cssTheme: currentCssTheme,
        defaultName: cfg.defaultName, //todo: consolidate cfg where possible
        moderators: moderators,
        renderFunctions: renderFunctions,
        cfg: cfg,
        gatewayCfg: gatewayCfg,            
        myMultiAddr: db.client.libp2p.getMultiaddrs()[0],
        posts: []
    }
}

//gateway stuff
app.get('/gateway', async (req, res, next) => {
    try {
        const db = await import('./db.js')
        const options = await standardRenderOptions(req,res)
        console.log('options', options)
        const html = await rt['gatewayHome'](options)
        resetError()
        res.send(html)
    } catch (err) {
        console.log('Failed to open gateway homepage')
        console.log(err)
        lastError = err
    }
});

// Start the Server
app.listen(cfg.browserPort, cfg.browserHost, () => {
	console.log(`Starting Server at ${cfg.browserPort}:${cfg.browserHost}`);
});


(async () => {

	process.setMaxListeners(0);

	const db = await import('./db.js');

    process.on('uncaughtException', (error) => {
        if (error instanceof DeliveryError) {
            console.error('A DeliveryError occurred:', error.message);
        } else {
            console.error('An uncaught exception occurred:', error.message);
            console.error('Stack trace:', error.stack);
            process.exit(1);
        }
    });


	try {


		loadCssThemes()
		currentCssTheme = cfg.defaultTheme

		await db.pbInitClient(cfg.peerbitPort)
		console.log("Successfully initialized Peerbit node.")
		console.log(await db.clientId())
        try {
            await db.bootstrap()            
        } catch (bootstrapErr) {
            console.log("Failed to bootstrap:", bootstrapErr)
        }


		// console.log(db.client)
		console.log(db.client.libp2p)

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

	// process.on('uncaughtException', (error) => {
	// 	    console.error('An uncaught exception occurred:', error.message);
	// 	    console.error('Stack trace:', error.stack);
	// });

	try {

        let dbOpens = cfg.queryFromPanBoardFilesDbIfFileNotFound ? [db.openFilesDb("", {replicationFactor: cfg.replicationFactor}).then(r => console.log("Successfully opened pan-board files database."))] : []

        for (let thisBoard of watchedBoards) {
            dbOpens.push(db.openPostsDb(thisBoard, {replicationFactor: cfg.replicationFactor}).then(r => console.log("Successfully opened database for \/"+thisBoard+"\/.")))
            // dbOpens.push(db.openPostsDb(thisBoard).then(r => console.log("Successfully opened database for \/"+thisBoard+"\/.")))
        }

        db.setModerators(moderators)

        await Promise.all(dbOpens)


	} catch (err) {
		console.log("Failed to open databases.")
		console.log(err)
	}

//open the boardlist:
if (cfg.openHomeOnStartup) {
	open('http://'+cfg.browserHost+':'+cfg.browserPort+'/home');
}


})();



