import { createLayerCatalogTool } from './layerCatalogTool.js'
import { createMeasureTool } from './measureTool.js'
import { createPopupTool } from './popupTool.js'
import { createSearchTool } from './searchTool.js'

// Tool manager đảm bảo một công cụ tương tác được bật tại một thời điểm.
export function createToolManager({ map, catalogLayers }) {
  const measure = createMeasureTool(map)
  const tools = {
    layers: createLayerCatalogTool({
      map,
      ...catalogLayers,
    }),
    measure,
    search: createSearchTool(map),
    identify: createPopupTool({ map }),
  }
  const buttons = document.querySelectorAll('[data-tool-action]')
  const panelIds = {
    layers: 'layer-catalog-panel',
    measure: 'measure-panel',
    search: 'search-panel',
    identify: 'identify-panel',
  }
  Object.entries(panelIds).forEach(([name, id]) => {
    const panel = document.querySelector(`#${id}`)
    if (panel) panel.dataset.toolAction = name
  })
  function closeAll(except = '') {
    Object.entries(tools).forEach(([name, tool]) => { if (name !== except) tool.close() })
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.toolAction === except))
  }
  buttons.forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.toolAction
    if (button.classList.contains('active')) {
      closeAll()
      return
    }
    document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: `toolbar:${name}` } }))
    closeAll(name)
    tools[name]?.open()
  }))
  document.addEventListener('toolpanelclose', (event) => {
    const name = event.target.dataset.toolAction
    if (name && tools[name]) closeAll()
  })
  return { tools, closeAll }
}
