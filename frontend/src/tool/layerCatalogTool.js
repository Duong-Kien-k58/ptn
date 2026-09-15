import { createToolPanel } from './toolUtils.js'

const STORAGE_KEY = 'ptn_layer_catalog_v3'

function getUiOrder(collection) {
  return collection.getArray().slice().reverse()
}

function setUiOrder(collection, layers) {
  collection.clear()
  collection.extend(layers.slice().reverse())
}

// Phiên bản này giữ nguyên mô hình catalog của LapTrinhGis: nhóm vector,
// raster và nền; checkbox/radio, thu gọn, kéo thả, lưu và khôi phục.
export function createLayerCatalogTool({ map, baseGroup, thematicGroups, rasterGroup }) {
  const panel = createToolPanel({
    id: 'layer-catalog-panel',
    title: 'Mục lục bản đồ',
    content: '<div class="catalog-toolbar"><span>Kéo thả layer hoặc nhóm để đổi thứ tự</span><div><button data-save>Lưu</button><button data-reset>Khôi phục</button></div></div><div id="catalog-content"></div>',
  })
  const content = panel.querySelector('#catalog-content')
  const groups = [...thematicGroups, rasterGroup]
  const allGroups = [...groups, baseGroup]
  const defaultGroupOrder = getUiOrder(map.getLayers()).filter((layer) => groups.includes(layer))
  const defaultLayers = new Map(allGroups.map((group) => [group, getUiOrder(group.getLayers())]))
  let dragged = null

  function save() {
    const state = {
      groupOrder: getUiOrder(map.getLayers()).filter((layer) => groups.includes(layer)).map((group) => group.get('tocGroupId')),
      collapsed: Object.fromEntries(allGroups.map((group) => [group.get('tocGroupId'), Boolean(group.get('tocCollapsed'))])),
      layers: Object.fromEntries(allGroups.map((group) => [group.get('tocGroupId'), getUiOrder(group.getLayers()).map((layer) => layer.get('configId'))])),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  function restore() {
    localStorage.removeItem(STORAGE_KEY)
    const fixed = map.getLayers().getArray().filter((layer) => !groups.includes(layer))
    map.getLayers().clear()
    map.getLayers().extend([...fixed, ...defaultGroupOrder.slice().reverse()])
    allGroups.forEach((group) => {
      setUiOrder(group.getLayers(), defaultLayers.get(group))
      group.set('tocCollapsed', false)
    })
    render()
  }

  function applySaved() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
      const orderedGroups = (state.groupOrder || []).map((id) => groups.find((group) => group.get('tocGroupId') === id)).filter(Boolean)
      groups.forEach((group) => { if (!orderedGroups.includes(group)) orderedGroups.push(group) })
      const fixed = map.getLayers().getArray().filter((layer) => !groups.includes(layer))
      map.getLayers().clear()
      map.getLayers().extend([...fixed, ...orderedGroups.reverse()])
      allGroups.forEach((group) => {
        const id = group.get('tocGroupId')
        const current = getUiOrder(group.getLayers())
        const wanted = (state.layers?.[id] || []).map((layerId) => current.find((layer) => layer.get('configId') === layerId)).filter(Boolean)
        current.forEach((layer) => { if (!wanted.includes(layer)) wanted.push(layer) })
        setUiOrder(group.getLayers(), wanted)
        group.set('tocCollapsed', Boolean(state.collapsed?.[id]))
      })
    } catch { /* Giữ cấu hình mặc định nếu localStorage không hợp lệ. */ }
  }

  function createLayerRow(layer, group, canDrag) {
    const row = document.createElement('div')
    row.className = 'toc-layer-row'
    row.draggable = canDrag
    const control = document.createElement('input')
    control.type = group === baseGroup ? 'radio' : 'checkbox'
    control.name = group === baseGroup ? 'toc-base-layer' : `toc-${group.get('tocGroupId')}`
    control.checked = layer.getVisible()
    control.setAttribute('aria-label', layer.get('title'))
    control.addEventListener('change', () => {
      if (group === baseGroup && control.checked) baseGroup.getLayers().forEach((item) => item.setVisible(item === layer))
      else layer.setVisible(control.checked)
      render()
    })
    const title = document.createElement('span')
    title.textContent = layer.get('title')
    row.append(control, title)
    if (!canDrag) return row
    row.addEventListener('dragstart', (event) => { dragged = { layer, group }; event.dataTransfer.effectAllowed = 'move' })
    row.addEventListener('dragover', (event) => { if (dragged && dragged.group === group) { event.preventDefault(); row.classList.add('toc-drop-target') } })
    row.addEventListener('dragleave', () => row.classList.remove('toc-drop-target'))
    row.addEventListener('drop', (event) => {
      event.preventDefault(); row.classList.remove('toc-drop-target')
      if (!dragged || dragged.group !== group || dragged.layer === layer) return
      const ordered = getUiOrder(group.getLayers()).filter((item) => item !== dragged.layer)
      ordered.splice(ordered.indexOf(layer) + (event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? 1 : 0), 0, dragged.layer)
      setUiOrder(group.getLayers(), ordered); dragged = null; render()
    })
    return row
  }

  function createGroup(group, draggable) {
    const section = document.createElement('section')
    section.className = 'toc-group'
    const header = document.createElement('div')
    header.className = 'toc-group-header'
    header.draggable = draggable
    const collapse = document.createElement('button')
    collapse.textContent = group.get('tocCollapsed') ? '▸' : '▾'
    collapse.addEventListener('click', () => { group.set('tocCollapsed', !group.get('tocCollapsed')); render() })
    const visible = document.createElement('input')
    visible.type = 'checkbox'; visible.checked = group.getVisible()
    visible.addEventListener('change', () => { group.setVisible(visible.checked); render() })
    const title = document.createElement('strong'); title.textContent = group.get('title')
    header.append(collapse, visible, title); section.append(header)
    if (!group.get('tocCollapsed')) {
      const children = document.createElement('div'); children.className = 'toc-group-children'
      getUiOrder(group.getLayers()).forEach((layer) => children.append(createLayerRow(layer, group, group !== baseGroup)))
      section.append(children)
    }
    return section
  }

  function render() {
    content.replaceChildren()
    getUiOrder(map.getLayers()).filter((layer) => groups.includes(layer)).forEach((group) => content.append(createGroup(group, true)))
    content.append(createGroup(baseGroup, false))
  }

  panel.querySelector('[data-save]').addEventListener('click', (event) => { save(); event.currentTarget.textContent = 'Đã lưu'; setTimeout(() => { event.currentTarget.textContent = 'Lưu' }, 1200) })
  panel.querySelector('[data-reset]').addEventListener('click', restore)
  applySaved(); render()
  return { open: () => { render(); panel.classList.add('shown') }, close: () => panel.classList.remove('shown') }
}
