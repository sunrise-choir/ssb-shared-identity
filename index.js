const pull = require('pull-stream')
const OffsetLog = require('flumelog-offset')
const Validate = require('ssb-validate')
const timestamp = require('monotonic-timestamp')

module.exports = {
  name: 'shared-identity',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  init: function (ssb, config) {
    var log
    var state

    function init () {
      log = OffsetLog('/home/piet/butt.offset', {
        flags: 'a+',
        codec: {
          decode: JSON.parse,
          encode: JSON.stringify,
          buffer: false,
          type: 'ssb'
        }
      })

      state = Validate.initial()

      log.since.once(val => {
        log.get(val, function (err, latestMessage) {
          if (err) throw new Error(err)
          state.feeds[ssb.id] = {
            id: latestMessage.key,
            timestamp: latestMessage.value.timestamp,
            sequence: latestMessage.value.sequence,
            queue: []
          }
        })
      })
    }

    init()
    // CACHE!!?????
    ssb.publish.hook(function (fn, args) {
      publish.apply(this, args)
    })

    function publish (content, cb) {
      Validate.appendNew(state, null, config.keys, content, timestamp())
      var message = state.queue.pop()
      log.append(message, function (err, result) {
        if (err) return cb(err)
        cb(null, message)
      })
    }

    return {
      rebuild: function (opts, cb) {
        if (typeof opts === 'function' && !cb) {
          cb = opts
          opts = {}
        }
        var log = OffsetLog('/home/piet/butt.offset', {
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
          pull.drain(null, function (err) {
            if (err) return cb(err)
            init()
            cb()
          })
        )
      }
    }
  }
}
