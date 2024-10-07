const { createReadStream, statSync } = require("node:fs")
const { cfgSeparator } = require("./cfg.json")
const { Model } = require("./lib/Model")
const { join } = require("path")

const LEN_SEP = cfgSeparator.length

let readStream = createReadStream(join(__dirname, "/data/corpus.txt"), { encoding: "utf-8", highWaterMark: 1024 * 8 })
let currentRead = ""

let model = new Model()

let corpusSize = statSync(join(__dirname, "/data/corpus.txt")).size

let totalCursor = 0
let totalWeights = 0
let totalParts = 0

function ingestPart(part) {
    let partWords = part.split(" ")
    let curWord = 0

    model.bumpWeight("<|NUL|>", "<|START|>", partWords[0])

    while (partWords[curWord] != null) {
        model.bumpWeight(partWords[curWord - 1], partWords[curWord], partWords[curWord + 1])
        totalWeights++
        curWord++
    }
}

readStream.on('data', (chunk) => {
    let cursor = 0
    while (chunk[cursor] != null) {
        currentRead += chunk[cursor]
        cursor++
        totalCursor++

        if (currentRead.endsWith(cfgSeparator)) {
            ingestPart(
                currentRead
                    .toLowerCase()
                    .slice(0, currentRead.length - LEN_SEP)
            )
            totalParts++
            currentRead = ""
        }
    }
})

readStream.on('end', () => {
    logProgress()
    clearTimeout(logRoutine)
    console.log("Rendering weights...")
    model.renderWeights(true) // encode for writing
    console.log("Training finished.")
    model.writeWeights()
    console.log("All done!")
    model.renderWeights(false) // decode for test string output
    console.log("Have 10 samples of strings:")
    for (i = 0; i < 10; i++) {
        console.log("Here's a string: ", model.getString())
    }
})

function logProgress() {
    console.log(`Weights processed: ${totalWeights.toLocaleString()} // Parts processed: ${totalParts.toLocaleString()} // Approx. progress: ${(totalCursor / corpusSize) * 100}%`)
}

let logRoutine = setInterval(logProgress, 1000)