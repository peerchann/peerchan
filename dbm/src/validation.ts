'use-strict';

import fs from 'fs';

import { Post } from './posts.js'

const validationConfigDir = 'config' //todo: make this dynamic/more easily configurable?
const vConf = JSON.parse(fs.readFileSync(validationConfigDir + '/validation.json', 'utf8'));

//todo: optimize
const Validate = {
	validationConfigDir,

	post: (inp: Post) => {
		if (!(inp.files.length || inp.message)) {
				throw new Error(`Post had no files or message.`)
		}
		if (BigInt(inp.date) - BigInt(vConf["post"]["date"].futureSecondsAllowed * 1000) > BigInt(Date.now())) { //todo: make more efficient
				throw new Error (`Post was more than ${vConf["post"]["date"].futureSecondsAllowed} seconds in the future.`)
		}
		if (inp.replyto) {
			if (inp.replyto.length != vConf["post"]["replyto"].hashLength) {
				throw new Error (`Post replyto length was not ${vConf["post"]["replyto"].hashLength}.`)
			}
			if (inp.subject) {
				throw new Error (`Post was a reply but had a subject.`)
			}
		}
		if (inp.name) {
			if (inp.name.length > vConf["post"]["name"].maxLength) {
				throw new Error (`Name exceeded max length of ${vConf["post"]["name"].maxLength} characters.`)
			}
		}
		if (inp.subject) {
			if (inp.subject.length > vConf["post"]["subject"].maxLength) {
				throw new Error (`Subject exceeded max length of ${vConf["post"]["subject"].maxLength} characters.`)
			}
		}
		if (inp.email) {
			if (inp.email.length > vConf["post"]["email"].maxLength) {
				throw new Error (`Email exceeded max length of ${vConf["post"]["email"].maxLength} characters.`)
			}
		}
		if (inp.message) {
			if (inp.message.length > vConf["post"]["message"].maxLength) {
				throw new Error (`Message exceeded max length of ${vConf["post"]["message"].maxLength} characters.`)
			}

		}
		if (inp.files.length > vConf["post"]["files"].maxFiles) {
			throw new Error (`File count exceeded maximum of ${vConf["post"]["files"].maxFiles}.`)
		}
		for (let inpFile of inp.files) {
			if (inpFile.hash.length != vConf["post"]["files"].hashLength) {
				throw new Error (`${inpFile.filename} hash was not ${vConf["post"]["files"].hashLength}.`)
			}
			if (inpFile.filename.length > vConf["post"]["files"]["fileName"].maxLength) {
				throw new Error (`${inpFile.filename} filename length exceeded max length of ${vConf["post"]["files"]["fileName"].maxLength}.`)
			}
			if (inpFile.extension && (inpFile.extension.length > vConf["post"]["files"]["extension"].maxLength)) {
				throw new Error (`${inpFile.filename} extension length exceeded max length of ${vConf["post"]["files"]["extension"].maxLength}.`)
			}
			if (inpFile.size > BigInt(vConf["post"]["files"]["size"].maxSize)) {
				throw new Error (`${inpFile.filename} size exceeded max size of ${vConf["post"]["files"]["size"].maxSize}.`)
			}
		}
	},

	file: () => {

	},

	filechunk: () => {

	},

};

export default Validate;