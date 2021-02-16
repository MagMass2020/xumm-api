const log = require('~src/handler/log')('app:web:xapp-redir')

module.exports = async (req, res, next) => {
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

  if (Array.isArray(xappFound) && xappFound.length > 0) {
    if (typeof xappFound[0].application_xapp_url === 'string' && xappFound[0].application_xapp_url !== '') {
      return res.status(301).redirect(
        xappFound[0].application_xapp_url
          + (xappFound[0].application_xapp_url.match(/\?/) ? '&' : '?')
          + 'xAppToken=' + 'xxxxxx'
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
}
