// const log = require('~src/handler/log')('app:payload:cancel')
const getPayload = require('~api/v1/platform/payload-get')
const updatePushBadge = require('~api/v1/internal/update-push-badge')

module.exports = async (req, res) => {
  try {
    const potentialPayload = await new Promise((resolve, reject) => {
      getPayload(req, {
        handleError (e) {
          reject(e)
        },
        json (payload) {
          resolve(payload)
        }
      })
    })

    let cancelled = false
    let reason = 'UNKNOWN'

    if (potentialPayload.meta.cancelled) {
      reason = 'ALREADY_CANCELLED'
    } else if (potentialPayload.meta.resolved) {
      reason = 'ALREADY_RESOLVED'
    } else if (potentialPayload.meta.expired) {
      reason = 'ALREADY_EXPIRED'
    } else if (potentialPayload.meta.app_opened) {
      reason = 'ALREADY_OPENED'
    } else {
      cancelled = true
      reason = 'OK'
    }

    if (cancelled === true) {
      await req.db(`
        UPDATE 
          payloads
        SET
          payload_expiration = FROM_UNIXTIME(:now),
          payload_cancelled = 1
        WHERE
          call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
        LIMIT 1
      `, {
        call_uuidv4: potentialPayload.meta.uuid,
        now: new Date() / 1000
      })

      updatePushBadge({ payloadUuid: potentialPayload.meta.uuid }, req.db, req.config)
    }

    res.json({
      result: {
        cancelled,
        reason
      },
      meta: Object.assign(potentialPayload.meta, {
        expired: true
      }),
      custom_meta: potentialPayload.custom_meta
    })

    return
  } catch (e) {
    return res.handleError(e)    
  }
}
