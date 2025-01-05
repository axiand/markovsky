const { WebSocket } = require("ws")
const fetch = require("node-fetch")
const { createWriteStream, writeFile } = require("node:fs")
const { join } = require("path")
const {
    cfgAllowedLangs,
    cfgBackDays,
    cfgSeparator,
    cfgStrictLang,
    cfgStrictLangMode,
    cfgMinLength,
    cfgAdditionalFiltering,
    cfgExcludeTags
} = require("./cfg.json")

const COLL = "app.bsky.feed.post"
// take current time, shift backwards by a day times cfgbackdays, mult by 1000 to make it a microsecond stamp
const CURSOR = Math.floor((new Date(Date.now()).getTime() - (1000 * 60 * 60 * 24 * cfgBackDays)) * 1000)
const JETSTREAM_URL = `wss://jetstream.atproto.tools/subscribe?wantedCollections=${COLL}`
const LINK_RGX = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi)
const ENG_RGX = new RegExp(/(?:(?!\p{Emoji}|\p{EComp})[À-῾Ⱡ-ﻼ])+/u)

let totalPosts = 0
let writtenPosts = 0
let perSec = 0

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
    let jdata = JSON.parse(data)
    let commit = jdata.commit

    // jetstream always serves acct/identity events so not everything is a commit
    if (commit == undefined) return

    // we only want creates
    if (commit.operation != "create") return

    let recd = commit.record
    let emb = recd.embed
    if (!emb || emb["$type"] != "app.bsky.embed.images") return
    for (img of emb.images) {
        let link = `https://cdn.bsky.app/img/feed_thumbnail/plain/${jdata.did}/${img.image.ref["$link"]}@webp`
        //console.log(`${img.alt || "no alt"} - https://cdn.bsky.app/img/feed_fullsize/plain/${jdata.did}/${img.image.ref["$link"]}@jpeg`)
        totalPosts++
        console.log(`- [ ${totalPosts} ]  [ ${writtenPosts} ] - I saw`)

        fetch(link)
            .then(async (v) => {
                let body = await v.buffer()
                await writeFile(join(__dirname, `/bigdump/${Date.now()}.webp`), body, () => { totalPosts--; writtenPosts++; perSec++; console.log(`- [ ${totalPosts} ]  [ ${writtenPosts} ] - I wrote`) })
            })
    }
    /*
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
    //rtext = rtext.trim()

    // now we can write!
    writtenPosts++
    writeStream.write(rtext + cfgSeparator)*/
})

const logRoutine = setInterval(() => {
    let t = `Ps: ${perSec}`
	perSec = 0
    console.log(t)
}, 1000)