// Extracts Sudan's outline from world-atlas into a small GeoJSON file used by the dashboard map.
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'
const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)))
const all = feature(topo, topo.objects.countries)
const sudan = all.features.find((f) => f.id === '729')
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round))
sudan.geometry.coordinates = round(sudan.geometry.coordinates)
writeFileSync(new URL('../src/data/sudan.geo.json', import.meta.url), JSON.stringify({ type: 'Feature', properties: { name: 'Sudan' }, geometry: sudan.geometry }))
console.log('ok', sudan.geometry.type)
