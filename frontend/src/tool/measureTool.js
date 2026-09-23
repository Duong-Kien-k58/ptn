import Draw from 'ol/interaction/Draw.js'
import Overlay from 'ol/Overlay.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { getArea, getLength } from 'ol/sphere.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { createToolPanel, formatArea, formatLength } from './toolUtils.js'

function createMeasureStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(32, 187, 169, .18)' }),
    stroke: new Stroke({ color: '#20bba9', width: 3 }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: '#20bba9' }),
    }),
  })
}

export function createMeasureTool(map) {
  // Kết quả đo chỉ nằm trong trình duyệt, không được ghi vào cơ sở dữ liệu.
  const source = new VectorSource()
  const layer = new VectorLayer({ source, style: createMeasureStyle() })
  map.addLayer(layer)

  const panel = createToolPanel({
    id: 'measure-panel',
    title: 'Công cụ đo đạc',
    content: `
      <button data-mode="LineString">Đo khoảng cách</button>
      <button data-mode="Polygon">Tính diện tích</button>
      <button class="secondary" data-clear="true">Xóa kết quả đo</button>
      <p class="tool-hint">Nhấp để vẽ; nhấp đúp để kết thúc.</p>
    `,
  })
  let drawInteraction = null
  let tooltip = null

  function stopMeasuring() {
    if (drawInteraction) {
      map.removeInteraction(drawInteraction)
    }
    if (tooltip) {
      map.removeOverlay(tooltip)
    }
    drawInteraction = null
    tooltip = null
  }

  function getMeasurementLabel(geometry, geometryType) {
    if (geometryType === 'LineString') {
      return formatLength(getLength(geometry))
    }
    return formatArea(getArea(geometry))
  }

  function startMeasuring(geometryType) {
    stopMeasuring()

    const tooltipElement = document.createElement('div')
    tooltipElement.className = 'measure-tooltip'
    tooltip = new Overlay({
      element: tooltipElement,
      offset: [10, -12],
      positioning: 'bottom-left',
    })
    map.addOverlay(tooltip)

    drawInteraction = new Draw({ source, type: geometryType })
    map.addInteraction(drawInteraction)

    drawInteraction.on('drawstart', (event) => {
      event.feature.getGeometry().on('change', (changeEvent) => {
        const geometry = changeEvent.target
        tooltipElement.textContent = getMeasurementLabel(geometry, geometryType)

        const position = geometryType === 'LineString'
          ? geometry.getLastCoordinate()
          : geometry.getInteriorPoint().getCoordinates()
        tooltip.setPosition(position)
      })
    })

    drawInteraction.once('drawend', (event) => {
      const geometry = event.feature.getGeometry()
      event.feature.set('measurement', getMeasurementLabel(geometry, geometryType))
      stopMeasuring()
    })
  }

  panel.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => startMeasuring(button.dataset.mode))
  })
  panel.querySelector('[data-clear]').addEventListener('click', () => {
    stopMeasuring()
    source.clear()
  })

  return {
    layer,
    open() {
      panel.classList.add('shown')
    },
    close() {
      stopMeasuring()
      panel.classList.remove('shown')
    },
    clear() {
      stopMeasuring()
      source.clear()
    },
  }
}
