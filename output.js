const { Model } = require('./lib/Model')

function onLoad() {
    for (i = 0; i < 1000; i++) {
        console.log("Here's a string: ", model.getString())
        console.log("\n")
    }
}

let model = new Model()
model.loadWeights("./data/model.txt", onLoad)