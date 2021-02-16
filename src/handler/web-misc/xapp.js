const log = require('~src/handler/log')('app:web:xapp-redir')

module.exports = async (req, res, next) => {
  try {
    let xummUa = false

    if (typeof req.headers['user-agent'] !== 'undefined') {
      if (req.headers['user-agent'].split(':')[0] === 'xumm/xapp') {
        xummUa = true
      }
    }

    if (!xummUa) {
      throw Error('Invalid xApp invoke')
    }

    const xappFound = await req.db(`
      SELECT
        application_xapp_identifier,
        application_xapp_url
      FROM applications WHERE application_xapp_identifier = :xapp
    `, {xapp: req.params.app})

    const xappErrorPageParams = {
      ott: req?.query?.xAppToken,
      module: 'xapps',
      mode: req.config.mode,
      xAppIdentifier: req?.params?.app,
      headers: req.headers,
      xappFound,
      // loadedInXumm: Object.keys(headers).length > 0
    }

    // log({xappErrorPageParams})

    if (Array.isArray(xappFound) && xappFound.length > 0) {
      if (typeof xappFound[0].application_xapp_url === 'string' && xappFound[0].application_xapp_url !== '') {
        return res.status(301).redirect(
          xappFound[0].application_xapp_url
            + (xappFound[0].application_xapp_url.match(/\?/) ? '&' : '?')
            + 'xAppToken=' + req?.query?.xAppToken
        )
      } else {
        return res.render('xapps/index.html', {
          ...xappErrorPageParams,
          error: { code: 500, desc: 'Not configured' }
        })  
      }
    } else {
      return res.render('xapps/index.html', {
        ...xappErrorPageParams,
        error: { code: 404, desc: 'Not found' }
      })
    }
  } catch (e) {
    log({e})
    res.status(404).render('500', { error: e.message })
  }
}
