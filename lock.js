var fs = require('fs-ext')

var fd = fs.openSync('/home/piet/.ssb/butt.offset', 'r')

fs.flockSync(fd, 'ex')
console.log('locked')

setInterval(() => {}, 1000)
