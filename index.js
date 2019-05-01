const pull = require('pull-stream')
var OffsetLog = require('flumelog-offset')
module.exports = {
  name: 'shared-identity',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  init: function (ssb, config) { 
    // CACHE!!?????
    return {
      rebuild: function (opts, cb) {
        if (typeof opts === 'function' && !cb) {
          cb = opts
          opts = {}
        }
        var log = OffsetLog('/Users/matt/butt.offset', {
          flags: 'w',
          codec: {
            decode: JSON.parse,
            encode: JSON.stringify,
            buffer: false,
            type: 'ssb'
          }
        })
        pull(
          ssb.createUserStream({ id: ssb.id, live: false }),
          pull.asyncMap((msg, cb) => {
            log.append([msg], cb)
            console.log('+')
          }),
          pull.drain(null, cb)
        )
      }
    }
  }
}
