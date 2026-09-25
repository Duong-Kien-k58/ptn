import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { transform, transformExtent } from 'ol/proj.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { GEOSERVER_CONFIG, MAP_LAYER_CONFIGS, RASTER_LAYER_CONFIGS } from '../config/layers.js'
import { requestJson } from './apiClient.js'
import { createToolPanel } from './toolUtils.js'

const TABLE_FEATURE_LIMIT = 1000
const RASTER_API_URL = `${GEOSERVER_CONFIG.backendUrl.replace(/\/features$/, '')}/rasters`

// Giới hạn 1.000 đối tượng để bảng thuộc tính vẫn phản hồi tốt trên trình duyệt.
function createWfsUrl(layer) {
  const url = new URL(GEOSERVER_CONFIG.wfsUrl, window.location.origin)
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: `${GEOSERVER_CONFIG.workspace}:${layer.id}`,
    outputFormat: 'application/json',
    maxFeatures: String(TABLE_FEATURE_LIMIT),
  })
  return url
}

function createHighlightStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
    stroke: new Stroke({ color: '#ef4444', width: 3 }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#ffdd00' }),
      stroke: new Stroke({ color: '#ef4444', width: 2 }),
    }),
  })
}

export function createDataTableTool({ map, crudManager, rasterGroup }) {
  const panel = createToolPanel({
    id: 'data-table-panel',
    title: 'Xem dữ liệu',
    content: `
      <div class="data-type-tabs" role="group" aria-label="Loại dữ liệu">
        <button type="button" class="active" data-table-type="vector">Vector</button>
        <button type="button" data-table-type="raster">Raster</button>
      </div>
      <div data-vector-view>
      <label>
        Lớp dữ liệu
        <select data-table-layer></select>
      </label>
      <div class="table-toolbar">
        <input data-table-filter placeholder="Lọc nhanh thuộc tính...">
        <button type="button" data-table-load>Tải dữ liệu</button>
        <button type="button" data-table-add>+ Thêm</button>
      </div>
      <p class="tool-hint" data-table-status>
        Chọn lớp rồi tải bảng thuộc tính.
      </p>
      <div class="data-table-wrap" data-table-wrap></div>
      </div>
      <div data-raster-view hidden>
        <label>Lớp raster<select data-raster-layer></select></label>
        <div class="table-toolbar"><button type="button" data-raster-zoom>Zoom tới raster</button></div>
        <p class="tool-hint" data-raster-status>Chọn raster để xem thông tin. Bấm một điểm trên bản đồ để xem giá trị pixel.</p>
        <div class="raster-details" data-raster-details></div>
        <div class="raster-pixel" data-raster-pixel>Chưa chọn điểm trên raster.</div>
      </div>
    `,
  })
  const typeButtons = [...panel.querySelectorAll('[data-table-type]')]
  const vectorView = panel.querySelector('[data-vector-view]')
  const rasterView = panel.querySelector('[data-raster-view]')
  const layerSelect = panel.querySelector('[data-table-layer]')
  const filterInput = panel.querySelector('[data-table-filter]')
  const status = panel.querySelector('[data-table-status]')
  const tableWrap = panel.querySelector('[data-table-wrap]')
  const rasterSelect = panel.querySelector('[data-raster-layer]')
  const rasterStatus = panel.querySelector('[data-raster-status]')
  const rasterDetails = panel.querySelector('[data-raster-details]')
  const rasterPixel = panel.querySelector('[data-raster-pixel]')
  const geoJsonFormat = new GeoJSON()

  let loadedFeatures = []
  let highlightLayer = null
  let rasters = []
  let dataType = 'vector'

  MAP_LAYER_CONFIGS.forEach((layer) => {
    const option = document.createElement('option')
    option.value = layer.id
    option.textContent = layer.title
    layerSelect.appendChild(option)
  })

  function getCurrentLayer() {
    return MAP_LAYER_CONFIGS.find((layer) => layer.id === layerSelect.value)
  }

  function getCurrentRaster() {
    return rasters.find((raster) => raster.name === rasterSelect.value)
  }

  function getRasterLayer(name) {
    return rasterGroup.getLayers().getArray().find((layer) => layer.get('rasterName') === name)
  }

  function setRasterStatus(message) {
    rasterStatus.textContent = message
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return 'Chưa có dữ liệu'
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return null
    const units = ['B', 'KB', 'MB', 'GB']
    const index = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0
    return `${(bytes / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`
  }

  function getRasterMetrics(raster) {
    if (!raster.bbox || raster.bbox.length !== 4 || !raster.width || !raster.height) return {}
    const [minX, minY, maxX, maxY] = raster.bbox.map(Number)
    const resolutionX = Math.abs(maxX - minX) / raster.width
    const resolutionY = Math.abs(maxY - minY) / raster.height
    const isGeographic = /EPSG:(4326|4258|4269)/i.test(raster.crs || '')
    const formatResolution = (value) => value.toFixed(2)
    const latitude = (minY + maxY) / 2 * Math.PI / 180
    const resolutionMetersX = resolutionX * 111320 * Math.cos(latitude)
    const resolutionMetersY = resolutionY * 110574
    const result = {
      resolution: isGeographic
        ? `${formatResolution(resolutionMetersX)} × ${formatResolution(resolutionMetersY)} m/pixel`
        : `${formatResolution(resolutionX)} × ${formatResolution(resolutionY)} m/pixel`,
      coverageArea: isGeographic
        ? `~${(Math.abs((maxX - minX) * 111320 * Math.cos(latitude) * (maxY - minY) * 110574) / 1e6).toFixed(2)} km²`
        : `${(Math.abs((maxX - minX) * (maxY - minY)) / 1e6).toFixed(2)} km²`,
    }
    try {
      const extent = transformExtent(raster.bbox, raster.crs, 'EPSG:4326')
      result.wgs84Extent = `${extent[0].toFixed(5)}, ${extent[1].toFixed(5)} → ${extent[2].toFixed(5)}, ${extent[3].toFixed(5)}`
    } catch {
      result.wgs84Extent = null
    }
    return result
  }

  function renderRasterDetails() {
    const raster = getCurrentRaster()
    rasterDetails.replaceChildren()
    rasterPixel.textContent = 'Chưa chọn điểm trên raster.'
    if (!raster) return
    const technical = raster.technical_metadata || {}
    const metrics = getRasterMetrics(raster)
    const rows = [
      ['Tên raster', raster.name],
      ['Tên hiển thị', raster.title],
      ['Tên file', raster.source_filename],
      ['CRS', raster.crs],
      ['BBox / phạm vi', raster.bbox?.length === 4 ? raster.bbox.map((value) => Number(value).toFixed(3)).join(', ') : null],
      ['Phạm vi WGS84', metrics.wgs84Extent],
      ['Kích thước', raster.width && raster.height ? `${raster.width} × ${raster.height} px` : null],
      ['Độ phân giải', metrics.resolution],
      ['Diện tích phủ', metrics.coverageArea],
      ['Dung lượng file', formatBytes(technical.file_size_bytes)],
      ['Số band', technical.band_count],
      ['Bits / pixel', technical.bits_per_sample],
      ['Kiểu dữ liệu pixel', technical.data_type],
      ['Kiểu mẫu pixel', technical.sample_format],
      ['NoData', technical.no_data],
      ['Ngày tạo', raster.created_at ? new Date(raster.created_at).toLocaleString('vi-VN') : null],
      ['Ngày cập nhật', raster.updated_at ? new Date(raster.updated_at).toLocaleString('vi-VN') : null],
    ]
    rows.forEach(([label, value]) => {
      const row = document.createElement('div')
      const key = document.createElement('span')
      const content = document.createElement('strong')
      key.textContent = label
      content.textContent = formatValue(value)
      row.append(key, content)
      rasterDetails.appendChild(row)
    })
  }

  async function loadRasters() {
    const response = await requestJson(`${RASTER_API_URL}/`)
    const metadataByName = new Map(response.rasters.map((raster) => [raster.name, raster]))
    const configured = RASTER_LAYER_CONFIGS.map((raster) => [raster.name, raster])
    const onMap = rasterGroup.getLayers().getArray().map((layer) => {
      const name = layer.get('rasterName')
      return [name, { name, title: layer.get('title'), ...layer.get('rasterMetadata') }]
    })
    rasters = [...new Map([...configured, ...onMap, ...metadataByName]).values()]
    const selected = rasterSelect.value
    rasterSelect.replaceChildren(...rasters.map((raster) => new Option(raster.title || raster.name, raster.name)))
    if (rasters.some((raster) => raster.name === selected)) rasterSelect.value = selected
    renderRasterDetails()
  }

  function zoomToRaster() {
    const raster = getCurrentRaster()
    if (!raster?.bbox || raster.bbox.length !== 4 || !raster.crs) {
      setRasterStatus('Raster này chưa có CRS hoặc phạm vi để zoom.')
      return
    }
    try {
      const extent = transformExtent(raster.bbox, raster.crs, map.getView().getProjection())
      map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 15, duration: 350 })
    } catch {
      setRasterStatus('Không thể chuyển đổi phạm vi raster sang hệ tọa độ bản đồ.')
    }
  }

  async function identifyRasterPixel(event) {
    if (!panel.classList.contains('shown') || dataType !== 'raster') return
    const raster = getCurrentRaster()
    const layer = raster && getRasterLayer(raster.name)
    const source = layer?.getSource()
    if (!source) return
    const url = source.getFeatureInfoUrl(event.coordinate, map.getView().getResolution(), map.getView().getProjection(), {
      INFO_FORMAT: 'application/json',
      FEATURE_COUNT: 1,
    })
    if (!url) return
    rasterPixel.textContent = 'Đang đọc giá trị pixel…'
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const properties = data.features?.[0]?.properties
      if (!properties || !Object.keys(properties).length) throw new Error('Không có giá trị tại điểm này.')
      const coordinate = transform(event.coordinate, map.getView().getProjection(), 'EPSG:4326')
      rasterPixel.replaceChildren(...[
        `Tọa độ: ${coordinate[0].toFixed(6)}, ${coordinate[1].toFixed(6)}`,
        ...Object.entries(properties).map(([key, value]) => `${key}: ${formatValue(value)}`),
      ].map((line) => {
        const row = document.createElement('div')
        row.textContent = line
        return row
      }))
    } catch (error) {
      rasterPixel.textContent = `Không thể đọc pixel: ${error.message}`
    }
  }

  function isCurrentLayerEditable() {
    return Boolean(getCurrentLayer()?.editable)
  }

  function clearHighlight() {
    if (highlightLayer) {
      map.removeLayer(highlightLayer)
    }
    highlightLayer = null
  }

  // Highlight nằm trên cùng và được xóa trước mỗi lần người dùng chọn dòng mới.
  function zoomToFeature(feature) {
    const geometry = feature.getGeometry()
    if (!geometry) {
      return
    }

    clearHighlight()
    highlightLayer = new VectorLayer({
      source: new VectorSource({ features: [feature.clone()] }),
      zIndex: 9999,
      style: createHighlightStyle(),
    })
    map.addLayer(highlightLayer)

    if (geometry.getType().includes('Point')) {
      map.getView().animate({
        center: geometry.getFirstCoordinate(),
        zoom: 14,
        duration: 350,
      })
      return
    }

    map.getView().fit(geometry.getExtent(), {
      padding: [80, 80, 80, 80],
      maxZoom: 15,
      duration: 350,
    })
  }

  function getFilteredFeatures() {
    const keyword = filterInput.value.trim().toLocaleLowerCase('vi-VN')
    if (!keyword) {
      return loadedFeatures
    }

    return loadedFeatures.filter((feature) => {
      return Object.values(feature.getProperties()).some((value) => {
        return String(value ?? '').toLocaleLowerCase('vi-VN').includes(keyword)
      })
    })
  }

  function getTableFields(features) {
    const fields = new Set()
    features.forEach((feature) => {
      Object.keys(feature.getProperties())
        .filter((fieldName) => fieldName !== 'geometry')
        .forEach((fieldName) => fields.add(fieldName))
    })
    return [...fields]
  }

  function createActionButton(label, className, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  function createFeatureRow(feature, fields) {
    const row = document.createElement('tr')
    const actionCell = document.createElement('td')
    actionCell.className = 'table-actions'

    const viewButton = createActionButton('Xem', '', () => zoomToFeature(feature))
    actionCell.appendChild(viewButton)

    if (isCurrentLayerEditable()) {
      const layerId = getCurrentLayer().id
      const editButton = createActionButton('Sửa', '', () => {
        zoomToFeature(feature)
        crudManager.openFromTable('edit-vector', layerId, feature)
      })
      const deleteButton = createActionButton('Xóa', 'danger', () => {
        zoomToFeature(feature)
        crudManager.openFromTable('delete-vector', layerId, feature)
      })
      actionCell.append(editButton, deleteButton)
    }

    row.appendChild(actionCell)
    fields.forEach((fieldName) => {
      const cell = document.createElement('td')
      cell.textContent = feature.get(fieldName) ?? ''
      row.appendChild(cell)
    })

    // Nhấp đúp vào bất kỳ ô nào cũng đưa bản đồ đến đối tượng tương ứng.
    row.addEventListener('dblclick', () => zoomToFeature(feature))
    return row
  }

  function renderTable() {
    tableWrap.replaceChildren()
    const visibleFeatures = getFilteredFeatures()

    if (!visibleFeatures.length) {
      tableWrap.textContent = loadedFeatures.length
        ? 'Không có dòng khớp bộ lọc.'
        : 'Lớp này chưa có dữ liệu.'
      return
    }

    const fields = getTableFields(visibleFeatures)
    const table = document.createElement('table')
    const header = document.createElement('thead')
    const headerRow = document.createElement('tr')
    const actionHeader = document.createElement('th')
    actionHeader.textContent = 'Thao tác'
    headerRow.appendChild(actionHeader)

    fields.forEach((fieldName) => {
      const cell = document.createElement('th')
      cell.textContent = fieldName
      headerRow.appendChild(cell)
    })

    header.appendChild(headerRow)
    table.appendChild(header)

    const body = document.createElement('tbody')
    visibleFeatures.forEach((feature) => {
      body.appendChild(createFeatureRow(feature, fields))
    })
    table.appendChild(body)
    tableWrap.appendChild(table)
  }

  async function loadTableData() {
    const layer = getCurrentLayer()
    status.textContent = 'Đang tải dữ liệu…'
    tableWrap.replaceChildren()
    clearHighlight()

    try {
      const response = await fetch(createWfsUrl(layer))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const featureCollection = await response.json()
      loadedFeatures = geoJsonFormat.readFeatures(featureCollection, {
        dataProjection: 'EPSG:4326',
        featureProjection: map.getView().getProjection(),
      })
      renderTable()
      status.textContent = `Đã tải ${loadedFeatures.length} đối tượng. Dùng Xem, Sửa hoặc Xóa ngay trên từng dòng.`
    } catch (error) {
      status.textContent = `Không thể lấy dữ liệu WFS: ${error.message}`
    }
  }

  panel.querySelector('[data-table-load]').addEventListener('click', loadTableData)
  panel.querySelector('[data-table-add]').addEventListener('click', () => {
    if (!isCurrentLayerEditable()) {
      status.textContent = 'Lớp này chỉ đọc, không thể thêm dữ liệu.'
      return
    }
    crudManager.openFromTable('add-vector', getCurrentLayer().id)
  })

  filterInput.addEventListener('input', renderTable)
  layerSelect.addEventListener('change', () => {
    loadedFeatures = []
    filterInput.value = ''
    tableWrap.replaceChildren()
    status.textContent = 'Chọn “Tải dữ liệu” để xem lớp mới.'
  })

  async function selectDataType(type) {
    dataType = type
    typeButtons.forEach((button) => button.classList.toggle('active', button.dataset.tableType === type))
    const isRaster = type === 'raster'
    vectorView.hidden = isRaster
    rasterView.hidden = !isRaster
    clearHighlight()
    if (!isRaster) return
    try {
      await loadRasters()
      setRasterStatus('Chọn raster để xem metadata. Bấm bản đồ để đọc giá trị pixel.')
    } catch (error) {
      setRasterStatus(`Không thể tải danh sách raster: ${error.message}`)
    }
  }

  typeButtons.forEach((button) => button.addEventListener('click', () => selectDataType(button.dataset.tableType)))

  rasterSelect.addEventListener('change', () => {
    renderRasterDetails()
    setRasterStatus('Bấm bản đồ để đọc giá trị pixel hoặc dùng “Zoom tới raster”.')
  })
  panel.querySelector('[data-raster-zoom]').addEventListener('click', zoomToRaster)
  map.on('singleclick', identifyRasterPixel)

  // Sau CRUD, bảng đang mở sẽ tự tải lại để hiển thị dữ liệu mới nhất.
  window.addEventListener('ptn-data-changed', () => {
    if (panel.classList.contains('shown')) {
      if (dataType === 'vector') loadTableData()
      else loadRasters().catch((error) => setRasterStatus(error.message))
    }
  })

  return {
    open() {
      panel.classList.add('shown')
      if (dataType === 'raster') {
        loadRasters()
          .then(() => setRasterStatus('Chọn raster để xem metadata. Bấm bản đồ để đọc giá trị pixel.'))
          .catch((error) => setRasterStatus(`Không thể tải danh sách raster: ${error.message}`))
      }
    },
    close() {
      panel.classList.remove('shown')
      clearHighlight()
    },
  }
}
