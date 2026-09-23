import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { createToolPanel } from './toolUtils.js'
import { GEOSERVER_CONFIG, MAP_LAYER_CONFIGS } from '../config/layers.js'

const normalize = (value) => String(value ?? '').toLocaleLowerCase('vi-VN')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')

function getWfsUrl(layer) {
  const url = new URL(GEOSERVER_CONFIG.wfsUrl, window.location.origin)
  url.search = new URLSearchParams({
    service: 'WFS', version: '1.0.0', request: 'GetFeature',
    typeName: `${GEOSERVER_CONFIG.workspace}:${layer.id}`,
    outputFormat: 'application/json', maxFeatures: '10000',
  })
  return url
}

export function createDataSearchTool({ map }) {
  const panel = createToolPanel({
    id: 'data-search-panel', title: 'Tìm kiếm thông tin',
    content: '<label>Từ khóa<input data-search-input placeholder="Tên, mã, tuyến đường..."></label><button type="button" data-search-button>Tìm kiếm</button><div class="data-result" data-search-result>Nhập ít nhất 2 ký tự.</div>',
  })
  const input = panel.querySelector('[data-search-input]')
  const result = panel.querySelector('[data-search-result]')
  const format = new GeoJSON()
  const cache = new Map()
  let highlight = null

  function clearHighlight() {
    if (highlight) map.removeLayer(highlight)
    highlight = null
  }

  async function loadLayer(layer) {
    if (cache.has(layer.id)) return cache.get(layer.id)
    const response = await fetch(getWfsUrl(layer))
    if (!response.ok) throw new Error(`${layer.title}: HTTP ${response.status}`)
    const collection = await response.json()
    const features = format.readFeatures(collection, {
      featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326',
    })
    const items = features.map((feature) => ({ feature, layer }))
    cache.set(layer.id, items)
    return items
  }

  function zoomTo(item) {
    const geometry = item.feature.getGeometry()
    if (!geometry) return
    clearHighlight()
    highlight = new VectorLayer({
      source: new VectorSource({ features: [item.feature.clone()] }), zIndex: 9999,
      style: new Style({ fill: new Fill({ color: 'rgba(255, 221, 0, .35)' }), stroke: new Stroke({ color: '#ef4444', width: 3 }), image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#ffdd00' }), stroke: new Stroke({ color: '#ef4444', width: 2 }) }) }),
    })
    map.addLayer(highlight)
    if (geometry.getType().includes('Point')) map.getView().animate({ center: geometry.getFirstCoordinate(), zoom: 14, duration: 350 })
    else map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 15, duration: 350 })
  }

  function render(items) {
    result.innerHTML = ''
    if (!items.length) { result.textContent = 'Không tìm thấy đối tượng phù hợp.'; return }
    items.forEach((item) => {
      const properties = item.feature.getProperties()
      delete properties.geometry
      const text = Object.values(properties).filter((value) => value !== null && value !== '').slice(0, 3).join(' · ') || item.layer.title
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'data-result-item'
      button.textContent = `${item.layer.title}: ${text}`
      button.addEventListener('click', () => zoomTo(item))
      result.appendChild(button)
    })
  }

  async function search() {
    const keyword = normalize(input.value.trim())
    if (keyword.length < 2) { result.textContent = 'Nhập ít nhất 2 ký tự để tìm kiếm.'; return }
    result.textContent = 'Đang tìm kiếm…'
    try {
      const groups = await Promise.all(MAP_LAYER_CONFIGS.map(loadLayer))
      const items = groups.flat().filter(({ feature, layer }) => normalize(`${layer.title} ${Object.values(feature.getProperties()).join(' ')}`).includes(keyword)).slice(0, 30)
      render(items)
    } catch (error) {
      result.textContent = `Không thể lấy dữ liệu WFS: ${error.message}`
    }
  }

  panel.querySelector('[data-search-button]').addEventListener('click', search)
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') search() })
  window.addEventListener('ptn-data-changed', () => cache.clear())
  return { open: () => { panel.classList.add('shown'); input.focus() }, close: () => { panel.classList.remove('shown'); clearHighlight() }, refresh: () => cache.clear() }
}
