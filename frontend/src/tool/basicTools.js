// Các công cụ cơ bản được tham khảo và rút gọn từ dự án LapTrinhGis.
import MousePosition from 'ol/control/MousePosition.js'
import ScaleLine from 'ol/control/ScaleLine.js'
import { createStringXY } from 'ol/coordinate.js'

export function createBasicTools(map) {
  // Chỉ giữ thước tỷ lệ và tọa độ. Các nút thao tác nằm ở toolbar PTN.
  map.addControl(new ScaleLine({ units: 'metric', bar: true, text: true, minWidth: 120 }))
  map.addControl(new MousePosition({
    coordinateFormat: createStringXY(5),
    projection: 'EPSG:4326',
    target: document.querySelector('#mouse-position'),
    undefinedHTML: 'Tọa độ: chưa xác định',
  }))
}
