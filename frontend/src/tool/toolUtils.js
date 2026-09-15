// Tiện ích chung để mọi panel công cụ có cùng cách mở, đóng và kéo thả.
export function createToolPanel({ id, title, content }) {
  const panel = document.createElement('section')
  panel.id = id
  panel.className = 'tool-panel'
  panel.innerHTML = `<header class="tool-panel-header"><strong>${title}</strong><button type="button" aria-label="Đóng">×</button></header><div class="tool-panel-body">${content}</div>`
  document.querySelector('#tool-panels').appendChild(panel)
  panel.querySelector('header').addEventListener('pointerdown', makeDraggable(panel))
  panel.querySelector('header button').addEventListener('click', () => panel.classList.remove('shown'))
  return panel
}

function makeDraggable(panel) {
  return (event) => {
    if (event.target.closest('button')) return
    const start = panel.getBoundingClientRect()
    const origin = { x: event.clientX, y: event.clientY }
    const move = (moveEvent) => {
      panel.style.left = `${start.left + moveEvent.clientX - origin.x}px`
      panel.style.top = `${start.top + moveEvent.clientY - origin.y}px`
      panel.style.right = 'auto'
    }
    const end = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
  }
}

export function formatLength(length) {
  return length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${length.toFixed(1)} m`
}

export function formatArea(area) {
  return area >= 1000000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(1)} m²`
}
