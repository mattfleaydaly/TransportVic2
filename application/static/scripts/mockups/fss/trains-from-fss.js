function formatTime(time, includeSeconds=false, space=false) {
  let hours = time.getHours()
  let minutes = time.getMinutes()
  let seconds = time.getSeconds()
  let mainTime = ''

  mainTime += (hours % 12) || 12
  mainTime += ':'

  if (minutes < 10) mainTime += '0'
  mainTime += minutes

  if (includeSeconds) {
    mainTime += ':'

    if (seconds < 10) mainTime += '0'
    mainTime += seconds
  }

  if (space) mainTime += ' '

  if (time.getHours() >= 12)
    mainTime += 'pm'
  else
    mainTime += 'am'

  return mainTime
}

function setTime() {
  $('.clock span').textContent = formatTime(new Date(), true, true)
}

function setupClock() {
  setTime()
  let msToNextSecond = 1000 - (+new Date() % 1000)
  setTimeout(() => {
    setTime()
    setInterval(setTime, 1000)
  }, msToNextSecond)
}

let currentlyDisplaying = 'next-out'

function setFullMessageActive(active) {
  if (active) {
    $('.content').style = 'display: none;'
    $('.fullMessage').style = 'display: flex;'
  } else {
    currentlyDisplaying = 'next-out'
    $('.content').style = 'display: flex;'
    $('.fullMessage').style = 'display: none;'
  }
}

function setListenAnnouncements() {
  if (currentlyDisplaying !== 'announcements') {
    currentlyDisplaying = 'announcements'
    $('.fullMessage').innerHTML = '<img src="/static/images/mockups/announcements.svg" /><p>Please Listen for Announcements</p>'
    setFullMessageActive(true)
  }
}

function setArrowActive(section, active) {
  let arrowMarker = $(`#A-${section}`)
  if (arrowMarker)
    arrowMarker.style = `display: ${active ? '' : 'none'};`
}

function setSectionColour(section, colour) {
  $(`#${section}`).setAttribute('stroke', colour)
}

let destinationSections = [
  {
    target: 'Southern Cross',
    id: 'SSS'
  },
  {
    target: 'Parliament',
    id: 'CCL'
  },
  {
    target: 'North Melbourne',
    id: 'NME'
  },
  {
    target: 'Richmond',
    id: 'RMD'
  },
]

let diagramSections = [
  {
    targets: ['Southern Cross', 'North Melbourne'],
    key: 'FSS-SSS-NME'
  },
  {
    targets: ['Richmond'],
    key: 'FSS-RMD'
  },
  {
    targets: ['Flagstaff', 'Parliament'],
    not: ['North Melbourne'],
    key: 'FSS-CCL-PAR'
  },
  {
    targets: ['Parliament', 'North Melbourne'],
    key: 'FSS-CCL-NME'
  },
  {
    targets: ['Parliament', 'Richmond'],
    key: 'PAR-RMD'
  },
]

let lineColours = {
  'Alamein': '152C6B',
  'Belgrave': '152C6B',
  'Craigieburn': 'FFBE00',
  'Cranbourne': '279FD5',
  'Frankston': '028430',
  'Glen Waverley': '152C6B',
  'Hurstbridge': 'BC2431',
  'Lilydale': '152C6B',
  'Mernda': 'BC2431',
  'Pakenham': '279FD5',
  'Sandringham': 'F178AF',
  'Stony Point': '028430',
  'Sunbury': 'FFBE00',
  'Upfield': 'FFBE00',
  'Werribee': '028430',
  'Williamstown': '028430',
  'City Circle': '000000'
}

function identifyTargetStop(departure, target) {
  let targetStop = departure.trip.stopTimings.find(stop => stop.stopName.slice(0, -16) === target)

  let actualDepartureTime = new Date(departure.actualDepartureTime)
  let scheduledDepartureTime = new Date(departure.scheduledDepartureTime)

  let fssStop = departure.trip.stopTimings.find(stop => stop.stopName === 'Flinders Street Railway Station')
  let fssMinutes = fssStop.departureTimeMinutes
  let targetMinutes = targetStop.departureTimeMinutes

  let minutesDifference = targetMinutes - fssMinutes

  let targetActualTime = new Date(+actualDepartureTime + minutesDifference * 1000 * 60)

  departure.targetActualTime = targetActualTime

  return departure
}

function setDestinationsRow(departures) {
  destinationSections.forEach(section => {
    let {target, id} = section

    let validDepartures = departures.filter(departure => {
      return !!departure.additionalInfo.screenStops.find(stop => stop.stopName === target && !stop.express)
    }).map(departure => {
      return identifyTargetStop(departure, target)
    }).sort((a, b) => a.targetActualTime - b.targetActualTime)

    let next2 = validDepartures.slice(0, 2)

    if (next2.length) {
      let departureDivs = Array.from(document.querySelectorAll(`#to${id} div.next2 div.departure`))

      next2.forEach((departure, i) => {
        let departureDiv = departureDivs[i]
        $('.platform', departureDiv).textContent = departure.platform
        $('.platform', departureDiv).className = 'platform ' + departure.codedLineName
        $('.minutesToDeparture', departureDiv).textContent = departure.prettyTimeToDeparture
      })
    }
  })
}

function updateDiagram(departures) {
  diagramSections.forEach(section => {
    let {targets, not, key} = section
    let lastTarget = targets.slice(-1)[0]

    let nextDeparture = departures.filter(departure => {
      for (let target of targets) {
        if (!departure.additionalInfo.screenStops.find(stop => stop.stopName === target && !stop.express))
          return false
      }
      if (not) {
        for (let excluded of not)
          if (departure.additionalInfo.screenStops.find(stop => stop.stopName === excluded && !stop.express))
            return false
      }
      return true
    }).map(departure => {
      return identifyTargetStop(departure, lastTarget)
    }).sort((a, b) => a.targetActualTime - b.targetActualTime)[0]

    if (nextDeparture) {
      setArrowActive(key, true)
      setSectionColour(key, '#' + lineColours[nextDeparture.trip.routeName])
    } else {
      setArrowActive(key, false)
      setSectionColour(key, '#C0C0C0')
    }
  })
}

function updateBody() {
  $.ajax({
    method: 'POST'
  }, (err, status, body) => {
    if (err) return setListenAnnouncements()

    let departures = body.departures
    setDestinationsRow(departures)
    updateDiagram(departures)
  })
}

function setSVGSize() {
  let windowSize = parseInt(getComputedStyle(document.body).getPropertyValue('width').slice(0, -2))
  let targetSize = windowSize * 0.47

  let scalingFactor = targetSize / 59.953

  let containerHeight = targetSize * (36.838/59.953)

  $('#cclSVG').style = `transform: scale(${scalingFactor})`
  $('#svgContainer').style = `height: ${containerHeight}px`
}

$.ready(() => {
  setTimeout(() => {
    setSVGSize()
    $('#cclSVG').setAttribute('display', '')
  }, 100)

  setupClock()
  updateBody()
  setInterval(updateBody, 1000 * 30)
})

window.on('resize', setSVGSize) // really just a utility function...
