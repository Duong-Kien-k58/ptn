import { createToolPanel } from './toolUtils.js'
import { transformExtent } from 'ol/proj.js'

const STORAGE_KEY = 'ptn_layer_catalog_v4'

// OpenLayers lưu lớp từ dưới lên trên, còn catalog hiển thị từ trên xuống dưới.
function getUiOrder(collection) {
  return collection.getArray().slice().reverse()
}

function setUiOrder(collection, layers) {
  collection.clear()
  collection.extend([...layers].reverse())
}

function getSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function childByName(element, name) {
  return Array.from(element.children).find((child) => child.localName === name)
}

function childNumber(element, name) {
  return Number(childByName(element, name)?.textContent)
}

function getGeographicExtent(capabilities, layerName) {
  const shortLayerName = layerName.split(':').at(-1)
  const layer = Array.from(capabilities.getElementsByTagName('*')).find((element) => (
    element.localName === 'Layer'
      && [layerName, shortLayerName].includes(childByName(element, 'Name')?.textContent)
  ))
  const bounds = layer && childByName(layer, 'EX_GeographicBoundingBox')
  if (!bounds) return null

  const extent = [
    childNumber(bounds, 'westBoundLongitude'),
    childNumber(bounds, 'southBoundLatitude'),
    childNumber(bounds, 'eastBoundLongitude'),
    childNumber(bounds, 'northBoundLatitude'),
  ]
  return extent.every(Number.isFinite) ? extent : null
}

// Catalog hoạt động như LapTrinhGis: chọn dòng để đánh dấu lớp, checkbox để
// bật/tắt, kéo layer để đổi vị trí hoặc đổi nhóm, kéo tiêu đề để đổi nhóm.
export function createLayerCatalogTool({ map, baseGroup, thematicGroups, rasterGroup }) {
  const movableGroups = [...thematicGroups, rasterGroup]
  const allGroups = [...movableGroups, baseGroup]
  const defaultGroupOrder = getUiOrder(map.getLayers()).filter((layer) => movableGroups.includes(layer))
  const defaultLayers = new Map(allGroups.map((group) => [group, getUiOrder(group.getLayers())]))
  const defaultCollapsed = new Map(allGroups.map((group) => [group, Boolean(group.get('tocCollapsed'))]))
  const defaultGroupByLayerId = new Map(
    movableGroups.flatMap((group) => getUiOrder(group.getLayers()).map((layer) => [layer.get('configId'), group])),
  )

  const panel = createToolPanel({
    id: 'layer-catalog-panel',
    title: 'Mục lục bản đồ',
    content: `
      <div class="catalog-toolbar">
        <span>Chọn để thao tác, kéo để sắp xếp.</span>
        <div><button type="button" data-save>Lưu</button><button type="button" class="secondary" data-reset>Khôi phục</button></div>
      </div>
      <div class="catalog-content" aria-label="Danh sách các lớp bản đồ"></div>
    `,
  })
  const content = panel.querySelector('.catalog-content')
  let selectedLayer = null
  let dragged = null
  const capabilitiesCache = new Map()

  function clearDropTargets() {
    panel.querySelectorAll('.toc-drop-target').forEach((element) => element.classList.remove('toc-drop-target'))
  }

  function isBaseLayer(layer) {
    return layer.get('layerKind') === 'base'
  }

  async function getWmsExtent(layer) {
    const source = layer.getSource()
    const layerName = source?.getParams?.().LAYERS
    const sourceUrl = source?.getUrls?.()[0]
    if (!layerName || !sourceUrl) return null

    if (!capabilitiesCache.has(sourceUrl)) {
      const url = new URL(sourceUrl, window.location.origin)
      url.search = ''
      url.searchParams.set('service', 'WMS')
      url.searchParams.set('request', 'GetCapabilities')
      capabilitiesCache.set(sourceUrl, fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return new DOMParser().parseFromString(await response.text(), 'text/xml')
      }))
    }

    const capabilities = await capabilitiesCache.get(sourceUrl)
    return getGeographicExtent(capabilities, layerName)
  }

  async function zoomToLayer(layer, button) {
    button.disabled = true
    button.title = 'Đang tải phạm vi lớp'
    try {
      const view = map.getView()
      const geographicExtent = isBaseLayer(layer) ? null : await getWmsExtent(layer)
      const extent = isBaseLayer(layer)
        ? view.getProjection().getExtent()
        : geographicExtent && transformExtent(geographicExtent, 'EPSG:4326', view.getProjection())
      if (!extent) throw new Error('Không tìm thấy phạm vi lớp')
      map.updateSize()
      view.fit(extent, { padding: [0, 0, 0, 0], duration: 350 })
      button.title = 'Xem tổng quan lớp'
    } catch {
      button.title = 'Không thể xác định phạm vi lớp'
    } finally {
      button.disabled = false
    }
  }

  function saveState() {
    const state = {
      groupOrder: getUiOrder(map.getLayers())
        .filter((group) => movableGroups.includes(group))
        .map((group) => group.get('tocGroupId')),
      groups: Object.fromEntries(
        movableGroups.map((group) => [group.get('tocGroupId'), getUiOrder(group.getLayers()).map((layer) => layer.get('configId'))]),
      ),
      collapsed: Object.fromEntries(allGroups.map((group) => [group.get('tocGroupId'), Boolean(group.get('tocCollapsed'))])),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  function applySavedState() {
    const state = getSavedState()
    const groupById = new Map(movableGroups.map((group) => [group.get('tocGroupId'), group]))
    const orderedGroups = (state.groupOrder || []).map((id) => groupById.get(id)).filter(Boolean)
    movableGroups.forEach((group) => { if (!orderedGroups.includes(group)) orderedGroups.push(group) })

    const fixedGroups = map.getLayers().getArray().filter((group) => !movableGroups.includes(group))
    map.getLayers().clear()
    map.getLayers().extend([...fixedGroups, ...orderedGroups.reverse()])

    const layersById = new Map(
      movableGroups.flatMap((group) => getUiOrder(group.getLayers()).map((layer) => [layer.get('configId'), layer])),
    )
    const desiredByGroup = new Map(movableGroups.map((group) => [group, []]))

    movableGroups.forEach((group) => {
      const savedIds = state.groups?.[group.get('tocGroupId')] || []
      savedIds.forEach((id) => {
        const layer = layersById.get(id)
        if (layer && !desiredByGroup.get(group).includes(layer)) desiredByGroup.get(group).push(layer)
      })
    })

    layersById.forEach((layer, id) => {
      const alreadyPlaced = [...desiredByGroup.values()].some((layers) => layers.includes(layer))
      if (!alreadyPlaced) desiredByGroup.get(defaultGroupByLayerId.get(id)).push(layer)
    })

    movableGroups.forEach((group) => setUiOrder(group.getLayers(), desiredByGroup.get(group)))
    allGroups.forEach((group) => group.set('tocCollapsed', Boolean(state.collapsed?.[group.get('tocGroupId')])))
  }

  function restoreDefaults() {
    localStorage.removeItem(STORAGE_KEY)
    const fixedGroups = map.getLayers().getArray().filter((group) => !movableGroups.includes(group))
    map.getLayers().clear()
    map.getLayers().extend([...fixedGroups, ...defaultGroupOrder.slice().reverse()])
    allGroups.forEach((group) => {
      setUiOrder(group.getLayers(), defaultLayers.get(group))
      group.set('tocCollapsed', defaultCollapsed.get(group))
    })
    selectedLayer = null
    render()
  }

  function moveLayer(layer, sourceGroup, targetGroup, targetLayer, placeAfter) {
    const targetOrder = getUiOrder(targetGroup.getLayers()).filter((item) => item !== layer)
    const targetIndex = targetLayer ? targetOrder.indexOf(targetLayer) : targetOrder.length
    targetOrder.splice(targetIndex + (targetLayer && placeAfter ? 1 : 0), 0, layer)

    if (sourceGroup !== targetGroup) {
      setUiOrder(sourceGroup.getLayers(), getUiOrder(sourceGroup.getLayers()).filter((item) => item !== layer))
    }
    setUiOrder(targetGroup.getLayers(), targetOrder)
  }

  function createLayerRow(layer, group, canDrag) {
    const row = document.createElement('div')
    const layerId = layer.get('configId') || layer.get('title')
    row.className = 'toc-layer-row'
    row.dataset.layerId = layerId
    row.draggable = canDrag
    row.classList.toggle('selected', layer === selectedLayer)

    const checkbox = document.createElement('input')
    checkbox.type = isBaseLayer(layer) ? 'radio' : 'checkbox'
    checkbox.name = isBaseLayer(layer) ? 'toc-base-layer' : `toc-${group.get('tocGroupId')}`
    checkbox.checked = layer.getVisible()
    checkbox.title = 'Bật hoặc tắt lớp'
    checkbox.setAttribute('aria-label', `Bật hoặc tắt ${layer.get('title')}`)
    checkbox.addEventListener('change', () => {
      if (isBaseLayer(layer) && checkbox.checked) baseGroup.getLayers().forEach((item) => item.setVisible(item === layer))
      else layer.setVisible(checkbox.checked)
      render()
    })

    const title = document.createElement('span')
    title.className = 'toc-layer-title'
    title.textContent = layer.get('title') || layerId

    const overviewButton = document.createElement('button')
    overviewButton.type = 'button'
    overviewButton.className = 'toc-layer-overview'
    overviewButton.title = 'Xem tổng quan lớp'
    overviewButton.setAttribute('aria-label', `Xem tổng quan ${layer.get('title') || layerId}`)
    overviewButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>'
    overviewButton.addEventListener('click', (event) => {
      event.stopPropagation()
      zoomToLayer(layer, overviewButton)
    })

    row.append(checkbox, title, overviewButton)
    row.addEventListener('click', (event) => {
      if (event.target === checkbox || event.target.closest('.toc-layer-overview')) return
      selectedLayer = layer
      render()
    })

    if (!canDrag) return row
    row.addEventListener('dragstart', (event) => {
      dragged = { type: 'layer', layer, sourceGroup: group }
      row.classList.add('dragging')
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', layerId)
    })
    row.addEventListener('dragend', () => { dragged = null; clearDropTargets() })
    row.addEventListener('dragover', (event) => {
      if (dragged?.type !== 'layer') return
      event.preventDefault()
      event.stopPropagation()
      clearDropTargets()
      row.classList.add('toc-drop-target')
    })
    row.addEventListener('dragleave', () => row.classList.remove('toc-drop-target'))
    row.addEventListener('drop', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (dragged?.type !== 'layer' || dragged.layer === layer) return
      const rect = row.getBoundingClientRect()
      moveLayer(dragged.layer, dragged.sourceGroup, group, layer, event.clientY > rect.top + rect.height / 2)
      selectedLayer = dragged.layer
      dragged = null
      render()
    })
    return row
  }

  function createGroup(group, canDrag) {
    const node = document.createElement('section')
    node.className = 'toc-group'
    const header = document.createElement('div')
    header.className = 'toc-group-header'
    header.draggable = canDrag

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'toc-collapse'
    toggle.textContent = group.get('tocCollapsed') ? '▸' : '▾'
    toggle.title = 'Thu gọn hoặc mở rộng nhóm'
    toggle.addEventListener('click', () => { group.set('tocCollapsed', !group.get('tocCollapsed')); render() })

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = group.getVisible()
    checkbox.title = 'Bật hoặc tắt cả nhóm'
    checkbox.setAttribute('aria-label', `Bật hoặc tắt nhóm ${group.get('title')}`)
    checkbox.addEventListener('change', () => { group.setVisible(checkbox.checked); render() })

    const title = document.createElement('span')
    title.className = 'toc-group-title'
    title.textContent = group.get('title')
    header.append(toggle, checkbox, title)
    node.append(header)

    const children = document.createElement('div')
    children.className = 'toc-group-children'
    children.hidden = Boolean(group.get('tocCollapsed'))
    getUiOrder(group.getLayers()).forEach((layer) => children.append(createLayerRow(layer, group, group !== baseGroup)))
    node.append(children)

    if (group !== baseGroup) {
      children.addEventListener('dragover', (event) => {
        if (dragged?.type !== 'layer' || event.target.closest('.toc-layer-row')) return
        event.preventDefault()
        children.classList.add('toc-drop-target')
      })
      children.addEventListener('dragleave', (event) => {
        if (!event.relatedTarget || !children.contains(event.relatedTarget)) children.classList.remove('toc-drop-target')
      })
      children.addEventListener('drop', (event) => {
        if (event.target.closest('.toc-layer-row')) return
        event.preventDefault()
        if (dragged?.type !== 'layer') return
        moveLayer(dragged.layer, dragged.sourceGroup, group, null, false)
        selectedLayer = dragged.layer
        dragged = null
        render()
      })
    }

    if (canDrag) {
      header.addEventListener('dragstart', (event) => {
        if (event.target === toggle || event.target === checkbox) { event.preventDefault(); return }
        dragged = { type: 'group', group }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', group.get('tocGroupId'))
      })
      header.addEventListener('dragend', () => { dragged = null; clearDropTargets() })
      header.addEventListener('dragover', (event) => {
        if (dragged?.type !== 'group' || dragged.group === group) return
        event.preventDefault()
        clearDropTargets()
        node.classList.add('toc-drop-target')
      })
      header.addEventListener('drop', (event) => {
        event.preventDefault()
        if (dragged?.type !== 'group' || dragged.group === group) return
        const groups = getUiOrder(map.getLayers()).filter((item) => movableGroups.includes(item) && item !== dragged.group)
        const targetIndex = groups.indexOf(group)
        const rect = header.getBoundingClientRect()
        groups.splice(targetIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0), 0, dragged.group)
        const fixedGroups = map.getLayers().getArray().filter((item) => !movableGroups.includes(item))
        map.getLayers().clear()
        map.getLayers().extend([...fixedGroups, ...groups.reverse()])
        dragged = null
        render()
      })
    }
    return node
  }

  function render() {
    content.replaceChildren()
    getUiOrder(map.getLayers()).filter((group) => movableGroups.includes(group)).forEach((group) => content.append(createGroup(group, true)))
    content.append(createGroup(baseGroup, false))
  }

  panel.querySelector('[data-save]').addEventListener('click', (event) => {
    saveState()
    event.currentTarget.textContent = 'Đã lưu'
    setTimeout(() => { event.currentTarget.textContent = 'Lưu' }, 1200)
  })
  panel.querySelector('[data-reset]').addEventListener('click', restoreDefaults)

  applySavedState()
  render()
  return {
    open: () => { render(); panel.classList.add('shown') },
    close: () => panel.classList.remove('shown'),
    refresh: render,
  }
}
