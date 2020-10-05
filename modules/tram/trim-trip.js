const async = require('async')
const TimedCache = require('../../TimedCache')
const EventEmitter = require('events')

let stopsCache = {}
let stopsLocks = {}

async function getStopData(stopGTFSID, stops) {
  if (stopsCache[stopGTFSID]) return stopsCache[stopGTFSID]
  if (stopsLocks[stopGTFSID]) {
    return await new Promise(resolve => stopsLocks[stopGTFSID].on('loaded', resolve))
  }
  stopsLocks[stopGTFSID] = new EventEmitter()
  let stopData = await stops.findDocument({ 'bays.stopGTFSID': stopGTFSID })

  stopsCache[stopGTFSID] = stopData
  stopsLocks[stopGTFSID].emit('loaded', stopData)
  delete stopsLocks[stopGTFSID]

  return stopData
}

async function modifyTrip(db, trip, operationDay) {
  trip.origin = trip.stopTimings[0].stopName
  trip.destination = trip.stopTimings.slice(-1)[0].stopName
  trip.departureTime = trip.stopTimings[0].departureTime
  trip.destinationArrivalTime = trip.stopTimings.slice(-1)[0].arrivalTime
  trip.operationDays = operationDay
  trip.hasBeenTrimmed = true
  delete trip._id

  let key = {
    mode: 'tram',
    operationDays: operationDay,
    origin: trip.origin,
    departureTime: trip.departureTime,
    destination: trip.destination,
    destinationArrivalTime: trip.destinationArrivalTime
  }

  await db.getCollection('live timetables').replaceDocument(key, trip, {
    upsert: true
  })
}

module.exports.trimFromDestination = async function(db, destination, coreRoute, trip, operationDay) {
  let cutoffStop

  if ((coreRoute === '96' || coreRoute === '109') && destination == 'Clarendon St Junction') {
    cutoffStop = 'Clarendon Street Junction'
  }

  if (cutoffStop && trip.destination !== cutoffStop) {
    let hasSeen = false

    trip.stopTimings = trip.stopTimings.filter(stop => {
      if (hasSeen) return false
      if (stop.stopName.includes(cutoffStop)) {
        return hasSeen = true
      }
      return true
    })

    await modifyTrip(db, trip, operationDay)
  }

  return trip
}


module.exports.trimFromMessage = async function(db, destinations, currentStopGTFSID, trip, operationDay) {
  let stops = db.getCollection('stops')
  let indexes = []

  await async.forEachOf(trip.stopTimings, async (stop, i) => {
    let stopData = await getStopData(stop.stopGTFSID, stops)
    if (destinations.some(dest => stopData.tramTrackerNames.includes(dest))) {
      indexes.push(i)
    }
  })

  let sortedIndexes = indexes.sort()

  let currentStopData = trip.stopTimings.find(stop => stop.stopGTFSID === currentStopGTFSID)
  let currentIndex = trip.stopTimings.indexOf(currentStopData)

  // We have passed the bus zone, so its behind us, cut origin
  // Equal because if we are heading in (destination) TT wouldnt return it
  if (currentIndex >= sortedIndexes[1]) {
    trip.stopTimings = trip.stopTimings.slice(sortedIndexes[1])
  } else { // Cut destination
    trip.stopTimings = trip.stopTimings.slice(0, sortedIndexes[0] + 1)
  }

  await modifyTrip(db, trip, operationDay)

  return trip
}
