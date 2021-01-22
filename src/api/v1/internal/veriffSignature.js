const crypto = require('crypto')

module.exports = (data, config) => {
  try {
    const signature = crypto.createHash('sha256')
    let payload

    if (data.constructor === Object) {
      payload = JSON.stringify(data)
    }

    if (data.constructor !== Buffer) {
      payload = Buffer.from(data, 'utf8')
    }

    if (data.constructor === Buffer) {
      payload = data
    }

    signature.update(payload)
    signature.update(Buffer.from(config.veriff.priv, 'utf8'))

    return signature.digest('hex')
  } catch (e) {
    return ''
  }
}
