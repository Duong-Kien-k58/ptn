import LayerGroup from 'ol/layer/Group.js'
import TileLayer from 'ol/layer/Tile.js'
import OSM from 'ol/source/OSM.js'
import TileWMS from 'ol/source/TileWMS.js'
import XYZ from 'ol/source/XYZ.js'

export const GEOSERVER_CONFIG = {
  workspace: 'ptn',
  wmsUrl: '/geoserver/ptn/wms',
  wfsUrl: '/geoserver/ptn/ows',
  backendUrl: '/api/features',
}

export const LAYER_GROUP_CONFIGS = [
  { id: 'DuLieuNen', title: 'Dữ liệu nền', kind: 'vector' },
  // 7 chủ đề dữ liệu địa lí
  { id: 'CoSoDoDac', title: 'Cơ sở đo đạc', kind: 'vector' },
  { id: 'ThuyVan', title: 'Thủy văn', kind: 'vector' },
  { id: 'DanCu', title: 'Dân cư', kind: 'vector' },
  { id: 'GiaoThong', title: 'Giao thông', kind: 'vector' },
  { id: 'BienGioiDiaGioi', title: 'Địa giới hành chính', kind: 'vector' },
  { id: 'DiaHinh', title: 'Địa hình', kind: 'vector' },
  { id: 'PhuBeMat', title: 'Phủ bề mặt', kind: 'vector'},

  // Nhóm dữ liệu raster và bản đồ nền
  { id: 'raster', title: 'Dữ liệu Raster', kind: 'raster' },
  { id: 'base', title: 'Bản đồ nền địa lý', kind: 'base' },
]

export const BASE_LAYER_CONFIGS = [
  { id: 'osm', title: 'OpenStreetMap', sourceType: 'OSM', visible: false },
  { id: 'topo', title: 'Counter Map', sourceType: 'XYZ', visible: false, url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' },
  { id: 'satellite', title: 'Google Satellite', sourceType: 'XYZ', visible: true, hideWhenPrinting: true, url: 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}' },
]

export const MAP_LAYER_CONFIGS = [
  { id: 'nenbien', title: 'Nền biển', group: 'DuLieuNen', type: 'Polygon', visible: true, editable: true, fields: [{ id: 'dosau', label: 'Độ sâu' }] },
  { id: 'khung25k', title: 'Bảng chắp 25K', group: 'DuLieuNen', type: 'Polygon', visible: false },
  { id: 'nuocngoai', title: 'Nước ngoài', group: 'DuLieuNen', type: 'Polygon', visible: true, editable: true, fields: [{ id: 'ten', label: 'Tên' }] },
  { id: 'ub_tinh', title: 'UB Tỉnh', group: 'BienGioiDiaGioi', type: 'Point', visible: true, editable: true, fields: [{ id: 'ten', label: 'Tên' }, { id: 'caphc', label: 'Cấp hành chính' }, { id: 'tinh', label: 'Tỉnh' }] },
  { id: 'qlo', title: 'Quốc lộ', group: 'GiaoThong', type: 'LineString', visible: true, editable: true, fields: [{ id: 'bientap', label: 'Biên tập' }, { id: 'td', label: 'Tuyến đường' }] },
  { id: 'tinhlo', title: 'Tỉnh lộ', group: 'GiaoThong', type: 'LineString', visible: true, editable: true, fields: [{ id: 'tenduong', label: 'Tên đường' }, { id: 'loaiduong', label: 'Loại đường' }, { id: 'tdg', label: 'Tên địa giới' }] },
  { id: 'vn_tinh', title: 'Ranh giới tỉnh', group: 'BienGioiDiaGioi', type: 'Polygon', visible: true, editable: true, fields: [{ id: 'ma_tinh', label: 'Mã tỉnh' }, { id: 'ten_tinh', label: 'Tên tỉnh' }, { id: 'sap_nhap', label: 'Sáp nhập' }, { id: 'quy_mo', label: 'Quy mô' }, { id: 'tru_so', label: 'Trụ sở' }, { id: 'loai', label: 'Loại' }] },
  { id: 'vn_xa', title: 'Ranh giới xã', group: 'BienGioiDiaGioi', type: 'Polygon', visible: true, editable: true, fields: [{ id: 'ma_xa', label: 'Mã xã' }, { id: 'ten_xa', label: 'Tên xã' }, { id: 'sap_nhap', label: 'Sáp nhập' }, { id: 'tru_so', label: 'Trụ sở' }, { id: 'loai', label: 'Loại' }, { id: 'ma_tinh', label: 'Mã tỉnh' }, { id: 'ten_tinh', label: 'Tên tỉnh' }] },
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
  const source = config.sourceType === 'OSM' ? new OSM() : new XYZ({ url: config.url })
  const layer = new TileLayer({ title: config.title, visible: config.visible, source })
  if (config.hideWhenPrinting) layer.set('hideWhenPrinting', true)
  return tagLayer(layer, config.id, 'base')
}

function createWmsLayer(config) {
  return tagLayer(new TileLayer({
    title: config.title, // Tên hiển thị layer
    visible: config.visible, // Bật/tắt mặc định
    source: new TileWMS({
      url: GEOSERVER_CONFIG.wmsUrl, // Địa chỉ WMS GeoServer
      params: {
        LAYERS: `${GEOSERVER_CONFIG.workspace}:${config.id}`, // Tên layer trên GeoServer
        TILED: true, // Cho phép tải dạng tile
      },
      serverType: 'geoserver', // Server là GeoServer
      transition: 0, // Không hiệu ứng chuyển tile
    }),
  }), config.id, 'vector') // Gắn ID và loại vector
}

function createRasterLayer(config) {
  const layer = new TileLayer({
    title: config.title, // Tên raster
    visible: config.visible, // Trạng thái hiển thị ban đầu
    source: new TileWMS({
      url: GEOSERVER_CONFIG.wmsUrl, // URL GeoServer WMS
      params: {
        LAYERS: `${GEOSERVER_CONFIG.workspace}:${config.layerName}`, // Tên raster thật trên GeoServer
        TILED: true
      },
      serverType: 'geoserver',
      transition: 0,
    }),
  })
  layer.set('rasterName', config.layerName) // Lưu tên raster thật trên GeoServer
  return tagLayer(layer, config.id, 'raster') // Gắn ID và loại raster
}
// Tạo LayerGroup từ các khai báo phía trên. Khi có GeoServer, chỉ cần thay
// source của từng lớp tại đây; mã giao diện và catalog không cần sửa.
export function createMapLayers() {
  const baseLayers = Object.fromEntries(BASE_LAYER_CONFIGS.map(config => [config.id, createBaseLayer(config)])) // Tạo các lớp bản đồ nền
  const vectorLayers = Object.fromEntries(MAP_LAYER_CONFIGS.map(config => [config.id, createWmsLayer(config)])) // Tạo các lớp vector
  const rasterLayers = Object.fromEntries(RASTER_LAYER_CONFIGS.map(config => [config.id, createRasterLayer(config)])) // Tạo các lớp raster

  function getGroupLayers(group) {
    if (group.kind === 'base') return BASE_LAYER_CONFIGS.map(config => baseLayers[config.id]) // Lấy các lớp nền
    if (group.kind === 'raster') return RASTER_LAYER_CONFIGS.map(config => rasterLayers[config.id]) // Lấy các lớp raster
    return MAP_LAYER_CONFIGS.filter(config => config.group === group.id).map(config => vectorLayers[config.id]) // Lấy vector thuộc nhóm
  }

  const groups = LAYER_GROUP_CONFIGS.map(config => {
    const group = new LayerGroup({
      title: config.title,
      layers: getGroupLayers(config).reverse(),
    })
    group.set('tocGroupId', config.id) // ID nhóm
    group.set('layerGroupKind', config.kind) // Loại nhóm
    group.set('tocCollapsed', config.fold === 'close') // Trạng thái đóng/mở
    return group
  })

  return {
    mapLayers: [...groups].reverse(), // Toàn bộ nhóm đưa lên bản đồ
    baseGroup: groups.find(group => group.get('layerGroupKind') === 'base'), // Nhóm bản đồ nền
    thematicGroups: groups.filter(group => group.get('layerGroupKind') === 'vector'), // Các nhóm vector
    rasterGroup: groups.find(group => group.get('layerGroupKind') === 'raster'), // Nhóm raster
  }
}
