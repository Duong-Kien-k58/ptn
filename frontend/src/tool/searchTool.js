import { fromLonLat } from 'ol/proj.js'
import { createToolPanel } from './toolUtils.js'

const places = { 'hà nội': [105.8342, 21.0278], 'đà nẵng': [108.2022, 16.0544], 'thành phố hồ chí minh': [106.6297, 10.8231] }

export function createSearchTool(map) {
  const panel = createToolPanel({ id: 'search-panel', title: 'Tìm kiếm vị trí', content: '<form><label>Địa danh hoặc tọa độ</label><input placeholder="Ví dụ: Hà Nội hoặc 21.02, 105.83"><button>Tìm kiếm</button><p class="tool-hint">Hỗ trợ: Hà Nội, Đà Nẵng, Thành phố Hồ Chí Minh hoặc vĩ độ, kinh độ.</p></form>' })
  panel.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault()
    const value = panel.querySelector('input').value.trim()
    const coordinates = places[value.toLocaleLowerCase('vi-VN')] || value.split(',').map((item) => Number(item.trim())).reverse()
    if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) { panel.querySelector('.tool-hint').textContent = 'Không tìm thấy vị trí. Kiểm tra lại dữ liệu nhập.'; return }
    map.getView().animate({ center: fromLonLat(coordinates), zoom: 13, duration: 500 })
    panel.querySelector('.tool-hint').textContent = `Đã đến: ${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}.`
  })
  return { open: () => { panel.classList.add('shown'); panel.querySelector('input').focus() }, close: () => panel.classList.remove('shown') }
}
