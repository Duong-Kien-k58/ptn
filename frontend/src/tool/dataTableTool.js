import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { GEOSERVER_CONFIG, MAP_LAYER_CONFIGS } from '../config/layers.js'
import { createToolPanel } from './toolUtils.js'

const TABLE_FEATURE_LIMIT = 1000

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
    fill: new Fill({ color: 'rgba(255, 221, 0, .35)' }),
    stroke: new Stroke({ color: '#ef4444', width: 3 }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#ffdd00' }),
      stroke: new Stroke({ color: '#ef4444', width: 2 }),
    }),
  })
}

export function createDataTableTool({ map, crudManager }) {
  const panel = createToolPanel({
    id: 'data-table-panel',
    title: 'Xem dữ liệu',
    content: `
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
    `,
  })
  const layerSelect = panel.querySelector('[data-table-layer]')
  const filterInput = panel.querySelector('[data-table-filter]')
  const status = panel.querySelector('[data-table-status]')
  const tableWrap = panel.querySelector('[data-table-wrap]')
  const geoJsonFormat = new GeoJSON()

  let loadedFeatures = []
  let highlightLayer = null

  MAP_LAYER_CONFIGS.forEach((layer) => {
    const option = document.createElement('option')
    option.value = layer.id
    option.textContent = layer.title
    layerSelect.appendChild(option)
  })

  function getCurrentLayer() {
    return MAP_LAYER_CONFIGS.find((layer) => layer.id === layerSelect.value)
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

  // Sau CRUD, bảng đang mở sẽ tự tải lại để hiển thị dữ liệu mới nhất.
  window.addEventListener('ptn-data-changed', () => {
    if (panel.classList.contains('shown')) {
      loadTableData()
    }
  })

  return {
    open() {
      panel.classList.add('shown')
    },
    close() {
      panel.classList.remove('shown')
      clearHighlight()
    },
  }
}
