import { getPointResolution, toLonLat } from 'ol/proj.js' // Công cụ tọa độ và tỷ lệ

function toVn2000(longitude, latitude, zoneWidth) {
  const a = 6378137 // Bán trục lớn ellipsoid
  const e2 = 0.00669438 // Độ lệch tâm bình phương
  const k0 = zoneWidth === 3 ? 0.9999 : 0.9996 // Hệ số tỷ lệ
  const centralMeridian = zoneWidth === 3 ? Math.round(longitude / 3) * 3 : (Math.floor((longitude + 180) / 6) + 1) * 6 - 183 // Kinh tuyến trục
  const rad = Math.PI / 180
  const lon = longitude * rad
  const lat = latitude * rad
  const lon0 = centralMeridian * rad
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const tanLat = Math.tan(lat)
  const ePrime2 = e2 / (1 - e2)
  const N = a / Math.sqrt(1 - e2 * sinLat ** 2) // Bán kính cong
  const T = tanLat ** 2
  const C = ePrime2 * cosLat ** 2
  const A = cosLat * (lon - lon0)
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat) - 35 * e2 ** 3 / 3072 * Math.sin(6 * lat)) // Cung kinh tuyến
  const easting = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5 / 120) + 500000 // Y
  const northing = k0 * (M + N * tanLat * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6 / 720)) // X
  return { northing, easting }
}

export function createBasicTools(map) {
  const latitudeValue = document.querySelector('#latitude-value') // Vĩ độ
  const longitudeValue = document.querySelector('#longitude-value') // Kinh độ
  const vn2000XValue = document.querySelector('#vn2000-x-value') // X VN2000
  const vn2000YValue = document.querySelector('#vn2000-y-value') // Y VN2000
  const mapScaleValue = document.querySelector('#map-scale-value') // Tỷ lệ
  const projectionInputs = document.querySelectorAll('input[name="projection-zone"]') // Nút chọn múi
  let latestCoordinate = null // Lưu vị trí chuột cuối cùng

  function getZoneWidth() {
    return Number(document.querySelector('input[name="projection-zone"]:checked')?.value || 6) // Lấy múi 3° hoặc 6°
  }

  function updateCoordinates(coordinate) {
    if (!coordinate) return
    const [longitude, latitude] = toLonLat(coordinate) // OpenLayers → WGS84
    const vn2000 = toVn2000(longitude, latitude, getZoneWidth()) // WGS84 → VN2000
    latitudeValue.textContent = latitude.toFixed(6) // Hiển thị vĩ độ
    longitudeValue.textContent = longitude.toFixed(6) // Hiển thị kinh độ
    vn2000XValue.textContent = vn2000.northing.toFixed(2) // Hiển thị X
    vn2000YValue.textContent = vn2000.easting.toFixed(2) // Hiển thị Y
  }

  map.on('pointermove', event => {
    if (event.dragging) return
    latestCoordinate = event.coordinate // Lấy tọa độ chuột
    updateCoordinates(latestCoordinate) // Cập nhật tọa độ
  })

  projectionInputs.forEach(input => input.addEventListener('change', () => updateCoordinates(latestCoordinate))) // Đổi múi thì tính lại

  function updateScale() {
    const view = map.getView()
    const resolution = view.getResolution()
    if (!resolution) return
    const metersPerPixel = getPointResolution(view.getProjection(), resolution, view.getCenter(), 'm') // Tính mét/pixel
    const scale = metersPerPixel / 0.00028 // Tính mẫu số tỷ lệ
    mapScaleValue.textContent = Math.round(scale).toLocaleString('vi-VN') // Hiển thị 1:n
  }

  map.getView().on('change:resolution', updateScale) // Zoom thay đổi thì tính lại tỷ lệ
  updateScale() // Tính tỷ lệ khi vừa mở bản đồ
}