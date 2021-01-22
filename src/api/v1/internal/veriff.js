const log = require('~src/handler/log')('app:internal:veriffCallback')
const veriffSignature = require('./veriffSignature')

const veriffFinalCodes = {
  '9001': 'Positive: Person was verified',
  '9102': 'Negative: Person has not been verified',
  '9104': 'Negative: Verification has been expired'
}

module.exports = async (req, res) => {
  // events
  // decisions
  // https://developers.veriff.com/#response-and-error-codes

  try {
    const veriffCallback =  {
      veriff: true,
      signatureValid: (req?.headers['x-signature'] || 'NO_SIGNATURE') === veriffSignature(req?.rawBody, req.config),
      params: req?.params?.action,
      data: req?.body,
      attempt: null
      // ip: req.remoteAddress,
      // endpoint: req.url,
      // query: req.query,
      // config: Object.assign({}, { ...(req.config.veriff), priv: '_' }),
    }

    const matchingAttempt = await req.db(`
      SELECT
        kyc_attempt_id,
        user_id
      FROM
        kyc_attempt
      WHERE
        kyc_external_id = :kyc_external_id
      AND
        kyc_attempt_uuidv4_bin = UNHEX(REPLACE(:kyc_attempt_uuidv4_txt,'-',''))
      AND
        kyc_attempt_provider = 'VERIFF'
      ORDER BY
        kyc_attempt_id DESC
    `, {
      kyc_external_id: req?.body?.verification?.id || req?.body?.id,
      kyc_attempt_uuidv4_txt: ((req?.body?.verification?.vendorData || req?.body?.vendorData) || '').split(':').reverse()[0],
    })

    if (Array.isArray(matchingAttempt) && matchingAttempt.length > 0 && matchingAttempt[0].constructor.name === 'RowDataPacket') {
      Object.assign(veriffCallback, {attempt: matchingAttempt[0]})

      const queryParams = {
        kyc_attempt_id: veriffCallback?.attempt?.kyc_attempt_id, 
        user_id: veriffCallback?.attempt?.user_id,
        kyc_result_moment: new Date() / 1000,
        kyc_result_status: (veriffCallback?.data?.verification?.status || veriffCallback?.data?.status) || veriffCallback?.data?.action,
        kyc_result_code: veriffCallback?.data?.verification?.code || veriffCallback?.data?.code,
        kyc_result_reason: veriffCallback?.data?.verification?.reason || veriffCallback?.data?.reason,
        kyc_result_reason_code: veriffCallback?.data?.verification?.reasonCode || veriffCallback?.data?.reasonCode,
        kyc_result_data: req?.config?.__env === 'dev' ? JSON.stringify(veriffCallback?.data, null, 2) : null
      }

      await req.db(`
        INSERT INTO
          kyc_attempt_update (
            kyc_attempt_id,
            user_id,
            kyc_result_moment,
            kyc_result_status,
            kyc_result_code,
            kyc_result_reason,
            kyc_result_reason_code,
            kyc_result_data
          ) VALUES (
            :kyc_attempt_id,
            :user_id,
            FROM_UNIXTIME(:kyc_result_moment),
            :kyc_result_status,
            :kyc_result_code,
            :kyc_result_reason,
            :kyc_result_reason_code,
            :kyc_result_data
          )
      `, queryParams)

      if (Object.keys(veriffFinalCodes).indexOf(String(queryParams.kyc_result_code)) > -1) {
        Object.assign(veriffCallback, {
          __FINAL: true,
          __FINAL_REASON: veriffFinalCodes[String(queryParams.kyc_result_code)],
          __FINAL_DB_RESULT: await req.db(`
            UPDATE
              kyc_attempt
            SET
              kyc_attempt_final_moment = NOW()
            WHERE
              kyc_attempt_id = :kyc_attempt_id
            AND
              user_id = :user_id
          `, queryParams)
        })
      } else {
        // Statsus update is non-final
        if (['string', 'number'].indexOf(typeof queryParams.kyc_result_reason_code) > -1) {
          // Status update contains a reason, user should be informed
          // TODO: INFORM USER (PUSH NOTIFICATION?)
          log({INFORM_USER_KYC: 'ADDITIONAL_INFO_REQUIRED'})
        }
      }

      // if (kycLine.constructor.name !== 'OkPacket' || typeof kycLine.insertId === 'undefined' || !(kycLine.insertId > 0)) {
      //   // DB insert error
      // } else {
      // }
    }

    // if (req.params.action === 'events' || req.params.action === 'decisions') {
    //   log(req.body)
    // }
    // if (req.params.action === 'check') {
    //   const sid = '1d25701e-5b25-4379-b754-ca54147b76d9'
    //   const call = await fetch(req.config.veriff.baseUrl + '/v1/sessions/' + sid + '/decision', {
    //     headers: {
    //       'Content-Type': 'application/json; Charset=UTF-8',
    //       'X-AUTH-CLIENT': req.config.veriff.pub,
    //       'X-SIGNATURE': veriffSignature(sid, req.config)
    //     }
    //   })
    //   const verification = await call.json()
    //   log({verification})
    //   Object.assign(d, {verification})
    // }

    log('veriffCallback', veriffCallback)

    return res.json({
      signatureValid: veriffCallback.signatureValid,
      attemptFound: Boolean(veriffCallback.attempt)
    })
  } catch (e) {
    return res.handleError(e)
  }
}
