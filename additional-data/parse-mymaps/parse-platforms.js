const cheerio = require('cheerio')
const fs = require('fs')

let platforms = fs.readFileSync(__dirname + '/station-platforms.kml').toString()
let $ = cheerio.load(platforms)

let knownStations = [
  "Aircraft",
  "Ardeer",
  "Albion",
  "Alamein",
  "Alphington",
  "Altona",
  "Albury",
  "Armadale",
  "Ararat",
  "Ashburton",
  "Aspendale",
  "Ascot Vale",
  "Anstey",
  "Auburn",
  "Avenel",
  "Ballarat",
  "Batman",
  "Bayswater",
  "Brighton Beach",
  "Blackburn",
  "Balaclava",
  "Bairnsdale",
  "Bendigo",
  "Belgrave",
  "Bell",
  "Bentleigh",
  "Beaufort",
  "Berwick",
  "Beaconsfield",
  "Birregurra",
  "Bittern",
  "Ballan",
  "Burnley",
  "Bacchus Marsh",
  "Broadmeadows",
  "Benalla",
  "Bonbeach",
  "Boronia",
  "Box Hill",
  "Broadford",
  "Burwood",
  "Brunswick",
  "Baxter",
  "Bunyip",
  "Camberwell",
  "Carrum",
  "Cranbourne",
  "Canterbury",
  "Cardinia Road",
  "Croydon",
  "Caulfield",
  "Craigieburn",
  "Chiltern",
  "Clifton Hill",
  "Chatham",
  "Clarkefield",
  "Clayton",
  "Coolaroo",
  "Clunes",
  "Castlemaine",
  "Carnegie",
  "Coburg",
  "Colac",
  "Camperdown",
  "Crib Point",
  "Corio",
  "Chelsea",
  "Caroline Springs",
  "Cheltenham",
  "Collingwood",
  "Creswick",
  "Croxton",
  "Donnybrook",
  "Darebin",
  "Diamond Creek",
  "Dennis",
  "Dingee",
  "Dimboola",
  "Darling",
  "Dandenong",
  "Deer Park",
  "Drouin",
  "Diggers Rest",
  "Eaglehawk",
  "Echuca",
  "East Camberwell",
  "Edithvale",
  "Eaglemont",
  "Elsternwick",
  "Eltham",
  "Elmore",
  "East Malvern",
  "Euroa",
  "Epping",
  "Epsom",
  "East Richmond",
  "Essendon",
  "Fawkner",
  "Flemington Bridge",
  "Flemington Racecourse",
  "Fairfield",
  "Flagstaff",
  "Frankston",
  "Flinders Street",
  "Footscray",
  "Ferntree Gully",
  "Gardiner",
  "Glenbervie",
  "Glenferrie",
  "Garfield",
  "Glenhuntly",
  "Ginifer",
  "Glen Iris",
  "Gisborne",
  "Geelong",
  "Gowrie",
  "Greensborough",
  "Glenroy",
  "Gardenvale",
  "Glen Waverley",
  "Hampton",
  "Hawthorn",
  "Hurstbridge",
  "Hoppers Crossing",
  "Heathcote Junction",
  "Heidelberg",
  "Heyington",
  "Highett",
  "Hawksburn",
  "Hallam",
  "Heathmont",
  "Holmesglen",
  "Hastings",
  "Heatherdale",
  "Hughesdale",
  "Huntingdale",
  "Hartwell",
  "Hawkstowe",
  "Ivanhoe",
  "Jacana",
  "Jolimont",
  "Jordanville",
  "Jewell",
  "Kananook",
  "Kensington",
  "Kerang",
  "Kangaroo Flat",
  "Kilmore East",
  "Keon Park",
  "Keilor Plains",
  "Kyneton",
  "Kooyong",
  "Laburnum",
  "Lalor",
  "Lara",
  "Laverton",
  "Lynbrook",
  "Lilydale",
  "Little River",
  "Leawarra",
  "Longwarry",
  "Mont Albert",
  "Macaulay",
  "Malvern",
  "Middle Brighton",
  "Malmsbury",
  "Macleod",
  "Melbourne Central",
  "Mitcham",
  "McKinnon",
  "Mernda",
  "Macedon",
  "Melton",
  "Mentone",
  "Merri",
  "Middle Footscray",
  "Moreland",
  "Mooroolbark",
  "Middle Gorge",
  "Montmorency",
  "Moe",
  "Mordialloc",
  "Mooroopna",
  "Moonee Ponds",
  "Merinda Park",
  "Murrumbeena",
  "Moorabbin",
  "Morradoo",
  "Marshall",
  "Murchison East",
  "Morwell",
  "Mount Waverley",
  "Maryborough",
  "Merlynston",
  "North Brighton",
  "Northcote",
  "Nagambie",
  "North Geelong",
  "Nhill",
  "Newmarket",
  "North Melbourne",
  "Nar Nar Goon",
  "Noble Park",
  "Newport",
  "North Richmond",
  "North Shore",
  "Narre Warren",
  "Nunawading",
  "North Williamstown",
  "Oakleigh",
  "Officer",
  "Oak Park",
  "Ormond",
  "Parliament",
  "Patterson",
  "Parkdale",
  "Pakenham",
  "Prahran",
  "Preston",
  "Pascoe Vale",
  "Pyramid",
  "Rockbank",
  "Riddells Creek",
  "Rosedale",
  "Regent",
  "Reservoir",
  "Ripponlea",
  "Riversdale",
  "Richmond",
  "Rochester",
  "Rosanna",
  "Royal Park",
  "Rushall",
  "Ruthven",
  "Ringwood",
  "Ringwood East",
  "Roxburgh Park",
  "St. Albans",
  "Sale",
  "Seaford",
  "Seddon",
  "Seymour",
  "Stratford",
  "South Geelong",
  "Seaholme",
  "Surrey Hills",
  "Sandringham",
  "Shepparton",
  "Springhurst",
  "South Kensington",
  "Strathmore",
  "South Morang",
  "Sandown Park",
  "Southland",
  "Springvale",
  "Sherwood Park",
  "Showgrounds",
  "Spotswood",
  "Southern Cross",
  "Stawell",
  "Stony Point",
  "Sunshine",
  "Sunbury",
  "Somerville",
  "Swan Hill",
  "Syndal",
  "South Yarra",
  "Tyabb",
  "Talbot",
  "Thornbury",
  "Tecoma",
  "Terang",
  "Trafalgar",
  "Tooronga",
  "Tallarook",
  "Cobblebank",
  "Tarneit",
  "Toorak",
  "Tottenham",
  "Traralgon",
  "Thomastown",
  "Tynong",
  "Upfield",
  "Upper Ferntree Gully",
  "Upwey",
  "Victoria Park",
  "Violet Town",
  "Watsonia",
  "Williamstown Beach",
  "Wandong",
  "Wendouree",
  "Werribee",
  "West Footscray",
  "Warragul",
  "Watergardens",
  "Winchelsea",
  "Williamstown",
  "Windsor",
  "Williams Landing",
  "Wallan",
  "Warrnambool",
  "Woodend",
  "Wodonga",
  "Waurn Ponds",
  "West Richmond",
  "Wangaratta",
  "Willison",
  "Westgarth",
  "Westall",
  "Westona",
  "Wattle Glen",
  "Wyndham Vale",
  "Yarragon",
  "Yarraman",
  "Yarraville"
]


let data = {}

let platformsData = Array.from($('Placemark'))
platformsData.forEach(platform => {
  let stationName = $('Data[name=STATION]', platform).text().trim()
  let platformNumber = $('Data[name=PLATFORMNO]', platform).text().trim()

  if (!knownStations.includes(stationName)) return console.log('Skipping', stationName)
  if (!platformNumber) return console.log('Skipping', stationName, 'without platform number')

  let coordinatesRaw = $('coordinates', platform).text().trim()
  let coordinates = coordinatesRaw.split('\n').filter(Boolean).map(line => {
    return line.trim().split(',').slice(0, 2).map(x => parseFloat(x))
  })

  let platformGeometry = {
    platformNumber,
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates]
    }
  }

  if (data[stationName]) {
    data[stationName].push(platformGeometry)
  } else {
    data[stationName] = [platformGeometry]
  }
})

fs.writeFileSync(__dirname + '/../station-platform-geometry.json', JSON.stringify(data, null, 1))