import LayerGroup from 'ol/layer/Group.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import OSM from 'ol/source/OSM.js'
import XYZ from 'ol/source/XYZ.js'
import VectorSource from 'ol/source/Vector.js'

// Đây là nơi khai báo duy nhất các nhóm và lớp bản đồ, theo cấu trúc của
// LapTrinhGis. Nguồn WMS/WFS sẽ được bổ sung ở Giai đoạn 3.
export const LAYER_GROUP_CONFIGS = [
  { id: 'background', title: 'Dữ liệu nền', kind: 'vector' },
  { id: 'administrative_point', title: 'Điểm hành chính', kind: 'vector' },
  { id: 'transport', title: 'Giao thông', kind: 'vector' },
  { id: 'administrative', title: 'Địa giới hành chính', kind: 'vector' },
  { id: 'raster', title: 'Dữ liệu Raster', kind: 'raster' },
  { id: 'base', title: 'Bản đồ nền', kind: 'base' },
]

export const BASE_LAYER_CONFIGS = [
  { id: 'osm', title: 'OpenStreetMap', source: 'osm', visible: true },
  { id: 'topo', title: 'Địa hình', source: 'topo', visible: false },
  { id: 'satellite', title: 'Vệ tinh', source: 'satellite', visible: false },
]

export const MAP_LAYER_CONFIGS = [
  { id: 'nenbien', title: 'Nền biển', group: 'background', type: 'Polygon', visible: false },
  { id: 'khung25k', title: 'Bảng chắp 25K', group: 'background', type: 'Polygon', visible: false },
  { id: 'nuocngoai', title: 'Nước ngoài', group: 'background', type: 'Polygon', visible: false },
  { id: 'ub_tinh', title: 'UB Tỉnh', group: 'administrative_point', type: 'Point', visible: false },
  { id: 'qlo', title: 'Quốc lộ', group: 'transport', type: 'LineString', visible: false },
  { id: 'tinhlo', title: 'Tỉnh lộ', group: 'transport', type: 'LineString', visible: false },
  { id: 'vn_tinh', title: 'Ranh giới tỉnh', group: 'administrative', type: 'Polygon', visible: false },
  { id: 'vn_xa', title: 'Ranh giới xã', group: 'administrative', type: 'Polygon', visible: false },
]

export const RASTER_LAYER_CONFIGS = [
  { id: 'vn25k', title: 'Dữ liệu nền VN25K', layerName: 'fast_alpha', visible: false },
  { id: 'dem_vietnam', title: 'DEM Việt Nam (SRTM 30 m)', layerName: 'SRTM_30_VN_UTM', visible: false },
]

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

  return tagLayer(new TileLayer({
    title: config.title,
    visible: config.visible,
    source,
  }), config.id, 'base')
}

function createPlaceholderLayer(config, kind) {
  return tagLayer(new VectorLayer({
    title: config.title,
    visible: config.visible,
    source: new VectorSource(),
  }), config.id, kind)
}

// Tạo LayerGroup từ các khai báo phía trên. Khi có GeoServer, chỉ cần thay
// source của từng lớp tại đây; mã giao diện và catalog không cần sửa.
export function createMapLayers() {
  const baseLayerMap = Object.fromEntries(
    BASE_LAYER_CONFIGS.map((config) => [config.id, createBaseLayer(config)]),
  )
  const vectorLayerMap = Object.fromEntries(
    MAP_LAYER_CONFIGS.map((config) => [config.id, createPlaceholderLayer(config, 'vector')]),
  )
  const rasterLayerMap = Object.fromEntries(
    RASTER_LAYER_CONFIGS.map((config) => [config.id, createPlaceholderLayer(config, 'raster')]),
  )

  const groups = LAYER_GROUP_CONFIGS.map((groupConfig) => {
    const children = groupConfig.kind === 'base'
      ? BASE_LAYER_CONFIGS.map((config) => baseLayerMap[config.id])
      : groupConfig.kind === 'raster'
        ? RASTER_LAYER_CONFIGS.map((config) => rasterLayerMap[config.id])
        : MAP_LAYER_CONFIGS
          .filter((config) => config.group === groupConfig.id)
          .map((config) => vectorLayerMap[config.id])

    const group = new LayerGroup({
      title: groupConfig.title,
      layers: children.reverse(),
    })
    group.set('tocGroupId', groupConfig.id)
    group.set('layerGroupKind', groupConfig.kind || 'vector')
    group.set('tocCollapsed', groupConfig.fold === 'close')
    return group
  })

  return {
    mapLayers: groups.slice().reverse(),
    baseGroup: groups.find((group) => group.get('layerGroupKind') === 'base'),
    thematicGroups: groups.filter((group) => group.get('layerGroupKind') === 'vector'),
    rasterGroup: groups.find((group) => group.get('layerGroupKind') === 'raster'),
  }
}
