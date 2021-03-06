const express = require('express')
const router = new express.Router()
const getDepartures = require('../../../modules/metro-trains/get-departures')
const moment = require('moment')
const utils = require('../../../utils')
const timingUtils = require('./timing-utils')

async function loadDepartures(req, res) {
  const station = await res.db.getCollection('stops').findDocument({
    codedName: req.params.stationName + '-railway-station'
  })

  if (!station || !station.bays.find(bay => bay.mode === 'metro train')) {
    return res.status(404).render('errors/no-stop')
  }

  let stopHeritageUseDates = await timingUtils.getStopHeritageUseDates(res.db, station)

  let departures = await getDepartures(station, res.db)

  departures = departures.map(departure => {
    departure.pretyTimeToDeparture = utils.prettyTime(departure.actualDepartureTime, true, false)
    departure.headwayDevianceClass = utils.findHeadwayDeviance(departure.scheduledDepartureTime, departure.estimatedDepartureTime, {
      early: 0.5,
      late: 5
    })

    let {trip} = departure
    departure.codedLineName = utils.encodeName(trip.routeName)

    let origin = trip.trueOrigin.slice(0, -16)
    let originDepartureTime = trip.trueDepartureTime
    let destination = trip.trueDestination.slice(0, -16)
    let destinationArrivalTime = trip.trueDestinationArrivalTime

    let currentStation = departure.trip.stopTimings.find(tripStop => tripStop.stopName === station.stopName)
    let stopGTFSID, minutesDiff
    let firstStop = departure.trip.stopTimings[0]

    let departureMinutes = utils.getMinutesPastMidnight(departure.scheduledDepartureTime)

    let fss = departure.trip.stopTimings.find(tripStop => tripStop.stopName === 'Flinders Street Railway Station')
    if (departure.trip.direction === 'Down' && fss) firstStop = fss

    if (currentStation) {
      stopGTFSID = currentStation.stopGTFSID

      minutesDiff = currentStation.departureTimeMinutes - firstStop.departureTimeMinutes
    } else {
      minutesDiff = firstStop.departureTimeMinutes - departureMinutes
      if (minutesDiff < 0) minutesDiff += 1440
    }

    let tripStart = departure.scheduledDepartureTime.clone().add(-minutesDiff, 'minutes')
    let operationDate = utils.getYYYYMMDD(tripStart)

    departure.tripURL = `${utils.encodeName(origin)}/${originDepartureTime}/`
      + `${utils.encodeName(destination)}/${destinationArrivalTime}/`
      + `${operationDate}/${stopGTFSID ? `#stop-${stopGTFSID}` : ''}`

    departure.destinationURL = `/metro/timings/${utils.encodeName(trip.trueDestination).slice(0, -16)}`

    return departure
  })

  return {
    departures,
    station,
    placeholder: 'Destination or platform',
    stopHeritageUseDates
  }
}

router.get('/:stationName', async (req, res) => {
  let response = await loadDepartures(req, res)
  if (response) res.render('timings/metro-trains', response)
})

router.post('/:stationName', async (req, res) => {
  res.render('timings/templates/metro-trains', await loadDepartures(req, res))
})

module.exports = router
