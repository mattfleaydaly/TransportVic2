const express = require('express')
const router = new express.Router()
const utils = require('../../../utils')
const TrainUtils = require('./TrainUtils')

let stoppingTypeMap = {
  sas: 'Stops All',
  limExp: 'Limited Express',
  exp: 'Express'
}

let rrlStations = [ 'footscray', 'sunshine' ]

async function getData(req, res) {
  let station = await res.db.getCollection('stops').findDocument({
    codedName: req.params.station + '-railway-station'
  })

  if (station.bays.find(bay => bay.mode === 'regional train')) {
    let metro = station.bays.find(bay => bay.mode === 'metro train')
    if (metro && !rrlStations.includes(req.params.station)) return { departures: [] }
  } else return { departures: [] }

  return await TrainUtils.getPIDSDepartures(res.db, station, req.params.platform, null, stoppingTypeMap)
}

router.get('/:station/:platform', async (req, res) => {
  res.render('mockups/vline/half-platform', { now: utils.now() })
})

router.post('/:station/:platform/', async (req, res) => {
  let departures = await getData(req, res)
  res.json(departures)
})

module.exports = router
