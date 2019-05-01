const pull = require('pull-stream')
const OffsetLog = require('flumelog-offset')
const Validate = require('ssb-validate')
const timestamp = require('monotonic-timestamp')

const fs = require('fs-ext')

const logPath = '/home/piet/butt.offset'

module.exports = {
  name: 'shared-identity',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  init: function (ssb, config) {
    function lock (fd) {
      fs.flockSync(fd, 'ex')
    }

    function unlock (fd) {
      fs.flockSync(fd, 'un')
    }

    function publish (content, cb) {
      function done (err, message) {
        unlock(fd)
        cb(err, message)
      }
      var fd = fs.openSync(logPath, 'r')
      lock(fd)

      var log = OffsetLog(logPath, {
        flags: 'a+',
        codec: {
          decode: JSON.parse,
          encode: JSON.stringify,
          buffer: false,
          type: 'ssb'
        }
      })

      var state = Validate.initial()

      log.since.once(val => {
        log.get(val, function (err, latestMessage) {
          if (err) return done(err)
          state.feeds[ssb.id] = {
            id: latestMessage.key,
            timestamp: latestMessage.value.timestamp,
            sequence: latestMessage.value.sequence,
            queue: []
          }
        })

        Validate.appendNew(state, null, config.keys, content, timestamp())
        var message = state.queue.pop()
        log.append(message, function (err, result) {
          if (err) return done(err)
          done(null, message)
        })
      })
    }

    // CACHE!!?????
    ssb.publish.hook(function (fn, args) {
      publish.apply(this, args)
    })

    return {
      rebuild: function (opts, cb) {
        if (typeof opts === 'function' && !cb) {
          cb = opts
          opts = {}
        }
        // TODO: we should probably lock the file here too.
        var log = OffsetLog(logPath, {
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
            cb()
          })
        )
      }
    }
  }
}
