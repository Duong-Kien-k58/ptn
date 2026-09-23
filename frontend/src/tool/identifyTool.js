import { toLonLat } from 'ol/proj.js'
import { createToolPanel } from './toolUtils.js'

export function createIdentifyTool(map) {
  const panel = createToolPanel({
    id: 'identify-panel',
    title: 'Tra cứu thông tin',
    content: `
      <p class="tool-hint">Chọn công cụ rồi nhấp lên bản đồ để xem tọa độ.</p>
      <div class="tool-result">Chưa chọn vị trí.</div>
    `,
  })
  const result = panel.querySelector('.tool-result')
  let isActive = false

  map.on('singleclick', (event) => {
    if (!isActive) {
      return
    }

    const [longitude, latitude] = toLonLat(event.coordinate)
    const clickedFeature = map.forEachFeatureAtPixel(event.pixel, (feature) => feature)
    const measurement = clickedFeature?.get?.('measurement')

    if (measurement) {
      result.innerHTML = `<b>Kết quả đo</b><br>${measurement}`
    } else {
      result.innerHTML = `<b>Vị trí đã chọn</b><br>Vĩ độ: ${latitude.toFixed(5)}<br>Kinh độ: ${longitude.toFixed(5)}`
    }

    map.getTargetElement().style.cursor = ''
    isActive = false
  })

  return {
    open() {
      isActive = true
      panel.classList.add('shown')
      map.getTargetElement().style.cursor = 'help'
    },
    close() {
      isActive = false
      map.getTargetElement().style.cursor = ''
      panel.classList.remove('shown')
    },
  }
}
