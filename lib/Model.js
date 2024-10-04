const { readFileSync, writeFileSync, createReadStream } = require('node:fs')

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

class BinaryWriter {
    buf;
    cursor;

    ui32(n) {
        this.buf.writeUInt32LE(n, this.cursor)
        this.cursor += 4
        return this
    }

    ui16(n) {
        this.buf.writeUInt16LE(n, this.cursor)
        this.cursor += 2
        return this
    }

    str(s) {
        try {
            this.buf.write(s, this.cursor)
            this.cursor += s.length
            return this
        } catch (e) {
            console.log(s)
            throw e;
        }
    }

    byte(b) {
        this.buf.writeUInt8(b, this.cursor)
        this.cursor += 1
        return this
    }

    constructor(len) {
        this.buf = Buffer.alloc(len)
        this.cursor = 0
        return this
    }

}

/*
    struct LutEntry
        string content,
        null byte
    series of null-terminated strings of arbitrary length
*/

/*
    struct Weight
        i32 prev_id,
        i32 cur_id,
        i32 next_id,
        i16 value,
        null byte,
        0x01 byte
    16 bytes per
*/

class Model {
    weights;
    totalWeights;
    ready;
    // str->int lookup map is used during training and writing
    // int->str lookup map is used during string generation
    lookupStrInt;
    lookupIntStr;
    lookupLength;
    lutByteLength;
    loadMode;

    pushLut(string) {
        if (this.lookupStrInt.get(string) != undefined) return
        this.lookupStrInt.set(string, this.lookupLength)
        this.lookupIntStr.set(this.lookupLength, string)
        this.lutByteLength += (string.length + 1)
        this.lookupLength++
    }

    bumpWeight(prev = "<|START|>", current, next = "<|END|>", by = 1) {
        //console.log(prev, current, next, by)
        if (!this.loadMode) this.pushLut(current)
        let seek = `${current}||${prev}`
        if (!this.weights[seek]) this.weights[seek] = []
        let weight = this.weights[seek].find((weight) => { return weight.next == next })

        if (!weight) {
            this.weights[seek].push({ next: next, value: by })
            this.totalWeights++
            return
        }

        weight.value += by
    }

    // mode ? encode : decode
    renderWeights(mode = true) {
        if (mode) {

            for (let weightGroup of Object.keys(this.weights)) {
                let maxWt = sum(this.weights[weightGroup].map((e) => { return e.value }))

                for (let weight of this.weights[weightGroup]) {
                    weight.value = clamp(((weight.value / (maxWt * WEIGHT_BUMP_COEF)) * 100) / 100, 0, 1)
                    weight.value = parseInt(weight.value * 65535)
                }
            }

        } else {

            for (let weightGroup of Object.keys(this.weights)) {
                for (let weight of this.weights[weightGroup]) {
                    weight.value = clamp(weight.value / 65535, 0.001, 1)
                }
            }
            this.ready = true

        }
    }

    writeWeights() {
        console.log("Writing lookup table")
        let lutBin = new BinaryWriter(this.lutByteLength)
        this.lookupStrInt.forEach((_, key) => {
            lutBin.str(key)
            lutBin.byte(0x00)
        })
        writeFileSync('./data/model.lut.dat', lutBin.buf)

        //let weightsOut = ""
        console.log("Writing model contents")
        let weightsBin = new BinaryWriter(this.totalWeights * 16)

        for (let currentGrp of Object.keys(this.weights)) {
            let grpNameSplit = currentGrp.split("||")
            let wtCurrent = grpNameSplit[0]
            let wtPrev = grpNameSplit[1]

            this.weights[currentGrp].forEach((weight) => {
                //weightsOut += `${wtPrev} ${wtCurrent} ${weight.next} ${weight.value.toPrecision(3)} <|>\n`
                //console.log(this.lookupStrInt.get(wtPrev), this.lookupStrInt.get(wtCurrent), this.lookupStrInt.get(weight.next), weight.value)

                weightsBin
                    .ui32(this.lookupStrInt.get(wtPrev))
                    .ui32(this.lookupStrInt.get(wtCurrent))
                    .ui32(this.lookupStrInt.get(weight.next))
                    .ui16(weight.value)
                    .byte(0x00)
                    .byte(0x01)
            })
        }

        writeFileSync('./data/model.dat', weightsBin.buf)
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
        this.loadMode = true
        //load up the lut
        this.initLut() //reinit to get rid of garbage

        let lutString = readFileSync("./data/model.lut.dat", "utf-8")

        for (let item of lutString.split(String.fromCodePoint(0x00))) { // split on every null byte
            this.pushLut(item)
        }

        // stream reader shamelessly stolen from training
        console.log("Loading model from " + path)
        let readStream = createReadStream(path, { highWaterMark: 1024 * 8 })

        let currentRead = Buffer.alloc(16)

        let subcursor = 0
        readStream.on('data', (chunk) => {
            let cursor = 0
            while (chunk[cursor] != null) {
                currentRead[subcursor] = chunk[cursor]
                subcursor++
                cursor++

                if (currentRead[15] == 0x01) {
                    this.bumpWeight(
                        this.lookupIntStr.get(currentRead.readUint32LE(0)),
                        this.lookupIntStr.get(currentRead.readUint32LE(4)),
                        this.lookupIntStr.get(currentRead.readUint32LE(8)),
                        currentRead.readUint16LE(12),
                    )
                    currentRead = Buffer.alloc(16)
                    subcursor = 0
                }
            }
        })

        readStream.on('end', () => {
            this.renderWeights(false)
            console.log("Finished loading model")
            cb()
        })
    }

    initLut() {
        this.lookupStrInt = new Map()
        this.lookupIntStr = new Map()
        this.lookupLength = 0
        this.lutByteLength = 0

        this.pushLut("<|NUL|>")
        this.pushLut("<|START|>")
        this.pushLut("<|END|>")
    }

    constructor() {
        this.weights = {}
        this.totalWeights = 0
        this.ready = false
        this.loadMode = false

        this.initLut()
    }
}

module.exports.Model = Model