const { WebSocket } = require("ws")
const { createWriteStream } = require("node:fs")
const {
    cfgAllowedLangs,
    cfgBackDays,
    cfgSeparator,
    cfgStrictLang,
    cfgStrictLangMode,
    cfgMinLength
} = require("./cfg.json")

const COLL = "app.bsky.feed.post"
// take current time, shift backwards by a day times cfgbackdays, mult by 1000 to make it a microsecond stamp
const CURSOR = Math.floor((new Date(Date.now()).getTime() - (1000 * 60 * 60 * 24 * cfgBackDays)) * 1000)
const JETSTREAM_URL = `wss://jetstream.atproto.tools/subscribe?wantedCollections=${COLL}&cursor=${CURSOR}`
const LINK_RGX = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi)
//const CLEAN_RGX = new RegExp(/[^\w\s]/gi)

let totalPosts = 0
let writtenPosts = 0

let langAssertion = cfgStrictLangMode ?
    (la) => { return la[0] == cfgStrictLang }
    :
    (la) => { return includesAny(la, cfgAllowedLangs) }

// fs.WriteStream extends Stream.Writable
let writeStream = createWriteStream("./data/corpus.txt")

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
    let commit = JSON.parse(data).commit

    // we only want creates
    if (commit.type != "c") return

    // jetstream always serves acct/identity events so filter that out too
    if (commit.collection != COLL) return

    let recd = commit.record
    totalPosts++
    // filter langs
    if (recd.langs == undefined || !langAssertion(recd.langs)) return;

    // misc filters to prevent pollution and spam
    let rtext = recd.text
    if (rtext.length < cfgMinLength) return;
    if (rtext.includes(cfgSeparator)) return;
    if (rtext.includes("<|>")) return;
    if (rtext.includes("||")) return;
    if (rtext.includes("<|START|>")) return;
    if (rtext.match(LINK_RGX)) return;
    //rtext = rtext.trim()

    // now we can write!
    writtenPosts++
    writeStream.write(rtext + cfgSeparator)
})

const logRoutine = setInterval(() => {
    let t = `Posts written: ${writtenPosts.toLocaleString()} // Total seen posts: ${totalPosts.toLocaleString()}`
    console.log(t)
}, 1000)