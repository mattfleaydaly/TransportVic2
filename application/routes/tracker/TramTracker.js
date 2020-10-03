const async = require('async')
const express = require('express')
const utils = require('../../../utils')
const url = require('url')
const querystring = require('querystring')
const moment = require('moment')
const tramDestinations = require('../../../additional-data/tram-destinations')
const router = new express.Router()

function adjustTrip(trip, date, today, minutesPastMidnightNow) {
  let origin = trip.origin
  let destination = trip.destination

  let e = utils.encodeName
  trip.url = `/tram/run/${e(trip.origin)}/${trip.departureTime}/${e(trip.destination)}/${trip.destinationArrivalTime}/${trip.date}`

  trip.destination = tramDestinations[destination] || destination
  trip.origin = tramDestinations[origin] || origin

  let {departureTime, destinationArrivalTime} = trip
  let departureTimeMinutes = utils.getMinutesPastMidnightFromHHMM(departureTime)
  let destinationArrivalTimeMinutes = utils.getMinutesPastMidnightFromHHMM(destinationArrivalTime)
  if (destinationArrivalTimeMinutes < departureTimeMinutes) destinationArrivalTimeMinutes += 1440

  trip.active = minutesPastMidnightNow <= destinationArrivalTimeMinutes || date !== today

  return trip
}

router.get('/', (req, res) => {
  res.render('tracker/tram/index')
})

router.get('/fleet', async (req, res) => {
  let {db} = res
  let tramTrips = db.getCollection('tram trips')

  let minutesPastMidnightNow = utils.getMinutesPastMidnightNow()

  let today = utils.getYYYYMMDDNow()

  let {fleet, date} = querystring.parse(url.parse(req.url).query)
  if (date) date = utils.getYYYYMMDD(utils.parseDate(date))
  else date = today

  if (!fleet) {
    return res.render('tracker/tram/by-fleet', {
      tripsToday: [],
      servicesByDay: {},
      fleet: '?',
      date: utils.parseTime(date, 'YYYYMMDD')
    })
  }

  let tramNumber = parseInt(fleet)

  let query = {
    date,
    tram: tramNumber
  }

  let tripsToday = await tramTrips.findDocuments(query)
    .sort({departureTime: 1}).toArray()

  tripsToday = tripsToday.map(trip => adjustTrip(trip, date, today, minutesPastMidnightNow))

  let operationDays = await tramTrips.distinct('date', {
    tram: tramNumber
  })
  let servicesByDay = {}

  await async.forEachSeries(operationDays, async date => {
    let humanDate = date.slice(6, 8) + '/' + date.slice(4, 6) + '/' + date.slice(0, 4)

    servicesByDay[humanDate] = {
      services: await tramTrips.distinct('routeNumber', {
        tram: tramNumber, date
      }),
      date
    }
  })

  res.render('tracker/tram/by-fleet', {
    tripsToday,
    servicesByDay,
    fleet,
    date: utils.parseTime(date, 'YYYYMMDD')
  })
})


router.get('/service', async (req, res) => {
  let {db} = res
  let tramTrips = db.getCollection('tram trips')

  let minutesPastMidnightNow = utils.getMinutesPastMidnightNow()

  let today = utils.getYYYYMMDDNow()

  let {service, date} = querystring.parse(url.parse(req.url).query)
  if (date) date = utils.getYYYYMMDD(utils.parseDate(date))
  else date = today

  if (!service) {
    return res.render('tracker/tram/by-service', {
      tripsToday: [],
      tramsByDay: {},
      service: '',
      date: utils.parseTime(date, 'YYYYMMDD')
    })
  }

  let rawTripsToday = await tramTrips.findDocuments({
    date,
    routeNumber: {
      $in: [
        service, service + 'a', service + 'd' // Optimise for core route
      ]
    }
  }).sort({departureTime: 1, origin: 1}).toArray()

  let tripsToday = rawTripsToday.map(trip => adjustTrip(trip, date, today, minutesPastMidnightNow))

  let operationDays = await tramTrips.distinct('date', {
    routeNumber: service
  })

  let tramsByDay = {}

  await async.forEachSeries(operationDays, async date => {
    let trams = await tramTrips.distinct('tram', {
      date,
      routeNumber: service
    })

    let humanDate = date.slice(6, 8) + '/' + date.slice(4, 6) + '/' + date.slice(0, 4)
    tramsByDay[humanDate] = {
      trams,
      date
    }
  })

  res.render('tracker/tram/by-service', {
    tripsToday,
    tramsByDay,
    service,
    date: utils.parseTime(date, 'YYYYMMDD')
  })
})

module.exports = router
