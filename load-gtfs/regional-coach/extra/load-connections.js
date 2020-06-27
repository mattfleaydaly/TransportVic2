const async = require('async')
const DatabaseConnection = require('../../../database/DatabaseConnection')
const config = require('../../../config.json')
const utils = require('../../../utils')

const updateStats = require('../../utils/stats')

let stops, gtfsTimetables

const database = new DatabaseConnection(config.databaseURL, config.databaseName)
let mode = {
  $in: ['regional train', 'regional coach']
}

async function findConnections(changeoverPoint) {
  let changeoverStop = await stops.findDocument({
    stopName: changeoverPoint
  })

  let stopGTFSIDs = changeoverStop.bays.filter(e => e.mode.includes('regional')).map(e => e.stopGTFSID)

  let trips = await gtfsTimetables.findDocuments({
    mode,
    'stopTimings.stopGTFSID': {
      $in: stopGTFSIDs
    }
  }).toArray()

  let connectionsMade = 0

  await async.forEachLimit(trips, 50, async trip => {
    let stop = trip.stopTimings.find(stop => stopGTFSIDs.includes(stop.stopGTFSID))

    if (!stop.arrivalTimeMinutes) return
    validTimes = {
      $gte: stop.arrivalTimeMinutes + 1,
      $lte: stop.arrivalTimeMinutes + 30
    }

    for (let operationDay of trip.operationDays) {
      let connections = await gtfsTimetables.findDocuments({
        mode,
        routeGTFSID: {
          $not: {
            $eq: trip.routeGTFSID
          }
        },
        operationDays: operationDay,
        tripID: {
          $not: {
            $eq: trip.tripID
          }
        },
        stopTimings: {
          $elemMatch: {
            stopGTFSID: {
              $in: stopGTFSIDs
            },
            $or: [{
              departureTimeMinutes: validTimes
            }, {
              arrivalTimeMinutes: validTimes
            }],
            'stopConditions.pickup': 0
          }
        }
      }).toArray()

      await async.forEach(connections, async connection => {
        let lastStop = connection.stopTimings.slice(-1)[0].stopGTFSID
        if (stopGTFSIDs.includes(lastStop)) return

        if (trip.mode === 'regional train' && connection.mode === 'regional train') {
          if (trip.direction !== connection.direction) return
        }

        if (trip.origin.includes('Southern Cross') && connection.destination.includes('Southern Cross')) return
        if (trip.destination.includes('Southern Cross') && connection.destination.includes('Southern Cross')) return
        if (trip.origin.includes('Southern Cross') && connection.origin.includes('Southern Cross')) return

        connectionsMade++
        if (!trip.connections) trip.connections = []

        let match = trip.connections.find(c => c.tripID === connection.tripID)
        if (match) {
          if (!match.operationDays.includes(operationDay)) {
            match.operationDays.push(operationDay)
          }
        } else {
          trip.connections.push({
            operationDays: [operationDay],
            changeAt: changeoverPoint,
            for: connection.destination,
            tripID: connection.tripID
          })
        }

        await gtfsTimetables.updateDocument({
          _id: trip._id
        }, {
          $set: {
            connections: trip.connections
          }
        })
      })
    }
  })

  console.log('Found ' + connectionsMade + ' connections at ' + changeoverPoint)

  return connectionsMade
}

database.connect({
  poolSize: 100
}, async err => {
  gtfsTimetables = database.getCollection('gtfs timetables')
  stops = database.getCollection('stops')

  let count = 0

  count += await findConnections('Koo Wee Rup Bus Interchange/Rossiter Road')
  count += await findConnections('Ballarat Railway Station')
  count += await findConnections('Geelong Railway Station')
  count += await findConnections('Warrnambool Railway Station')
  count += await findConnections('Ararat Railway Station')
  count += await findConnections('Stawell Railway Station')
  count += await findConnections('Car Park Rear Toilet Block/Lloyd Street') // Dimboola
  count += await findConnections('Castlemaine Railway Station')
  count += await findConnections('Swan Hill Railway Station')
  count += await findConnections('Bendigo Railway Station')
  count += await findConnections('Rochester Railway Station')
  count += await findConnections('Jennings Street/Northern Highway') // Heathcote
  count += await findConnections('Shepparton Railway Station')
  count += await findConnections('Wangaratta Railway Station')
  count += await findConnections('Woodend Railway Station')
  count += await findConnections('Kerang Railway Station')
  count += await findConnections('Murchison East Railway Station')
  count += await findConnections('Seymour Railway Station')
  count += await findConnections('Wodonga Railway Station')
  count += await findConnections('Benalla Railway Station')
  count += await findConnections('Traralgon Railway Station')
  count += await findConnections('Sale Railway Station')
  count += await findConnections('Bairnsdale Railway Station')

  updateStats('vline-connections', count)
  console.log('Completed loading in ' + count + ' vline connections')
  process.exit()
})
