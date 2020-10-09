// const log = require('~src/handler/log')('app:devconsole:persist')
const uuid = require('uuid/v4')
const getAuth0User = require('~src/api/v1/internal/getAuth0User')
const checkDea = require('~src/api/v1/internal/checkDea')

module.exports = async (req, res) => {
  let auditTrailType = ''
  const mutationTypeTitle = req.params.appId ? 'Update' : 'Create'
  const appId = req.params.appId ? req.params.appId : uuid()
  const appSecret = uuid()
  const call_uuidv4 = res.get('X-Call-Ref') || null

  const data = {
    application_auth0_owner: req.__auth.jwt.sub,
    application_uuidv4: appId,
    application_secret_txt: appSecret,
  }

  try {
    if (typeof req.body !== 'object' || req.body === null) {
      throw new Error(mutationTypeTitle + ' app: Invalid application details')
    }
    
    let updateFields = []

    if (typeof req.body.regenerateSecret === 'boolean' && req.method.toLowerCase() === 'patch') {
      updateFields = [
        'application_secret_txt',
      ]

      Object.assign(data, {
        application_secret_txt: appSecret
      })

      auditTrailType = 'regen_resecret'
    } else if (typeof req.body.removeApp === 'boolean' && req.method.toLowerCase() === 'delete') {
      updateFields = [
        'application_disabled',
      ]

      Object.assign(data, {
        application_disabled: 1
      })

      auditTrailType = 'destroy'
    } else {
      if (typeof req.body.appName !== 'string' || req.body.appName.trim() === '') {
        throw new Error(mutationTypeTitle + ' app: Application name invalid')
      }
      if (typeof req.body.appDescription !== 'string' || req.body.appDescription.trim() === '') {
        throw new Error(mutationTypeTitle + ' app: Application description invalid')
      }
      if (typeof req.body.appIcon !== 'string' || !req.body.appIcon.trim().match(/^https:\/\/xumm-cdn.imgix.net\//)) {
        throw new Error(mutationTypeTitle + ' app: Application icon URL invalid')
      }

      updateFields = [
        'application_name',
        'application_description',
        'application_webhookurl',
        'application_icon_url',
      ]

      Object.assign(data, {
        application_name: req.body.appName.trim(),
        application_description: req.body.appDescription.trim(),
        application_webhookurl: (req.body.appWebhookUrl || '').trim(),
        application_icon_url: req.body.appIcon.trim()    
      })

      auditTrailType = 'update'
    }

    if (req.params.appId) {
      const updateFieldsQueryStr = updateFields.map(u => {
        let output = `${u} = :${u}`
        if (u.match(/_txt$/)) {
          output += `, ${u.replace(/_txt$/, '_bin')} = UNHEX(REPLACE(:${u},'-',''))`
        }
        return output
      }).join(',')

      // Update
      const db = await req.db(`
        UPDATE
          applications
        SET
          ${updateFieldsQueryStr}
        WHERE
          application_auth0_owner = :application_auth0_owner
        AND
          application_uuidv4_txt = :application_uuidv4
        AND
          application_disabled = 0
        LIMIT 1
      `, data)

      // log(db)
      if (db.constructor.name !== 'OkPacket' || typeof db.affectedRows === 'undefined' || !(db.affectedRows > 0)) {
        throw Object.assign(new Error('App update error'), { code: 605 })
      }
    } else {
      auditTrailType = 'create'

      const userDetails = await getAuth0User(req.config.auth0management, data.application_auth0_owner)
      if (typeof userDetails.email_verified !== 'undefined' && !userDetails.email_verified) {
        throw new Error('User email account not verified')
      }
     
      const isDea = await checkDea(userDetails.email)
      if (isDea) {
        throw new Error('User email account is disposable')
      }

      const db = await req.db(`
        INSERT INTO
          applications
        SET
          application_uuidv4_txt = :application_uuidv4,
          application_uuidv4_bin = UNHEX(REPLACE(:application_uuidv4,'-','')),
          application_name = :application_name,
          application_secret_txt = :application_secret_txt,
          application_secret_bin = UNHEX(REPLACE(:application_secret_txt,'-','')),
          application_description = :application_description,
          application_webhookurl = :application_webhookurl,
          application_icon_url = :application_icon_url,
          application_auth0_owner = :application_auth0_owner
      `, data)

      if (typeof db !== 'object' || typeof db.insertId !== 'number' || db.insertId < 1) {
        throw Object.assign(new Error('App create increment error'), { code: 605 })
      }
    }

    /**
     * Insert audit trail information as well
     */
    req.db(`
      INSERT INTO
        auditinfo
      SET
        call_uuidv4_txt = :call_uuidv4,
        call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4,'-','')),
        application_uuidv4_txt = :application_uuidv4,
        application_uuidv4_bin = UNHEX(REPLACE(:application_uuidv4,'-','')),
        auditinfo_type = :auditinfo_type,
        auditinfo_data = :auditinfo_data
    `, {
      call_uuidv4: call_uuidv4,
      application_uuidv4: appId,
      auditinfo_type: 'app_' + auditTrailType,
      auditinfo_data: JSON.stringify({
        ip: req.remoteAddress,
        params: req.params,
        body: req.body,
        headers: req.headers
      })
    })

    const responseJson = {
      [req.params.appId ? 'updated' : 'created']: true,
      uuidv4: appId,
      credentials: {
        secret: null
      }
    }

    if (typeof req.body.appName !== 'undefined') {
      Object.assign(responseJson, {
        name: req.body.appName.trim(),
      })
    }

    if (!(req.params.appId) || updateFields.indexOf('application_secret_txt') > -1) {
      // Secret created or updated
      responseJson.credentials.secret = appSecret
    }

    return res.json(responseJson)
  } catch (e) {
    e.httpCode = e.code = 500
    return res.handleError(e)
  }
}
