import 'ol/ol.css'
import './style.css'
import { createMap } from './map/map.js'
import { createBasicTools } from './tool/basicTools.js'
import { createCrudManager } from './tool/crudManager.js'
import { createDataSearchTool } from './tool/dataSearchTool.js'
import { createDataTableTool } from './tool/dataTableTool.js'
import { createRasterManager } from './tool/rasterManager.js'
import { createLayerOverviewTool } from './tool/layerOverviewTool.js'
import { createToolManager } from './tool/toolManager.js'
import { createSystemTools } from './tool/systemTools.js'
import { createAuthUi } from './auth.js'

// Khởi tạo bản đồ trước, sau đó lần lượt gắn các công cụ phụ thuộc vào nó.
const { map, catalogLayers, vietnamCenter, defaultZoom } = createMap()
createAuthUi()
createBasicTools(map)
const toolManager = createToolManager({ map, catalogLayers })
const systemTools = createSystemTools()
const layerOverview = createLayerOverviewTool({ map, ...catalogLayers })

const crudManager = createCrudManager({ map })
const dataTools = {
  'data-search': createDataSearchTool({ map }),
  'data-view': createDataTableTool({ map, crudManager, rasterGroup: catalogLayers.rasterGroup }),
}
const rasterManager = createRasterManager({
  map,
  rasterGroup: catalogLayers.rasterGroup,
  onRasterChanged: () => toolManager.tools.layers.restoreVisibility(),
})
rasterManager.load()

// Mọi chức năng chỉ được hoạt động riêng lẻ. Các công cụ phát sự kiện này
// trước khi mở để đóng panel và tương tác còn lại trên bản đồ.
function clearFeatureButtons() {
  document.querySelectorAll('[data-section], [data-crud-action], [data-tool-action]').forEach((button) => {
    button.classList.remove('active', 'opened')
  })
}

document.addEventListener('ptn-tool-activate', (event) => {
  const activeTool = event.detail?.name
  const preservedDataTool = event.detail?.preserveDataTool
  Object.entries(dataTools).forEach(([name, tool]) => {
    if (name !== activeTool && name !== preservedDataTool) tool.close()
  })
  if (activeTool !== 'crud') crudManager.close()
  if (activeTool !== 'raster') rasterManager.close()
  toolManager.closeAll(activeTool?.startsWith('toolbar:') ? activeTool.slice(8) : '')
  clearFeatureButtons()
})

// Mỗi panel dữ liệu biết menu nào đã mở nó. Khi người dùng đóng panel bằng
// nút ×, menu tương ứng cũng trở lại trạng thái bình thường.
const sectionPanelIds = {
  'data-search': 'data-search-panel',
  'data-view': 'data-table-panel',
}
Object.entries(sectionPanelIds).forEach(([sectionName, panelId]) => {
  const panel = document.querySelector(`#${panelId}`)
  if (panel) {
    panel.dataset.sectionAction = sectionName
  }
})

document.querySelectorAll('[data-crud-action]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.crudAction.endsWith('-raster')) {
      rasterManager.open(button.dataset.crudAction)
    }
    button.classList.add('active')
  })
})

function showMessage(title, text) {
  document.querySelector('#message-title').textContent = title
  document.querySelector('#message-text').textContent = text
  document.querySelector('.message').classList.add('show')
}

document.addEventListener('ptn-account-action', (event) => {
  const labels = {
    register: 'Đăng ký tài khoản', forgot: 'Quên mật khẩu', profile: 'Thông tin cá nhân',
    'change-password': 'Đổi mật khẩu', admin: 'Quản trị hệ thống', logout: 'Đăng xuất',
  }
  if (event.detail.action === 'error') return showMessage('Tài khoản', event.detail.message)
  if (event.detail.action === 'admin') return systemTools.openAdmin()
  showMessage(labels[event.detail.action], 'Chức năng này sẽ được bổ sung theo luồng yêu cầu tiếp theo.')
})

document.querySelectorAll('[data-section]').forEach((button) => {
  button.addEventListener('click', () => {
    const sectionName = button.dataset.section
    const selectedTool = dataTools[sectionName]

    if (sectionName === 'vector-overview' || sectionName === 'raster-overview') {
      layerOverview.open(sectionName.startsWith('vector') ? 'vector' : 'raster')
      return
    }

    if (sectionName === 'support') {
      systemTools.openSupport()
      button.classList.add('active', 'opened')
      return
    }

    if (!selectedTool) {
      if (sectionName !== 'map') {
        document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: sectionName } }))
        button.classList.add('active')
        showMessage(button.textContent.trim(), 'Chức năng này sẽ được xây dựng ở bước tiếp theo.')
      }
      return
    }

    const isAlreadyOpen = button.classList.contains('opened')
    if (isAlreadyOpen) {
      selectedTool.close()
      button.classList.remove('opened')
      return
    }

    document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: sectionName } }))
    button.classList.add('active', 'opened')
    selectedTool.open()
  })
})

document.addEventListener('toolpanelclose', (event) => {
  const sectionName = event.target.dataset.sectionAction
  if (sectionName) {
    document
      .querySelector(`[data-section="${sectionName}"]`)
      ?.classList.remove('active', 'opened')
  }
  if (event.target.dataset.featureAction) {
    document.querySelectorAll('[data-crud-action]').forEach((button) => button.classList.remove('active'))
    if (event.target.dataset.featureAction === 'crud') {
      crudManager.close()
    }
  }
})

// Mỗi nhóm menu trái hoạt động như accordion: mở một nhóm sẽ thu các nhóm khác.
document.querySelectorAll('[data-menu-parent]').forEach((menuParent) => {
  const menuButton = menuParent.querySelector('.menu-parent-button')
  const menuChildren = menuParent.querySelector('.menu-children')

  menuButton.addEventListener('click', () => {
    const isExpanded = menuButton.getAttribute('aria-expanded') === 'true'

    document.querySelectorAll('[data-menu-parent]').forEach((otherParent) => {
      const otherButton = otherParent.querySelector('.menu-parent-button')
      const otherChildren = otherParent.querySelector('.menu-children')
      otherButton.setAttribute('aria-expanded', 'false')
      otherChildren.hidden = true
      otherParent.classList.remove('expanded')
    })

    if (!isExpanded) {
      menuButton.setAttribute('aria-expanded', 'true')
      menuChildren.hidden = false
      menuParent.classList.add('expanded')
    }
  })
})

function handleMapAction(actionName) {
  const view = map.getView()

  if (actionName === 'zoom-in') {
    view.animate({ zoom: view.getZoom() + 1, duration: 200 })
  } else if (actionName === 'zoom-out') {
    view.animate({ zoom: view.getZoom() - 1, duration: 200 })
  } else if (actionName === 'home') {
    view.animate({ center: vietnamCenter, zoom: defaultZoom, duration: 500 })
  } else if (actionName === 'fullscreen') {
    document.querySelector('.map-panel').requestFullscreen?.()
  } else if (actionName === 'guide') {
    systemTools.openSupport()
  } else if (actionName === 'close-message') {
    document.querySelector('.message').classList.remove('show')
  }
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    handleMapAction(button.dataset.action)
  })
})
