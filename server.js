import express from 'express';
import session from 'express-session';
import { compileFile } from 'pug';
import fs from 'fs';
import open from 'open';

import multer from 'multer';
import bodyParser from 'body-parser';

import Stream from 'stream';

import mime from 'mime'

import { DeliveryError } from '@peerbit/stream-interface';
import { randomBytes } from '@peerbit/crypto';
import { StringMatch, IntegerCompare, Compare, IsNull, Or, And } from '@peerbit/document'

const app = express();

const storageDir = 'storage'
const configDir = 'config'
const backupDir = 'backup'
const pluginDir = 'plugins'

ensureDirExists(configDir)
let db
const localhostIps = []
//todo: another form of authentication (for bypassing gateway mode permissions)
// const localhostIps = ['127.0.0.1', '::1']

import { setMaxListeners, EventEmitter } from 'events'
setMaxListeners(Infinity)

//used for plugins
const eventBus = new EventEmitter();

//todo: automatically fix configs with missing fields
function loadConfig() {
    const configFile = configDir+'/config.json';
    try {
        const defaultConfig = JSON.parse(fs.readFileSync(configDir+'/configDefault.json', 'utf8'));
        if (fs.existsSync(configFile)) {
            const configObject = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            let anyChanges = false
            for (let thisCfgKey of Object.keys(defaultConfig)) {
                if (configObject[thisCfgKey] === undefined) {
                    configObject[thisCfgKey] = defaultConfig[thisCfgKey]
                    anyChanges = true
                }
            }
            if (anyChanges) {
                fs.writeFileSync(configFile, JSON.stringify(configObject, null, '\t'), 'utf8');
            }
            return configObject
        } else {
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

function saveGatewayConfig() {
    const configFile = configDir+'/gatewayConfig.json';
    try {
        fs.writeFileSync(configFile, JSON.stringify(gatewayCfg, null, '\t'), 'utf8');
        console.log('Gateway configuration saved successfully.');
    } catch (err) {
        console.error('Error saving gateway configuration:', err);
    }
}

const watchedBoards = loadWatchedBoards()


// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));

function getFileExtension(url) {
    return url.split('.').pop().toLowerCase();
}

// Middleware to set cache-control headers
//todo: make cache length etc. configurable
app.use((req, res, next) => {
    const ext = getFileExtension(req.url);

    if (gatewayCfg.gatewayMode && (cfg.embedImageFileExtensions.includes(ext) || cfg.embedVideoFileExtensions.includes(ext) || cfg.embedAudioFileExtensions.includes(ext))) {
        // Cache specific file types for 1 week
        res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
        // No caching for other files
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});

app.use(express.static('./res')); //todo: revist to allow static icons and such, also change in home.pug

// Middleware to generate a nonce for each request to make inline script execution comply with CSP.
app.use((req, res, next) => {
  // Generate a random nonce value
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `script-src 'nonce-${nonce}' 'self'`);
  res.locals.nonce = nonce;
  next();
});

const sessionKey = randomBytes(256).toString('base64')
app.use(session({
  secret: sessionKey,
  resave: false,
  saveUninitialized: false
}));

//determine which boards can be accessed by the current requester
function canSeeBoards(req, res, next) {
    if (req.session.loggedIn) {
        req.visibleBoards = watchedBoards;
    } else if (gatewayCfg.gatewayMode && !gatewayCfg.can.seeAllBoards) {
        req.visibleBoards = gatewayCfg.canSeeBoards.filter(b => watchedBoards.includes(b));
    } else {
        req.visibleBoards = watchedBoards;
    }
    next();
}

app.use(canSeeBoards);

// Multer storage configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


//Compile pug templates to memory to speed up rendering.
const rt={};//object to hold render templates
rt['home'] = compileFile('./views/boardmanage.pug');
rt['board'] = compileFile('./views/board.pug');
rt['files'] = compileFile('./views/files.pug');
rt['gatewayHome'] = compileFile('./views/gatewayhome.pug');
rt['gatewayConfig'] = compileFile('./views/gatewayconfig.pug');
rt['query'] = compileFile('./views/query.pug');
rt['prune'] = compileFile('./views/prune.pug');
rt['backup'] = compileFile('./views/backup.pug');

//todo: consider not making the bigint into a string instead show it without quotes at least for query results
function makeRenderSafe(inputObj) {
    if (typeof inputObj === 'bigint') {
        return inputObj.toString();
    }
    if (typeof inputObj === 'object' && inputObj !== null) {
        if (Array.isArray(inputObj)) {
            return inputObj.map(makeRenderSafe);
        } else {
            return Object.fromEntries(
                Object.entries(inputObj).map(([key, value]) => [key, makeRenderSafe(value)])
            );
        }
    }
    return inputObj;
}

async function addFileStatuses(inputObj = {}, whichBoard) {
    let fileStatusChecks = []
    const processFile = async (thisFile, board) => {
        thisFile.fileStatus = await db.fileExists(thisFile.postfilehash, board)
        if (cfg.queryFromPanBoardFilesDbIfFileNotFound && !thisFile.fileStatus) {
            thisFile.fileStatus = await db.fileExists(thisFile.postfilehash, '')
        }
    }
    const processObject = async (obj, board) => {
        for (let [key, value] of Object.entries(obj)) {
            if (key === 'files' && Array.isArray(value)) {
                for (let file of value) {
                    fileStatusChecks.push(processFile(file, board || obj['board']))
                }
            } else if (typeof value === 'object' && value !== null) {
                fileStatusChecks.push(processObject(value, board))
            }
        }
    }
    await processObject(inputObj, whichBoard)
    await Promise.all(fileStatusChecks)
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

function updateDefaultTheme(themeName) {
    loadCssThemes() //todo: possible update this somewhere else or check every time?
    const lowercaseTheme = themeName.toLowerCase()
    if (cssThemes.includes(lowercaseTheme)) {
        currentCssTheme = lowercaseTheme
        cfg.defaultTheme = lowercaseTheme
        saveConfig()
    } else {
        throw new Error(`Theme ${lowercaseTheme}.css not found.`)
    }
}

app.get('/function/changeTheme/:themeName', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'changeTheme') //todo: revisit this if there can be themes in the session cookies
  	loadCssThemes()
    updateDefaultTheme(req.params.themeName)
  } catch (err) {
  	console.log(`Failed to change theme to: ${req.params.themeName}.`)
  	req.session.lastError = err.message
  }
  	res.redirect(req.headers.referer)
});

//todo: make this into a post req.
app.get('/:board/deletepost=:posthash', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delPost')
    gatewayCanSeeBoard(req, req.params.board)
  	console.log(`Deleting post: ${req.params.posthash} on /${req.params.board}/.`);
	await db.delPost(req.params.posthash, req.params.board, cfg.deletePostRandomKey)

  } catch (err) {
  	console.log(`Failed to delete post: ${req.params.posthash}.`)
  	req.session.lastError = err.message
  }

	res.redirect(req.headers.referer); //todo: check propriety
});


//todo: add GET version?
//todo: consider async and/or simultaneous deletes
app.post('/deletePosts', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delPost')
    const queryHashes = JSON.parse(req.body.queryHashes)
    console.log('Deleting posts:', queryHashes);
    for (let thisBoard of Object.keys(queryHashes)) {
        gatewayCanSeeBoard(req, thisBoard)
        for (let thisHash of queryHashes[thisBoard]) {
            try {
                await db.delPost(thisHash, thisBoard, cfg.deletePostRandomKey)
            } catch (delErr) {
                console.log(`Failed to delete post ${thisHash} from /${thisBoard}/:`, delErr)
            }
        }
    }
  } catch (err) {
    console.log(`Failed to delete posts.`)
    req.session.lastError = err.message
  }
    res.redirect(req.headers.referer);
});

//todo: add GET version?
//todo: consider async and/or simultaneous prunings
//todo: consider if these should be prunings or hard deletions... it's called pruning but we actually hard (explicitly) delete for now, (or have this an interface checkbox/config option)
app.post('/pruneMany', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delPost') //todo: not need permissions to delPost when eg. only files are being pruned and vise versa
    gatewayCanDo(req, 'delFile')
    const hardDelete = req.body.action === 'delete'
    if (!hardDelete) {
        throw new Error ('Pruning is unimplemented.') //todo: implement
        //todo: pruning could be conceived of as deleting with a local identity that in general only your nodes subscribe to, distinct from node's identity used to broadcast explicit deletion actions. this allows posts and files to be pruned without explicity telling other nodes subscribed to you that it merits explicit deletion
    }
    const toPrune = {
        'posts': JSON.parse(req.body.orphanReplies || '{}'),
        'fileRefs': JSON.parse(req.body.orphanFileRefs || '{}'),
        'fileChunks': JSON.parse(req.body.orphanFileChunks || '{}'),
    }
    console.log(`Pruning: ${toPrune}`);
    for (let thisType of Object.keys(toPrune)) {
        for (let thisBoard of Object.keys(toPrune[thisType])) {
            gatewayCanSeeBoard(req, thisBoard)
            for (let thisHash of toPrune[thisType][thisBoard]) {
                try {
                    switch (thisType) {
                        case 'posts':
                            await db.removeSinglePost(thisHash, thisBoard, cfg.deletePostRandomKey, hardDelete)
                            break;
                        case 'fileRefs':
                            await db.removeSingleFileRef(thisHash, thisBoard, cfg.deletePostRandomKey, hardDelete)
                            break;
                        case 'fileChunks':
                            await db.removeSingleFileChunk(thisHash, thisBoard, cfg.deletePostRandomKey, hardDelete)
                            break;
                    }
                } catch (pruneErr) {
                    console.log(`Failed to prune ${thisType.slice(0, -1)} ${thisHash}:`,pruneErr)
                }
            }
        }
    }
  } catch (err) {
    console.log(`Failed to prune posts.`)
    req.session.lastError = err.message
  }
    res.redirect(req.headers.referer);
});

app.get('/myreplicationfactors.html', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'seeClientId') //todo: rename maybe throughout
	res.send(makeRenderSafe([db.Files.files.log.role.segments[0].factor, db.Files.chunks.documents.log.role.segments[0].factor]))
  } catch (err) {
  	console.log('Failed to get replication factor.')
  	console.log(err)
  	req.session.lastError = err.message
  	res.redirect('/home.html')
  }

	// res.redirect(req.headers.referer); //todo: check propriety
});

app.get('/mymultiaddr.json', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'seeClientId')
	res.send(db.client.libp2p.getMultiaddrs()[0])
  } catch (err) {
  	console.log('Failed to get multiAddr.')
  	console.log(err)
  	req.session.lastError = err.message
  	res.redirect('/home.html')
  }

	// res.redirect(req.headers.referer); //todo: check propriety
});

//todo: make this into a post req.
app.get('/:board/deletefile=:filehash', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'delFile')
    gatewayCanSeeBoard(req, req.params.board)
  	const fileHash = req.params.filehash
  	console.log(`Deleting file: ${fileHash}.`);
    if (cfg.queryFromPanBoardFilesDbIfFileNotFound) {
        await Promise.all([
            db.delFile(fileHash, req.params.board, cfg.deleteFileRandomKey),
            db.delFile(fileHash, null, cfg.deleteFileRandomKey)
        ])
    } else {
        await db.delFile(fileHash, req.params.board, cfg.deleteFileRandomKey)        
    }

  } catch (err) {
  	console.log(`Failed to delete file: ${params.params.fileHash}.`)
  	req.session.lastError = err.message
  }
	res.redirect(req.headers.referer); //todo: check propriety
});

app.post('/connectToPeer', upload.any(), async (req, res, next) => {
  // Here you can write the logic to delete the file corresponding to the imageUrl
  try {
    gatewayCanDo(req, 'dialPeer')
  	const peerMultiAddr = req.body.peerMultiAddr
  	console.log(`Connecting to peer: ${peerMultiAddr}.`);
	await db.connectToPeer(peerMultiAddr)

  } catch (err) {
  	console.log(`Failed to connect to peer.`)
  	req.session.lastError = err.message
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
    req.session.lastError = err.message
  }
    res.redirect(req.headers.referer);
});

function validateBoardId(boardId) {
    if (!boardId) {
        throw new Error ('Board ID should be at least one character.')
    } else if (/[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(boardId)) {
        throw new Error ('Board ID should not contain punctuation or spaces.')
    }
    return true
}

//todo: consolidate duplicated functionality
app.post('/addWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    validateBoardId(req.body.boardId)
    // Extract the board ID from the request body
    const boardId = req.body.boardId;

    // Add the board ID to the watchedBoards array
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
	    await openBoardDbs(boardId)
	    // Invoke the saveWatchedBoards function to save the updated watchedBoards array
	    console.log("watchedBoards:")
	    console.log(watchedBoards)
	    saveWatchedBoards();
    }
    // Redirect back to the previous page
  } catch (err) {
	    console.error('Error adding watched board:', err);
	    req.session.lastError = err.message
  }
    res.redirect(req.headers.referer);
});

//todo: remove upload if unecessary
app.post('/removeWatchedBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    validateBoardId(req.body.boardId)
    const boardId = req.body.boardId;
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
		await closeBoardDbs(boardId)
		watchedBoards.splice(index, 1);
		saveWatchedBoards();
	}
  } catch (err) {
    console.error('Error removing watched board:', err);
    req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
});

//todo: add GET equivalent for this
//todo: gateway considerations
app.post('/reloadBoard', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard') //todo: maybe a separate perm for this?
    const boardId = req.body.boardId
    validateBoardId(boardId)
    await closeBoardDbs(boardId)
    await openBoardDbs(boardId)
      .then(() => {
        console.log(`Successfully re-opened /${boardId}/.`)
      })
      .catch(async (err) => {
        console.error(`Error re-opening /${boardId}/:`, err)
        await closeBoardDbs(boardId)
        throw err;
      });

  } catch (err) {
    console.error(`Error reloading /${req.body.boardId}/:`, err);
    req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
})

app.get('/function/addBoard/:board',  async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    validateBoardId(req.params.board)
    const boardId = req.params.board;
    if (watchedBoards.indexOf(boardId) === -1) {
    	watchedBoards.push(boardId);
        await openBoardDbs(boardId)
	    saveWatchedBoards();
        res.send(`Successfully opened /${req.params.board}/.`)
    } else {
        res.send(`/${req.params.board}/ was already in watched boards.`)
    }
  } catch (err) {
	    console.error('Error adding watched board:', err);
        req.session.lastError = err.message
        res.send(err)
  }
});

//todo: add GET equivalent for this
//todo: gateway considerations
app.post('/resetBoard', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard') //todo: maybe a separate perm for this?
    const boardId = req.body.boardId
    validateBoardId(boardId)

    //only difference from reloading (aside from gateway permissions)
    // await db.closePostsDb(boardId)
    await dropBoardDbs(boardId)
    await openBoardDbs(boardId)
      .then(() => {
        console.log(`Successfully reset /${boardId}/.`)
      })
      .catch(async (err) => {
        console.error(`Error resetting /${boardId}/:`, err)
        await closeBoardDbs(boardId)
        throw err;
      });

  } catch (err) {
    console.error(`Error resetting /${req.body.boardId}/:`, err);
    req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
})

app.get('/function/addBoard/:board',  async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    validateBoardId(req.params.board)
    const boardId = req.params.board;
    if (watchedBoards.indexOf(boardId) === -1) {
        watchedBoards.push(boardId);
        await openBoardDbs(boardId)
        saveWatchedBoards();
        res.send(`Successfully opened /${req.params.board}/.`)
    } else {
        res.send(`/${req.params.board}/ was already in watched boards.`)
    }
  } catch (err) {
        console.error('Error adding watched board:', err);
        req.session.lastError = err.message
        res.send(err)
  }
});

app.get('/function/removeBoard/:board', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    validateBoardId(req.params.board)
    const boardId = req.params.board;
    const index = watchedBoards.indexOf(boardId);
    if (index !== -1) {
		await closeBoardDbs(boardId)
		watchedBoards.splice(index, 1);
		console.log("watchedBoards:")
		console.log(watchedBoards)
		saveWatchedBoards();
        res.send(`Successfully closed /${req.params.board}/.`)
	} else {
        res.send(`/${req.params.board}/ was already not in watched boards.`)
    }
  } catch (err) {
        console.error('Error removing watched board:', err);
        req.session.lastError = err.message
        res.send(err)
  }
});

app.get('/function/pruneBoard/:board', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    validateBoardId(req.params.board)
    await db.pruneBoard(req.params.board)
    res.send(`Successfully pruned data from /${req.params.board}/.`)
  } catch (err) {
        console.error('Error pruning data from board:', err);
        req.session.lastError = err.message
        res.send(err)
  }
});


//todo: consolidate duplicated functionality
app.get('/function/addGatewayBoard/:board',  async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    validateBoardId(req.params.board)
    const boardId = req.body.boardId;
    if (gatewayCfg.canSeeBoards.indexOf(boardId) === -1) {
        gatewayCfg.canSeeBoards.push(boardId);
        saveGatewayConfig();
        res.send(`Successfully added /${req.params.board}/ to gateway boards.`)
    } else {
        res.send(`/${req.params.board}/ was already in gateway boards.`)
    }
  } catch (err) {
        req.session.lastError = err.message
        res.send('Error adding watched board:', err);
  }
});

app.get('/function/removeGatewayBoard/:board', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    validateBoardId(req.params.board)
    const boardId = req.body.boardId;
    const index = gatewayCfg.canSeeBoards.indexOf(boardId)
    if (index !== -1) {
        gatewayCfg.canSeeBoards.splice(index, 1);
        saveGatewayConfig();
        res.send(`Successfully removed /${req.params.board}/ from gateway boards.`)
    } else {
        res.send(`/${req.params.board}/ was already not in gateway boards.`)
    }
  } catch (err) {
        req.session.lastError = err.message
        res.send('Error removing watched board:', err);
  }
});

// app.get('/function/eventListeners', async (req, res, next) => {
//   try {
//         gatewayCanDo(req, 'seeAllBoards')
//         console.log(eventListeners)
//         res.json(eventListeners)
//   } catch (err) {
//         req.session.lastError = err.message
//         res.send('Error viewing event listeners:', err);
//   }
// });

//todo: consolidate duplicated functionality
app.post('/addGatewayBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addBoard')
    validateBoardId(req.body.agbId)
    const boardId = req.body.agbId;
    if (gatewayCfg.canSeeBoards.indexOf(boardId) === -1) {
        gatewayCfg.canSeeBoards.push(boardId);
        saveGatewayConfig();
        console.log(`Successfully added /${boardId}/ to gateway boards.`)
    } else {
        throw new Error(`/${boardId}/ was already in gateway boards.`)
    }
  } catch (err) {
        console.log('Error adding watched board:', err);
        req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
});

app.post('/removeGatewayBoard', upload.any(), async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remBoard')
    validateBoardId(req.body.rgbId)
    const boardId = req.body.rgbId;
    const index = gatewayCfg.canSeeBoards.indexOf(boardId)
    if (index !== -1) {
        gatewayCfg.canSeeBoards.splice(index, 1);
        saveGatewayConfig();
        console.log(`Successfully removed /${boardId}/ from gateway boards.`)
    } else {
        throw new Error(`/${boardId}/ was already not in gateway boards.`)
    }
  } catch (err) {
        console.log('Error removing watched board:', err);
        req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
});

//todo: ensure the res response/redirect works properly in all cases
//todo: async considerations
app.post('/deleteSelected', async (req, res, next) => {
  try {
    console.log("Selection to delete:", req.body)
    if (Object.keys(req.body.posts).length) {
        gatewayCanDo(req, 'delPost')
        if (req.body.recursiveFileDelete) {
            gatewayCanDo(req, 'delFile')
        }
        for (let thisBoard of Object.keys(req.body.posts)) {
            gatewayCanSeeBoard(req, thisBoard)
            for (let thisHash of req.body.posts[thisBoard]) {
                try {
                    if (req.body.recursiveFileDelete) {
                        const thisPost = await db.getSpecificPost(thisBoard, thisHash)
                        console.log(thisPost, thisPost.length)
                        if (thisPost.length) {
                            for (let thisPostFile of thisPost[0].files) {
                                try {
                                    await db.delFile(thisPostFile.postfilehash, thisBoard, cfg.deleteFileRandomKey)
                                } catch (delPostFileErr) {
                                    console.log(`Failed to delete file ${thisHash} from /${thisBoard}/:`, delPostFileErr)
                                }
                            }
                        }
                    }
                    await db.delPost(thisHash, thisBoard, cfg.deletePostRandomKey)
                } catch (delErr) {
                    console.log(`Failed to delete post ${thisHash} from /${thisBoard}/:`, delErr)
                }
            }
        }
    }
    if (Object.keys(req.body.files).length) {
        gatewayCanDo(req, 'delFile')
        for (let thisBoard of Object.keys(req.body.files)) {
            gatewayCanSeeBoard(req, thisBoard)
            for (let thisHash of req.body.files[thisBoard]) {
                try {
                    await db.delFile(thisHash, thisBoard, cfg.deleteFileRandomKey)
                } catch (delErr) {
                    console.log(`Failed to delete file ${thisHash} from /${thisBoard}/:`, delErr)
                }
            }
        }
    }
  } catch (err) {
    console.log('Error deleting selection:', err)
    // res.redirect(req.headers.referer);
  }
  res.json({ redirectUrl: req.headers.referer });
});

//todo: consider ways to somehow preserve the scrolled-to location or at least the #div link of the url if feasible
app.post('/function/toggleSidebar', async (req, res, next) => {
  try {
    req.session.hideSidebar = !req.session.hideSidebar
    if (req.body.noRedirect) {
      res.json({ success: true, hideSidebar: req.session.hideSidebar });
    } else {
      res.redirect(req.headers.referer);
    }
  } catch (err) {
    console.log('Error toggling sidebar visibility:', err);
    req.session.lastError = err.message;
    res.redirect(req.headers.referer);
  }
});

const moderators = loadModerators()

async function addModerator(moderatorId) {
	if (!moderatorId || moderatorId.length != 44) {
		throw new Error('Moderator ID should be 44-characters long.')
	}
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
		req.session.lastError = err.message
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
		req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
});

app.get('/function/addModerator/:moderatorId'),  async (req, res, next) => {
  try {
    gatewayCanDo(req, 'addMod')
    await addModerator(req.params.moderatorId)
  } catch (err) {
	    console.error('Error adding moderator:', err);
		req.session.lastError = err.message
  }
  res.redirect(req.headers.referer);
}

app.get('/function/removeModerator/:moderatorId', async (req, res, next) => {
  try {
    gatewayCanDo(req, 'remMod')
    await removeModerator(req.params.moderatorId)
  } catch (err) {
		console.error('Error adding moderator:', err);
		req.session.lastError = err.message
  }
    res.redirect(req.headers.referer);
});

//todo: check extensionless files, nameless files, etc.
const downloadFileHandler = async (req, res, next) => {
    let fileStream
    try {
        gatewayCanDo(req, 'seeFile')
        let fileData = await db.getFile(req.params.filehash, req.params.whichBoard)
        if (cfg.queryFromPanBoardFilesDbIfFileNotFound && !fileData) {
            fileData = await db.getFile(req.params.filehash, '')
        }
        if (fileData) {
            fileStream = new Stream.Readable()
            let i = 0

            res.setHeader('Cache-Control', 'public, max-age=604800'); //Cache for one week //todo: make configurable and the same (or different) as static files

            res.setHeader('Content-Type', mime.getType(req.params.fileext || 'bin') || 'application/octet-stream'); //Set MIME type

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
        console.log(`$Failed to get file ${req.params.filehash} on /${req.params.whichBoard}/`)
        console.log(error)
        if (fileStream) {
            fileStream.destroy(); //Close the file stream if it's initialized
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

//todo: do this
//todo: consider adding sift as a dep or not
//todo: neaten up
//todo: handle case sensitive etc?
//todo: optimize maybe
//todo: paren handling?

function convertQueryToPeerbitQuery (queryString) {
    // console.log("convertQueryToPeerbitQuery() in index.js")
    // console.log("queryString:")
    // console.log(queryString)
    try {
    let pbQuery = []
    //supported operations are =, >, <. >=, <=, and, or
    //order of operations:
        // =, >, <, >=, <=
        // and
        // or
    //operations and terms are separated by single spaces
    //for an empty query, the value empty (without quotes) is used
    //bigints and numbers are treated as interchangeable
    //todo: implement empty

    //first split the input string into tokens
    const tokens = queryString.match(/"[^"]*"|\S+/g);

    function queryExpToPeerbitQueryExp(tokenArray) {
        //we get the type of the Peerbit query based on the third element of the array
        if (tokenArray[2] == 'empty' && tokenArray[1] == '=') {
            return new Or([new StringMatch({key: tokenArray[0], value: ''}), new IsNull({key: tokenArray[0]})])
        } else if (tokenArray[2].startsWith('"') && tokenArray[2].endsWith('"') && tokenArray[1] == '=') {
            //todo: partial matches, case sensitivity, etc
            return new StringMatch({key: tokenArray[0], value: tokenArray[2].slice(1, -1)})
        } else {
            switch (tokenArray[1]) {
            case '=':
                return new IntegerCompare({key: tokenArray[0], value: BigInt(tokenArray[2]), compare: Compare.Equal})
            case '>':
                return new IntegerCompare({key: tokenArray[0], value: BigInt(tokenArray[2]), compare: Compare.Greater})
            case '<':
                return new IntegerCompare({key: tokenArray[0], value: BigInt(tokenArray[2]), compare: Compare.Less})
            case '>=':
                return new IntegerCompare({key: tokenArray[0], value: BigInt(tokenArray[2]), compare: Compare.GreaterOrEqual})
            case '<=':
                return new IntegerCompare({key: tokenArray[0], value: BigInt(tokenArray[2]), compare: Compare.LessOrEqual})
            }
        }
    }

    function parseAnds(tokenArray) {
        const andInds = tokenArray.reduce((indices, token, index) => (['and', 'AND', '&', '&&'].includes(token) && indices.push(index), indices), []);
        if (andInds.length) {
            let startInd = 0
            let allAndExps = []
            andInds.forEach((endInd, i) => {
                const expressionTokens = tokens.slice(startInd, endInd)
                allAndExps.push(queryExpToPeerbitQueryExp(expressionTokens))
                startInd = endInd +1
            })
            const remainingTokens = tokens.slice(startInd)
            if (remainingTokens.length) {
                allAndExps.push(queryExpToPeerbitQueryExp(remainingTokens))
            }
            return new And(allAndExps)
        } else {
            return queryExpToPeerbitQueryExp(tokenArray)
        }
        //todo: split up by ands
    }

    let peerbitQuery = []

    if (!queryString) {
        return peerbitQuery
    }

    const orInds = tokens.reduce((indices, token, index) => (['or', 'OR', '|', '||'].includes(token) && indices.push(index), indices), []);
    if (orInds.length) {
        let startInd = 0
        let allOrExps = []
        orInds.forEach((endInd, i) => {
            const expressionTokens = tokens.slice(startInd, endInd)
            allOrExps.push(parseAnds(expressionTokens))
            startInd = endInd + 1
        })
        const remainingTokens = tokens.slice(startInd)
        if (remainingTokens.length) {
            allOrExps.push(parseAnds(remainingTokens))
        }
        peerbitQuery.push(new Or(allOrExps))
    } else {
        peerbitQuery.push(parseAnds(tokens))

    }

    ///

    // const orInds = tokens.reduce((indices, token, index) => (['or', 'OR', '|', '||'].includes(token) && indices.push(index), indices), []);
    // const andInds = tokens.reduce((indices, token, index) => (['and', 'AND', '&', '&&'].includes(token) && indices.push(index), indices), []);

    // const orAndInds = [...orInds, ...andInds].sort((a, b) => a - b);

    // let queryExpressions = new Array (Math.max(orAndInds));
    // let startIndex = 0;

    // for (let orAndInd of orAndInds) {
    //     queryExpressions.push(tokens.slice(startIndex, orAndInd));
    //     startIndex = orAndInd + 1;
    // }

    // if (startIndex < tokens.length) {
    //     queryExpressions.push(tokens.slice(startIndex));
    // }

    // console.log(queryExpressions);

    // const peerbitQueryExpressions = []


    // function combineAndQueryExpressions(inputArray) {

    // }

    // //if there are any "or" tokens, the query needs to split up accordingly
    // if (orInds.length) {
    //     let prevOrInd = 0
    //     for (thisOrInd of orInds) {
            
    //         prevOrInd = thisOrInd
    //     }
    // }

    console.log("Parsed query:", peerbitQuery)
    return peerbitQuery
    } catch (err) {
        //todo: more explicative error handling
        throw new Error(`Malformed query: ${err}`);
    }
}

//todo: query files, file chunks, etc.
//todo: aggregation, more complex queries, etc.

//todo: maybe do these on a session basis? (and handle others)
//Query interface queries
var lastQuery
var lastQueryBoards
var lastQueryResults
var lastQueryLimit = 512 //default nonzero value to avoid browser rendering issues

//Pruning
var lastPruneBoards
var lastPruneAllBut = 10 * cfg.threadsPerPage //keep 10 pages of threads as the default value //todo: maybe revisit this.
// var lastPruneCounts //todo: maybe some kind of display or message to show the results of the pruning

//Orphan queries
var lastOrphanQueryBoards
var lastOrphanQueryLimit = 512 //default nonzero value to avoid browser rendering issues
var lastOrphanReplies
var lastOrphanFileRefs
var lastOrphanFileChunks

//Backup and restore
var lastBackupBoards
var lastRestoreBoards

//todo: also add GET API?
//todo: add timer
//todo: bigint handling and stuff
//todo: combine board and whatnot into single query?
//todo: handle boards staying there and also in pug

function convertQueryToBigInt (query) {
    for (let thisKey of Object.keys(query)) {
        if (typeof query[thisKey] === 'string' && ["date","size"].includes(thisKey)) {
            query[thisKey] = BigInt(query[thisKey])
        } else if (typeof query === 'object') {
            query[thisKey] = convertQueryToBigInt(query[thisKey]);
        }
    }
    return query;
};

//splits a string by a given character but returns empty array if the string was empty
//todo: add to places where appropriate
function splitBy(inputString = '', splitString = ',') {
    if (inputString) {
        return inputString.split(splitString)
    } else {
        return []
    }
}

app.post('/submitQuery', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'useQueryPage')
        // console.log('req.body:', req.body)
        lastQuery = req.body.queryString
        lastQueryBoards = req.body.boardIds
        lastQueryLimit = parseInt(req.body.queryLimit) || 0

        let boardsToQuery = req.body.boardIds ? req.visibleBoards.filter(b => req.body.boardIds.split(',').includes(b)) : req.visibleBoards

        const peerbitQuery = convertQueryToPeerbitQuery(req.body.queryString);

        //todo: handle non-implemented query?

        lastQueryResults = makeRenderSafe(await db.queryPosts(boardsToQuery, peerbitQuery, lastQueryLimit))

        //query limit handling
        //todo: maybe make this occur earlier someehow
        if (lastQueryLimit) {
            let remainingPosts = lastQueryLimit;
            
            for (let thisBoard of Object.keys(lastQueryResults)) {
                const posts = lastQueryResults[thisBoard];
                
                const postsToInclude = Math.min(posts.length, remainingPosts);
                lastQueryResults[thisBoard] = posts.slice(0, postsToInclude);
                
                remainingPosts -= postsToInclude;
                
                if (remainingPosts <= 0) {
                    break;
                }
            }
            Object.keys(lastQueryResults).forEach(board => {
                if (lastQueryResults[board].length === 0) {
                    delete lastQueryResults[board];
                }
            });
        }


        // console.log("queryResults:")
        // console.log(lastQueryResults)
    } catch (err) {
        lastQueryResults = 'Error executing query.'
        console.log('Failed to submit query.')
        console.log(err)
        req.session.lastError = err.message
    }
    res.redirect('/query.html')
})


//todo: instead of making each delete its own operation in the oplog, bulk deletes should be utilized if and where appropriate, both in the route below and throughout, however this requires gathering all of the replies (and files?) that need to be deleted as well before bulk deleting. (this may not make sense actually as each document has its own independent oplog...)
//todo: optimize
//this also prunes orphans on the specified boards afterward
app.post('/pruneThreads', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'delPost') //todo: consider the implications of being able to delete files by deleting posts, and possibly change the perms check(s) here
        gatewayCanDo(req, 'delFile')

        lastPruneBoards = req.body.pruneBoardIds
        lastPruneAllBut = req.body.pruneAllBut || 0

        let boardsToQuery = req.body.pruneBoardIds ? req.visibleBoards.filter(b => req.body.pruneBoardIds.split(',').includes(b)) : req.visibleBoards

        const threadHashesToPruneByBoard = Object.fromEntries(
            await Promise.all(boardsToQuery.map(async b => {
                return [b, await db.getAllBumpSortedThreads(b).then(results => results.threads.map(threadPost => threadPost.hash).slice(lastPruneAllBut))]; //sorted by most recently bumped first
            }))
        );

        console.log(threadHashesToPruneByBoard);
        // var prunePromises = []

        // const concurrentLimit = 32 //doing at lot at once doesn't seem to work well

        for (let thisBoard of Object.keys(threadHashesToPruneByBoard)) {
            for (let thisHash of threadHashesToPruneByBoard[thisBoard]) {
                try {await db.removeSinglePost(thisHash, thisBoard, cfg.deletePostRandomKey, true)
                } catch (pruneErr) {
                    console.log(`Failed to delete post ${thisHash} on board /${thisBoard}/:`, pruneErr)
                }
                // prunePromises.push(db.removeSinglePost(thisHash, thisBoard, cfg.deletePostRandomKey, true)
                //     .catch((pruneErr) => console.log(`Failed to delete post ${thisHash} on board /${thisBoard}/:`, pruneErr)))
                // if (prunePromises.length >= concurrentLimit) {
                //     await Promise.all(prunePromises).then(() => { prunePromises.length = 0 })
                // }
            }
        }

        // await Promise.all(prunePromises)
        // prunePromises.length = 0

        //subsequently, prune orphans (could maybe be optimized by utilizing the previous results)
        //todo: consider soft deletion?
        const { orphanedRepliesByBoard, orphanedFileRefsByBoard, orphanedFileChunksByBoard } = await getOrphans(boardsToQuery);

        for (let thisBoard of Object.keys(orphanedRepliesByBoard)) {
            for (let thisHash of orphanedRepliesByBoard[thisBoard]) {
                try {await db.removeSinglePost(thisHash, thisBoard, cfg.deletePostRandomKey, true)
                } catch (pruneErr) {
                    console.log(`Failed to delete post ${thisHash} on board /${thisBoard}/:`, pruneErr)
                }
                // prunePromises.push(db.removeSinglePost(thisHash, thisBoard, cfg.deletePostRandomKey, true)
                //     .catch((pruneErr) => console.log(`Failed to delete post ${thisHash} on board /${thisBoard}/:`, pruneErr)))
                // if (prunePromises.length >= concurrentLimit) {
                //     await Promise.all(prunePromises).then(() => { prunePromises.length = 0 })
                // }
            }
        }
        for (let thisBoard of Object.keys(orphanedFileRefsByBoard)) {
            for (let thisHash of orphanedFileRefsByBoard[thisBoard]) {
                try {await db.removeSingleFileRef(thisHash, thisBoard, cfg.deleteFileRandomKey, true)
                } catch (pruneErr) {
                    console.log(`Failed to delete file reference ${thisHash} on board /${thisBoard}/:`, pruneErr)
                }
                // prunePromises.push(db.removeSingleFileRef(thisHash, thisBoard, cfg.deleteFileRandomKey, true)
                //     .catch((pruneErr) => console.log(`Failed to delete file reference ${thisHash} on board /${thisBoard}/:`, pruneErr)))
                // if (prunePromises.length >= concurrentLimit) {
                //     await Promise.all(prunePromises).then(() => { prunePromises.length = 0 })
                // }
            }
        }
        for (let thisBoard of Object.keys(orphanedFileChunksByBoard)) {
            for (let thisHash of orphanedFileChunksByBoard[thisBoard]) {
                try {await db.removeSingleFileChunk(thisHash, thisBoard, cfg.deleteFileRandomKey, true)
                } catch (pruneErr) {
                    console.log(`Failed to delete file chunk ${thisHash} on board /${thisBoard}/:`, pruneErr)
                }               
                // prunePromises.push(db.removeSingleFileChunk(thisHash, thisBoard, cfg.deleteFileRandomKey, true)
                //     .catch((pruneErr) => console.log(`Failed to delete file chunk ${thisHash} on board /${thisBoard}/:`, pruneErr)))
                
                // if (prunePromises.length >= concurrentLimit) {
                //     await Promise.all(prunePromises).then(() => { prunePromises.length = 0 })
                // }
            }
        }

        // await Promise.all(prunePromises)

    } catch (err) {
        console.log(`Error pruning threads:`, err)
        req.session.lastError = err.message
    }
    res.redirect('/prune.html')
})


async function getOrphans(boardsToQuery) {

        const postsByBoard = Object.fromEntries(
            await Promise.all(boardsToQuery.map(async b => {
                return [b, await db.getPosts(b).then(results => results.map(post => ({ hash: post.hash, replyto: post.replyto, files: post.files })))];
            }))
        );

        const allThreadHashesByBoard = Object.fromEntries(
            Object.entries(postsByBoard).map(([board, allPostsThisBoard]) => [
                board,
                new Set(allPostsThisBoard.filter(post => !post.replyto).map(post => post.hash))
            ])
        );

        const allOrphanReplyHashesByBoard = Object.fromEntries(
            Object.entries(postsByBoard).map(([board, allPostsThisBoard]) => [
                board,
                new Set(allPostsThisBoard.filter(post => (post.replyto && !allThreadHashesByBoard[board].has(post.replyto))).map(post => post.hash))
            ])
        );

        const allReferencedFilesByBoard = Object.fromEntries(
            Object.entries(postsByBoard).map(([board, allPostsThisBoard]) => {
                const referencedFiles = new Set();
                allPostsThisBoard.forEach(post => {
                    if (!allOrphanReplyHashesByBoard[board].has(post.hash)) {
                        post.files.forEach(file => {
                            referencedFiles.add(file.postfilehash);
                        });
                    }
                });

                return [board, referencedFiles];
            })
        );

        const fileRefsByBoard = Object.fromEntries(
            await Promise.all(boardsToQuery.map(async b => {
                return [b, await db.getFileRefs(b)];
            }))
        );

        const allOrphanFileRefsByBoard = Object.fromEntries(
            Object.entries(fileRefsByBoard).map(([board, allFileRefsThisBoard]) => {
                const orphanFileRefs = new Set(
                    allFileRefsThisBoard
                        .filter(fileRef => !allReferencedFilesByBoard[board].has(fileRef.hash)).map(fileRef => fileRef.hash)
                );
                return [board, orphanFileRefs];
            })
        );

        const allReferencedFileChunksByBoard = Object.fromEntries(
            Object.entries(fileRefsByBoard).map(([board, allFileRefsThisBoard]) => {
                const referencedFileChunks = new Set(
                    allFileRefsThisBoard
                        .filter(fileRef => !allOrphanFileRefsByBoard[board].has(fileRef.hash))
                        .flatMap(fileRef => fileRef.chunkCids)
                );
                return [board, referencedFileChunks];
            })
        );

        const fileChunksByBoard = Object.fromEntries(
            await Promise.all(boardsToQuery.map(async b => {
                return [b, await db.getFileChunks(b).then(chunks => chunks.map((chunk) => ({ hash: chunk.hash, fileHash: chunk.fileHash })))];
            }))
        );        
        
        const allOrphanFileChunksByBoard = Object.fromEntries(
            Object.entries(fileChunksByBoard).map(([board, allFileChunksThisBoard]) => {
                const orphanFileChunks = allFileChunksThisBoard
                    .filter(fileChunk => !allReferencedFileChunksByBoard[board].has(fileChunk.hash))
                    .map(fileChunk => fileChunk.hash);

                return [board, orphanFileChunks];
            })
        );

        return {
            orphanedRepliesByBoard: Object.fromEntries(
                Object.entries(allOrphanReplyHashesByBoard).map(([board, orphanSet]) => [board, [...orphanSet]])
            ),
            orphanedFileRefsByBoard: Object.fromEntries(
                Object.entries(allOrphanFileRefsByBoard).map(([board, orphanSet]) => [board, [...orphanSet]])
            ),
            orphanedFileChunksByBoard: Object.fromEntries(
                Object.entries(allOrphanFileChunksByBoard).map(([board, orphanSet]) => [board, [...orphanSet]])
            )
        };
}

//todo: possibly combine this with thread count based pruning
//todo: optimize
//todo: since file chunks can be large in in-memory size, it would be useful if peerbit supported projection, then the chunk contents wouldn't have to be retrieved, only the file chunk .hash and .fileHash
app.post('/submitOrphanQuery', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'useQueryPage') //todo: seperate perm?
        // console.log('req.body:', req.body)
        lastOrphanQueryBoards = req.body.orphanQueryBoardIds
        lastOrphanQueryLimit = req.body.orphanQueryLimit

        let boardsToQuery = req.body.orphanQueryBoardIds ? req.visibleBoards.filter(b => req.body.orphanQueryBoardIds.split(',').includes(b)) : req.visibleBoards


        const { orphanedRepliesByBoard, orphanedFileRefsByBoard, orphanedFileChunksByBoard } = await getOrphans(boardsToQuery);

        //remove empty entries (boards with no orphans of the given type)
        lastOrphanReplies = Object.fromEntries(
            Object.entries(orphanedRepliesByBoard).filter(([board, hashes]) => hashes.length > 0)
        );
        lastOrphanFileRefs = Object.fromEntries(
            Object.entries(orphanedFileRefsByBoard).filter(([board, hashes]) => hashes.length > 0)
        );
        lastOrphanFileChunks = Object.fromEntries(
            Object.entries(orphanedFileChunksByBoard).filter(([board, hashes]) => hashes.length > 0)
        );

        const queryLimit = Math.max(0, parseInt(lastOrphanQueryLimit) || 0);
        var numResults = 0

        const limitOrphans = (orphanObject) => {
            const entries = Object.entries(orphanObject);
            const limitedOrphans = {};

            for (const [board, hashes] of entries) {
                if (numResults >= queryLimit) break;
                
                const remainingLimit = queryLimit - numResults;
                const limitedHashes = hashes.slice(0, remainingLimit);
                
                if (limitedHashes.length > 0) {
                    limitedOrphans[board] = limitedHashes;
                    numResults += limitedHashes.length;
                }
            }
            return limitedOrphans;
        };

        if (queryLimit) {
            lastOrphanReplies = limitOrphans(lastOrphanReplies);
            lastOrphanFileRefs = limitOrphans(lastOrphanFileRefs);
            lastOrphanFileChunks = limitOrphans(lastOrphanFileChunks);            
        }

    } catch (err) {
        lastQueryResults = 'Error searching for orphans.'
        console.log('Failed to search for orphans.')
        console.log(err)
        req.session.lastError = err.message
    }
    res.redirect('/prune.html')
})

//todo: made disabled on gateway by default (check if already is)
app.get('/query.html', async (req, res, next) => {
    try {
        console.time('buildQueryPage');
        gatewayCanDo(req, 'query')
        // console.log("lastQueryResults in query.html")
        // console.log(lastQueryResults)
        const options = await standardRenderOptions(req,res)
        options.lastQuery = lastQuery
        options.lastQueryBoards = lastQueryBoards
        options.lastQueryResults = lastQueryResults
        options.lastQueryLimit = lastQueryLimit
        if (typeof lastQueryResults === "object") {
            options.lastQueryResultsHashes = {}
            for (let thisBoard of Object.keys(lastQueryResults)) {
                options.lastQueryResultsHashes[thisBoard] = lastQueryResults[thisBoard].map(r => r.hash)
            }
        }

        // threads = await addFileStatuses(makeRenderSafe(threads))

        const html = await rt['query'](options)
        // resetError(req)
        res.send(html)
    } catch (err) {
        console.log('Failed to generate query page.')
        console.log(err)
        req.session.lastError = err.message
        res.redirect('/home.html')
    }
    console.timeEnd('buildQueryPage');
})

//todo: permissions check
app.get('/prune.html', async (req, res, next) => {
    try {
        console.time('buildPrunePage');
        // gatewayCanDo(req, 'del')
        // console.log("lastQueryResults in query.html")
        // console.log(lastQueryResults)
        const options = await standardRenderOptions(req,res)

        options.lastPruneBoards = lastPruneBoards
        options.lastPruneAllBut = lastPruneAllBut 

        options.lastOrphanQueryBoards = lastOrphanQueryBoards
        options.lastOrphanQueryLimit = lastOrphanQueryLimit
        options.orphanReplies = lastOrphanReplies
        options.orphanFileRefs = lastOrphanFileRefs
        options.orphanFileChunks = lastOrphanFileChunks

        // if (typeof lastQueryResults === "object") {
        //     options.lastQueryResultsHashes = {}
        //     for (let thisBoard of Object.keys(lastQueryResults)) {
        //         options.lastQueryResultsHashes[thisBoard] = lastQueryResults[thisBoard].map(r => r.hash)
        //     }
        // }

        // threads = await addFileStatuses(makeRenderSafe(threads))

        const html = await rt['prune'](options)
        // resetError(req)
        res.send(html)
    } catch (err) {
        console.log('Failed to generate prune page.')
        console.log(err)
        req.session.lastError = err.message
        res.redirect('/home.html')
    }
    console.timeEnd('buildPrunePage');
})

//todo: consider splitting permission into sep for backup and restore
app.get('/backup.html', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'backup')
        const options = await standardRenderOptions(req,res)
        options.lastBackupBoards = lastBackupBoards
        options.lastRestoreBoards = lastRestoreBoards

        const html = await rt['backup'](options)
        res.send(html)
    } catch (err) {
        console.log('Failed to generate backup page.')
        console.log(err)
        req.session.lastError = err.message
        res.redirect('/home.html')
    }
})

function ensureDirExists(dirName) {
    if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
    }
}

//todo: console messages, error handling/messages
//todo: clear existing backup(?)
//todo: apply these to te restore function too
//todo: option for files only or posts only?
//todo: more granual try catch?
//todo: local/remote considerations?
//todo: backup into an archive, and specific backup versioning/version handling (backup manifest)
app.post('/submitBackup', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'backup')

        ensureDirExists(backupDir)

        console.log(`Starting backup.`)

        lastBackupBoards = req.body.backupBoardIds

        let boardsToBackup = req.body.backupBoardIds ? req.visibleBoards.filter(b => req.body.backupBoardIds.split(',').includes(b)) : req.visibleBoards

        //files are stored in their fully constructed forms with a filename like "file_<boardid>_<hash>.<extension>"
        //posts are stored as json, with bigints converted to strings, with a filename like "post_<boardid>_<hash>.json"
        for (let thisBoard of boardsToBackup) {
            console.log(`Backing up /${thisBoard}/...`)
            //save every (complete) file to the filesystem
            const allFileRefsThisBoard = await db.getFileRefs(thisBoard)
            for (let thisFileRef of allFileRefsThisBoard) {
                try {
                    const thisFileData = await db.getFile(thisFileRef.hash, thisBoard)
                    if (!thisFileData) {
                        throw new Error('File data was empty.')
                    }
                    fs.writeFileSync(`${backupDir}/file_${thisBoard}_${thisFileRef.hash}`, thisFileData);
                } catch (thisFileErr) {
                    console.log(`Error backing up file ${thisFileRef.hash} on /${thisBoard}/:`, thisFileErr)
                }
            }
            //save every post as a json file
            const allPostsThisBoard = await db.getPosts(thisBoard)
            for (let thisPost of allPostsThisBoard) {
                //convert bigints to strings and save
                fs.writeFileSync(
                    `${backupDir}/post_${thisBoard}_${thisPost.hash}.json`,
                    JSON.stringify(thisPost, (key, value) => 
                        typeof value === 'bigint' ? value.toString() : value
                    ),
                    'utf8'
                );

            }
            
        }
        console.log(`Backup complete.`)
    } catch (err) {
        console.log('Failed to backup.')
        console.log(err)
        req.session.lastError = err.message
    }
    res.redirect('/backup.html')
})

//todo: handle cases where the board for the given item isnt open/watched
app.post('/submitRestore', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'backup')

        ensureDirExists(backupDir)

        console.log(`Starting restore.`)

        const dbPosts = await import('./dist/posts.js')

        lastRestoreBoards = req.body.restoreBoardIds

        let boardsToRestore = req.body.restoreBoardIds ? req.visibleBoards.filter(b => req.body.restoreBoardIds.split(',').includes(b)) : req.visibleBoards

        for (const file of fs.readdirSync(backupDir)) {
            const filePath = backupDir + '/' + file
            if (!fs.statSync(filePath).isFile()) continue;
            const [thisType, thisBoard, thisHash] = file.split(/[_\.]/);
            if (!boardsToRestore.includes(thisBoard)) continue;
            switch (thisType) {
                case 'file':
                    await db.putFile(
                        fs.readFileSync(filePath),
                        thisBoard
                    )
                    break;
                case 'post':
                    const thisPostData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const newPostDocument = new dbPosts.Post(
                        BigInt(thisPostData.date),
                        thisPostData.replyto,
                        thisPostData.name,
                        thisPostData.subject,
                        thisPostData.email,
                        thisPostData.message,
                        thisPostData.files.map(f => new dbPosts.PostFile(
                            f.postfilehash || f.hash, //f.hash is legacy behavior, could be handled more robustly with explicit backup versioning/backup manifests
                            f.filename,
                            f.extension,
                            BigInt(f.size)
                        ))
                    )
                    console.log(thisPostData)
                    console.log(newPostDocument)
                    await db.makeNewPost(
                        newPostDocument,
                        thisBoard
                    )
                    break;
            }
        }
        console.log(`Restore complete.`)
    } catch (err) {
        console.log('Failed to restore.')
        console.log(err)
        req.session.lastError = err.message
    }
    res.redirect('/backup.html')
})

app.get('/overboard.html', async (req, res, next) => {
    try {
        console.time('buildOverboardIndex');
        // gatewayCanSeeBoard(req, req.params.board)
        // if (watchedBoards.indexOf(req.params.board) === -1) {
        //     throw new Error(`Board /${req.params.board}/ not in watched board list.`)
        // }

        //todo: add additional overboard pages?
        // //todo: consider changing this/eschewing ".html"
        // var whichPage = parseInt(req.params.pagenumber)
        // if (req.params.pagenumber == 'index') {
        //     whichPage = 1
        // }

        //todo: more custom/efficient behavior instead of 

        const options = await standardRenderOptions(req,res)

        var boardsToShow = options.watchedBoards

        if (req.query.boards) {
            const specifiedBoards = req.query.boards.split(',');
            boardsToShow = boardsToShow.filter(b => specifiedBoards.includes(b));
        }

        let boardQueries = []
        let threads = []
        let replies = []
        let omittedreplies = []
        let threadsPerPage = req.query.threads ? parseInt(req.query.threads) : cfg.threadsPerPage
        if (!req.session.loggedIn && gatewayCfg.gatewayMode) {
            threadsPerPage = Math.min(threadsPerPage, gatewayCfg.maxOverboardThreads)
        }
        threadsPerPage = Math.max(threadsPerPage, 0)

        for (let whichBoard of boardsToShow) {
            boardQueries.push(db.getThreadsWithRepliesForOverboard(whichBoard, threadsPerPage, cfg.previewReplies, 1).then((thisBoardResults) => {
                threads = threads.concat(thisBoardResults.threads);
                replies = replies.concat(thisBoardResults.replies)
                omittedreplies = omittedreplies.concat(thisBoardResults.omittedreplies)
            }))
        }
        await Promise.all(boardQueries)

        for(let threadPostIndex in threads) {
            threads[threadPostIndex].replies = replies[threadPostIndex]
            threads[threadPostIndex].omittedreplies = omittedreplies[threadPostIndex]
        }

        threads.sort((a, b) => (a.lastbumped > b.lastbumped) ? -1 : ((a.lastbumped < b.lastbumped) ? 1 : 0)) //newest on top
        threads = threads.slice(0, threadsPerPage) //todo: other pages?

        threads = await addFileStatuses(makeRenderSafe(threads))

        // options.currentBoard = "Overboard"
        options.posts = threads
        options.indexMode = true
        options.overboardMode = true
        const html = await rt['board'](options)
        // resetError(req)
        res.send(html)
    } catch (err) {
        console.log('Failed to get posts for overboard.')
        console.log(err)
        req.session.lastError = err.message
        res.redirect('/home.html')
    }
    console.timeEnd('buildOverboardIndex');
})

//todo: handle catalog pages
app.get('/:board/catalog.html', async (req, res, next) => {
    try {
        console.time('buildCatalog');
        gatewayCanSeeBoard(req, req.params.board)
        if (watchedBoards.indexOf(req.params.board) === -1) {
            throw new Error(`Board /${req.params.board}/ not in watched board list.`)
        }

        // let allPosts = makeRenderSafe(db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies))
        let indexPosts = await addFileStatuses(makeRenderSafe(await db.getThreadsWithReplies(req.params.board, 1000, 0, 1)), req.params.board) //todo: make 1000 dynamic/configurable/or make infinite

        for(let threadPost in indexPosts.threads) {
            indexPosts.threads[threadPost].replies = indexPosts.replies[threadPost]
            indexPosts.threads[threadPost].omittedreplies = indexPosts.omittedreplies[threadPost]
        }

        const options = await standardRenderOptions(req,res)
        options.currentBoard = req.params.board
        options.posts = indexPosts.threads
        options.numPages = boardPagesCache[req.params.board]
        options.indexMode = true
        options.catalogMode = true
        console.log(indexPosts.totalpages + " pages total")
        const html = await rt['board'](options)
        // resetError(req)
        res.send(html)

    } catch (err) {
        console.log('Failed to get posts for board \"'+req.params.board+'\".')
        console.log(err)
        req.session.lastError = err.message
        res.redirect('/home.html')
    }
    console.timeEnd('buildCatalog');
})

app.get('/:board/:pagenumber.html', async (req, res, next) => {

	try {
        console.time('buildIndex');
		gatewayCanSeeBoard(req, req.params.board)
	    if (watchedBoards.indexOf(req.params.board) === -1) {
	    	throw new Error(`Board /${req.params.board}/ not in watched board list.`)
	    }

		//todo: consider changing this/eschewing ".html"
		var whichPage = parseInt(req.params.pagenumber)
		if (req.params.pagenumber == 'index') {
			whichPage = 1
		}

        let indexPosts = await addFileStatuses(makeRenderSafe(await db.getThreadsWithReplies(req.params.board, cfg.threadsPerPage, cfg.previewReplies, whichPage)), req.params.board)
    
		boardPagesCache[req.params.board] = indexPosts.totalpages

		for(let threadPost in indexPosts.threads) {
			indexPosts.threads[threadPost].replies = indexPosts.replies[threadPost]
			indexPosts.threads[threadPost].omittedreplies = indexPosts.omittedreplies[threadPost]
		  
        }

        const options = await standardRenderOptions(req,res)
		options.currentBoard = req.params.board
        options.posts = indexPosts.threads
		options.numPages = boardPagesCache[req.params.board]
        // options.whichPage = whichPage
		options.indexMode = true
		console.log(`/${req.params.board}/ page ${req.params.pagenumber}, ${indexPosts.totalpages} pages total`)
		const html = await rt['board'](options)
		// resetError(req)
        res.send(html)

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		req.session.lastError = err.message
		res.redirect('/home.html')
	}
    console.timeEnd('buildIndex');
})

const boardPagesCache = {}; //todo: reconsider

//todo: remove redundancy with currentBoard, watchedBoards, etc throughout?
app.get('/:board/thread/:thread.html', async (req, res, next) => {

	try {
        gatewayCanSeeBoard(req, req.params.board)
	    if (watchedBoards.indexOf(req.params.board) === -1) {
	    	throw new Error(`Board /${req.params.board}/ not in watched board list.`)
	    }
		let threadPost = await db.getSpecificPost(req.params.board, req.params.thread)
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
		// // resetError(req)
		res.send(html)

	} catch (err) {
		console.log('Failed to get posts for board \"'+req.params.board+'\".')
		console.log(err)
		req.session.lastError = err.message
		res.redirect('/home.html')
	}

})

//todo: different dependng on new thread/reply
//todo: files
//todo: validation
//todo: projected post etc
app.post('/submit', upload.any(), async (req, res, next) => {
	try {
        gatewayCanDo(req, 'post')
        if (req.files?.length) {
            gatewayCanDo(req, 'postFile')
        }
        gatewayCanSeeBoard(req, req.body.whichBoard)
		const dbPosts = await import('./dist/posts.js')
		let postFiles = []
		for (let thisFile of req.files) {
	  		thisFile.originalname = Buffer.from(thisFile.originalname, 'latin1').toString('utf-8'); //allow unicode in filenames, gets around issue with multer 1.4.5/busboy for the time being
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
    	const Validate = await import('./dist/validation.js')
    	Validate.default.post(newPost)
        
        eventBus.emit('newPostPre', { post: newPost, board: req.body.whichBoard });

        await db.makeNewPost(newPost, req.body.whichBoard, cfg.postPostRandomKey)            

        eventBus.emit('newPostAfter', { post: newPost, board: req.body.whichBoard });

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
	  req.session.lastError = err.message
	}
	res.redirect(req.headers.referer);
    // res.send({ reload: true });
});


//todo: consider sanity checking/clamping values eg. postHashLength
app.post('/updateConfig', upload.any(), async (req, res, next) => {
    try {
        gatewayCanDo(req, 'changeConfig')
        //manually reset the boolean values as unchecked boxes wont be included in req.body
        for (let thisKey of Object.keys(cfg)) {
            if (typeof cfg[thisKey]=== 'boolean') {
                cfg[thisKey] = false //todo: check that this is sufficient and working properly and doesn't need to be generalized to other input types
            }
        }
        for(let thisKey of Object.keys(req.body)) {
            switch(thisKey) {
                case 'threadsPerPage':
                case 'previewReplies':
                case 'maxFilesPerPostToShow':
                case 'postHashLength':
                    cfg[thisKey] = parseInt(req.body[thisKey])
                    continue
                case  'embedImageFileExtensions':
                case 'embedVideoFileExtensions':
                case 'embedAudioFileExtensions':
                case 'hyperlinkSchemes':
                case 'specialPageLinks':
                    cfg[thisKey] = splitBy(req.body[thisKey], ',')
                    continue
                case 'openHomeOnStartup':
                case 'postPostRandomKey':
                case 'postFileRandomKey':
                case 'deletePostRandomKey':
                case 'deleteFileRandomKey':
                case 'queryFromPanBoardFilesDbIfFileNotFound':
                case 'remoteQueryPosts':
                case 'remoteQueryFileRefs':
                case 'remoteQueryFileChunks':
                case 'bootstrapOnStartup':
                    cfg[thisKey] = req.body[thisKey] === 'on'
                    continue
                case 'defaultTheme':
                    updateDefaultTheme(req.body[thisKey])
                    continue
                default:
                    cfg[thisKey] = req.body[thisKey]
            }

        }
        saveConfig()
        db.setRemoteQuery(cfg.remoteQueryPosts, cfg.remoteQueryFileRefs, cfg.remoteQueryFileChunks)
        console.log('Configuration updated successfully')
        console.log(cfg)
    } catch (err) {
      console.log('Failed to update configuration')
      console.log(err)
      req.session.lastError = err.message
    }
    res.redirect(req.headers.referer);
    // res.send({ reload: true });
});


//todo: implement this and also the admin user/pass one

//todo: consider sanity checking
app.post('/updateGatewayConfig', upload.any(), async (req, res, next) => {
    console.log('req.body', req.body)
    try {
        gatewayCanDo(req, 'changeGatewayConfig')
        //manually reset the boolean values as unchecked boxes wont be included in req.body
        for (let thisKey of Object.keys(gatewayCfg)) {
            if (typeof gatewayCfg[thisKey]=== 'boolean') {
                gatewayCfg[thisKey] = false //todo: check that this is sufficient and working properly and doesn't need to be generalized to other input types
            }
        }
        for (let thisKey of Object.keys(gatewayCfg.can)) {
            if (typeof gatewayCfg.can[thisKey]=== 'boolean') {
                gatewayCfg.can[thisKey] = false //todo: check that this is sufficient and working properly and doesn't need to be generalized to other input types
            }
        }
        for(let thisKey of Object.keys(req.body)) {
            if (thisKey === 'maxOverboardThreads') {
                gatewayCfg[thisKey] = parseInt(req.body[thisKey])
            } else if (thisKey === 'can') {
                for (let thisCanKey of Object.keys(req.body[thisKey])) {
                   gatewayCfg['can'][thisCanKey] = req.body[thisKey][thisCanKey] === 'on';
                }
            } else if (thisKey === 'canSeeBoards') {
                gatewayCfg[thisKey] = req.body[thisKey].split(',')
            } else if (thisKey === 'gatewayMode') {
                if (gatewayCfg.adminUser && gatewayCfg.adminPass) {
                    gatewayCfg[thisKey] = req.body[thisKey] === 'on'
                } else {
                    req.session.lastError = 'Admin password and username should be configured in config/gatewayConfig.json before enabling gateway mode (requires restart).' //use the last error but dont actually throw so that the other settings can be updated //todo: revisit doing this differently?.message
                    //todo: change this message once UI form in implemented
                }
            } else {
                gatewayCfg[thisKey] = req.body[thisKey]
            }

        }
        saveGatewayConfig()
        console.log('Gateway configuration updated successfully')
        console.log(gatewayCfg)
    } catch (err) {
      console.log('Failed to update gateway configuration')
      console.log(err)
      req.session.lastError = err.message
    }
    res.redirect(req.headers.referer);
    // res.send({ reload: true });
});

//todo: implement the admin user/pass one


app.get('', async (req, res, next) => { //todo: merge with above functionality or filegateway
	res.redirect('/home.html')
});

//todo: revisit this
app.get('/function/findThreadContainingPost/:board/:postHash', async (req, res, next) => {
    try {
        gatewayCanSeeBoard(req, req.params.board)
        const specificPost = await db.getSpecificPost(req.params.board, req.params.postHash)
        const hashRefIndex = req.params.postHash.indexOf('#');
        if (specificPost.length) { //post was found
            if (specificPost[0].replyto) { //post is a reply
                res.redirect(`/${req.params.board}/thread/${specificPost[0].replyto}.html${hashRefIndex === -1 ? '' : req.params.postHash.substring(hashRefIndex)}`)
            } else { //post is a thread OP
                res.redirect(`/${req.params.board}/thread/${req.params.postHash}.html`) //todo: do we need hash reference here?
            }
        } else { //post not found
            throw new Error(`Thread containing post with hash '${req.params.postHash}' not found.`) //todo: maybe don't make this an error or something, or pre-check the links?
        }
    } catch (err) {
        console.log(err)
        req.session.lastError = err.message
        res.redirect(req.headers.referer) //todo: check if this is working properly
    }
})


async function getBoardStats(whichBoard) {
    try {
        return db.getBoardStats(whichBoard)
    } catch {err} {
        console.log(`Failed to get board stats for /${whichBoard}`)
        console.log(err)
        req.session.lastError = err.message
        return {}
    }
}


//todo: fix redundancy with boards
app.get('/home.html', async (req, res, next) => {
    try {
        if (!localhostIps.includes(req.ip) && gatewayCfg.gatewayMode) {
            res.redirect('/gateway.html');
            return;
        }

        const options = await standardRenderOptions(req, res);
        options.boardStats = {};
        await Promise.all(watchedBoards.map(async (thisBoard) => {
            options.boardStats[thisBoard] = await getBoardStats(thisBoard);
        }));
        const html = await rt['home'](options);
        // resetError(req);
        res.send(html);
    } catch (error) {
        console.log('Failed to open homepage');
        console.log(error);
        req.session.lastError = error.message
    }
});


app.get('/listPeers', async (req, res, next) => {
    try {
        gatewayCanDo(req)
        res.json(await db.listPeers())

    } catch (error) {
        console.log('Failed to list peers')
        console.log(error)
        req.session.lastError = error.message
        res.redirect('home.html')
    }
});


app.get('/files.html', async (req, res, next) => {
    try {
        gatewayCanDo(req)
        const options = await standardRenderOptions(req,res)
        options.files = await db.getAllFileDocuments()
        console.log(options.files)
        const html = await rt['files'](options)
        // resetError(req)
        res.send(html)

    } catch (error) {
        console.log('Failed to open files page')
        console.log(error)
        req.session.lastError = error.message
        res.redirect('home.html')
    }
});

//todo: consider making this a middleware
//todo: some kind of board consideration? so can delete files on x board but not y board, based on canSeeBoards
function gatewayCanDo(req, whichPerm, throwErr = true) { //todo: revisit the name of this?
    if (req.session.loggedIn) {
        return true;
    }
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

//todo: make into middleware
//todo: consolidate with gatewayCanDo()
function gatewayCanSeeBoard(req, whichBoard) {
    if (req.session.loggedIn) {
        return true
    }
    if ((gatewayCfg.gatewayMode) && !gatewayCfg.can.seeAllBoards && !gatewayCfg.canSeeBoards.includes(whichBoard)) {
        throw new Error (`Not permitted to browse /${whichBoard}/.`)
    } else {
        return true
    }
}

function createCheckAccess(req) {
    if (!gatewayCfg.gatewayMode || req.session.loggedIn) {
        return function(req, accessTypes) {
            return true;
        };
    } else {
        return function(req, accessTypes) {
            return accessTypes.every(accessType => {
                try {
                    gatewayCanDo(req, accessType);
                    return true;
                } catch (error) {
                    return false;
                }
            });
        };
    }
}

async function standardRenderOptions (req,res) { //todo: make this into a middleware?
    const renderOptions = {
        clientId: await db.clientId(),
        req: req,
        prefillMessageBox: res.locals.prefillMessageBox,
        nonce: res.locals.nonce,
        boards: watchedBoards,
        specialPageLinks: cfg.specialPageLinks,
        alert: req.session.lastError,
        loggedInAs: req.session.loggedIn,
        watchedBoards: req.visibleBoards, //todo: split visible in top versus visible in gateway manage? nicer way to visualize which are gateway boards or not?
        themes: cssThemes,
        cssTheme: currentCssTheme,
        defaultName: cfg.defaultName, //todo: consolidate cfg where possible
        moderators: moderators,
        renderFunctions: renderFunctions,
        checkAccess: createCheckAccess(req),
        cfg: cfg,
        gatewayCfg: gatewayCfg,            
        myMultiAddr: db.client.libp2p.getMultiaddrs()[0],
        posts: []
    }
    //reset the error
    req.session.lastError = ''
    return renderOptions
}

//gateway stuff
//todo: possibly consolidate with home or make a new settings page
app.get('/gateway.html', async (req, res, next) => {
    try {
        const options = await standardRenderOptions(req,res)
        options.boardStats = {};
        await Promise.all(watchedBoards.map(async (thisBoard) => {
            options.boardStats[thisBoard] = await getBoardStats(thisBoard);
        }));
        const html = await rt['gatewayHome'](options)
        // resetError(req)
        res.send(html)
    } catch (err) {
        console.log('Failed to open gateway homepage')
        console.log(err)
        req.session.lastError = err.message
    }
});

//gateway stuff
app.get('/gatewayconfig.html', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'changeGatewayConfig')
        const options = await standardRenderOptions(req,res)
        options.boardStats = {};
        await Promise.all(watchedBoards.map(async (thisBoard) => {
            options.boardStats[thisBoard] = await getBoardStats(thisBoard);
        }));
        const html = await rt['gatewayConfig'](options)
        // resetError(req)
        res.send(html)
    } catch (err) {
        console.log('Failed to open gateway configuration page')
        console.log(err)
        req.session.lastError = err.message
    }
});

app.post('/gatewayLogin', (req, res) => {
  const { username, password } = req.body;
  try {
    if (gatewayCfg.adminUser && username === gatewayCfg.adminUser && password === gatewayCfg.adminPass) {
      req.session.loggedIn = username;
    } else {
      throw new Error('Invalid username or password.');
    }
  } catch (err) {
    req.session.lastError = err.message
    console.log(err);
  }
  res.redirect(req.headers.referer);
});

app.post('/gatewayLogout', (req, res) => {
  try {
    if (req.session.loggedIn) {
        console.log('req.session.loggedIn', req.session.loggedIn)
      req.session.loggedIn = null;
    } else {
      throw new Error('No session to log out from.');
    }
  } catch (err) {
    req.session.lastError = err.message
    console.log(err);
  }
  res.redirect(req.headers.referer);
});

app.post('/restartClient', async (req, res, next) => {
    try {
        gatewayCanDo(req, 'restartClient')
        await clientReboot(cfg)
    } catch (err) {
        lastQueryResults = 'Error restarting client.'
        console.log('Error restarting client:',err)
        console.log(err)
        req.session.lastError = err.message
    }
    res.redirect('/query.html')
})

app.get('/:board', async (req, res, next) => {
    if (/[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(req.params.board)) {
        res.redirect('/home.html')
    } else {
        res.redirect(`/${req.params.board}/index.html`)
    }
    
})

async function openBoardDbs (board) {
    await db.openPostsDb(board, {replicationFactor: cfg.replicationFactor})
    await addEventListeners(board)
}

async function closeBoardDbs (board) {
    await db.closePostsDb(board)
    // await removeEventListeners(board)
}

async function dropBoardDbs (board) {
    await db.dropPostsDb(board)
    // await removeEventListeners(board)
}

// other event handlers are handled in loadPlugins()
function addEventListeners(board) {
    const whichBoard = db.openedBoards[board];

    //evoked when the local copy of a board is updated
    const boardUpdateHandler = (event) => {
        for (const pluginName in plugins) {
            const plugin = plugins[pluginName];
            plugin.module.onChange(event, board);
        }
    };
    whichBoard.documents.events.addEventListener("change", boardUpdateHandler);
    whichBoard.fileDb.documents.events.addEventListener("change", boardUpdateHandler);
    whichBoard.fileDb.chunks.documents.events.addEventListener("change", boardUpdateHandler);
}

// //remove event listeners
// function removeEventListeners(board) {
//     const whichBoard = db.openedBoards[board];
//     whichBoard.documents.events.removeEventListener("change", globalEventHandler);
//     whichBoard.fileDb.documents.events.removeEventListener("change", globalEventHandler);
//     whichBoard.fileDb.chunks.documents.events.removeEventListener("change", globalEventHandler);
//     console.log(`Event listeners removed for board: ${board}`);
// }

// this can probably be handled fine by the engine
// //store references to event listeners so they can be deleted upon board closing
// const eventListeners = {};

async function clientReboot(cfg) {
    await clientStop()
    cfg = loadConfig()
    await clientBoot(cfg)
    dialBootstrapNodes() //don't await this
}


async function clientStop() {
    await Promise.all(watchedBoards.map(thisBoard => closeBoardDbs(thisBoard)));
    await db.pbStopClient()
}

async function gracefulShutdown() {
  console.log('Stopping node.');

  try {
    await clientStop();
    await new Promise((resolve, reject) => {
        pageServer.close((err) => {
            if (err) {
                console.log(`Error stopping pageserver at ${cfg.browserHost}:${cfg.browserPort}:`, err);
                reject(err);
            } else {
                console.log(`Stopped pageserver at ${cfg.browserHost}:${cfg.browserPort}`);
                resolve();
            }
        });
    });
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}


async function clientBoot(configObject) {

    process.setMaxListeners(0);

    db = await import('./dist/db.js');

    process.on('uncaughtException', (error) => {
        console.error('An uncaught exception occurred:', error.message);
        console.error('Stack trace:', error.stack);
        // process.exit(1);
    });


    try {

        loadCssThemes()
        currentCssTheme = configObject.defaultTheme

        await db.pbInitClient(configObject)
        console.log("Successfully initialized Peerbit node.")
        console.log(`Client ID: ${await db.clientId()}`)

    } catch (err) {

        console.log('Failed to initialize Peerbit node:')
        console.log(err)

    }
    try {

        db.setModerators(moderators)
        db.setRemoteQuery(configObject.remoteQueryPosts, configObject.remoteQueryFileRefs, configObject.remoteQueryFileChunks)

        let dbOpens = configObject.queryFromPanBoardFilesDbIfFileNotFound ? [db.openFilesDb("", { replicationFactor: configObject.replicationFactor }).then(r => console.log("Successfully opened pan-board files database."))] : []

        for (let thisBoard of watchedBoards) {
            dbOpens.push(
                db.openPostsDb(thisBoard, { replicationFactor: configObject.replicationFactor })
                    .then(() => {
                        console.log("Successfully opened database for \/" + thisBoard + "\/.")
                        addEventListeners(thisBoard) //todo: use openBoardDbs here
                    }) 
                    .catch((err) => {
                        console.log("Failed to open database for \/" + thisBoard + "\/:", err)
                        // console.log('posts:', db.openedBoards[thisBoard])
                        // console.log('file references:', db.openedBoards[thisBoard]?.fileDb)
                        // console.log('file chunks:', db.openedBoards[thisBoard]?.fileDb?.chunks)
                    })
            )
        }

        await Promise.all(dbOpens)

    } catch (err) {
        console.log("Error opening databases:")
        console.log(err)
    }
    console.log("Initialization complete.")
}

async function dialBootstrapNodes() {
    if (cfg.bootstrapOnStartup) {
        console.log('Bootstrapping...');
        try {
            const bootstrapAddresses = JSON.parse(fs.readFileSync(configDir + '/bootstrap.json', 'utf8'))['multiAddrs'];
            Promise.all([
                db.bootstrap(),
                Promise.all(bootstrapAddresses.map(async (thisAddress) => {
                    try {
                        await db.connectToPeer(thisAddress);
                    } catch (dialErr) {
                        console.log(`Failed to dial ${thisAddress}:`, dialErr);
                    }
                }))
            ]).then(() => {
                console.log('Bootstrapping complete.');
            });
        } catch (bootstrapErr) {
            console.log("Failed to bootstrap:", bootstrapErr);
        }
    }
}

const plugins = {}

async function loadPlugins() {
    console.log('Loading plugins...')
    try {
        const pluginFolders = fs.readdirSync(pluginDir, { withFileTypes: true })
        for (const pluginFolder of pluginFolders) {
            // Ensure we only process directories
            if (pluginFolder.isDirectory()) {
                const pluginPath = `${pluginDir}/${pluginFolder.name}`
                try {
                    const manifestPath = `${pluginPath}/manifest.json`
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    const pluginModule = await import(`./${pluginPath}/main.js`);
                    plugins[manifest.name] = {
                        manifest,
                        module: pluginModule.default,
                    };
                    console.log(`Loaded plugin: ${manifest.name}`);
                } catch (err) {
                    console.error(`Failed to load plugin in folder: ${pluginFolder.name}`);
                    console.error(err);
                }
            }
        }
    } catch (err) {
        console.error('Failed to read plugins directory.');
        console.error(err);
    }

    //now instantiate the event listeners
    try {
        //evoked when a new post is attempted via /submit, after the validation step
        eventBus.on('newPostPre', (event) => {
            console.log('newPostPre triggered');
            for (const pluginName in plugins) {
                const plugin = plugins[pluginName];
                plugin.module?.newPostPre(event, event.board); 
            }
        });

        //evoked after a new post is successfully made via /submit
        eventBus.on('newPostAfter', (event) => {
            for (const pluginName in plugins) {
                const plugin = plugins[pluginName];
                plugin.module?.newPostAfter(event, event.board); 
            }
        });
    } catch (err) {
        console.error('Failed to instantiate plugin event listeners.')
        console.error(err)
    }



    console.log('Plugins loaded.')
}

// Start the Server
const pageServer = app.listen(cfg.browserPort, cfg.browserHost, () => {
    console.log(`Starting pageserver at ${cfg.browserHost}:${cfg.browserPort}`);
});

(async () => {

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    await loadPlugins()

    await clientBoot(cfg)

    dialBootstrapNodes() //don't await this

    //open the configured homepage
    if (cfg.openHomeOnStartup) {
    	open(`http://${cfg.browserHost}:${cfg.browserPort}/${cfg.openOnStartupUrl}`);
    }


})();



