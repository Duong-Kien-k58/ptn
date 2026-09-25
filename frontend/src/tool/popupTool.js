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
      <div class="data-type-tabs" role="group" aria-label="Loại dữ liệu">
        <button type="button" class="active" data-popup-type="vector">Vector</button>
        <button type="button" data-popup-type="raster">Raster</button>
      </div>
      <label>Lớp dữ liệu<select data-popup-layer></select></label>
      <p class="tool-hint" data-popup-status>Chọn lớp rồi nhấp đối tượng trên bản đồ.</p>
    `,
  })
  const typeButtons = [...panel.querySelectorAll('[data-popup-type]')]
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
  let dataType = 'vector'

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

  function getVisibleVectorItems() {
    const entries = getMapLayerEntries()
    return MAP_LAYER_CONFIGS.map((config) => {
      const entry = entries.find(({ layer, isVisible }) => isVisible && layer.get('configId') === config.id)
      return entry && { id: config.id, title: config.title, kind: 'vector', config, layer: entry.layer }
    }).filter(Boolean)
  }

  function getVisibleRasterItems() {
    return getMapLayerEntries().flatMap(({ layer, isVisible }) => {
      const name = layer.get('rasterName')
      if (!isVisible || !name) return []
      return [{ id: name, title: layer.get('title') || name, kind: 'raster', layer }]
    })
  }

  function getVisibleItems() {
    return dataType === 'raster' ? getVisibleRasterItems() : getVisibleVectorItems()
  }

  function getCurrentItem() {
    return getVisibleItems().find((item) => item.id === layerSelect.value)
  }

  function refreshLayerOptions() {
    const previous = layerSelect.value
    const items = getVisibleItems()
    layerSelect.replaceChildren()
    if (!items.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = `Không có lớp ${dataType} đang bật`
      layerSelect.appendChild(option)
      layerSelect.disabled = true
      return
    }

    items.forEach((item) => {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.title
      layerSelect.appendChild(option)
    })
    layerSelect.disabled = false
    layerSelect.value = items.some((item) => item.id === previous) ? previous : items[0].id
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

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return null
    const units = ['B', 'KB', 'MB', 'GB']
    const index = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0
    return `${(bytes / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`
  }

  function getResolution(metadata) {
    const { bbox, width, height } = metadata
    if (!bbox || bbox.length !== 4 || !width || !height) return null
    const [minX, minY, maxX, maxY] = bbox.map(Number)
    const x = Math.abs(maxX - minX) / width
    const y = Math.abs(maxY - minY) / height
    const geographic = /EPSG:(4326|4258|4269)/i.test(metadata.crs || '')
    if (!geographic) return `${x.toFixed(2)} × ${y.toFixed(2)} m/pixel`
    const latitude = (minY + maxY) / 2 * Math.PI / 180
    return `${(x * 111320 * Math.cos(latitude)).toFixed(2)} × ${(y * 110574).toFixed(2)} m/pixel`
  }

  function appendRasterMetadata(item) {
    const metadata = item.layer.get('rasterMetadata') || {}
    const technical = metadata.technical_metadata || {}
    const rows = [
      ['Tên file', metadata.source_filename],
      ['CRS', metadata.crs],
      ['Phạm vi', metadata.bbox?.length === 4 ? metadata.bbox.map((value) => Number(value).toFixed(3)).join(', ') : null],
      ['Kích thước', metadata.width && metadata.height ? `${metadata.width} × ${metadata.height} px` : null],
      ['Độ phân giải', getResolution(metadata)],
      ['Số band', technical.band_count],
      ['Bits / pixel', technical.bits_per_sample],
      ['Kiểu dữ liệu', technical.data_type],
      ['NoData', technical.no_data],
      ['Dung lượng', formatBytes(technical.file_size_bytes)],
      ['Cập nhật', metadata.updated_at ? new Date(metadata.updated_at).toLocaleString('vi-VN') : null],
    ]
    rows.forEach(([label, value]) => {
      if (value !== null && value !== undefined && value !== '') appendRow(label, value)
    })
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

  function showRaster(properties, item, coordinate) {
    highlightSource.clear()
    popupContent.replaceChildren()
    popupTitle.textContent = item.title
    appendRow('Raster', item.id)
    appendRasterMetadata(item)
    Object.entries(properties).forEach(([name, value]) => appendRow(name, value))
    const [longitude, latitude] = toLonLat(coordinate)
    appendRow('Tọa độ', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
    popupElement.hidden = false
    overlay.setPosition(coordinate)
  }

  async function identify(event) {
    const item = getCurrentItem()
    if (!item) {
      refreshLayerOptions()
      clearPopup()
      status.textContent = 'Lớp đã tắt hoặc không còn hiển thị trên bản đồ.'
      return
    }

    const url = item.layer.getSource()?.getFeatureInfoUrl(
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
    status.textContent = `Đang tra cứu ${item.title}…`
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (currentRequest !== requestId) return

      if (item.kind === 'raster') {
        const properties = data.features?.[0]?.properties
        if (!properties || !Object.keys(properties).length) throw new Error('Không có giá trị pixel tại vị trí này.')
        showRaster(properties, item, event.coordinate)
        status.textContent = `Đang xem giá trị pixel lớp ${item.title}.`
        return
      }

      const feature = geoJsonFormat.readFeatures(data, {
        dataProjection: map.getView().getProjection(), featureProjection: map.getView().getProjection(),
      })[0]
      if (!feature?.getGeometry()) {
        clearPopup()
        status.textContent = `Không tìm thấy đối tượng thuộc lớp ${item.title}.`
        return
      }

      showFeature(feature, item.config, event.coordinate)
      status.textContent = `Đang xem thông tin lớp ${item.title}.`
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
    const selectedLayerIsVisible = getVisibleItems().some((item) => item.id === selectedLayerId)
    refreshLayerOptions()
    if (!selectedLayerIsVisible) clearPopup()
  }))
  typeButtons.forEach((button) => button.addEventListener('click', () => {
    dataType = button.dataset.popupType
    typeButtons.forEach((item) => item.classList.toggle('active', item === button))
    refreshLayerOptions()
    clearPopup()
    status.textContent = dataType === 'raster'
      ? 'Chọn raster đang bật rồi nhấp bản đồ để đọc giá trị pixel.'
      : 'Chọn lớp rồi nhấp đối tượng trên bản đồ.'
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
