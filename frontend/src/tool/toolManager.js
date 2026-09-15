import { createGeolocationTool } from './geolocationTool.js'
import { createIdentifyTool } from './identifyTool.js'
import { createLayerCatalogTool } from './layerCatalogTool.js'
import { createLegendTool } from './legendTool.js'
import { createMeasureTool } from './measureTool.js'
import { createPrintTool } from './printTool.js'
import { createSearchTool } from './searchTool.js'

// Tool manager đảm bảo một công cụ tương tác được bật tại một thời điểm.
export function createToolManager({ map, catalogLayers }) {
  const measure = createMeasureTool(map)
  const location = createGeolocationTool(map)
  const tools = {
    layers: createLayerCatalogTool({
      map,
      ...catalogLayers,
      measureLayer: measure.layer,
      locationLayer: location.layer,
    }),
    legend: createLegendTool(),
    measure,
    search: createSearchTool(map),
    identify: createIdentifyTool(map),
    locate: location,
    print: createPrintTool(),
  }
  const buttons = document.querySelectorAll('[data-tool-action]')
  function closeAll(except = '') {
    Object.entries(tools).forEach(([name, tool]) => { if (name !== except) tool.close() })
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.toolAction === except))
  }
  buttons.forEach((button) => button.addEventListener('click', () => { const name = button.dataset.toolAction; closeAll(name); tools[name]?.open() }))
  return { tools, closeAll }
}
