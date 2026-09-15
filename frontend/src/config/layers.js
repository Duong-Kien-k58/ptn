// Cấu trúc danh mục được kế thừa từ LapTrinhGis. Nguồn WMS/WFS sẽ được
// cấu hình ở Giai đoạn 3 khi GeoServer và PostGIS đã sẵn sàng.
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
