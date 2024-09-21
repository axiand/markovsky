const { writeFileSync, createReadStream } = require('node:fs')

// value between 0-1. less = more bump
const WEIGHT_BUMP_COEF = 0.9

function sum(nums) {
    let sum = 0
    for (let num of nums) { sum += new Number(num) }
    return sum
}

function clamp(num, mn, mx) {
    return Math.min(Math.max(num, mn), mx)
}

class Model {
    weights;
    ready;

    bumpWeight(prev = "<|START|>", current, next = "<|END|>", by = 1) {
        let seek = `${current}||${prev}`
        if (!this.weights[seek]) this.weights[seek] = []
        let weight = this.weights[seek].find((weight) => { return weight.next == next })

        if (!weight) {
            this.weights[seek].push({ next: next, value: by })
            return
        }

        weight.value += by
    }

    renderWeights() {
        for (let weightGroup of Object.keys(this.weights)) {
            let sortedGroup = this.weights[weightGroup].sort((a, b) => { return a.value - b.value }).reverse()
            let maxWt = sum(sortedGroup.map((e) => { return e.value }))

            for (let weight of this.weights[weightGroup]) {
                weight.value = clamp(((weight.value / (maxWt * WEIGHT_BUMP_COEF)) * 100) / 100, 0, 1)
            }
        }

        this.ready = true;
    }

    writeWeights() {
        let weightsOut = ""

        for (let currentGrp of Object.keys(this.weights)) {
            let grpNameSplit = currentGrp.split("||")
            let wtCurrent = grpNameSplit[0]
            let wtPrev = grpNameSplit[1]

            this.weights[currentGrp].forEach((weight) => { weightsOut += `${wtPrev} ${wtCurrent} ${weight.next} ${weight.value.toPrecision(3)} <|>\n` })
        }

        writeFileSync('./data/model.txt', weightsOut)
    }

    stepWord(wts) {
        let idx = 0
        let word

        while (word == null) {
            if (Math.random() < wts[idx].value) {
                word = wts[idx].next
                break
            }
            idx++
            if (wts[idx] == null) idx = 0
        }

        return word
    }

    getString(maxLength = 300, fill = null) {
        if (!this.ready) throw "model not ready; render weights first"
        let current = "<|START|>"
        let prev = "<|NUL|>"
        let strOut = ""

        // autocomplete mode
        if (fill != null) {
            let fillSplit = fill.split(" ")
            current = fillSplit[fillSplit.length - 1]
            prev = fillSplit[fillSplit.length - 2] || "<|START|>"
            strOut = fill + " "
        }

        while (strOut.length < maxLength) {
            let nextWeights = this.weights[`${current}||${prev}`]
            let nextW
            try {
                nextW = this.stepWord(nextWeights)
            } catch (err) {
                console.log("i died :(")
                console.log(strOut)
                console.log(current, prev)
                throw err;
            }

            if (nextW == "<|END|>") break;

            strOut += nextW + " "
            prev = current
            current = nextW
        }

        return strOut
    }

    loadWeights(path, cb) {
        // stream reader shamelessly stolen from training
        console.log("Loading model from " + path)
        let readStream = createReadStream(path, { encoding: "utf-8", highWaterMark: 1024 * 8 })

        let currentRead = ""

        readStream.on('data', (chunk) => {
            let cursor = 0
            while (chunk[cursor] != null) {
                currentRead += chunk[cursor]
                cursor++

                if (currentRead.endsWith("<|>\n")) {
                    let wtParts = currentRead.split(" ")
                    this.bumpWeight(wtParts[0], wtParts[1], wtParts[2], parseFloat(wtParts[3]))
                    currentRead = ""
                }
            }
        })

        readStream.on('end', () => {
            this.ready = true
            console.log("Finished loading model")
            cb()
        })
    }

    constructor() {
        this.weights = {}
        this.ready = false
    }
}

module.exports.Model = Model