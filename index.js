const pull = require('pull-stream')
const OffsetLog = require('flumelog-offset')
const Validate = require('ssb-validate')
const timestamp = require('monotonic-timestamp')

const fs = require('fs-ext')

module.exports = {
  name: 'shared-identity',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  init: function (ssb, config) {
    var refreshing = false
    var pendingRefresh = false

    function watch () {
      return fs.watch(logPath(), () => {
        console.log('file defo changed, refreshing, pending', refreshing, pendingRefresh)
        if (!refreshing) {
          refresh()
        } else {
          pendingRefresh = true
        }
      })
    }
    function refresh () {
      refreshing = true
      if (!fs.existsSync(logPath())) {
        rebuild()
        return
      }

      var log = OffsetLog(logPath(), {
        flags: 'r',
        codec: {
          decode: JSON.parse,
          encode: JSON.stringify,
          buffer: false,
          type: 'ssb'
        }
      })

      ssb.latestSequence(ssb.id, function (err, latestSeq) {
        if (err) throw new Error(err)
        pull(
          log.stream({ reverse: true }),
          pull.through(console.log),
          pull.map(data => data.value.value),
          pull.take((value) => value.sequence > latestSeq),
          pull.collect(function (err, msgs) {
            if (err) return console.error(err)
            pull(
              pull.values(msgs.reverse()),
              pull.asyncMap(ssb.add),
              pull.drain(null, () => {
                refreshing = false
                if (pendingRefresh) {
                  setTimeout(() => {
                    pendingRefresh = false
                    refresh()
                  }, 50)
                }
              })
            )
          })
        )
      })
    }

    try {
      var watcher = watch(refresh)
    } catch (ex) {
      console.log('no watch, ex:', ex)
      rebuild() // just assume the file isn't there. What could go wrong?
    }

    function lock (fd) {
      fs.flockSync(fd, 'ex')
    }

    function unlock (fd) {
      fs.flockSync(fd, 'un')
    }

    function logPath () {
      // const id = ssb.id
      const id = 'butt'
      const path = config.path
      return `${path}/${id}.offset` // TODO path.join
    }

    function publish (content, cb) {
      var fd = fs.openSync(logPath(), 'r')

      function done (err, message) {
        unlock(fd)
        cb(err, message)
      }
      lock(fd)

      var log = OffsetLog(logPath(), {
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

    function rebuild (opts, cb) {
      if (watcher) {
        watcher.close()
      }

      refreshing = true

      if (typeof opts === 'function' && !cb) {
        cb = opts
        opts = {}
      }
      // TODO: we should probably lock the file here too.
      var log = OffsetLog(logPath(), {
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
          if (err) return cb && cb(err)
          watcher = watch()
          refreshing = false
          cb && cb()
        })
      )
    }
    return {
      rebuild
    }
  }
}
