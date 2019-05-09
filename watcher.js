var fs = require('fs')

const key = 'butt'
fs.watch(`/home/piet/.ssb/${key}.offset`, console.log)
