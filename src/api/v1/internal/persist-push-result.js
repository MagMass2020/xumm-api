const log = require('~src/handler/log')('app:push:persist-result')

module.exports = async (pushToken, responseJson, db) => {
  try {  
    const response = typeof responseJson === 'object' && responseJson !== null 
      ? responseJson
      : JSON.parse(responseJson)

    const success = Number(response.success || 0) || 0

    return await db(`
      INSERT INTO _push_results (success, push_token, response_json) VALUES (
        :success,
        :pushToken,
        :responseJson
      )
    `, {
      pushToken,
      success,
      responseJson
    })
  } catch (e) {
    log(e)
  }
}
