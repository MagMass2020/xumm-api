const log = require('~src/handler/log')('app:payload-data')
const failOnDisabled = false

module.exports = async (uuid, expressApp, invoker) => {
  const db = expressApp.db

  let payloadUuid = ''
  if (typeof uuid === 'object' && uuid !== null && typeof uuid.uuid !== 'undefined') {
    payloadUuid = uuid.uuid 
  } else if (typeof uuid === 'string') {
    payloadUuid = uuid
  }

  const v4 = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)
  if (payloadUuid.match(v4)) {
    const dbResults = await db(`
      SELECT
        applications.application_name,
        applications.application_description,
        applications.application_disabled,
        applications.application_uuidv4_txt as application_uuidv4,
        applications.application_icon_url,
        payloads.payload_tx_type,
        payloads.payload_tx_destination,
        payloads.payload_tx_destination_tag,
        payloads.payload_request_json,
        payloads.payload_multisign,
        payloads.payload_submit,
        payloads.call_uuidv4_txt as _uuid,
        payloads.payload_origintype,
        payloads.payload_signmethod,
        payloads.payload_tx_destination as _destination,
        IF (knownaccounts.knownaccount_name IS NULL OR knownaccounts.knownaccount_name = '', payloads.payload_tx_destination, knownaccounts.knownaccount_name) as _resolved_destination,
        IF (payloads.payload_handler IS NULL, 0, 1) as _resolved,
        IF (payloads.payload_response_hex IS NULL OR payloads.payload_response_hex = '', 0, 1) as _signed,
        IF (payloads.payload_cancelled IS NULL, 0, 1) as _cancelled,
        IF (payloads.payload_expiration >= FROM_UNIXTIME(:payload_expiration), 0, 1) as _expired,
        IF (payloads.token_id IS NOT NULL, 1, 0) as _pushed,
        IF (payloads.payload_app_opencount > 0, 1, 0) as _app_opened,
        IF (payloads.payload_app_opencount > 0, IF(payloads.payload_web_opencount > 0, 0, 1), NULL) as _opened_by_deeplink,
        DATE_FORMAT(payloads.payload_created, '%Y-%m-%dT%H:%i:%sZ') as payload_created_at,
        DATE_FORMAT(payloads.payload_expiration, '%Y-%m-%dT%H:%i:%sZ') as payload_expires_at,
        payloads.payload_return_url_app,
        payloads.payload_return_url_web,
        payloads.payload_response_hex as response_hex,
        payloads.payload_response_txid as response_txid,
        payloads.payload_resolved as response_resolved_at,
        payloads.payload_dispatched_to as response_dispatched_to,
        payloads.payload_dispatched_result as response_dispatched_result,
        payloads.payload_dispatched_nodetype as response_dispatched_nodetype,
        payloads.payload_response_multisign_account as response_multisign_account,
        payloads.payload_response_account as response_account,
        tokens.token_accesstoken_txt as application_issued_user_token,
        (UNIX_TIMESTAMP(CURRENT_TIMESTAMP) - UNIX_TIMESTAMP(payloads.payload_expiration)) * -1 as payload_expires_in_seconds,
        payloads_external_meta.meta_string as meta_custom_identifier,
        payloads_external_meta.meta_blob as meta_custom_blob,
        payloads_external_meta.meta_user_instruction as meta_custom_instruction,
        payload_xapp_event as meta_is_xapp
      FROM 
        payloads
      JOIN
        applications ON (
          payloads.application_id = applications.application_id
        )
      LEFT JOIN
        knownaccounts ON (
          payloads.payload_tx_destination = knownaccounts.knownaccount_account
        )
      LEFT JOIN
        tokens ON (
          tokens.payload_uuidv4_bin = payloads.call_uuidv4_bin
        )
      LEFT JOIN
        payloads_external_meta ON (
          payloads_external_meta.payload_id = payloads.payload_id
          AND
          payloads_external_meta.application_id = payloads.application_id
        )
      WHERE 
        payloads.call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
      ORDER BY 
        payloads.payload_id DESC
      LIMIT 1
    `, {
      call_uuidv4: payloadUuid,
      payload_expiration: new Date() / 1000
    })

    if (dbResults.constructor.name === 'Array' && dbResults.length > 0 && dbResults[0].constructor.name === 'RowDataPacket') {
      if ([ 'web', 'app', 'ws', 'api' ].indexOf(invoker) > -1 && dbResults[0]._expired < 1) {
        // Update counters, only if requested while not expired
        db(`
          UPDATE
            payloads
          SET
            payload_${invoker}_opencount = payload_${invoker}_opencount + 1
          WHERE 
            call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
          LIMIT 1
        `, {
          call_uuidv4: payloadUuid
        })
      }

      if (dbResults[0].application_disabled > 0 && failOnDisabled) {
        log(`   !! Application disabled [ ${dbResults[0].application_name} ]`, payloadUuid)
        throw new Error('Application disabled')
      } else {
        log(`   ✓ ${ dbResults[0]._expired > 0 ? '<< EXPIRED >> ' : '' }Payment Data for [ ${dbResults[0].application_name} ]`, payloadUuid)
      }

      const json = JSON.parse(dbResults[0].payload_request_json)
      if (typeof json.Memos !== 'undefined') {
        Object.assign(dbResults[0], {
          payload_computed: {
            Memos: json.Memos.map(m => {
              let r = { Memo: {} }
              if (typeof m.Memo !== 'undefined') {
                Object.keys(m.Memo).forEach(k => {
                  let value = Buffer.from(m.Memo[k], 'hex').toString('utf8')
                  r.Memo[k] = (value.length > 1 && value.match(/[a-zA-Z0-9]+/i)) ? value : m.Memo[k]
                })
              }
              return r
            })
          }
        })
      }
      return Object.assign(dbResults[0], {
        payload_request_json: json
      })
    } else {
      log('<< NO >> Payment Data for', payloadUuid)
      return false
    }
  } else {
    log('<< ERR: Invalid payload UUID >> Payment Data for', payloadUuid)
    throw new Error('Invalid payload UUID')
  }

  // await timeout(3000)
  return false
}
