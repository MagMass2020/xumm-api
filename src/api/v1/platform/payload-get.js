// const log = require('~src/handler/log')('app:payload:get')
const getPayloadData = require('~api/v1/internal/payload-data')
const formatPayloadData = require('~api/v1/internal/payload-data-formatter')

module.exports = async (req, res) => {
  if (typeof req.params.payloads_external_meta__meta_string !== 'undefined') {
    /**
     * Custom meta ID lookup
     */
    try {
      const payloadByCustomId = await req.db(`
        SELECT
          payloads.call_uuidv4_txt
        FROM 
          payloads_external_meta
        JOIN payloads ON (
          payloads_external_meta.payload_id = payloads.payload_id
          AND
          payloads_external_meta.application_id = payloads.application_id
        )
        WHERE
          payloads_external_meta.application_id = :application_id
          AND
          payloads_external_meta.meta_string = :payloads_external_meta__meta_string
        LIMIT 1
      `, {
        application_id: req.__auth.application.id || '',
        payloads_external_meta__meta_string: req.params.payloads_external_meta__meta_string
      })
      if (payloadByCustomId.constructor.name === 'Array' && payloadByCustomId.length > 0 && payloadByCustomId[0].constructor.name === 'RowDataPacket') {
        req.params.payloads__payload_id = payloadByCustomId[0].call_uuidv4_txt
      }
    } catch (ce) {
      const e = new Error(`Payload custom ID lookup error`)
      e.causingError = ce
      e.httpCode = 404
      e.code = 409
      return res.handleError(e)
    }
  }

  try {
    // log(req.params)
    /**
     * Check if app is authorized to fetch the payload
     * because it has been created by the requesting app.
     */
    const payloadAuthInfo = await req.db(`
      SELECT 
        payloads.payload_id
      FROM 
        payloads
      WHERE
        call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
      AND
        application_id = :application_id
      LIMIT 1
    `, {
      call_uuidv4: req.params.payloads__payload_id || '',
      application_id: req.__auth.application.id || ''
    })

    if (payloadAuthInfo.constructor.name === 'Array' && payloadAuthInfo.length > 0 && payloadAuthInfo[0].constructor.name === 'RowDataPacket') {
      const payload = await getPayloadData(req.params.payloads__payload_id, req.app, 'api')

      let response = {
        meta: {
          exists: false,
          uuid: null
        },
        application: {},
        payload: {},
        response: {}
      }

      if (payload) {
        req.app.redis.publish(`sign:${req.params.payloads__payload_id}`, { devapp_fetched: true })

        formatPayloadData(payload, response)
      }

      response.custom_meta = {
        identifier: response.meta.custom_identifier || null,
        blob: response.meta.custom_blob || null,
        instruction: response.meta.custom_instruction || null
      }

      delete response.meta.custom_identifier
      delete response.meta.custom_blob
      delete response.meta.custom_instruction

      res.json(response)
      return
    }

    const e = new Error(`Payload not found`)
    e.httpCode = e.code = 404
    return res.handleError(e)
  } catch (ue) {
    const e = new Error(`Payload error`)
    e.causingError = ue
    e.httpCode = e.code = 500
    return res.handleError(e)
  }
}
