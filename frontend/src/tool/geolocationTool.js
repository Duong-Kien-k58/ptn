import Feature from 'ol/Feature.js'
import Geolocation from 'ol/Geolocation.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'

export function createGeolocationTool(map) {
  const marker = new Feature()
  const layer = new VectorLayer({ source: new VectorSource({ features: [marker] }), style: new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#d8344b' }), stroke: new Stroke({ color: '#fff', width: 2 }) }) }), zIndex: 100 })
  map.addLayer(layer)
  const geolocation = new Geolocation({ trackingOptions: { enableHighAccuracy: true }, projection: map.getView().getProjection() })
  geolocation.on('change:position', () => { const position = geolocation.getPosition(); if (position) { marker.setGeometry(new Point(position)); map.getView().animate({ center: position, zoom: 15, duration: 500 }) } })
  geolocation.on('error', () => { geolocation.setTracking(false); layer.setVisible(false) })
  return {
    layer,
    open: () => {
      layer.setVisible(true)
      geolocation.setTracking(true)
    },
    close: () => {
      geolocation.setTracking(false)
      layer.setVisible(false)
      marker.setGeometry(null)
    },
  }
}
