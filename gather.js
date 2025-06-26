const { WebSocket } = require("ws")
const { createWriteStream } = require("node:fs")
const { join } = require("path")
const {
    cfgAllowedLangs,
    cfgBackDays,
    cfgSeparator,
    cfgStrictLang,
    cfgStrictLangMode,
    cfgMinLength,
    cfgAdditionalFiltering,
    cfgExcludeTags,
	cfgFilteredKeywords
} = require("./cfg.json")

const COLL = "app.bsky.feed.post"
// take current time, shift backwards by a day times cfgbackdays, mult by 1000 to make it a microsecond stamp
const CURSOR = Math.floor((new Date(Date.now()).getTime() - (1000 * 60 * 60 * 24 * cfgBackDays)) * 1000)
const JETSTREAM_URL = `wss://jetstream.atproto.tools/subscribe?wantedCollections=${COLL}&cursor=${CURSOR}`
const LINK_RGX = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi)
const ENG_RGX = new RegExp(/(?:(?!\p{Emoji}|\p{EComp})[À-῾Ⱡ-ﻼ])+/u)

let totalPosts = 0
let writtenPosts = 0
let filteredPosts = 0

let langAssertion = cfgStrictLangMode ?
    (la) => { return la[0] == cfgStrictLang && la.length == 1 }
    :
    (la) => { return includesAny(la, cfgAllowedLangs) }

// fs.WriteStream extends Stream.Writable
let writeStream = createWriteStream(join(__dirname, "/data/corpus.txt"))

// bool includesAny(Array, Array)
function includesAny(who, what) {
    let found = false
    let i = 0;
    while (what[i] != undefined) {
        if (who.includes(what[i])) { found = true; break; }
        i++;
    }
    return found;
}

let con = new WebSocket(JETSTREAM_URL)

con.on("message", (data) => {
	//console.log(JSON.parse(data))
    let commit = JSON.parse(data).commit

    // jetstream always serves acct/identity events so not everything is a commit
    if (commit == undefined) return

    // we only want creates
    if (commit.operation != "create") return

    let recd = commit.record
    totalPosts++
    // filter langs
    if (recd.langs == undefined || !langAssertion(recd.langs)) return;

    // misc filters to prevent pollution and spam
    let rtext = recd.text
    if (rtext.length < cfgMinLength) return;
    if (rtext.includes(cfgSeparator)) return;
    if (rtext.includes("|")) return;
    if (rtext.match(LINK_RGX)) return;
    if (cfgAdditionalFiltering && rtext.match(ENG_RGX)) return;
    if (cfgExcludeTags && rtext.includes("#")) return;
	if (includesAny(rtext.toLowerCase(), cfgFilteredKeywords)) return filteredPosts++; // apply keyword filter
    //rtext = rtext.trim()

    // now we can write!
    writtenPosts++
    writeStream.write(rtext + cfgSeparator)
})

const logRoutine = setInterval(() => {
    let t = `Posts written: ${writtenPosts.toLocaleString()} // Total seen posts: ${totalPosts.toLocaleString()} // Rejected posts: ${filteredPosts.toLocaleString()}`
    console.log(t)
}, 1000)