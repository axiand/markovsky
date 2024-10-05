const { Model } = require('./lib/Model')

function onLoad() {
    for (i = 0; i < 24; i++) {
        console.log(model.getString())
        console.log("--\n")
    }
}

let model = new Model()
model.loadWeights("model", onLoad)