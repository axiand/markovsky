const { Model } = require('./lib/Model')

function onLoad() {
    console.log(JSON.stringify(model.lookupStrInt.entries()))
    for (i = 0; i < 500; i++) {
        console.log(model.getString())
        console.log("--\n")
    }
}

let model = new Model()
model.loadWeights("model", onLoad)