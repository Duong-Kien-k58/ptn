import Draw from 'ol/interaction/Draw.js'
import Overlay from 'ol/Overlay.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { getArea, getLength } from 'ol/sphere.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { createToolPanel, formatArea, formatLength } from './toolUtils.js'

// Đo đạc được tách riêng giống dự án cũ; kết quả chỉ nằm trong bộ nhớ trình duyệt.
export function createMeasureTool(map) {
  const source = new VectorSource()
  const layer = new VectorLayer({ source, style: new Style({ fill: new Fill({ color: 'rgba(32,187,169,.18)' }), stroke: new Stroke({ color: '#20bba9', width: 3 }), image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#20bba9' }) }) }) })
  map.addLayer(layer)
  const panel = createToolPanel({ id: 'measure-panel', title: 'Công cụ đo đạc', content: '<button data-mode="LineString">Đo khoảng cách</button><button data-mode="Polygon">Tính diện tích</button><button class="secondary" data-clear="true">Xóa kết quả đo</button><p class="tool-hint">Nhấp để vẽ; nhấp đúp để kết thúc.</p>' })
  let draw = null
  let tooltip = null

  function stop() { if (draw) map.removeInteraction(draw); draw = null; if (tooltip) map.removeOverlay(tooltip); tooltip = null }
  function start(type) {
    stop()
    const element = document.createElement('div')
    element.className = 'measure-tooltip'
    tooltip = new Overlay({ element, offset: [10, -12], positioning: 'bottom-left' })
    map.addOverlay(tooltip)
    draw = new Draw({ source, type })
    map.addInteraction(draw)
    draw.on('drawstart', (event) => event.feature.getGeometry().on('change', (change) => {
      const geometry = change.target
      const label = type === 'LineString' ? formatLength(getLength(geometry)) : formatArea(getArea(geometry))
      element.textContent = label
      tooltip.setPosition(type === 'LineString' ? geometry.getLastCoordinate() : geometry.getInteriorPoint().getCoordinates())
    }))
    draw.once('drawend', (event) => {
      const geometry = event.feature.getGeometry()
      event.feature.set('measurement', type === 'LineString' ? formatLength(getLength(geometry)) : formatArea(getArea(geometry)))
      stop()
    })
  }
  panel.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => start(button.dataset.mode)))
  panel.querySelector('[data-clear]').addEventListener('click', () => { stop(); source.clear() })
  return { layer, open: () => panel.classList.add('shown'), close: () => { stop(); panel.classList.remove('shown') }, clear: () => { stop(); source.clear() } }
}
