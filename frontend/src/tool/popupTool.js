import GeoJSON from 'ol/format/GeoJSON.js'
import Overlay from 'ol/Overlay.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { toLonLat } from 'ol/proj.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { MAP_LAYER_CONFIGS } from '../config/layers.js'
import { createToolPanel } from './toolUtils.js'

// Tra cứu nhanh WMS: chỉ đọc feature, không thay đổi dữ liệu nguồn.
export function createPopupTool({ map }) {
  const geoJsonFormat = new GeoJSON()
  const highlightSource = new VectorSource()
  const highlightLayer = new VectorLayer({
    source: highlightSource,
    zIndex: 10000,
    style: new Style({
      fill: new Fill({ color: 'rgba(255, 221, 0, .35)' }),
      stroke: new Stroke({ color: '#ef4444', width: 3 }),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#ffdd00' }),
        stroke: new Stroke({ color: '#ef4444', width: 2 }),
      }),
    }),
  })
  map.addLayer(highlightLayer)

  const panel = createToolPanel({
    id: 'identify-panel',
    title: 'Tra cứu thông tin',
    content: `
      <label>Lớp dữ liệu<select data-popup-layer></select></label>
      <p class="tool-hint" data-popup-status>Chọn lớp rồi nhấp đối tượng trên bản đồ.</p>
    `,
  })
  const layerSelect = panel.querySelector('[data-popup-layer]')
  const status = panel.querySelector('[data-popup-status]')

  const popupElement = document.createElement('section')
  popupElement.className = 'feature-popup'
  popupElement.hidden = true
  const popupHeader = document.createElement('header')
  popupHeader.className = 'feature-popup-header'
  const popupTitle = document.createElement('h3')
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'feature-popup-close'
  closeButton.setAttribute('aria-label', 'Đóng thông tin')
  closeButton.textContent = '×'
  const popupContent = document.createElement('div')
  popupContent.className = 'feature-popup-content'
  popupHeader.append(popupTitle, closeButton)
  popupElement.append(popupHeader, popupContent)
  const overlay = new Overlay({
    element: popupElement,
    autoPan: { animation: { duration: 180 }, margin: 18 },
    positioning: 'bottom-center',
    offset: [0, -12],
  })
  map.addOverlay(overlay)

  let active = false
  let requestId = 0

  function getMapLayerEntries() {
    const entries = []
    function collect(layer, parentVisible = true) {
      const isVisible = parentVisible && layer.getVisible()
      const children = layer.getLayers?.()
      if (children) children.forEach((child) => collect(child, isVisible))
      else entries.push({ layer, isVisible })
    }
    map.getLayers().forEach(collect)
    return entries
  }

  function getVisibleConfigs() {
    const entries = getMapLayerEntries()
    return MAP_LAYER_CONFIGS.filter((config) => entries.some(({ layer, isVisible }) => {
      return isVisible && layer.get('configId') === config.id
    }))
  }

  function getLayerForConfig(config) {
    return getMapLayerEntries().find(({ layer, isVisible }) => {
      return isVisible && layer.get('configId') === config.id
    })?.layer
  }

  function getCurrentConfig() {
    return getVisibleConfigs().find((config) => config.id === layerSelect.value)
  }

  function refreshLayerOptions() {
    const previous = layerSelect.value
    const configs = getVisibleConfigs()
    layerSelect.replaceChildren()
    if (!configs.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'Không có lớp đang hiển thị'
      layerSelect.appendChild(option)
      layerSelect.disabled = true
      return
    }

    configs.forEach((config) => {
      const option = document.createElement('option')
      option.value = config.id
      option.textContent = config.title
      layerSelect.appendChild(option)
    })
    layerSelect.disabled = false
    layerSelect.value = configs.some((config) => config.id === previous) ? previous : configs[0].id
  }

  function clearPopup() {
    requestId += 1
    highlightSource.clear()
    overlay.setPosition(undefined)
    popupContent.replaceChildren()
    popupElement.hidden = true
  }

  function appendRow(label, value) {
    const row = document.createElement('div')
    row.className = 'feature-popup-row'
    const name = document.createElement('strong')
    name.textContent = `${label}:`
    const content = document.createElement('span')
    content.textContent = value === null || value === undefined || value === '' ? '—' : String(value)
    row.append(name, content)
    popupContent.appendChild(row)
  }

  function showFeature(feature, config, coordinate) {
    highlightSource.clear()
    highlightSource.addFeature(feature.clone())
    popupContent.replaceChildren()

    popupTitle.textContent = config.title
    config.fields.forEach((field) => appendRow(field.label, feature.get(field.id)))
    const [longitude, latitude] = toLonLat(coordinate)
    appendRow('Tọa độ', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)

    popupElement.hidden = false
    overlay.setPosition(coordinate)
  }

  async function identify(event) {
    const config = getCurrentConfig()
    const wmsLayer = config && getLayerForConfig(config)
    if (!config || !wmsLayer) {
      refreshLayerOptions()
      clearPopup()
      status.textContent = 'Lớp đã tắt hoặc không còn hiển thị trên bản đồ.'
      return
    }

    const url = wmsLayer.getSource()?.getFeatureInfoUrl(
      event.coordinate,
      map.getView().getResolution(),
      map.getView().getProjection(),
      { INFO_FORMAT: 'application/json', FEATURE_COUNT: 1, BUFFER: 8 },
    )
    if (!url) {
      clearPopup()
      status.textContent = 'Lớp này không hỗ trợ tra cứu thông tin.'
      return
    }

    const currentRequest = ++requestId
    status.textContent = `Đang tra cứu ${config.title}…`
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (currentRequest !== requestId) return

      const feature = geoJsonFormat.readFeatures(data, {
        dataProjection: map.getView().getProjection(),
        featureProjection: map.getView().getProjection(),
      })[0]
      if (!feature?.getGeometry()) {
        clearPopup()
        status.textContent = `Không tìm thấy đối tượng thuộc lớp ${config.title}.`
        return
      }

      showFeature(feature, config, event.coordinate)
      status.textContent = `Đang xem thông tin lớp ${config.title}.`
    } catch (error) {
      if (currentRequest !== requestId) return
      clearPopup()
      status.textContent = `Không thể tra cứu thông tin: ${error.message}`
    }
  }

  function getAllMapLayerNodes() {
    const nodes = []
    function collect(layer) {
      nodes.push(layer)
      layer.getLayers?.().forEach(collect)
    }
    map.getLayers().forEach(collect)
    return nodes
  }

  closeButton.addEventListener('click', clearPopup)
  map.on('singleclick', (event) => { if (active) identify(event) })
  getAllMapLayerNodes().forEach((layer) => layer.on('change:visible', () => {
    const selectedLayerId = layerSelect.value
    const selectedLayerIsVisible = getVisibleConfigs().some((config) => config.id === selectedLayerId)
    refreshLayerOptions()
    if (!selectedLayerIsVisible) clearPopup()
  }))
  refreshLayerOptions()

  return {
    open() {
      active = true
      refreshLayerOptions()
      panel.classList.add('shown')
      map.getTargetElement().style.cursor = 'help'
    },
    close() {
      active = false
      requestId += 1
      map.getTargetElement().style.cursor = ''
      panel.classList.remove('shown')
      clearPopup()
    },
  }
}
