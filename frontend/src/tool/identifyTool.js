import { toLonLat } from 'ol/proj.js'
import { createToolPanel } from './toolUtils.js'

// Khi WMS/WFS được thêm ở Giai đoạn 5, handler này sẽ gọi GetFeatureInfo.
export function createIdentifyTool(map) {
  const panel = createToolPanel({ id: 'identify-panel', title: 'Tra cứu thông tin', content: '<p class="tool-hint">Chọn công cụ rồi nhấp lên bản đồ để xem tọa độ. Thuộc tính layer sẽ được kết nối khi có dữ liệu GIS.</p><div class="tool-result">Chưa chọn vị trí.</div>' })
  let active = false
  const result = panel.querySelector('.tool-result')
  map.on('singleclick', (event) => {
    if (!active) return
    const [longitude, latitude] = toLonLat(event.coordinate)
    const feature = map.forEachFeatureAtPixel(event.pixel, (item) => item)
    const measurement = feature?.get?.('measurement')
    result.innerHTML = measurement
      ? `<b>Kết quả đo</b><br>${measurement}`
      : `<b>Vị trí đã chọn</b><br>Vĩ độ: ${latitude.toFixed(5)}<br>Kinh độ: ${longitude.toFixed(5)}`
    map.getTargetElement().style.cursor = ''
    active = false
  })
  return { open: () => { active = true; panel.classList.add('shown'); map.getTargetElement().style.cursor = 'help' }, close: () => { active = false; map.getTargetElement().style.cursor = ''; panel.classList.remove('shown') } }
}
