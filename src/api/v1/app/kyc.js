const fetch = require('node-fetch')
const log = require('~src/handler/log')('app:kyc')
const uuid = require('uuid/v4')
const veriffSignature = require('../internal/veriffSignature')

module.exports = async (req, res) => {
  // if (user.constructor.name !== 'OkPacket' || typeof user.insertId === 'undefined' || !(user.insertId > 0))
  // uuid()
  // user_created = FROM_UNIXTIME(:moment_creation),
  // moment_creation = new Date() / 1000
  // user_uuidv4_txt = :user_uuidv4,
  // user_uuidv4_bin = UNHEX(REPLACE(:user_uuidv4,'-','')),

  const existingUserKycSessions = await req.db(`
    SELECT
      kyc_attempt_uuidv4_txt,
      kyc_external_link
    FROM
      kyc_attempt
    WHERE
      kyc_attempt_provider = 'VERIFF'
    AND
      user_id = :user_id
    AND
      kyc_attempt_moment > DATE_SUB(NOW(), INTERVAL 5 DAY)
    AND
      kyc_attempt_final_moment IS NULL
    ORDER BY
      kyc_attempt_id DESC
  `, {
    user_id: req.__auth.user.id
  })

  if (Array.isArray(existingUserKycSessions) && existingUserKycSessions.length > 0) {
    const retrievedKycSession = {
      xummKycId: existingUserKycSessions[0].kyc_attempt_uuidv4_txt,
      error: false,
      error_type: null,
      next: existingUserKycSessions[0].kyc_external_link
    }
    log('KYC_Session_RETRIEVED', {
      user: req.__auth.user,
      retrievedKycSession
    })
    return res.json(retrievedKycSession)
  }

  const xummKycId = uuid()

  const response = {
    xummKycId
  }

  const veriffKycStartBody = JSON.stringify({
    verification: {
      callback: 'https://xumm.app/detect/xapp:app.xumm.kyc?id=' + xummKycId,
      timestamp: new Date().toISOString(),
      vendorData: 'XUMM-KYC:VERIFF:' + xummKycId
    }
  })

  const call = await fetch(req.config.veriff.baseUrl + '/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; Charset=UTF-8',
      'X-AUTH-CLIENT': req.config.veriff.pub,
      'X-SIGNATURE': veriffSignature(veriffKycStartBody, req.config)
    },
    body: veriffKycStartBody
  })

  const veriffResponse = await call.json()

  log('KYC_Session_NEW', {
    user: req.__auth.user,
    xummKycId,
    veriff: veriffResponse
  })

  Object.assign(response, {
    error: true,
    error_type: 'UNKNOWN',
    // ext_status: veriffResponse?.status,
    // ext_id: veriffResponse?.verification?.id
  })

  if (typeof veriffResponse === 'object' && veriffResponse !== null && veriffResponse?.status === 'success') {
    const kycLine = await req.db(`
      INSERT INTO
        kyc_attempt (
          kyc_attempt_provider,
          user_id,
          kyc_attempt_moment,
          kyc_attempt_uuidv4_txt,
          kyc_attempt_uuidv4_bin,
          kyc_attempt_data,
          kyc_external_id,
          kyc_external_link
        ) VALUES (
          'VERIFF',
          :user_id,
          FROM_UNIXTIME(:kyc_attempt_moment),
          :kyc_attempt_uuidv4_txt,
          UNHEX(REPLACE(:kyc_attempt_uuidv4_txt,'-','')),
          :kyc_attempt_data,
          :kyc_external_id,
          :kyc_external_link
        )
    `, {
      user_id: req.__auth.user.id,
      kyc_attempt_moment: new Date() / 1000,
      kyc_attempt_uuidv4_txt: xummKycId,
      kyc_attempt_data: req?.config?.__env === 'dev' ? JSON.stringify(veriffResponse, null, 2) : null,
      kyc_external_id: veriffResponse?.verification?.id,
      kyc_external_link: veriffResponse?.verification?.url
    })

    if (kycLine.constructor.name !== 'OkPacket' || typeof kycLine.insertId === 'undefined' || !(kycLine.insertId > 0)) {
      // DB insert error
      Object.assign(response, {error_type: 'INTERNAL_DB'})
    } else {
      Object.assign(response, {
        error: false,
        error_type: null,
        next: veriffResponse.verification.url
      })
    }
  } else {
    // Unexpected response from Veriff
    Object.assign(response, {error_type: 'EXTERNAL_PROVIDER'})
  }

  try {
    res.json(response)
  } catch (e) {
    res.handleError(e)
  }
}
