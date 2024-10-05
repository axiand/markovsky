const { Model } = require('./lib/Model')
const bskyPwd = process.env.MARKOVSKY_PWD
const bskyLogin = process.env.MARKOVSKY_LOGIN

function onLoad() {

}

console.log(process.env)

let model = new Model()
//model.loadWeights("model", onLoad)