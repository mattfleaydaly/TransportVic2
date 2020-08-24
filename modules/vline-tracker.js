const async = require('async')
const urls = require('../urls.json')
const config = require('../config')
const utils = require('../utils')
const moment = require('moment')
const cheerio = require('cheerio')
const DatabaseConnection = require('../database/DatabaseConnection')

const database = new DatabaseConnection(config.databaseURL, config.databaseName)
let dbStops
let refreshRate = 30

function shouldRun() {
  let minutes = utils.getMinutesPastMidnightNow()

  return 270 <= minutes && minutes <= 1260 // 0430 - 2100
}

async function getStationFromVNETName(vnetStationName, db) {
  const station = await db.getCollection('stops').findDocument({
    bays: {
      $elemMatch: {
        mode: 'regional train',
        vnetStationName
      }
    }
  })

  return station
}

async function getVNETDepartures(direction, db) {
  let url = urls.vlinePlatformDepartures.format('', direction).slice(0, -3) + '600'
  const body = (await utils.request(url)).replace(/a:/g, '')
  const $ = cheerio.load(body)
  const allServices = Array.from($('PlatformService'))

  let mappedDepartures = []

  await async.forEach(allServices, async service => {
    function $$(q) {
      return $(q, service)
    }

    let originDepartureTime = utils.parseTime($$('ScheduledDepartureTime').text())
    let destinationArrivalTime = utils.parseTime($$('ScheduledDestinationArrivalTime').text())
    let runID = $$('ServiceIdentifier').text()
    let originVNETName = $$('Origin').text()
    let destinationVNETName = $$('Destination').text()

    let accessibleTrain = $$('IsAccessibleAvailable').text() === 'true'
    let barAvailable = $$('IsBuffetAvailable').text() === 'true'

    let vehicle = $$('Consist').text().replace(/ /g, '-')
    let vehicleConsist = $$('ConsistVehicles').text().replace(/ /g, '-')

    let fullVehicle = vehicle
    let vehicleType

    if (vehicle.match(/N\d{3}/)) {
      let carriages = vehicleConsist.slice(5).split('-')
      fullVehicle = vehicleConsist

      vehicleType = 'N +'
      vehicleType += carriages.length

      if (carriages.includes('N')) vehicleType += 'N'
      else vehicleType += 'H'
    } else if (vehicle.includes('VL')) {
      let cars = vehicle.split('-')
      fullVehicle = vehicle.replace(/\dVL/g, 'VL')

      vehicleType = cars.length + 'x 3VL'
    } else if (vehicle.match(/70\d\d/)) {
      let cars = vehicle.split('-')
      vehicleType = cars.length + 'x SP'
    }

    if ($$('Consist').attr('i:nil'))
      fullVehicle = ''

    let direction = $$('Direction').text()
    if (direction === 'D') direction = 'Down'
    else direction = 'Up'

    const originStation = await getStationFromVNETName(originVNETName, db)
    const destinationStation = await getStationFromVNETName(destinationVNETName, db)

    if (!originStation || !destinationStation) return // Apparently origin or dest is sometimes unknown

    let originVLinePlatform = originStation.bays.find(bay => bay.mode === 'regional train')
    let destinationVLinePlatform = destinationStation.bays.find(bay => bay.mode === 'regional train')

    mappedDepartures.push({
      runID,
      originVNETName: originVLinePlatform.vnetStationName,
      destinationVNETName: destinationVLinePlatform.vnetStationName,
      origin: originVLinePlatform.fullStopName,
      destination: destinationVLinePlatform.fullStopName,
      originDepartureTime, destinationArrivalTime,
      direction,
      vehicle: fullVehicle.split('-'),
      barAvailable,
      accessibleTrain,
      vehicleType
    })
  })

  return mappedDepartures
}

async function getDeparturesFromVNET(db) {
  let vnetDepartures = [...await getVNETDepartures('D', db), ...await getVNETDepartures('U', db)]
  let vlineTrips = db.getCollection('vline trips')
  let timetables = db.getCollection('timetables')
  let liveTimetables = db.getCollection('live timetables')

  await async.forEach(vnetDepartures, async departure => {
    let referenceTime = departure.originDepartureTime.clone()
    if (referenceTime.get('hours') <= 3) referenceTime.add(-1, 'days')
    let date = referenceTime.format('YYYYMMDD')
    let dayOfWeek = utils.getDayName(referenceTime)

    let tripData = {
      date,
      runID: departure.runID,
      origin: departure.origin.slice(0, -16),
      destination: departure.destination.slice(0, -16),
      departureTime: departure.originDepartureTime.format('HH:mm'),
      destinationArrivalTime: departure.destinationArrivalTime.format('HH:mm'),
      consist: departure.vehicle
    }

    let query = {
      date, runID: departure.runID
    }

    await vlineTrips.replaceDocument(query, tripData, {
      upsert: true
    })

    let nspTrip = await timetables.findDocument({
      operationDays: dayOfWeek,
      runID: departure.runID,
      mode: 'regional train'
    })

    if (nspTrip && nspTrip.destination !== departure.destination) {
      let stoppingAt = nspTrip.stopTimings.map(e => e.stopName)
      let destinationIndex = stoppingAt.indexOf(departure.destination)
      let skipping = nspTrip.stopTimings.slice(destinationIndex + 1).map(e => e.stopName)

      nspTrip.stopTimings = nspTrip.stopTimings.slice(0, destinationIndex + 1)
      let lastStop = nspTrip.stopTimings[destinationIndex]

      nspTrip.destination = lastStop.stopName
      nspTrip.destinationArrivalTime = lastStop.arrivalTime
      lastStop.departureTime = null
      lastStop.departureTimeMinutes = null

      nspTrip.skipping = skipping
      nspTrip.runID = departure.runID
      nspTrip.originalServiceID = nspTrip.originalServiceID || departure.originDepartureTime.format('HH:mm') + nspTrip.destination
      nspTrip.operationDays = date

      delete nspTrip._id
      await liveTimetables.replaceDocument({
        operationDays: date,
        runID: departure.runID,
        mode: 'regional train'
      }, nspTrip, {
        upsert: true
      })
    }
  })
}

async function requestTimings() {
  console.log('requesting vline trips')
  try {
    await getDeparturesFromVNET(database)
  } catch (e) {
    console.log(e)
    console.log('Error getting vline trips, skipping this round')
  }

  if (shouldRun()) {
    setTimeout(requestTimings, 30 * 60 * 1000)
  } else {
    let minutesPastMidnight = utils.getMinutesPastMidnightNow()
    let timeToStart = (1710 - minutesPastMidnight) % 1440

    setTimeout(requestTimings, timeToStart * 60 * 1000)
  }
}

database.connect(async () => {
  dbStops = database.getCollection('stops')
  await requestTimings()
})
