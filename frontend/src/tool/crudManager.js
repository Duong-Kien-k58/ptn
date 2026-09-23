import Draw from 'ol/interaction/Draw.js'
import Feature from 'ol/Feature.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import Modify from 'ol/interaction/Modify.js'
import Snap from 'ol/interaction/Snap.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'
import { GEOSERVER_CONFIG, MAP_LAYER_CONFIGS } from '../config/layers.js'
import { requestJson } from './apiClient.js'
import { createToolPanel } from './toolUtils.js'

const geoJsonFormat = new GeoJSON()
const SNAP_FEATURE_LIMIT = 5000
const FEATURE_INFO_LIMIT = 20

// WFS chỉ dùng để đọc feature phục vụ chọn và bắt dính. CRUD đi qua Django API.
function createWfsUrl(layer) {
  const url = new URL(GEOSERVER_CONFIG.wfsUrl, window.location.origin)
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: `${GEOSERVER_CONFIG.workspace}:${layer.id}`,
    outputFormat: 'application/json',
    maxFeatures: String(SNAP_FEATURE_LIMIT),
  })
  return url
}

// GeoServer có thể trả gid, id, hoặc mã dạng "ptn:nenbien.12".
function getFeatureId(feature) {
  const possibleIds = [feature.get('gid'), feature.get('id'), feature.getId()]

  for (const value of possibleIds) {
    if (Number.isInteger(value)) {
      return value
    }

    const matchedNumber = String(value ?? '').match(/(?:^|[.:])(\d+)$/)
    if (matchedNumber) {
      return Number(matchedNumber[1])
    }
  }

  return null
}

function closePolygonRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return ring
  }

  const firstPoint = ring[0]
  const lastPoint = ring.at(-1)
  const isClosed = Array.isArray(firstPoint)
    && Array.isArray(lastPoint)
    && firstPoint[0] === lastPoint[0]
    && firstPoint[1] === lastPoint[1]

  return isClosed ? ring : [...ring, [...firstPoint]]
}

// OpenLayers thường tự đóng Polygon. Chuẩn hóa lại trước khi gửi Django để
// GeoJSON hợp lệ ngay cả trong những trường hợp dữ liệu đặc biệt.
function normalizePolygonGeometry(geometry) {
  if (geometry?.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(closePolygonRing),
    }
  }

  if (geometry?.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(closePolygonRing)),
    }
  }

  return geometry
}

// GeoServer GetFeatureInfo trả CRS ở cấp FeatureCollection, thường là CRS
// hiện tại của bản đồ. Không được mặc định EPSG:4326 khi dữ liệu là EPSG:3857.
function getFeatureInfoProjection(featureCollection, fallbackProjection) {
  const crsName = featureCollection?.crs?.properties?.name
  const matchedEpsg = String(crsName ?? '').match(/EPSG(?::|::)(\d+)$/i)
  return matchedEpsg ? `EPSG:${matchedEpsg[1]}` : fallbackProjection
}

function createButton(label, className = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  return button
}

export function createCrudManager({ map }) {
  // Chỉ cho phép CRUD các lớp được khai báo editable trong layers.js.
  const editableLayers = MAP_LAYER_CONFIGS.filter((layer) => layer.editable)

  // sketchSource hiển thị feature đang chọn/vẽ. snapSource chỉ chứa dữ liệu
  // để Snap bắt dính điểm, cạnh nên không được đưa thành một layer hiển thị.
  const sketchSource = new VectorSource()
  const snapSource = new VectorSource()
  const sketchLayer = new VectorLayer({
    source: sketchSource,
    zIndex: 9998,
    style: new Style({
      fill: new Fill({ color: 'rgba(255, 221, 0, .35)' }),
      stroke: new Stroke({ color: '#ef4444', width: 3 }),
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#ffdd00' }),
        stroke: new Stroke({ color: '#ef4444', width: 2 }),
      }),
    }),
  })
  map.addLayer(sketchLayer)

  // Hiển thị tất cả đỉnh của đối tượng đang sửa để người dùng biết chính xác
  // nơi có thể kéo và bắt dính, thay vì chỉ hiện nút khi rê chuột thật sát.
  const editVertexSource = new VectorSource()
  const editVertexLayer = new VectorLayer({
    source: editVertexSource,
    zIndex: 9999,
    style: new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#22d3ee' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
    }),
  })
  map.addLayer(editVertexLayer)

  const panel = createToolPanel({
    id: 'crud-panel',
    title: 'Quản trị dữ liệu không gian',
    content: `
      <label>
        Lớp dữ liệu
        <select data-crud-layer></select>
      </label>
      <div class="crud-status" data-crud-status></div>
      <div data-crud-workspace></div>
      <div class="crud-form-actions" data-crud-actions></div>
    `,
  })
  panel.dataset.featureAction = 'crud'
  const layerSelect = panel.querySelector('[data-crud-layer]')
  const status = panel.querySelector('[data-crud-status]')
  const workspace = panel.querySelector('[data-crud-workspace]')
  const actionArea = panel.querySelector('[data-crud-actions]')

  let currentAction = null
  let selectedFeature = null
  let selectedFeatureId = null
  let replacementGeometry = null
  let drawInteraction = null
  let modifyInteraction = null
  let snapInteraction = null
  let isSelecting = false
  let snapFeaturesLoaded = false
  let snapLayerKey = ''
  let isSaving = false
  let openedFromTable = false
  let hiddenWmsFeature = null

  function getCurrentLayer() {
    return editableLayers.find((layer) => layer.id === layerSelect.value)
  }

  function setStatus(message, isError = false) {
    status.textContent = message
    status.classList.toggle('error', isError)
  }

  function setMapCursor(cursor = '') {
    map.getTargetElement().style.cursor = cursor
  }

  // WMS là ảnh nên không tự dịch theo feature preview. Tạm ẩn riêng feature
  // đang sửa khỏi WMS để chỉ còn thấy vị trí mới do VectorLayer hiển thị.
  function hideSelectedFeatureFromWms() {
    restoreSelectedFeatureToWms()
    const layer = getCurrentLayer()
    if (!layer || selectedFeatureId === null) return

    const mapLayer = getMapLayerEntries().find(({ layer: item }) => item.get('configId') === layer.id)?.layer
    const source = mapLayer?.getSource?.()
    if (!source?.getParams || !source.updateParams) return

    const originalFilter = source.getParams().CQL_FILTER
    const exclusion = `gid <> ${selectedFeatureId}`
    const filter = originalFilter && originalFilter !== 'INCLUDE'
      ? `(${originalFilter}) AND (${exclusion})`
      : exclusion
    source.updateParams({ CQL_FILTER: filter, _reload: Date.now() })
    hiddenWmsFeature = { source, originalFilter }
  }

  function restoreSelectedFeatureToWms() {
    if (!hiddenWmsFeature) return
    hiddenWmsFeature.source.updateParams({
      CQL_FILTER: hiddenWmsFeature.originalFilter || 'INCLUDE',
      _reload: Date.now(),
    })
    hiddenWmsFeature = null
  }

  function getGeometryVertices(coordinates) {
    if (!Array.isArray(coordinates)) return []
    if (Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
      return [coordinates]
    }
    return coordinates.flatMap(getGeometryVertices)
  }

  function showEditVertices() {
    editVertexSource.clear()
    const geometry = selectedFeature?.getGeometry()
    if (!geometry) return

    const seen = new Set()
    getGeometryVertices(geometry.getCoordinates()).forEach((coordinate) => {
      const key = `${coordinate[0]}:${coordinate[1]}`
      if (!seen.has(key)) {
        seen.add(key)
        editVertexSource.addFeature(new Feature(new Point(coordinate)))
      }
    })
  }

  function isNearEditableGeometry(pixel) {
    const geometry = selectedFeature?.getGeometry()
    if (!geometry) return false

    const coordinate = map.getCoordinateFromPixel(pixel)
    const nearestCoordinate = geometry.getClosestPoint(coordinate)
    const nearestPixel = map.getPixelFromCoordinate(nearestCoordinate)
    return Math.hypot(pixel[0] - nearestPixel[0], pixel[1] - nearestPixel[1]) <= 16
  }

  function stopDrawing() {
    if (drawInteraction) {
      map.removeInteraction(drawInteraction)
    }
    if (snapInteraction) {
      map.removeInteraction(snapInteraction)
    }
    if (modifyInteraction) {
      map.removeInteraction(modifyInteraction)
    }

    drawInteraction = null
    modifyInteraction = null
    snapInteraction = null
    setMapCursor()
  }

  function resetWorkspace() {
    stopDrawing()
    restoreSelectedFeatureToWms()
    isSelecting = false
    isSaving = false
    layerSelect.disabled = !getVisibleEditableLayers().length
    isSaving = false
    layerSelect.disabled = false
    selectedFeature = null
    selectedFeatureId = null
    replacementGeometry = null
    sketchSource.clear()
    editVertexSource.clear()
    workspace.replaceChildren()
    actionArea.replaceChildren()
  }

  // Tải nền bắt dính ngầm để người dùng có thể bấm bắt đầu vẽ ngay lập tức.
  async function loadSnapFeatures() {
    const visibleLayers = getVisibleEditableLayers()
    const visibleLayerKey = visibleLayers.map((layer) => layer.id).join(',')
    if (snapFeaturesLoaded && snapLayerKey === visibleLayerKey) {
      return snapSource.getFeatures().length
    }

    snapSource.clear()
    const loadingResults = await Promise.allSettled(
      visibleLayers.map(async (layer) => {
        const response = await fetch(createWfsUrl(layer))
        if (!response.ok) {
          throw new Error(`WFS ${layer.id}: HTTP ${response.status}`)
        }

        const featureCollection = await response.json()
        return geoJsonFormat.readFeatures(featureCollection, {
          dataProjection: 'EPSG:4326',
          featureProjection: map.getView().getProjection(),
        })
      }),
    )

    loadingResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        snapSource.addFeatures(result.value)
      }
    })

    snapFeaturesLoaded = true
    snapLayerKey = visibleLayerKey
    return snapSource.getFeatures().length
  }

  function startDrawing(mode) {
    stopDrawing()
    const layer = getCurrentLayer()
    if (!layer) {
      setStatus('Hãy bật một lớp dữ liệu trước khi vẽ.', true)
      return
    }
    if (mode === 'edit' && layer.type === 'Point') {
      setStatus('Điểm được di chuyển trực tiếp bằng cách kéo nút cyan, không cần vẽ điểm thay thế.', true)
      return
    }
    const instruction = mode === 'add'
      ? 'Vẽ đối tượng mới. Nhấp để đặt điểm, nhấp đúp để kết thúc.'
      : 'Vẽ hình học thay thế. Nhấp để đặt điểm, nhấp đúp để kết thúc.'

    // OpenLayers xử lý tương tác theo thứ tự ngược lúc thêm. Thêm Snap sau
    // Draw để Snap điều chỉnh tọa độ trước khi Draw ghi nhận điểm đó.
    drawInteraction = new Draw({
      source: sketchSource,
      type: layer.type,
    })
    map.addInteraction(drawInteraction)

    snapInteraction = new Snap({
      // Khi sửa, chỉ bắt dính vào hình học đang chọn; không tải toàn bộ WFS.
      source: mode === 'edit' ? sketchSource : snapSource,
      pixelTolerance: 16,
      vertex: true,
      edge: true,
    })
    map.addInteraction(snapInteraction)

    // Chế độ vẽ hình thay thế dùng dấu +; chỉnh trực tiếp dùng con trỏ kéo.
    setMapCursor(mode === 'edit' ? 'default' : 'crosshair')
    if (mode === 'edit') {
      setStatus(`${instruction} Có thể bắt dính vào điểm hoặc cạnh của đối tượng đang chọn.`)
    } else {
      setStatus(`${instruction} Đang tải dữ liệu bắt dính…`)
      loadSnapFeatures()
        .then((featureCount) => {
          if (drawInteraction) {
            setStatus(`${instruction} Có thể bắt dính điểm/cạnh (${featureCount} đối tượng).`)
          }
        })
        .catch(() => {
          if (drawInteraction) {
            setStatus(`${instruction} Không tải được dữ liệu bắt dính, vẫn có thể vẽ bình thường.`, true)
          }
        })
    }

    drawInteraction.once('drawend', (event) => {
      stopDrawing()

      if (mode === 'add') {
        selectedFeature = event.feature
      } else {
        replacementGeometry = event.feature.getGeometry().clone()
        // Hình cũ chỉ được giữ trong lúc vẽ để Snap bắt dính. Khi đã vẽ
        // xong, chỉ hiển thị hình thay thế để không gây nhầm lẫn.
        sketchSource.clear()
        sketchSource.addFeature(event.feature)
        editVertexSource.clear()
      }

      renderPropertyForm()
      setStatus(
        mode === 'add'
          ? 'Nhập toàn bộ thuộc tính rồi lưu.'
          : 'Đã có hình học mới. Kiểm tra thuộc tính rồi lưu.',
      )
    })
  }

  function createPropertyFields(layer, feature = null) {
    const fields = document.createElement('div')
    fields.className = 'crud-fields'
    fields.dataset.crudProperties = ''

    layer.fields.forEach((field) => {
      const label = document.createElement('label')
      label.textContent = field.label

      const input = document.createElement('input')
      input.name = field.id
      input.value = feature?.get(field.id) ?? ''

      label.appendChild(input)
      fields.appendChild(label)
    })

    return fields
  }

  function readPropertiesFromForm() {
    const properties = {}
    workspace.querySelectorAll('[data-crud-properties] input').forEach((input) => {
      properties[input.name] = input.value
    })
    return properties
  }

  function renderPropertyForm() {
    const layer = getCurrentLayer()
    if (!layer) {
      workspace.replaceChildren()
      actionArea.replaceChildren()
      setStatus('Lớp đang thao tác đã tắt. Hãy bật lại lớp trước khi tiếp tục.', true)
      return
    }

    workspace.replaceChildren(createPropertyFields(layer, selectedFeature))
    actionArea.replaceChildren()

    const saveButton = createButton('Lưu thay đổi')
    saveButton.addEventListener('click', saveFeature)

    const cancelButton = createButton('Hủy', 'secondary')
    cancelButton.addEventListener('click', () => {
      resetWorkspace()
      setStatus('Đã hủy thao tác.')
    })

    actionArea.append(saveButton, cancelButton)
  }

  function renderEditChoice() {
    const geometryActionLabel = getCurrentLayer()?.type === 'Point'
      ? 'Di chuyển điểm'
      : 'Sửa hình học'
    workspace.innerHTML = `
      <p class="tool-hint">Chọn cách sửa đối tượng đã chọn.</p>
      <div class="crud-mode-grid">
        <button type="button" data-crud-mode="attributes">Sửa thuộc tính</button>
        <button type="button" data-crud-mode="geometry">${geometryActionLabel}</button>
      </div>
    `
    actionArea.replaceChildren()

    workspace.querySelector('[data-crud-mode="attributes"]').addEventListener('click', () => {
      renderPropertyForm()
      setStatus('Chỉnh sửa thuộc tính rồi chọn “Lưu thay đổi”.')
    })
    workspace.querySelector('[data-crud-mode="geometry"]').addEventListener('click', () => {
      startGeometryEditing()
    })
  }

  // Sửa hình học dùng trực tiếp feature đã chọn. Vì không tải WFS của tất cả
  // lớp, thao tác mở công cụ diễn ra ngay cả với dữ liệu lớn.
  function startGeometryEditing() {
    stopDrawing()
    const layer = getCurrentLayer()
    if (!layer) {
      setStatus('Lớp đang thao tác đã tắt. Hãy bật lại lớp trước khi sửa hình học.', true)
      return
    }
    hideSelectedFeatureFromWms()
    sketchSource.clear()
    sketchSource.addFeature(selectedFeature)
    showEditVertices()

    workspace.replaceChildren(createPropertyFields(layer, selectedFeature))
    actionArea.replaceChildren()

    modifyInteraction = new Modify({ source: sketchSource, pixelTolerance: 16 })
    map.addInteraction(modifyInteraction)
    // Điểm chỉ cần kéo đến vị trí mới. Snap vào chính điểm đang kéo sẽ làm
    // nó bị hút về vị trí cũ, nên chỉ bật Snap cho đường và vùng.
    if (layer.type !== 'Point') {
      snapInteraction = new Snap({
        source: sketchSource,
        pixelTolerance: 16,
        vertex: true,
        edge: true,
      })
      map.addInteraction(snapInteraction)
    }
    setMapCursor('default')

    modifyInteraction.on('modifyend', () => {
      replacementGeometry = selectedFeature.getGeometry().clone()
      showEditVertices()
      setMapCursor('move')
      setStatus(layer.type === 'Point'
        ? 'Đã di chuyển điểm. Có thể kéo lại hoặc lưu thay đổi.'
        : 'Đã cập nhật hình học. Có thể tiếp tục kéo điểm/cạnh hoặc lưu thay đổi.')
    })
    modifyInteraction.on('modifystart', () => setMapCursor('move'))

    const saveButton = createButton('Lưu thay đổi')
    saveButton.addEventListener('click', saveFeature)
    const cancelButton = createButton('Hủy', 'secondary')
    cancelButton.addEventListener('click', () => {
      resetWorkspace()
      setStatus('Đã hủy thao tác.')
    })
    if (layer.type !== 'Point') {
      const drawButton = createButton('Vẽ hình thay thế', 'secondary')
      drawButton.addEventListener('click', () => startDrawing('edit'))
      actionArea.append(saveButton, drawButton, cancelButton)
      setStatus('Kéo điểm hoặc cạnh để chỉnh hình học. Con trỏ có thể bắt dính vào chính hình này.')
    } else {
      actionArea.append(saveButton, cancelButton)
      setStatus('Kéo nút cyan của điểm đã chọn đến vị trí mới, rồi lưu thay đổi.')
    }
  }

  function startSelecting() {
    if (!getCurrentLayer()) {
      setStatus('Hãy bật một lớp dữ liệu trước khi chọn.', true)
      return
    }
    isSelecting = true
    setMapCursor('crosshair')
    setStatus(`Nhấp vào bản đồ để tìm các đối tượng thuộc lớp “${getCurrentLayer().title}”.`)
  }

  function renderStartButtons() {
    workspace.replaceChildren()
    actionArea.replaceChildren()

    const startLabel = currentAction === 'add' ? 'Bắt đầu vẽ' : 'Bắt đầu chọn'
    const startButton = createButton(startLabel)
    startButton.disabled = !getCurrentLayer()
    startButton.addEventListener('click', () => {
      if (currentAction === 'add') {
        startDrawing('add')
      } else {
        startSelecting()
      }
    })

    const cancelButton = createButton('Hủy', 'secondary')
    cancelButton.addEventListener('click', () => {
      resetWorkspace()
      panel.classList.remove('shown')
    })
    actionArea.append(startButton, cancelButton)
  }

  function getMapLayerEntries() {
    const entries = []
    function collect(layer, parentVisible = true) {
      const isVisible = parentVisible && layer.getVisible()
      const childLayers = layer.getLayers?.()
      if (childLayers) {
        childLayers.forEach((childLayer) => collect(childLayer, isVisible))
      } else {
        entries.push({ layer, isVisible })
      }
    }

    map.getLayers().forEach(collect)
    return entries
  }

  function getAllMapLayers() {
    return getMapLayerEntries().map(({ layer }) => layer)
  }

  function getVisibleEditableLayers() {
    const mapLayers = getMapLayerEntries()
    return editableLayers.filter((config) => mapLayers.some(({ layer, isVisible }) => {
      return layer.get('configId') === config.id && isVisible
    }))
  }

  function refreshLayerOptions(preferredLayerId = layerSelect.value) {
    const visibleLayers = getVisibleEditableLayers()
    layerSelect.replaceChildren()

    if (!visibleLayers.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'Không có lớp dữ liệu đang hiển thị'
      layerSelect.appendChild(option)
      layerSelect.disabled = true
      return false
    }

    visibleLayers.forEach((layer) => {
      const option = document.createElement('option')
      option.value = layer.id
      option.textContent = `${layer.title} (${layer.type})`
      layerSelect.appendChild(option)
    })
    layerSelect.disabled = isSaving
    layerSelect.value = visibleLayers.some((layer) => layer.id === preferredLayerId)
      ? preferredLayerId
      : visibleLayers[0].id
    return true
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

  function syncLayersAfterVisibilityChange() {
    const activeLayerId = layerSelect.value
    const activeLayerStillVisible = getVisibleEditableLayers().some((layer) => layer.id === activeLayerId)
    refreshLayerOptions(activeLayerId)

    if (!panel.classList.contains('shown') || !currentAction || activeLayerStillVisible) {
      return
    }

    resetWorkspace()
    renderStartButtons()
    setStatus(
      getCurrentLayer()
        ? 'Lớp đang thao tác đã tắt. Hãy chọn một lớp đang hiển thị để tiếp tục.'
        : 'Không có lớp dữ liệu nào đang hiển thị để quản trị.',
      true,
    )
  }

  function getCandidateLabel(feature, layer) {
    const value = layer.fields
      .map((field) => feature.get(field.id))
      .find((item) => item !== null && item !== undefined && String(item).trim())
    return value ? String(value) : `Đối tượng #${getFeatureId(feature)}`
  }

  function chooseFeature(candidate) {
    layerSelect.value = candidate.layer.id
    selectedFeature = candidate.feature
    selectedFeatureId = candidate.id
    replacementGeometry = null
    sketchSource.clear()
    sketchSource.addFeature(selectedFeature)

    if (currentAction === 'delete') {
      renderDeleteConfirmation()
    } else {
      renderEditChoice()
    }
    setStatus(`Đã chọn: ${candidate.layer.title} – ${getCandidateLabel(candidate.feature, candidate.layer)}.`)
  }

  function renderFeatureChoices(candidates) {
    workspace.replaceChildren()
    const hint = document.createElement('p')
    hint.className = 'tool-hint'
    hint.textContent = `Tìm thấy ${candidates.length} đối tượng tại vị trí bấm. Chọn đối tượng cần ${currentAction === 'delete' ? 'xóa' : 'sửa'}.`
    const list = document.createElement('div')
    list.className = 'crud-feature-choices'

    candidates.forEach((candidate) => {
      const button = createButton(getCandidateLabel(candidate.feature, candidate.layer), 'crud-feature-choice')
      button.addEventListener('click', () => chooseFeature(candidate))
      list.appendChild(button)
    })
    workspace.append(hint, list)

    const retryButton = createButton('Chọn vị trí khác', 'secondary')
    retryButton.addEventListener('click', () => {
      workspace.replaceChildren()
      actionArea.replaceChildren()
      startSelecting()
    })
    actionArea.replaceChildren(retryButton)
  }

  async function selectFeatureFromMap(coordinate) {
    isSelecting = false
    const layerConfig = getCurrentLayer()
    const mapLayerEntry = getMapLayerEntries().find(({ layer }) => layer.get('configId') === layerConfig.id)
    if (!mapLayerEntry?.isVisible) {
      setMapCursor()
      setStatus(`Lớp “${layerConfig.title}” đang tắt. Hãy bật lớp này trước khi chọn đối tượng.`, true)
      return
    }

    setMapCursor('progress')
    setStatus(`Đang kiểm tra lớp “${layerConfig.title}” tại vị trí đã chọn…`)

    try {
      const url = mapLayerEntry.layer.getSource()?.getFeatureInfoUrl(
        coordinate,
        map.getView().getResolution(),
        map.getView().getProjection(),
        { INFO_FORMAT: 'application/json', FEATURE_COUNT: FEATURE_INFO_LIMIT, BUFFER: 8 },
      )
      if (!url) throw new Error('Không tạo được yêu cầu chọn đối tượng.')

      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const featureProjection = map.getView().getProjection()
      const dataProjection = getFeatureInfoProjection(data, featureProjection)
      const candidates = geoJsonFormat.readFeatures(data, {
        dataProjection,
        featureProjection,
      }).map((feature) => {
        return { layer: layerConfig, feature, id: getFeatureId(feature) }
      }).filter((candidate) => candidate.id !== null)

      if (!candidates.length) {
        isSelecting = true
        setMapCursor('crosshair')
        setStatus('Không có đối tượng có thể chỉnh sửa tại vị trí này. Hãy nhấp lại.', true)
        return
      }

      setMapCursor()
      renderFeatureChoices(candidates)
      setStatus(`Tìm thấy ${candidates.length} đối tượng. Hãy chọn một đối tượng trong danh sách.`)
    } catch (error) {
      isSelecting = true
      setMapCursor('crosshair')
      setStatus(`Không thể đọc đối tượng từ GeoServer: ${error.message}`, true)
    }
  }

  function renderDeleteConfirmation() {
    workspace.innerHTML = `
      <p class="tool-hint warning">
        Đối tượng đã được chọn. Thao tác này không thể hoàn tác.
      </p>
    `
    actionArea.replaceChildren()

    const deleteButton = createButton('Xác nhận xóa', 'danger')
    deleteButton.addEventListener('click', saveFeature)
    const cancelButton = createButton('Hủy', 'secondary')
    cancelButton.addEventListener('click', () => {
      resetWorkspace()
      setStatus('Đã hủy xóa.')
    })
    actionArea.append(deleteButton, cancelButton)
    setStatus('Đã chọn đối tượng. Xác nhận để xóa.')
  }

  // WMS có cache, nên thêm tham số thay đổi để nó lấy ảnh mới sau CRUD.
  function refreshWmsLayer(layerId) {
    getAllMapLayers().forEach((layer) => {
      if (layer.get('configId') === layerId) {
        layer.getSource()?.updateParams({ _reload: Date.now() })
      }
    })
  }

  function createFeaturePayload() {
    const properties = readPropertiesFromForm()
    // Khi chỉ sửa thuộc tính, không gửi geometry lấy từ WMS GetFeatureInfo.
    // Geometry chỉ cần được kiểm tra/cập nhật sau thao tác vẽ lại hoặc thêm mới.
    if (currentAction !== 'add' && !replacementGeometry) {
      return properties
    }

    const geometry = replacementGeometry || selectedFeature.getGeometry()
    const featureToSave = selectedFeature.clone()
    featureToSave.setGeometry(geometry)
    const geoJson = geoJsonFormat.writeFeatureObject(featureToSave, {
      featureProjection: map.getView().getProjection(),
      dataProjection: 'EPSG:4326',
    })

    return {
      ...properties,
      geometry: normalizePolygonGeometry(geoJson.geometry),
    }
  }

  async function saveFeature() {
    const layer = getCurrentLayer()
    const needsExistingFeature = currentAction !== 'add'
    if (!layer) {
      setStatus('Lớp đang thao tác đã tắt. Không thể lưu thay đổi.', true)
      return
    }
    if (isSaving || !selectedFeature || (needsExistingFeature && selectedFeatureId === null)) {
      setStatus('Chưa có đối tượng để lưu.', true)
      return
    }

    if (currentAction === 'delete' && !window.confirm('Xóa đối tượng đã chọn?')) {
      return
    }

    isSaving = true
    layerSelect.disabled = true
    actionArea.querySelectorAll('button').forEach((button) => { button.disabled = true })
    setStatus('Đang lưu thay đổi…')

    try {
      if (currentAction === 'delete') {
        await requestJson(
          `${GEOSERVER_CONFIG.backendUrl}/${layer.id}/${selectedFeatureId}/delete/`,
          { method: 'DELETE' },
        )
      } else {
        const isAdding = currentAction === 'add'
        const path = isAdding ? `${layer.id}/add/` : `${layer.id}/${selectedFeatureId}/edit/`
        await requestJson(`${GEOSERVER_CONFIG.backendUrl}/${path}`, {
          method: isAdding ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createFeaturePayload()),
        })
      }

      restoreSelectedFeatureToWms()
      refreshWmsLayer(layer.id)
      snapFeaturesLoaded = false
      snapLayerKey = ''
      window.dispatchEvent(new Event('ptn-data-changed'))
      resetWorkspace()
      if (openedFromTable) {
        panel.classList.remove('shown')
      } else {
        setStatus('Đã lưu thay đổi. Lớp bản đồ đã được làm mới.')
      }
    } catch (error) {
      setStatus(error.message, true)
    } finally {
      isSaving = false
      layerSelect.disabled = !getCurrentLayer()
      actionArea.querySelectorAll('button').forEach((button) => { button.disabled = false })
    }
  }

  // Có thể mở từ menu trái (không có feature) hoặc từ bảng (đã có feature).
  function open(nextAction, layerId = null, feature = null, keepTableOpen = false) {
    document.dispatchEvent(new CustomEvent('ptn-tool-activate', {
      detail: { name: 'crud', preserveDataTool: keepTableOpen ? 'data-view' : null },
    }))
    openedFromTable = keepTableOpen
    currentAction = nextAction.replace('-vector', '')
    resetWorkspace()
    refreshLayerOptions(layerId || layerSelect.value)

    panel.classList.add('shown')
    if (feature) {
      selectedFeature = feature.clone()
      selectedFeatureId = getFeatureId(feature)
      sketchSource.addFeature(selectedFeature)
      if (selectedFeatureId === null) {
        setStatus('Không xác định được mã đối tượng.', true)
        return
      }

      if (currentAction === 'delete') {
        renderDeleteConfirmation()
      } else {
        renderEditChoice()
      }
      return
    }

    renderStartButtons()
    if (!getCurrentLayer()) {
      setStatus('Không có lớp dữ liệu nào đang hiển thị để quản trị.', true)
      return
    }
    const nextStep = currentAction === 'add' ? 'bắt đầu vẽ' : 'bắt đầu chọn đối tượng'
    setStatus(`Chọn lớp rồi ${nextStep}.`)
  }

  map.on('singleclick', (event) => {
    const canSelect = isSelecting
      && !selectedFeature
      && (currentAction === 'edit' || currentAction === 'delete')
    if (canSelect) {
      selectFeatureFromMap(event.coordinate)
    }
  })

  // Chỉ đổi sang biểu tượng kéo khi con trỏ nằm trong vùng 16 px quanh
  // cạnh/đỉnh. Listener được đăng ký một lần, không tích lũy khi mở lại tool.
  map.on('pointermove', (event) => {
    if (modifyInteraction && isNearEditableGeometry(event.pixel)) {
      setMapCursor('move')
    } else if (modifyInteraction) {
      setMapCursor('default')
    }
  })

  layerSelect.addEventListener('change', () => {
    if (!currentAction) {
      return
    }
    resetWorkspace()
    renderStartButtons()
    setStatus('Đã đổi lớp. Chọn thao tác để tiếp tục.')
  })

  document.querySelectorAll('[data-crud-action$="-vector"]').forEach((menuItem) => {
    menuItem.addEventListener('click', () => open(menuItem.dataset.crudAction))
  })

  refreshLayerOptions()
  getAllMapLayerNodes().forEach((layer) => layer.on('change:visible', syncLayersAfterVisibilityChange))

  return {
    open,
    openFromTable(nextAction, layerId, feature) {
      open(nextAction, layerId, feature, true)
    },
    close() {
      resetWorkspace()
      panel.classList.remove('shown')
    },
  }
}
