import Map from 'ol/Map.js'
import View from 'ol/View.js'
import { fromLonLat } from 'ol/proj.js'
import { createMapLayers } from '../config/layers.js'

const vietnamCenter = fromLonLat([106.2, 16.2]) // Tâm gần giữa Việt Nam
const defaultZoom = 7 // Mức zoom khi mở bản đồ

export function createMap() {
  const catalogLayers = createMapLayers()
  const map = new Map({
    target: 'map',
    controls: [],
    layers: catalogLayers.mapLayers,
    view: new View({
      center: vietnamCenter,
      zoom: defaultZoom,
      minZoom: 1,
      maxZoom: 30,
    }),
  })
  return { map, catalogLayers, vietnamCenter, defaultZoom }
}