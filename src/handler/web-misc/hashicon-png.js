const log = require('~src/handler/log')('app:hashicon')
const hashicon = require('hashicon')
const {createCanvas} = require('canvas')
const sharp = require('sharp')
const xTagged = require('xrpl-tagged-address-codec')

module.exports = async (req, res, next) => { 
  res.setHeader('Content-Type', 'image/png')

  let size = 200
  let padding = 0
  let icon

  if (req.params.size) {
    let _size = Number(req.params.size.slice(1))
    if (!isNaN(_size) && _size > 50 && _size < 1000) size = _size
  }

  if (req.params.padding) {
    let _padding = Number(req.params.padding.slice(1))
    if (!isNaN(_padding) && _padding > 0 && _padding < size) padding = _padding
  }

  try {
    const account = xTagged.Encode({account: req.params.account})
    icon = hashicon(account, {createCanvas, size})

    log(req.params.account)

    res.setHeader('Content-Disposition', 'inline; filename=hashicon_' + req.params.account + '_' + size + '.png')
  } catch (e) {
    log('err', req.params.account)
    icon = hashicon('502', {
      createCanvas,
      size,
      saturation: {min: 0, max: 2},
      shift: {min: 1, max: 2},
      hue: {min: 0, max: 1},
      lightness: {min: 20, max: 100},
      variation: {min: 0, max: 20, enabled: false}
    })
  }

  if (padding > 0) {
    const output = await sharp(Buffer.from(icon.toDataURL('image/png').split(',')[1], 'base64'))
      .extend({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        top: padding, left: padding, bottom: padding, right: padding
      }).png().toBuffer()
    return res.send(Buffer.from(output, 'binary'))
  }

  return res.send(Buffer.from(icon.toDataURL('image/png').split(',')[1], 'base64'))
}
