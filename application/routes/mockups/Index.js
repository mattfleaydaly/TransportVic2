const express = require('express')
const router = new express.Router()
const utils = require('../../../utils')
const url = require('url')
const querystring = require('querystring')

router.get('/', (req, res) => {
  res.render('mockups/index')
})

router.get('/get', async (req, res) => {
  let stops = res.db.getCollection('stops')
  let query = querystring.parse(url.parse(req.url).query)
  let {type, value} = query
  if (type === 'fss-escalator') {
    return res.redirect('/mockups/fss-escalator/' + value)
  } else if (type === 'bus-int-pids') {
    let {bay} = query
    let m = value.match(/\/bus\/timings(\/.+)/)
    if (m) {
      m = m[1]
      bay = bay || '*'
      res.redirect('/mockups/bus-int-pids' + m + '/' + bay)
    }
  }
  res.end('what?')
})

module.exports = router