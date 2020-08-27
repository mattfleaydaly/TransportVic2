const express = require('express')
const moment = require('moment')
const router = new express.Router()
const utils = require('../../../utils')
const ptvAPI = require('../../../ptv-api')
const getStoppingPattern = require('../../../modules/utils/get-stopping-pattern')
const busStopNameModifier = require('../../../additional-data/bus-stop-name-modifier')

const busDestinations = require('../../../additional-data/bus-destinations')
const coachDestinations = require('../../../additional-data/coach-stops')
const tramDestinations = require('../../../additional-data/tram-destinations')

const determineTramRouteNumber = require('../../../modules/tram/determine-tram-route-number')
const determineBusRouteNumber = require('../../../modules/bus/determine-bus-route-number')

const tramFleet = require('../../../tram-fleet')

async function pickBestTrip(data, db) {
  let tripDay = utils.parseTime(data.operationDays, 'YYYYMMDD')
  let tripStartTime = utils.parseTime(`${data.operationDays} ${data.departureTime}`, 'YYYYMMDD HH:mm')
  let tripStartMinutes = utils.getPTMinutesPastMidnight(tripStartTime)
  let tripEndTime = utils.parseTime(`${data.operationDays} ${data.destinationArrivalTime}`, 'YYYYMMDD HH:mm')
  let tripEndMinutes = utils.getPTMinutesPastMidnight(tripEndTime)

  let trueMode = data.mode
  if (trueMode === 'coach') trueMode = 'regional coach'

  let originStop = await db.getCollection('stops').findDocument({
    codedNames: data.origin,
    'bays.mode': trueMode
  })

  let destinationStop = await db.getCollection('stops').findDocument({
    codedNames: data.destination,
    'bays.mode': trueMode
  })
  if (!originStop || !destinationStop) return null
  let minutesToTripStart = tripStartTime.diff(utils.now(), 'minutes')
  let minutesToTripEnd = tripEndTime.diff(utils.now(), 'minutes')

  let originName = originStop.bays.filter(bay => utils.encodeName(bay.fullStopName) === data.origin)[0].fullStopName
  let destinationName = destinationStop.bays.filter(bay => utils.encodeName(bay.fullStopName) === data.destination)[0].fullStopName

  let query = {
    mode: trueMode,
    origin: originName,
    departureTime: data.departureTime,
    destination: destinationName,
    destinationArrivalTime: data.destinationArrivalTime,
    operationDays: data.operationDays
  }

  let gtfsTrip = await db.getCollection('gtfs timetables').findDocument(query)
  let liveTrip = await db.getCollection('live timetables').findDocument(query)

  let useLive = minutesToTripEnd > -5 && minutesToTripStart < 120 && data.mode !== 'coach'

  if (liveTrip) {
    if (liveTrip.type === 'timings' && new Date() - liveTrip.updateTime < 2 * 60 * 1000) {
      return liveTrip
    }
  }

  if (!useLive) return gtfsTrip

  // So PTV API only returns estimated timings for bus if stop_id is set and the bus hasn't reached yet...
  let referenceTrip = liveTrip || gtfsTrip
  if (!referenceTrip) return null

  let now = utils.now()

  let checkStops = referenceTrip.stopTimings.map(stopTiming => {
    stopTiming.actualDepartureTime = now.clone().startOf('day').add(stopTiming.departureTimeMinutes, 'minutes')
    return stopTiming
  }).filter(stopTiming => {
    return stopTiming.actualDepartureTime.diff(now, 'minutes') > 0
  }).slice(0, -1)

  let checkStop = checkStops[0]

  if (!checkStop) checkStop = referenceTrip.stopTimings[0]

  let checkStopTime = utils.parseTime(`${data.operationDays} ${checkStop.departureTime}`, 'YYYYMMDD HH:mm')
  let isoDeparture = checkStopTime.toISOString()
  let mode = trueMode === 'bus' ? 2 : 1
  try {
    let {departures, runs} = await ptvAPI(`/v3/departures/route_type/${mode}/stop/${checkStop.stopGTFSID}?gtfs=true&date_utc=${tripStartTime.clone().add(-3, 'minutes').startOf('minute').toISOString()}&max_results=5&expand=run&expand=stop`)

    let departure = departures.filter(departure => {
      let run = runs[departure.run_id]
      let destinationName = busStopNameModifier(utils.adjustStopName(run.destination_name.trim()))
        .replace(/ #.+$/, '').replace(/^(D?[\d]+[A-Za-z]?)-/, '')
      let scheduledDepartureTime = moment(departure.scheduled_departure_utc).toISOString()

      return scheduledDepartureTime === isoDeparture &&
        destinationName === referenceTrip.destination
    })[0]

    if (!departure) return gtfsTrip
    let ptvRunID = departure.run_id
    let departureTime = departure.scheduled_departure_utc

    let trip = await getStoppingPattern(db, ptvRunID, trueMode, departureTime, departure.stop_id, gtfsTrip)
    return trip
  } catch (e) {
    return gtfsTrip
  }
}

router.get('/:mode/run/:origin/:departureTime/:destination/:destinationArrivalTime/:operationDays', async (req, res, next) => {
  if (!['coach', 'bus', 'tram'].includes(req.params.mode)) return next()

  let trip = await pickBestTrip(req.params, res.db)
  if (!trip) return res.status(404).render('errors/no-trip')

  let routes = res.db.getCollection('routes')
  let tripRoute = await routes.findDocument({ routeGTFSID: trip.routeGTFSID }, { routePath: 0 })
  let operator = tripRoute.operators[0]

  let {destination, origin} = trip
  let fullDestination = destination
  let fullOrigin = origin

  let destinationShortName = utils.getStopName(destination)
  let originShortName = utils.getStopName(origin)

  if (!utils.isStreet(destinationShortName)) destination = destinationShortName
  if (!utils.isStreet(originShortName)) origin = originShortName

  destination = destination.replace('Shopping Centre', 'SC').replace('Railway Station', 'Station')
  origin = origin.replace('Shopping Centre', 'SC').replace('Railway Station', 'Station')

  if (trip.mode === 'tram') {
    destination = tramDestinations[destination] || destination
    origin = tramDestinations[origin] || origin
  } else if (trip.mode === 'regional coach') {
    destination = fullDestination.replace('Shopping Centre', 'SC')
    origin = fullOrigin.replace('Shopping Centre', 'SC')

    let destinationSuburb = trip.stopTimings.slice(-1)[0].suburb
    destination = coachDestinations[destination + ` (${destinationSuburb})`] || coachDestinations[destination] || destination
    origin = coachDestinations[origin] || origin

    let destShortName = utils.getStopName(destination)
    if (!utils.isStreet(destShortName)) destination = destShortName

    let originShortName = utils.getStopName(origin)
    if (!utils.isStreet(originShortName)) origin = originShortName
  } else {
    let serviceData = busDestinations.service[trip.routeNumber] || busDestinations.service[trip.routeGTFSID] || {}

    destination = serviceData[destination]
      || busDestinations.generic[destination]
      || busDestinations.generic[fullDestination] || destination

    origin = serviceData[origin]
      || busDestinations.generic[origin]
      || busDestinations.generic[fullOrigin] || origin
  }

  let loopDirection
  if (tripRoute.flags)
    loopDirection = tripRoute.flags[trip.gtfsDirection]

  let importantStops = []

  if (trip.mode === 'bus')
    importantStops = trip.stopTimings.map(stop => utils.getStopName(stop.stopName))
      .filter((e, i, a) => a.indexOf(e) === i)
      .slice(1, -1)
      .filter(utils.isCheckpointStop)
      .map(utils.shorternStopName)

  let viaText
  if (importantStops.length)
    viaText = `Via ${importantStops.slice(0, -1).join(', ')}${(importantStops.length > 1 ? ' & ' : '') + importantStops.slice(-1)[0]}`

  trip.stopTimings = trip.stopTimings.map(stop => {
    stop.prettyTimeToArrival = ''

    if (trip.cancelled) {
      stop.headwayDevianceClass = 'cancelled'
    } else {
      stop.headwayDevianceClass = 'unknown'
    }

    if (stop.estimatedDepartureTime) {
      let scheduledDepartureTime = utils.parseTime(req.params.operationDays, 'YYYYMMDD').add(stop.departureTimeMinutes || stop.arrivalTimeMinutes, 'minutes')

      let headwayDeviance = scheduledDepartureTime.diff(stop.estimatedDepartureTime, 'minutes')

      if (headwayDeviance > 2) {
        stop.headwayDevianceClass = 'early'
      } else if (headwayDeviance <= -5) {
        stop.headwayDevianceClass = 'late'
      } else {
        stop.headwayDevianceClass = 'on-time'
      }

      const timeDifference = moment.utc(moment(stop.estimatedDepartureTime).diff(utils.now()))

      if (+timeDifference < -30000) return stop
      if (+timeDifference <= 60000) stop.prettyTimeToArrival = 'Now'
      else {
        stop.prettyTimeToArrival = ''
        if (timeDifference.get('hours')) stop.prettyTimeToArrival += timeDifference.get('hours') + ' h '
        if (timeDifference.get('minutes')) stop.prettyTimeToArrival += timeDifference.get('minutes') + ' min'
      }
    }
    return stop
  })

  if (trip.vehicle) {
    if (req.params.mode === 'tram') {
      let tramModel = tramFleet.getModel(trip.vehicle)
      trip.vehicleData = {
        name: `Tram ${tramModel}.${trip.vehicle}`
      }
    } else if (req.params.mode === 'bus') {
      let smartrakIDs = res.db.getCollection('smartrak ids')

      let busRego = (await smartrakIDs.findDocument({
        smartrakID: parseInt(trip.vehicle)
      }) || {}).fleetNumber
      if (busRego) {
        trip.vehicleData = {
          name: 'Bus #' + busRego
        }
      }
    }
  }

  let routeNumber = trip.routeNumber
  let routeNumberClass = utils.encodeName(operator)

  if (trip.mode === 'tram') {
    routeNumber = determineTramRouteNumber(trip)
    routeNumberClass = 'tram-' + routeNumber.replace(/[a-z]/, '')
  }

  if (trip.mode === 'bus') {
    routeNumber = determineBusRouteNumber(trip)
  }

  res.render('runs/generic', {
    trip,
    shorternStopName: utils.shorternStopName,
    origin,
    destination,
    routeNumberClass,
    loopDirection,
    viaText,
    routeNumber
  })
})

module.exports = router
