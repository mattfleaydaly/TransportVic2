node --max-old-space-size=2048 load-gtfs/metro-bus/load-bus-stops.js 4
node load-gtfs/metro-bus/load-788-stop-numbers.js
node --max-old-space-size=4096 load-gtfs/metro-bus/load-bus-routes.js 4
node --max-old-space-size=5120 --expose-gc --harmony load-gtfs/metro-bus/gtfs-loader-wrapper.js 4
