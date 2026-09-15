import { createIdentifyTool } from './identifyTool.js'
import { createLayerCatalogTool } from './layerCatalogTool.js'
import { createMeasureTool } from './measureTool.js'
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
    identify: createIdentifyTool(map),
  }
  const buttons = document.querySelectorAll('[data-tool-action]')
  function closeAll(except = '') {
    Object.entries(tools).forEach(([name, tool]) => { if (name !== except) tool.close() })
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.toolAction === except))
  }
  buttons.forEach((button) => button.addEventListener('click', () => { const name = button.dataset.toolAction; closeAll(name); tools[name]?.open() }))
  return { tools, closeAll }
}
