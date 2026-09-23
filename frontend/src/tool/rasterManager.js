import { transformExtent } from 'ol/proj.js'
import { GEOSERVER_CONFIG, RASTER_LAYER_CONFIGS } from '../config/layers.js'
import { requestJson } from './apiClient.js'
import { createToolPanel } from './toolUtils.js'

const RASTER_API_URL = `${GEOSERVER_CONFIG.backendUrl.replace(/\/features$/, '')}/rasters`

export function createRasterManager({ map, rasterGroup, onRasterChanged = () => {} }) {
  const panel = createToolPanel({
    id: 'raster-manager-panel',
    title: 'Quản trị dữ liệu raster',
    content: `
      <label>Raster đã khai báo<select data-raster-select></select></label>
      <label>Tệp GeoTIFF<input data-raster-file type="file" accept=".tif,.tiff,image/tiff"></label>
      <button type="button" class="secondary" data-raster-clear-preview hidden>Ẩn preview</button>
      <div class="crud-status" data-raster-status>Chọn thao tác raster từ menu bên trái.</div>
      <div class="crud-form-actions">
        <button type="button" data-raster-save>Thực hiện</button>
        <button type="button" class="secondary" data-raster-cancel>Hủy</button>
      </div>
    `,
  })
  panel.dataset.featureAction = 'raster'
  const rasterSelect = panel.querySelector('[data-raster-select]')
  const fileInput = panel.querySelector('[data-raster-file]')
  const status = panel.querySelector('[data-raster-status]')
  const saveButton = panel.querySelector('[data-raster-save]')
  const clearPreviewButton = panel.querySelector('[data-raster-clear-preview]')
  let currentAction = null
  let previewLayer = null

  function setStatus(message, isError = false) {
    status.textContent = message
    status.classList.toggle('error', isError)
  }

  function requestRasterApi(path = '', options) {
    return requestJson(`${RASTER_API_URL}${path}`, options)
  }

  function addRasterOption(id, title = id) {
    const optionAlreadyExists = [...rasterSelect.options].some((option) => option.value === id)
    if (optionAlreadyExists) return
    const option = document.createElement('option')
    option.value = id
    option.textContent = title
    rasterSelect.appendChild(option)
  }

  function clearPreview() {
    if (previewLayer) map.removeLayer(previewLayer)
    previewLayer = null
    clearPreviewButton.hidden = true
  }

  async function previewRaster() {
    const file = fileInput.files[0]
    if (!file || currentAction === 'delete') return
    clearPreview()
    try {
      const [{ default: WebGLTileLayer }, { default: GeoTIFFSource }] = await Promise.all([
        import('ol/layer/WebGLTile.js'),
        import('ol/source/GeoTIFF.js'),
      ])
      const source = new GeoTIFFSource({ sources: [{ blob: file }], convertToRGB: 'auto' })
      previewLayer = new WebGLTileLayer({ source, opacity: 0.72, zIndex: 9998 })
      map.addLayer(previewLayer)

      const rasterView = await source.getView()
      const rasterProjection = rasterView.projection
      if (!rasterProjection || !rasterView.extent) throw new Error('GeoTIFF chưa có hệ tọa độ hoặc phạm vi hợp lệ.')

      const extent = transformExtent(rasterView.extent, rasterProjection, map.getView().getProjection())
      map.updateSize()
      map.getView().fit(extent, { padding: [0, 0, 0, 0], duration: 350 })
      clearPreviewButton.hidden = false
      setStatus(`Preview: ${file.name} · ${rasterProjection.getCode()} · phạm vi ảnh đã được zoom.`)
    } catch (error) {
      clearPreview()
      setStatus(`Không thể preview GeoTIFF: ${error.message}`, true)
    }
  }

  function refreshRasterWms() {
    rasterGroup.getLayers().forEach((layer) => {
      layer.getSource()?.updateParams?.({ _reload: Date.now() })
    })
  }

  function getRasterName() {
    return rasterSelect.value
  }

  function updatePanelForAction() {
    const isDeleting = currentAction === 'delete'
    fileInput.closest('label').hidden = isDeleting
    if (isDeleting) saveButton.textContent = 'Xác nhận xóa'
    else if (currentAction === 'edit') saveButton.textContent = 'Thay thế GeoTIFF'
    else saveButton.textContent = 'Xuất bản GeoTIFF'
  }

  function hideRasterLayer(name) {
    const layer = rasterGroup.getLayers().getArray().find((item) => item.get('rasterName') === name)
    if (layer) layer.setVisible(false)
    onRasterChanged()
  }

  async function executeRasterAction() {
    const rasterName = getRasterName()
    if (!rasterName) {
      setStatus('Hãy chọn raster đã khai báo.', true)
      return
    }
    saveButton.disabled = true
    try {
      if (currentAction === 'delete') {
        if (!window.confirm(`Xóa raster “${rasterName}” khỏi GeoServer?`)) return
        await requestRasterApi(`/${encodeURIComponent(rasterName)}/delete/`, { method: 'DELETE' })
        hideRasterLayer(rasterName)
        setStatus('Đã xóa raster và coverage store trên GeoServer.')
        return
      }
      const file = fileInput.files[0]
      if (!file) {
        setStatus('Hãy chọn một tệp GeoTIFF.', true)
        return
      }
      const formData = new FormData()
      formData.append('file', file)
      if (currentAction === 'add') formData.append('name', rasterName)
      const uploadPath = currentAction === 'add' ? '/upload/' : `/${encodeURIComponent(rasterName)}/upload/`
      await requestRasterApi(uploadPath, { method: 'POST', body: formData })
      refreshRasterWms()
      clearPreview()
      onRasterChanged()
      setStatus('Đã xuất bản raster. Lớp bản đồ đã được làm mới.')
    } catch (error) {
      setStatus(error.message, true)
    } finally {
      saveButton.disabled = false
    }
  }

  function open(selectedAction) {
    document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: 'raster' } }))
    currentAction = selectedAction.replace('-raster', '')
    panel.classList.add('shown')
    updatePanelForAction()
    if (currentAction === 'add') {
      setStatus('Chọn raster đã khai báo, sau đó chọn GeoTIFF để xuất bản.')
    } else if (currentAction === 'edit') {
      setStatus('Chọn raster và GeoTIFF mới để thay thế.')
    } else {
      setStatus('Chọn raster cần xóa.')
    }
  }

  RASTER_LAYER_CONFIGS.forEach((raster) => {
    addRasterOption(raster.layerName, raster.title)
  })
  saveButton.addEventListener('click', executeRasterAction)
  fileInput.addEventListener('change', previewRaster)
  clearPreviewButton.addEventListener('click', () => {
    clearPreview()
    setStatus('Đã ẩn preview. GeoTIFF chưa được gửi lên GeoServer.')
  })
  panel.querySelector('[data-raster-cancel]').addEventListener('click', () => {
    clearPreview()
    panel.classList.remove('shown')
  })
  panel.addEventListener('toolpanelclose', clearPreview)

  return {
    open,
    close() {
      clearPreview()
      panel.classList.remove('shown')
    },
  }
}
