import { createToolPanel } from './toolUtils.js'

// Chú giải mô tả các nhóm lớp đã có trong danh mục. Dữ liệu GIS thật sẽ được
// nối vào các lớp này từ Giai đoạn 3 nên không tạo dữ liệu giả ở đây.
export function createLegendTool() {
  const panel = createToolPanel({
    id: 'legend-panel',
    title: 'Chú giải bản đồ',
    content: `
      <div class="legend-list">
        <div class="legend-item"><i class="legend-symbol legend-base"></i><span>Bản đồ nền OpenStreetMap</span></div>
        <div class="legend-item"><i class="legend-symbol legend-point"></i><span>Điểm hành chính</span></div>
        <div class="legend-item"><i class="legend-symbol legend-line"></i><span>Quốc lộ, tỉnh lộ</span></div>
        <div class="legend-item"><i class="legend-symbol legend-area"></i><span>Ranh giới hành chính</span></div>
        <div class="legend-item"><i class="legend-symbol legend-raster"></i><span>Raster và DEM</span></div>
      </div>
      <p class="tool-hint">Các lớp chuyên đề sẽ hiển thị dữ liệu thực khi PostGIS và GeoServer được tích hợp.</p>
    `,
  })

  return {
    open: () => panel.classList.add('shown'),
    close: () => panel.classList.remove('shown'),
  }
}
