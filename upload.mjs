import { XRPC, CredentialManager } from '@atcute/client'
import { writeFileSync, readFileSync } from 'node:fs'
import { Model } from './lib/Model.js'
const bskyPwd = process.env.MARKOVSKY_PWD
const bskyLogin = process.env.MARKOVSKY_LOGIN
let authState
let mgr
let rpc
let model

try {
    let rawjson = readFileSync("./data/authState.json", "utf-8")
    authState = JSON.parse(rawjson)
} catch (e) {
    console.log("no auth state file; it will be created on successful login")
}

async function createPost() {
    console.log("creating record")
    let strOut = model.getString()
    console.log(strOut)

    let resp = await rpc.call('com.atproto.repo.createRecord', {
        headers: {
            "Content-Type": "application/json"
        },
        data: {
            "collection": "app.bsky.feed.post",
            "repo": mgr.session.did,
            "record": {
                "$type": "app.bsky.feed.post",
                "createdAt": new Date(Date.now()).toISOString(),
                "text": strOut.slice(0, 299)
            }
        }
    })

    console.log(resp)
}

async function buildSession() {
    console.log("creating bluesky session")
    mgr = new CredentialManager({ service: "https://bsky.social" })
    rpc = new XRPC({ handler: mgr })
    if (authState != null) {
        console.log("using cached auth details")
        await mgr.resume(authState)
    } else {
        console.log("logging in")
        await mgr.login({ identifier: bskyLogin, password: bskyPwd })
    }
    console.log("Posting as: " + mgr.session.handle)
}

async function main() {
    model = new Model()

    await buildSession()

    writeFileSync("./data/authState.json", JSON.stringify(mgr.session))

    model.loadWeights("model", createPost)
}

main()