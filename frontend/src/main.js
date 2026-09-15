// main.js chỉ khởi tạo bản đồ và gắn các sự kiện đơn giản.
import 'ol/ol.css'
import './style.css'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import { fromLonLat } from 'ol/proj.js'
import { createBasicTools } from './tool/basicTools.js'
import { createToolManager } from './tool/toolManager.js'
import { createMapLayers } from './config/layers.js'

const vietnamCenter = fromLonLat([106.2, 16.2])
const defaultZoom = 5.3
const catalogLayers = createMapLayers()

const map = new Map({
  target: 'map',
  controls: [],
  layers: catalogLayers.mapLayers,
  view: new View({ center: vietnamCenter, zoom: defaultZoom, minZoom: 3, maxZoom: 19 }),
})

// Các công cụ cơ bản được để trong thư mục tool để có thể mở rộng dần.
createBasicTools(map)
createToolManager({ map, catalogLayers })

function showMessage(title, text) {
  document.querySelector('#message-title').textContent = title
  document.querySelector('#message-text').textContent = text
  document.querySelector('.message').classList.add('show')
}

document.querySelectorAll('[data-section]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-section]').forEach((item) => item.classList.remove('active'))
    button.classList.add('active')
    if (button.dataset.section !== 'map') {
      showMessage(button.textContent.trim(), 'Chức năng này sẽ được xây dựng ở bước tiếp theo.')
    }
  })
})

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'zoom-in') map.getView().animate({ zoom: map.getView().getZoom() + 1, duration: 200 })
    if (button.dataset.action === 'zoom-out') map.getView().animate({ zoom: map.getView().getZoom() - 1, duration: 200 })
    if (button.dataset.action === 'home') map.getView().animate({ center: vietnamCenter, zoom: defaultZoom, duration: 500 })
    if (button.dataset.action === 'fullscreen') document.querySelector('.map-panel').requestFullscreen?.()
    if (button.dataset.action === 'guide') showMessage('Hướng dẫn', 'Kéo bản đồ để di chuyển và dùng chuột cuộn để phóng to hoặc thu nhỏ.')
    if (button.dataset.action === 'account') showMessage('Tài khoản học viên', 'Chức năng đăng nhập sẽ được kết nối với backend sau.')
    if (button.dataset.action === 'close-message') document.querySelector('.message').classList.remove('show')
  })
})
