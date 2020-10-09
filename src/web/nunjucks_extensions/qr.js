const log = require('~src/handler/log')('app:qr')
const nunjucks = require('nunjucks')
const QRCode = require('qrcode-svg')

class qrExtension {
  constructor () {
    this.tags = [ 'qr' ]
    this.parse = (parser, nodes, lexer) => {
      const tok = parser.nextToken()
      // const args = parser.parseSignature(null, true)
      parser.advanceAfterBlockEnd(tok.value)
      const body = parser.parseUntilBlocks('endqr')
      // let errorBody = null
      // if (parser.skipSymbol('error')) {
      //   parser.skip(lexer.TOKEN_BLOCK_END)
      //   errorBody = parser.parseUntilBlocks('endqr')
      // }
      parser.advanceAfterBlockEnd()
      return new nodes.CallExtensionAsync(this, 'run', null, [ body ])
    }

    this.run = (context, body, cb) => {
      // const err = new Error('xxxx')
      const err = null
      // cb(err, body())
      const svg = new QRCode(body().trim()).svg()
      cb(err, new nunjucks.runtime.SafeString(svg))
    }  
  }
}

module.exports = qrExtension
