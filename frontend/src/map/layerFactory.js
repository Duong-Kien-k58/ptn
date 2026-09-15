import LayerGroup from 'ol/layer/Group.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import OSM from 'ol/source/OSM.js'
import XYZ from 'ol/source/XYZ.js'
import VectorSource from 'ol/source/Vector.js'
import {
  BASE_LAYER_CONFIGS,
  LAYER_GROUP_CONFIGS,
  MAP_LAYER_CONFIGS,
  RASTER_LAYER_CONFIGS,
} from '../config/layers.js'

function tagLayer(layer, configId, kind) {
  layer.set('configId', configId)
  layer.set('layerKind', kind)
  return layer
}

function createBaseLayer(config) {
  const source = config.source === 'topo'
    ? new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' })
    : config.source === 'satellite'
      ? new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' })
      : new OSM()
  return tagLayer(new TileLayer({ title: config.title, visible: config.visible, source }), config.id, 'base')
}

function createPlaceholderLayer(config, kind) {
  return tagLayer(new VectorLayer({
    title: config.title,
    visible: config.visible,
    source: new VectorSource(),
  }), config.id, kind)
}

export function createMapLayers() {
  const baseLayerMap = Object.fromEntries(BASE_LAYER_CONFIGS.map((config) => [config.id, createBaseLayer(config)]))
  const layerMap = Object.fromEntries(MAP_LAYER_CONFIGS.map((config) => [config.id, createPlaceholderLayer(config, 'vector')]))
  const rasterLayerMap = Object.fromEntries(RASTER_LAYER_CONFIGS.map((config) => [config.id, createPlaceholderLayer(config, 'raster')]))

  const groups = LAYER_GROUP_CONFIGS.map((groupConfig) => {
    const children = groupConfig.kind === 'base'
      ? BASE_LAYER_CONFIGS.map((config) => baseLayerMap[config.id])
      : groupConfig.kind === 'raster'
        ? RASTER_LAYER_CONFIGS.map((config) => rasterLayerMap[config.id])
        : MAP_LAYER_CONFIGS.filter((config) => config.group === groupConfig.id).map((config) => layerMap[config.id])
    const group = new LayerGroup({ title: groupConfig.title, layers: children.reverse() })
    group.set('tocGroupId', groupConfig.id)
    group.set('layerGroupKind', groupConfig.kind)
    return group
  })

  return {
    mapLayers: groups.slice().reverse(),
    baseGroup: groups.find((group) => group.get('layerGroupKind') === 'base'),
    thematicGroups: groups.filter((group) => group.get('layerGroupKind') === 'vector'),
    rasterGroup: groups.find((group) => group.get('layerGroupKind') === 'raster'),
    layerConfigs: MAP_LAYER_CONFIGS,
    rasterLayerMap,
  }
}
